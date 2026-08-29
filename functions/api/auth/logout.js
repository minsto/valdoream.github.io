import { clearSessionCookie, json, parseCookies, SESSION_COOKIE } from './_lib';

export async function onRequest({ request, env }) {
    if (request.method !== 'POST' && request.method !== 'GET') {
        return json({ ok: false, error: 'POST ou GET.' }, 405);
    }

    const cookies = parseCookies(request.headers.get('Cookie'));
    const token = cookies[SESSION_COOKIE];
    if (token && env.CONTENT) {
        await env.CONTENT.delete('session:' + token);
    }

    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Set-Cookie': clearSessionCookie(),
            'Cache-Control': 'no-store'
        }
    });
}
