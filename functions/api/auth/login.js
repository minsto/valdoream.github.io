import {
    consumeCaptcha,
    createSession,
    json,
    loginPasswordUser,
    publicUser,
    sessionCookieHeader
} from './_lib';

export async function onRequest({ request, env }) {
    if (request.method !== 'POST') return json({ ok: false, error: 'POST uniquement.' }, 405);
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const captchaOk = await consumeCaptcha(env, body.captchaId, body.captchaAnswer);
    if (!captchaOk) {
        return json({ ok: false, error: 'Captcha incorrect ou expire. Reessaie.' }, 400);
    }

    try {
        const user = await loginPasswordUser(env, {
            email: body.email,
            password: body.password
        });

        if (user.banned) {
            return json({
                ok: false,
                error: 'Compte banni' + (user.banReason ? ' : ' + user.banReason : '.')
            }, 403);
        }

        const token = await createSession(env, user.id);
        return json(
            {
                ok: true,
                user: publicUser(user),
                setup: !user.minecraftPseudo
            },
            200,
            { 'Set-Cookie': sessionCookieHeader(token) }
        );
    } catch (err) {
        return json({ ok: false, error: String(err.message || err) }, 401);
    }
}
