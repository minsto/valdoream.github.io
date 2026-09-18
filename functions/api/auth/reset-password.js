/*
 * POST /api/auth/reset-password
 * Applique un nouveau mot de passe a partir du token recu par email.
 */

import {
    consumePasswordResetToken,
    createSession,
    json,
    publicUser,
    sessionCookieHeader,
    setUserPassword
} from './_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);
    if (request.method !== 'POST') {
        return json({ ok: false, error: 'POST uniquement.' }, 405);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const token = String(body.token || '').trim();
    const password = body.password;
    if (!token) return json({ ok: false, error: 'Lien invalide ou expire.' }, 400);

    const reset = await consumePasswordResetToken(env, token);
    if (!reset) {
        return json({ ok: false, error: 'Lien invalide ou expire. Demande un nouveau lien.' }, 400);
    }

    const user = await env.CONTENT.get('user:' + reset.userId, 'json');
    if (!user) {
        return json({ ok: false, error: 'Compte introuvable.' }, 404);
    }

    try {
        await setUserPassword(env, user, password);
        const sessionToken = await createSession(env, user.id);
        return json(
            { ok: true, user: publicUser(user), message: 'Mot de passe mis a jour. Tu es connecte.' },
            200,
            { 'Set-Cookie': sessionCookieHeader(sessionToken) }
        );
    } catch (err) {
        return json({ ok: false, error: err.message || String(err) }, 400);
    }
}
