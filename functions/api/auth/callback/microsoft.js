/*
 * Callback Microsoft OAuth (Hotmail / Outlook).
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

    if (oauthError) return failRedirect(origin, 'Connexion Microsoft annulee.');
    if (!code || !state) return failRedirect(origin, 'Retour Microsoft invalide.');
    if (!env.CONTENT || !env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
        return failRedirect(origin, 'Microsoft OAuth non configure.');
    }

    const stateData = await env.CONTENT.get('oauth_state:' + state, 'json');
    await env.CONTENT.delete('oauth_state:' + state);
    if (!stateData || stateData.provider !== 'microsoft') {
        return failRedirect(origin, 'Session OAuth expiree. Reessaie.');
    }

    try {
        const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: env.MICROSOFT_CLIENT_ID,
                client_secret: env.MICROSOFT_CLIENT_SECRET,
                redirect_uri: origin + '/api/auth/callback/microsoft',
                grant_type: 'authorization_code'
            })
        });
        const token = await tokenRes.json();
        if (!token.access_token) {
            return failRedirect(origin, 'Echange de jeton Microsoft echoue.');
        }

        const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: 'Bearer ' + token.access_token }
        });
        const profile = await profileRes.json();
        const email = profile.mail || profile.userPrincipalName;
        if (!email) return failRedirect(origin, 'Microsoft n a pas renvoye d email.');

        const user = await upsertOAuthUser(env, {
            email,
            name: profile.displayName || email,
            provider: 'microsoft',
            picture: null
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
        return failRedirect(origin, 'Erreur Microsoft : ' + String(err.message || err));
    }
}
