/*
 * Console admin : envoie une commande Minecraft dans la file d'attente.
 * Protege par le middleware /admin/ (mot de passe HTTP Basic).
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

export async function onRequest({ request, env }) {
    if (!env.CONTENT) {
        return json({ ok: false, error: 'Binding KV CONTENT manquant.' }, 503);
    }

    if (request.method !== 'POST') {
        return json({ ok: false, error: 'POST uniquement.' }, 405);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const command = String(body?.command ?? '').trim().replace(/^\//, '');
    if (!command) {
        return json({ ok: false, error: 'Commande vide.' }, 400);
    }

    const player = body?.player ? String(body.player).trim() : null;

    try {
        const stored = await env.CONTENT.get(CONTENT_KEY, 'json');
        const content = stored && typeof stored === 'object' ? stored : {};
        if (!Array.isArray(content.queue)) content.queue = [];
        if (!Array.isArray(content.logs)) content.logs = [];

        const entry = {
            id: Date.now(),
            player: player || '*',
            command,
            source: 'console',
            itemName: null,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        content.queue.unshift(entry);
        content.logs.push(`[Console]: commande en attente ? ${command}`);

        await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));
        return json({ ok: true, entry });
    } catch (err) {
        return json({ ok: false, error: String(err) }, 502);
    }
}
