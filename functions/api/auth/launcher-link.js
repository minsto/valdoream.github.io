/*
 * GET /api/auth/launcher-link?uuid=&name=
 * Verifie si un compte portail a le meme pseudo / UUID Minecraft.
 * Public, sans email — pour la sync du launcher.
 */

import {
    json,
    lookupLauncherLink,
    publicUser
} from './_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);
    if (request.method !== 'GET') {
        return json({ ok: false, error: 'GET uniquement.' }, 405);
    }

    const url = new URL(request.url);
    const uuid = String(url.searchParams.get('uuid') || '').trim();
    const name = String(url.searchParams.get('name') || '').trim();
    if (!uuid && !name) {
        return json({ ok: false, error: 'uuid ou name requis.' }, 400);
    }

    try {
        const { linked, user } = await lookupLauncherLink(env, { uuid, name });
        if (!linked || !user) {
            return json({
                ok: true,
                linked: false,
                hint:
                    'Sur valdoream.pages.dev/portal/, connecte-toi et mets ton pseudo Minecraft ' +
                    'identique a ton compte Microsoft du launcher.'
            });
        }

        const pub = publicUser(user);
        return json({
            ok: true,
            linked: true,
            minecraftPseudo: pub.minecraftPseudo,
            minecraftUuid: pub.minecraftUuid,
            grade: pub.grade,
            name: pub.name,
            skin: pub.skin,
            hint: 'Compte portail Valdoream trouve pour ' + (pub.minecraftPseudo || pub.name)
        });
    } catch (err) {
        return json({ ok: false, error: String(err) }, 502);
    }
}
