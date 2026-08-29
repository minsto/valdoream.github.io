import { json } from './_lib';

export async function onRequest({ request, env }) {
    return json({
        ok: true,
        google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
        configured: Boolean(env.CONTENT)
    });
}
