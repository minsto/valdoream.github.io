/*
 * Demarre OAuth Google.
 * Variables : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SITE_URL (optionnel)
 */

import { json, randomToken, siteUrl } from './_lib';

export async function onRequest({ request, env }) {
    if (request.method !== 'GET') return json({ ok: false, error: 'GET uniquement.' }, 405);

    if (!env.CONTENT) {
        return json({ ok: false, error: 'Base KV CONTENT manquante.' }, 503);
    }
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return json({
            ok: false,
            error: 'Google OAuth non configure. Ajoute GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans Cloudflare Pages.'
        }, 501);
    }

    const origin = siteUrl(env, request);
    const state = randomToken(16);
    await env.CONTENT.put('oauth_state:' + state, JSON.stringify({ provider: 'google', createdAt: Date.now() }), {
        expirationTtl: 600
    });

    const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: origin + '/api/auth/callback/google',
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'online',
        prompt: 'select_account'
    });

    return Response.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString(), 302);
}
