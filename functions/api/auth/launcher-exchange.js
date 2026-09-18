/*
 * POST /api/auth/launcher-exchange
 * Echange code one-shot → refresh token long (stocke dans le launcher).
 */

import {
    json,
    publicUser,
    randomToken
} from './_lib';

const REFRESH_TTL = 90 * 86400;

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);
    if (request.method !== 'POST') return json({ ok: false, error: 'POST uniquement.' }, 405);

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const code = String(body.code || '').trim();
    const state = String(body.state || '').trim();
    if (!code || !state) return json({ ok: false, error: 'code/state requis.' }, 400);

    const key = 'launcher_code:' + code;
    const data = await env.CONTENT.get(key, 'json');
    await env.CONTENT.delete(key);
    if (!data || data.state !== state || !data.userId) {
        return json({ ok: false, error: 'Lien expire ou invalide. Recommence la sync.' }, 400);
    }

    const user = await env.CONTENT.get('user:' + data.userId, 'json');
    if (!user) return json({ ok: false, error: 'Compte introuvable.' }, 404);

    const refreshToken = randomToken(32);
    await env.CONTENT.put(
        'launcher_refresh:' + refreshToken,
        JSON.stringify({ userId: user.id, createdAt: Date.now() }),
        { expirationTtl: REFRESH_TTL }
    );

    return json({
        ok: true,
        refreshToken,
        user: publicUser(user),
        expiresIn: REFRESH_TTL
    });
}
