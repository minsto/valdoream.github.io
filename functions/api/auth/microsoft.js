/*
 * Demarre OAuth Microsoft (Hotmail / Outlook / compte Microsoft).
 * Variables : MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
 */

import { json, randomToken, siteUrl } from './_lib';

export async function onRequest({ request, env }) {
    if (request.method !== 'GET') return json({ ok: false, error: 'GET uniquement.' }, 405);

    if (!env.CONTENT) {
        return json({ ok: false, error: 'Base KV CONTENT manquante.' }, 503);
    }
    if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
        return json({
            ok: false,
            error: 'Microsoft OAuth non configure. Ajoute MICROSOFT_CLIENT_ID et MICROSOFT_CLIENT_SECRET dans Cloudflare Pages.'
        }, 501);
    }

    const origin = siteUrl(env, request);
    const state = randomToken(16);
    await env.CONTENT.put('oauth_state:' + state, JSON.stringify({ provider: 'microsoft', createdAt: Date.now() }), {
        expirationTtl: 600
    });

    const params = new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        redirect_uri: origin + '/api/auth/callback/microsoft',
        response_type: 'code',
        scope: 'openid profile email User.Read',
        state,
        response_mode: 'query'
    });

    return Response.redirect(
        'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' + params.toString(),
        302
    );
}
