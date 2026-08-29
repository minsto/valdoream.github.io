import { json } from './_lib';

export async function onRequest({ request, env }) {
    return json({
        ok: true,
        password: Boolean(env.CONTENT),
        google: false,
        microsoft: false,
        oauthSoon: true,
        configured: Boolean(env.CONTENT)
    });
}
