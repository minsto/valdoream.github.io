/*
 * POST /api/auth/launcher-pair-claim
 * Launcher envoie { code, uuid, name } → refreshToken.
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

    const code = String(body.code || '').replace(/\D/g, '').trim();
    if (!/^\d{6}$/.test(code)) {
        return json({ ok: false, error: 'Code invalide (6 chiffres).' }, 400);
    }

    const key = 'launcher_pair:' + code;
    const data = await env.CONTENT.get(key, 'json');
    await env.CONTENT.delete(key);
    if (!data || !data.userId) {
        return json({ ok: false, error: 'Code expire ou deja utilise. Regeneres-en un sur le portail.' }, 400);
    }

    const user = await env.CONTENT.get('user:' + data.userId, 'json');
    if (!user) return json({ ok: false, error: 'Compte introuvable.' }, 404);

    const mcName = String(user.minecraftPseudo || '').toLowerCase();
    const launchName = String(body.name || '').toLowerCase();
    const launchUuid = String(body.uuid || '').replace(/-/g, '').toLowerCase();
    const userUuid = String(user.minecraftUuid || '').replace(/-/g, '').toLowerCase();

    // Le pseudo launcher doit matcher le profil portail (ou l'UUID).
    const nameOk = mcName && launchName && mcName === launchName;
    const uuidOk = userUuid && launchUuid && userUuid === launchUuid;
    if (!nameOk && !uuidOk) {
        return json({
            ok: false,
            error:
                'Le pseudo Minecraft du portail (' + (user.minecraftPseudo || '?') +
                ') doit etre identique au compte Microsoft du launcher.'
        }, 400);
    }

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
