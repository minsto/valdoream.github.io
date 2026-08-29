/*
 * GET /api/auth/me — session courante
 * GET /api/auth/providers — quels OAuth sont configures
 */

import { getSessionUser, json, publicUser } from './_lib';

export async function onRequest({ request, env }) {
    if (request.method !== 'GET') return json({ ok: false, error: 'GET uniquement.' }, 405);

    const url = new URL(request.url);
    if (url.pathname.endsWith('/providers') || url.searchParams.get('providers') === '1') {
        return json({
            ok: true,
            google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
            microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
            configured: Boolean(env.CONTENT)
        });
    }

    if (!env.CONTENT) {
        return json({ ok: false, authenticated: false, error: 'KV manquante.' }, 503);
    }

    const user = await getSessionUser(env, request);
    if (!user) return json({ ok: true, authenticated: false, user: null });

    return json({ ok: true, authenticated: true, user: publicUser(user) });
}
