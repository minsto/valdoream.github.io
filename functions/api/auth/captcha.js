import { createCaptcha, json } from './_lib';

export async function onRequest({ request, env }) {
    if (request.method !== 'GET') return json({ ok: false, error: 'GET uniquement.' }, 405);
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);

    const captcha = await createCaptcha(env);
    return json({ ok: true, ...captcha });
}
