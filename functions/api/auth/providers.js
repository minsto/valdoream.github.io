import { json } from './_lib';

export async function onRequest({ request, env }) {
    const turnstile = Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
    return json({
        ok: true,
        password: Boolean(env.CONTENT),
        turnstile,
        turnstileSiteKey: turnstile ? env.TURNSTILE_SITE_KEY : null,
        google: false,
        microsoft: false,
        oauthSoon: true,
        configured: Boolean(env.CONTENT)
    });
}
