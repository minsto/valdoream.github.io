/*
 * Synchronisation mod NeoForge -> site web.
 *
 * Le mod envoie les logs console, la liste des joueurs en ligne et un heartbeat.
 * Le panel admin lit tout ca via /admin/api/minecraft/live.
 */

import {
    checkServerKey,
    json,
    readLive,
    trimLogs,
    writeLive
} from './_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) {
        return json({ ok: false, error: 'Binding KV CONTENT manquant.' }, 503);
    }

    const authErr = checkServerKey(request, env);
    if (authErr) return json({ ok: false, error: authErr }, 401);

    if (request.method !== 'POST') {
        return json({ ok: false, error: 'POST uniquement.' }, 405);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    try {
        const prev = await readLive(env);
        const incoming = Array.isArray(body.logs) ? body.logs.map(String) : [];
        const merged = trimLogs([...prev.consoleLogs, ...incoming]);

        const live = {
            connected: true,
            lastSeen: new Date().toISOString(),
            online: Number(body.online ?? 0),
            maxPlayers: Number(body.maxPlayers ?? 0),
            tps: body.tps != null ? Number(body.tps) : prev.tps,
            players: Array.isArray(body.players) ? body.players.map(String) : [],
            modVersion: body.modVersion ? String(body.modVersion) : prev.modVersion,
            consoleLogs: merged
        };

        await writeLive(env, live);
        return json({ ok: true, logCount: merged.length });
    } catch (err) {
        return json({ ok: false, error: String(err) }, 502);
    }
}
