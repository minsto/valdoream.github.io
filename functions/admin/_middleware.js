/*
 * Protège /admin/ par authentification HTTP Basic.
 *
 * Ce code tourne sur les serveurs Cloudflare avant que le moindre fichier du
 * panel ne soit envoyé au navigateur. Les identifiants viennent des variables
 * d'environnement du projet Pages (Settings > Environment variables) et ne sont
 * donc jamais présents dans le dépôt Git.
 *
 * Variables attendues : ADMIN_USER et ADMIN_PASSWORD.
 */

const REALM = 'Valdoream Admin';

export async function onRequest(context) {
    const { request, env } = context;

    const expectedUser = env.ADMIN_USER;
    const expectedPassword = env.ADMIN_PASSWORD;

    // Sans identifiants configurés, on refuse tout : mieux vaut un panel
    // inaccessible qu'un panel ouvert à tous.
    if (!expectedUser || !expectedPassword) {
        return errorPage(
            503,
            'Panel non configuré',
            "Les variables d'environnement ADMIN_USER et ADMIN_PASSWORD ne sont pas définies dans le projet Cloudflare Pages."
        );
    }

    const credentials = parseBasicAuth(request.headers.get('Authorization'));

    if (!credentials) return askForPassword();

    const [userOk, passwordOk] = await Promise.all([
        secureEquals(credentials.user, expectedUser),
        secureEquals(credentials.password, expectedPassword)
    ]);

    if (!userOk || !passwordOk) return askForPassword();

    const response = await context.next();

    // Une page d'administration ne doit pas finir dans un cache partagé.
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, max-age=0');
    headers.set('X-Robots-Tag', 'noindex, nofollow');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

function parseBasicAuth(header) {
    if (!header) return null;

    const [scheme, encoded] = header.split(' ');
    if (scheme !== 'Basic' || !encoded) return null;

    let decoded;
    try {
        const binary = atob(encoded);
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        decoded = new TextDecoder().decode(bytes);
    } catch {
        return null;
    }

    const separator = decoded.indexOf(':');
    if (separator === -1) return null;

    return {
        user: decoded.slice(0, separator),
        password: decoded.slice(separator + 1)
    };
}

// Compare via des empreintes SHA-256 de longueur fixe, pour que le temps de
// réponse ne révèle pas combien de caractères du mot de passe sont corrects.
async function secureEquals(candidate, expected) {
    const [a, b] = await Promise.all([sha256(candidate), sha256(expected)]);

    let difference = 0;
    for (let i = 0; i < a.length; i++) {
        difference |= a[i] ^ b[i];
    }

    return difference === 0;
}

async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return new Uint8Array(digest);
}

function askForPassword() {
    return errorPage(401, 'Accès réservé', 'Identifiant ou mot de passe incorrect.', {
        'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`
    });
}

function errorPage(status, title, message, extraHeaders = {}) {
    const body = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Valdoream | ${title}</title>
    <style>
        body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
               background: #08080a; color: #fff; font-family: system-ui, sans-serif; text-align: center; padding: 20px; }
        .box { max-width: 420px; }
        h1 { font-size: 1.5rem; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px; }
        p { color: #9e9ea7; line-height: 1.6; }
        a { color: #ff6a00; }
    </style>
</head>
<body>
    <div class="box">
        <h1>${title}</h1>
        <p>${message}</p>
        <p><a href="/">Retour au site</a></p>
    </div>
</body>
</html>`;

    return new Response(body, {
        status,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0',
            ...extraHeaders
        }
    });
}
