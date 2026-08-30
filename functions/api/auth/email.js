/*
 * PUT /api/auth/email — changer l'email (mot de passe requis)
 */

import {
    changeUserEmail,
    getSessionUser,
    json,
    publicUser
} from './_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);
    if (request.method !== 'PUT') {
        return json({ ok: false, error: 'PUT uniquement.' }, 405);
    }

    const user = await getSessionUser(env, request);
    if (!user) return json({ ok: false, error: 'Non connecte.' }, 401);

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    try {
        const updated = await changeUserEmail(env, user, {
            newEmail: body.email,
            password: body.password
        });
        return json({ ok: true, user: publicUser(updated) });
    } catch (err) {
        return json({ ok: false, error: err.message || String(err) }, 400);
    }
}
