/*
 * DELETE /api/auth/account — supprimer le compte (mot de passe requis)
 */

import {
    clearSessionCookie,
    deleteUserAccount,
    getSessionToken,
    getSessionUser,
    json
} from './_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);
    if (request.method !== 'DELETE') {
        return json({ ok: false, error: 'DELETE uniquement.' }, 405);
    }

    const user = await getSessionUser(env, request);
    if (!user) return json({ ok: false, error: 'Non connecte.' }, 401);

    let body = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    try {
        await deleteUserAccount(
            env,
            user,
            { password: body.password },
            getSessionToken(request)
        );
        return json(
            { ok: true },
            200,
            { 'Set-Cookie': clearSessionCookie() }
        );
    } catch (err) {
        return json({ ok: false, error: err.message || String(err) }, 400);
    }
}
