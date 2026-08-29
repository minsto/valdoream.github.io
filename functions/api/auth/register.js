import {
    createPasswordUser,
    createSession,
    json,
    publicUser,
    sessionCookieHeader,
    verifyBotProtection
} from './_lib';

export async function onRequest({ request, env }) {
    if (request.method !== 'POST') return json({ ok: false, error: 'POST uniquement.' }, 405);
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const bot = await verifyBotProtection(env, request, body);
    if (!bot.ok) return json({ ok: false, error: bot.error }, 400);

    try {
        const user = await createPasswordUser(env, {
            email: body.email,
            password: body.password,
            name: body.name
        });
        const token = await createSession(env, user.id);
        return json(
            { ok: true, user: publicUser(user), setup: true },
            200,
            { 'Set-Cookie': sessionCookieHeader(token) }
        );
    } catch (err) {
        return json({ ok: false, error: String(err.message || err) }, 400);
    }
}
