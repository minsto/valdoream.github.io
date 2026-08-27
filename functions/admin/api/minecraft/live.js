/*
 * Etat live du serveur Minecraft + file de livraisons, pour le panel admin.
 * Protege par le middleware /admin/ (mot de passe HTTP Basic).
 */

import {
    isLiveConnected,
    json,
    queueSummary,
    readContent,
    readLive
} from '../../../api/minecraft/_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) {
        return json({ ok: false, error: 'Binding KV CONTENT manquant.' }, 503);
    }

    if (request.method !== 'GET') {
        return json({ ok: false, error: 'GET uniquement.' }, 405);
    }

    try {
        const [content, live] = await Promise.all([
            readContent(env),
            readLive(env)
        ]);

        const queue = queueSummary(content.queue || []);
        const connected = isLiveConnected(live);

        return json({
            ok: true,
            server: {
                connected,
                lastSeen: live.lastSeen,
                online: live.online,
                maxPlayers: live.maxPlayers,
                tps: live.tps,
                players: live.players,
                modVersion: live.modVersion
            },
            consoleLogs: live.consoleLogs || [],
            queue: {
                pending: queue.pending,
                recent: queue.recent,
                pendingCount: queue.pendingCount
            }
        });
    } catch (err) {
        return json({ ok: false, error: String(err) }, 502);
    }
}
