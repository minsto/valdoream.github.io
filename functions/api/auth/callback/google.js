/*
 * Callback Google OAuth.
 */

import {
    createSession,
    sessionCookieHeader,
    siteUrl,
    upsertOAuthUser
} from '../_lib';

function failRedirect(origin, message) {
    return Response.redirect(origin + '/portal/?error=' + encodeURIComponent(message), 302);
}

export async function onRequest({ request, env }) {
    const origin = siteUrl(env, request);
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');

    if (oauthError) return failRedirect(origin, 'Connexion Google annulee.');
    if (!code || !state) return failRedirect(origin, 'Retour Google invalide.');
    if (!env.CONTENT || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return failRedirect(origin, 'Google OAuth non configure.');
    }

    const stateData = await env.CONTENT.get('oauth_state:' + state, 'json');
    await env.CONTENT.delete('oauth_state:' + state);
    if (!stateData || stateData.provider !== 'google') {
        return failRedirect(origin, 'Session OAuth expiree. Reessaie.');
    }

    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_CLIENT_SECRET,
                redirect_uri: origin + '/api/auth/callback/google',
                grant_type: 'authorization_code'
            })
        });
        const token = await tokenRes.json();
        if (!token.access_token) {
            return failRedirect(origin, 'Echange de jeton Google echoue.');
        }

        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: 'Bearer ' + token.access_token }
        });
        const profile = await profileRes.json();
        if (!profile.email) return failRedirect(origin, 'Google n a pas renvoye d email.');

        const user = await upsertOAuthUser(env, {
            email: profile.email,
            name: profile.name || profile.email,
            provider: 'google',
            picture: profile.picture || null
        });

        const session = await createSession(env, user.id);
        const next = user.minecraftPseudo ? '/portal/' : '/portal/?setup=1';

        return new Response(null, {
            status: 302,
            headers: {
                Location: origin + next,
                'Set-Cookie': sessionCookieHeader(session)
            }
        });
    } catch (err) {
        return failRedirect(origin, 'Erreur Google : ' + String(err.message || err));
    }
}
