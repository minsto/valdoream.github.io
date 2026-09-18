/*
 * POST /api/auth/launcher-pair-create
 * Joueur connecte : genere un code a 6 chiffres pour le launcher.
 */

import {
    getSessionUser,
    json
} from './_lib';

function sixDigitCode() {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
    return String(n).padStart(6, '0');
}

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);
    if (request.method !== 'POST') return json({ ok: false, error: 'POST uniquement.' }, 405);

    const user = await getSessionUser(env, request);
    if (!user) return json({ ok: false, error: 'Connecte-toi d abord.' }, 401);

    if (!user.minecraftPseudo) {
        return json({
            ok: false,
            error: 'Enregistre d abord ton pseudo Minecraft (identique au launcher).'
        }, 400);
    }

    const code = sixDigitCode();
    await env.CONTENT.put(
        'launcher_pair:' + code,
        JSON.stringify({ userId: user.id, createdAt: Date.now() }),
        { expirationTtl: 600 }
    );

    return json({
        ok: true,
        code,
        expiresIn: 600,
        message: 'Dans le launcher : Synchroniser Valdoream, puis entre ce code.'
    });
}
