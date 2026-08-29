/*
 * Admin : synchronise ban / grade vers le compte joueur (par pseudo Minecraft).
 * Protege par /admin/ middleware.
 */

import {
    findUserByMinecraft,
    json,
    saveUser
} from '../../../api/auth/_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);
    if (request.method !== 'POST') return json({ ok: false, error: 'POST uniquement.' }, 405);

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const pseudo = String(body.minecraftPseudo || '').trim();
    if (!pseudo) return json({ ok: false, error: 'Pseudo Minecraft requis.' }, 400);

    const user = await findUserByMinecraft(env, pseudo);
    if (!user) {
        return json({
            ok: false,
            error: 'Aucun compte inscrit avec ce pseudo Minecraft.'
        }, 404);
    }

    if (typeof body.banned === 'boolean') {
        user.banned = body.banned;
        user.banReason = body.banned ? (body.banReason || 'Banni par le staff') : null;
    }
    if (body.grade) user.grade = String(body.grade);

    await saveUser(env, user);
    return json({ ok: true, userId: user.id, banned: user.banned, grade: user.grade });
}
