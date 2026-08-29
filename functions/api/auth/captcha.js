import { createCaptcha, envGet, json } from './_lib';

export async function onRequest({ request, env }) {
    if (request.method !== 'GET') return json({ ok: false, error: 'GET uniquement.' }, 405);
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);

    const siteKey = envGet(env, 'TURNSTILE_SITE_KEY');
    const secretKey = envGet(env, 'TURNSTILE_SECRET_KEY');

    if (siteKey && secretKey) {
        return json({
            ok: true,
            mode: 'turnstile',
            siteKey
        });
    }

    const captcha = await createCaptcha(env);
    return json({ ok: true, mode: 'math', ...captcha });
}
