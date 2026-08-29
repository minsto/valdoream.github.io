import { envGet, json } from './_lib';

export async function onRequest({ request, env }) {
    const siteKey = envGet(env, 'TURNSTILE_SITE_KEY') || '';
    const secretKey = envGet(env, 'TURNSTILE_SECRET_KEY') || '';
    const turnstile = Boolean(siteKey && secretKey);

    return json({
        ok: true,
        password: Boolean(env.CONTENT),
        turnstile,
        turnstileSiteKey: turnstile ? siteKey : null,
        turnstileSiteKeyPresent: Boolean(siteKey),
        turnstileSecretKeyPresent: Boolean(secretKey),
        google: false,
        microsoft: false,
        oauthSoon: true,
        configured: Boolean(env.CONTENT)
    });
}
