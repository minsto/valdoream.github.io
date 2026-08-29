import { json } from './_lib';

export async function onRequest({ request, env }) {
    const siteKey = env.TURNSTILE_SITE_KEY ? String(env.TURNSTILE_SITE_KEY).trim() : '';
    const secretKey = env.TURNSTILE_SECRET_KEY ? String(env.TURNSTILE_SECRET_KEY).trim() : '';
    const turnstile = Boolean(siteKey && secretKey);

    // Diagnostic sans reveler les secrets : quelles variables la Function voit.
    const seen = Object.keys(env || {})
        .filter(k => !String(k).startsWith('CF_'))
        .sort();

    return json({
        ok: true,
        password: Boolean(env.CONTENT),
        turnstile,
        turnstileSiteKey: turnstile ? siteKey : null,
        turnstileSiteKeyPresent: Boolean(siteKey),
        turnstileSecretKeyPresent: Boolean(secretKey),
        turnstileSiteKeyLength: siteKey.length,
        google: false,
        microsoft: false,
        oauthSoon: true,
        configured: Boolean(env.CONTENT),
        envNames: seen
    });
}
