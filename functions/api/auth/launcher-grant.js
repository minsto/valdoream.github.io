/*
 * POST /api/auth/launcher-grant
 * Joueur connecte au portail : cree un code one-shot pour lier le launcher.
 * body: { state, redirect }
 */

import {
    getSessionUser,
    json,
    randomToken
} from './_lib';

function isAllowedRedirect(raw) {
    try {
        const u = new URL(String(raw || ''));
        if (u.protocol !== 'http:') return false;
        if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
        if (u.pathname !== '/api/valdoream/callback') return false;
        return true;
    } catch {
        return false;
    }
}

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);
    if (request.method !== 'POST') return json({ ok: false, error: 'POST uniquement.' }, 405);

    const user = await getSessionUser(env, request);
    if (!user) return json({ ok: false, error: 'Connecte-toi d abord sur le portail.' }, 401);

    if (!user.minecraftPseudo) {
        return json({
            ok: false,
            error: 'Renseigne d abord ton pseudo Minecraft dans le portail (identique au launcher).'
        }, 400);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const state = String(body.state || '').trim();
    const redirect = String(body.redirect || '').trim();
    if (!state || state.length < 8) return json({ ok: false, error: 'state invalide.' }, 400);
    if (!isAllowedRedirect(redirect)) {
        return json({ ok: false, error: 'redirect launcher invalide.' }, 400);
    }

    const code = randomToken(24);
    await env.CONTENT.put(
        'launcher_code:' + code,
        JSON.stringify({
            userId: user.id,
            state,
            createdAt: Date.now()
        }),
        { expirationTtl: 300 }
    );

    const url = new URL(redirect);
    url.searchParams.set('code', code);
    url.searchParams.set('state', state);

    return json({ ok: true, redirect: url.toString() });
}
