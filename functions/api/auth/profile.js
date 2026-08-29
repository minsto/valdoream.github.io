/*
 * GET  /api/auth/profile — profil public de la session
 * PUT  /api/auth/profile — maj pseudo Minecraft + Discord
 */

import {
    DISCORD_RE,
    getSessionUser,
    json,
    PSEUDO_RE,
    publicUser,
    resolveMinecraftUuid,
    saveUser,
    setMinecraftIndex
} from './_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);

    const user = await getSessionUser(env, request);
    if (!user) return json({ ok: false, error: 'Non connecte.' }, 401);

    if (request.method === 'GET') {
        return json({ ok: true, user: publicUser(user) });
    }

    if (request.method !== 'PUT') {
        return json({ ok: false, error: 'GET ou PUT.' }, 405);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const minecraftPseudo = body.minecraftPseudo != null
        ? String(body.minecraftPseudo).trim()
        : user.minecraftPseudo;
    const discordPseudo = body.discordPseudo != null
        ? String(body.discordPseudo).trim()
        : user.discordPseudo;

    if (minecraftPseudo && !PSEUDO_RE.test(minecraftPseudo)) {
        return json({
            ok: false,
            error: 'Pseudo Minecraft invalide (3 a 16 caracteres : lettres, chiffres, _).'
        }, 400);
    }

    if (discordPseudo && !DISCORD_RE.test(discordPseudo)) {
        return json({
            ok: false,
            error: 'Pseudo Discord invalide (ex: Joueur#1234 ou joueur_discord).'
        }, 400);
    }

    if (minecraftPseudo && minecraftPseudo !== user.minecraftPseudo) {
        const uuid = await resolveMinecraftUuid(minecraftPseudo);
        user.minecraftPseudo = minecraftPseudo;
        user.minecraftUuid = uuid;
        await setMinecraftIndex(env, user.id, minecraftPseudo);
    } else if (minecraftPseudo === '' || minecraftPseudo === null) {
        user.minecraftPseudo = null;
        user.minecraftUuid = null;
    }

    if (discordPseudo !== undefined) {
        user.discordPseudo = discordPseudo || null;
    }

    await saveUser(env, user);
    return json({ ok: true, user: publicUser(user) });
}
