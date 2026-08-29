import { consumeCaptcha, createCaptcha, json, verifyBotProtection } from './_lib';

export async function onRequest({ request, env }) {
    if (request.method !== 'GET') return json({ ok: false, error: 'GET uniquement.' }, 405);
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);

    // Si Turnstile est configure, le navigateur n'a pas besoin du captcha maths.
    if (env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY) {
        return json({
            ok: true,
            mode: 'turnstile',
            siteKey: env.TURNSTILE_SITE_KEY
        });
    }

    const captcha = await createCaptcha(env);
    return json({ ok: true, mode: 'math', ...captcha });
}
