/*
 * File d'attente Minecraft : le serveur NeoForge (ou le script bridge) interroge
 * cette adresse pour recuperer les commandes a executer, puis confirme quand
 * c'est fait.
 *
 * Authentification : en-tete X-Server-Key = variable SERVER_API_KEY du projet
 * Cloudflare Pages (type Secret). Ne jamais mettre cette cle dans le code du site.
 */

const CONTENT_KEY = 'content';

function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0'
        }
    });
}

function checkKey(request, env) {
    const expected = env.SERVER_API_KEY;
    if (!expected) return 'SERVER_API_KEY non configuree dans Cloudflare Pages.';
    const got = request.headers.get('X-Server-Key') || request.headers.get('x-server-key');
    if (!got || got !== expected) return 'Cle serveur invalide.';
    return null;
}

function withQueue(content) {
    if (!content || typeof content !== 'object') return { queue: [] };
    if (!Array.isArray(content.queue)) content.queue = [];
    return content;
}

export async function onRequest({ request, env }) {
    if (!env.CONTENT) {
        return json({ ok: false, error: 'Binding KV CONTENT manquant.' }, 503);
    }

    const authErr = checkKey(request, env);
    if (authErr) return json({ ok: false, error: authErr }, 401);

    try {
        const stored = await env.CONTENT.get(CONTENT_KEY, 'json');
        const content = withQueue(stored ?? {});

        if (request.method === 'GET') {
            const pending = content.queue.filter(q => q.status === 'pending');
            return json({ ok: true, pending, count: pending.length });
        }

        if (request.method === 'POST') {
            let body;
            try {
                body = await request.json();
            } catch {
                return json({ ok: false, error: 'JSON invalide.' }, 400);
            }

            const id = body?.id;
            const status = body?.status;
            if (!id || !['done', 'failed'].includes(status)) {
                return json({ ok: false, error: 'Corps attendu : { id, status: "done"|"failed", error? }' }, 400);
            }

            const entry = content.queue.find(q => q.id === id);
            if (!entry) {
                return json({ ok: false, error: 'Commande introuvable : ' + id }, 404);
            }

            entry.status = status;
            entry.doneAt = new Date().toISOString();
            if (body.error) entry.error = String(body.error);

            const stamp = new Date().toLocaleTimeString('fr-FR');
            if (!Array.isArray(content.logs)) content.logs = [];
            content.logs.push(
                `[MC ${stamp}]: ${entry.command} ? ${status}${body.error ? ' (' + body.error + ')' : ''}`
            );

            await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));
            return json({ ok: true, id, status });
        }

        return json({ ok: false, error: 'GET ou POST uniquement.' }, 405);
    } catch (err) {
        return json({ ok: false, error: String(err) }, 502);
    }
}
