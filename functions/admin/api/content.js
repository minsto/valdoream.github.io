/*
 * Ecriture du contenu du site.
 *
 * Cette Function est volontairement placee sous /admin/ : le middleware
 * functions/admin/_middleware.js s'execute avant elle, donc seul quelqu'un qui
 * connait ADMIN_USER / ADMIN_PASSWORD peut modifier le site. Le navigateur
 * renvoie tout seul les identifiants du panel sur cette adresse, puisqu'elle
 * partage le meme prefixe /admin/.
 */

const CONTENT_KEY = 'content';

// 512 ko : largement de quoi tenir le catalogue, assez bas pour qu'une boucle
// buguee cote navigateur ne remplisse pas la base.
const MAX_BYTES = 512 * 1024;

function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0'
        }
    });
}

function missingBinding() {
    return json({
        ok: false,
        configured: false,
        error: "La base de donnees n'est pas branchee : il manque un binding KV nomme CONTENT " +
               "dans Settings > Bindings du projet Cloudflare Pages. Les modifications restent " +
               "pour l'instant enregistrees dans ce navigateur uniquement."
    }, 501);
}

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return missingBinding();

    try {
        switch (request.method) {
            case 'GET': {
                const stored = await env.CONTENT.get(CONTENT_KEY, 'json');
                return json({ ok: true, configured: true, content: stored ?? null });
            }

            case 'PUT': {
                let body;
                try {
                    body = await request.json();
                } catch {
                    return json({ ok: false, error: 'Corps de requete JSON invalide.' }, 400);
                }

                if (!body || typeof body !== 'object' || Array.isArray(body)) {
                    return json({ ok: false, error: 'Le contenu attendu est un objet JSON.' }, 400);
                }

                const text = JSON.stringify(body);
                if (text.length > MAX_BYTES) {
                    return json({ ok: false, error: 'Contenu trop volumineux pour etre enregistre.' }, 413);
                }

                await env.CONTENT.put(CONTENT_KEY, text);
                return json({ ok: true, savedAt: new Date().toISOString() });
            }

            case 'DELETE': {
                await env.CONTENT.delete(CONTENT_KEY);
                return json({ ok: true, reset: true });
            }

            default:
                return json({ ok: false, error: 'Methode non autorisee.' }, 405);
        }
    } catch (err) {
        return json({ ok: false, error: 'Erreur de la base de donnees : ' + String(err) }, 502);
    }
}
