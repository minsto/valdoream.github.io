/*
 * GET /api/auth/launcher-consume?token=&next=/
 * Pose le cookie de session puis redirige (pour iframe launcher).
 */

import {
    createSession,
    sessionCookieHeader
} from './_lib';

function safeNext(raw) {
    const value = String(raw || '/?embed=1');
    if (!value.startsWith('/') || value.startsWith('//')) return '/?embed=1';
    return value;
}

export async function onRequest({ request, env }) {
    if (!env.CONTENT) {
        return new Response('KV manquante', { status: 503 });
    }
    if (request.method !== 'GET') {
        return new Response('GET only', { status: 405 });
    }

    const url = new URL(request.url);
    const token = String(url.searchParams.get('token') || '').trim();
    const next = safeNext(url.searchParams.get('next'));

    if (!token) {
        return Response.redirect(new URL('/?embed=1', url.origin).toString(), 302);
    }

    const key = 'launcher_lt:' + token;
    const data = await env.CONTENT.get(key, 'json');
    await env.CONTENT.delete(key);

    if (!data || !data.userId) {
        return Response.redirect(new URL('/portal/?error=' + encodeURIComponent('Lien expire'), url.origin).toString(), 302);
    }

    const user = await env.CONTENT.get('user:' + data.userId, 'json');
    if (!user) {
        return Response.redirect(new URL('/portal/?error=' + encodeURIComponent('Compte introuvable'), url.origin).toString(), 302);
    }

    const sessionToken = await createSession(env, user.id);
    const dest = new URL(next, url.origin);
    if (!dest.searchParams.has('embed')) dest.searchParams.set('embed', '1');

    return new Response(null, {
        status: 302,
        headers: {
            Location: dest.toString(),
            'Set-Cookie': sessionCookieHeader(sessionToken),
            'Cache-Control': 'no-store'
        }
    });
}
