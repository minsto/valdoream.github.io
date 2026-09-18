/*
 * POST /api/auth/launcher-session
 * body: { refreshToken } → embedToken one-shot pour auto-login iframe.
 */

import {
    json,
    publicUser,
    randomToken
} from './_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);
    if (request.method !== 'POST') return json({ ok: false, error: 'POST uniquement.' }, 405);

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const refreshToken = String(body.refreshToken || '').trim();
    if (!refreshToken) return json({ ok: false, error: 'refreshToken requis.' }, 400);

    const data = await env.CONTENT.get('launcher_refresh:' + refreshToken, 'json');
    if (!data || !data.userId) {
        return json({ ok: false, error: 'Session launcher expiree. Resynchronise.' }, 401);
    }

    const user = await env.CONTENT.get('user:' + data.userId, 'json');
    if (!user) return json({ ok: false, error: 'Compte introuvable.' }, 404);

    const embedToken = randomToken(24);
    await env.CONTENT.put(
        'launcher_lt:' + embedToken,
        JSON.stringify({ userId: user.id, createdAt: Date.now() }),
        { expirationTtl: 120 }
    );

    return json({
        ok: true,
        embedToken,
        user: publicUser(user)
    });
}
