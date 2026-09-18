/*
 * POST /api/auth/forgot-password
 * Envoie un lien de reinitialisation a l'email du joueur (Resend).
 */

import {
    json,
    requestPasswordReset,
    verifyBotProtection
} from './_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);
    if (request.method !== 'POST') {
        return json({ ok: false, error: 'POST uniquement.' }, 405);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const bot = await verifyBotProtection(env, request, body);
    if (!bot.ok) return json({ ok: false, error: bot.error }, 400);

    try {
        await requestPasswordReset(env, request, body.email);
        // Toujours le meme message (sauf erreur OAuth / config email).
        return json({
            ok: true,
            message:
                'Si un compte existe avec cet email, un lien de reinitialisation vient d\'etre envoye. Verifie ta boite de reception (et les spams).'
        });
    } catch (err) {
        const msg = err.message || String(err);
        // Erreurs de config / OAuth : on les remonte clairement.
        const status = /non configure|Echec envoi|autrement \(Google/i.test(msg) ? 400 : 400;
        return json({ ok: false, error: msg }, status);
    }
}
