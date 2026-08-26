/*
 * Lecture publique du contenu du site (news, posts, boutique, joueurs).
 *
 * Tout le monde peut lire ici, personne ne peut ecrire : l'ecriture passe par
 * /admin/api/content, qui est derriere le mot de passe du panel.
 *
 * Le contenu vit dans un namespace Workers KV expose a la Function sous le nom
 * CONTENT. Tant que ce binding n'est pas cree dans le projet Cloudflare Pages,
 * on repond « configured: false » : le site continue alors de fonctionner avec
 * le contenu par defaut et le stockage local du navigateur.
 */

const CONTENT_KEY = 'content';

function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            // Le catalogue change quand l'admin le modifie : jamais de cache.
            'Cache-Control': 'no-store, max-age=0'
        }
    });
}

export async function onRequest({ request, env }) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json(
            { ok: false, error: "Cette adresse est en lecture seule. L'ecriture se fait sur /admin/api/content." },
            405
        );
    }

    if (!env.CONTENT) {
        return json({
            configured: false,
            content: null,
            hint: "Aucun binding KV nomme CONTENT dans ce projet Cloudflare Pages."
        });
    }

    try {
        const stored = await env.CONTENT.get(CONTENT_KEY, 'json');
        return json({ configured: true, content: stored ?? null });
    } catch (err) {
        return json({ configured: true, content: null, error: String(err) }, 502);
    }
}
