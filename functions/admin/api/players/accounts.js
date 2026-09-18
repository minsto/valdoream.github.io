/*
 * Liste / moderation des comptes inscrits (portail joueur).
 * Protege par /admin/ middleware.
 *
 * GET    — liste des comptes
 * POST   — ban / grade
 * DELETE — supprimer definitivement un compte
 */

import {
    adminDeleteUser,
    json,
    publicUser,
    saveUser
} from '../../../api/auth/_lib';

async function listAccountIds(env) {
    const ids = [];
    let cursor;
    do {
        const page = await env.CONTENT.list({ prefix: 'user:', cursor, limit: 1000 });
        for (const key of page.keys || []) {
            // user:{id} seulement — ignore user_by_email:
            const name = key.name || '';
            if (/^user:[a-f0-9]+$/i.test(name)) {
                ids.push(name.slice('user:'.length));
            }
        }
        cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return ids;
}

async function loadAccounts(env) {
    const ids = await listAccountIds(env);
    const users = [];
    for (const id of ids) {
        const user = await env.CONTENT.get('user:' + id, 'json');
        if (user && user.email) users.push(user);
    }
    users.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return users;
}

function accountPayload(u) {
    const safe = publicUser(u);
    return {
        ...safe,
        email: u.email || null,
        purchaseCount: (u.purchases || []).length
    };
}

export async function onRequest({ request, env }) {
    if (!env.CONTENT) return json({ ok: false, error: 'KV manquante.' }, 503);

    if (request.method === 'GET') {
        try {
            const users = await loadAccounts(env);
            return json({
                ok: true,
                count: users.length,
                accounts: users.map(accountPayload)
            });
        } catch (err) {
            return json({ ok: false, error: String(err) }, 502);
        }
    }

    if (request.method === 'POST') {
        let body;
        try {
            body = await request.json();
        } catch {
            return json({ ok: false, error: 'JSON invalide.' }, 400);
        }

        const userId = String(body.userId || '').trim();
        if (!userId) return json({ ok: false, error: 'userId requis.' }, 400);

        const user = await env.CONTENT.get('user:' + userId, 'json');
        if (!user) return json({ ok: false, error: 'Compte introuvable.' }, 404);

        if (typeof body.banned === 'boolean') {
            user.banned = body.banned;
            user.banReason = body.banned
                ? (body.banReason || 'Banni depuis le panel admin')
                : null;
        }
        if (body.grade != null && String(body.grade).trim()) {
            user.grade = String(body.grade).trim();
        }

        await saveUser(env, user);
        return json({ ok: true, account: accountPayload(user) });
    }

    if (request.method === 'DELETE') {
        let body;
        try {
            body = await request.json();
        } catch {
            return json({ ok: false, error: 'JSON invalide.' }, 400);
        }

        const userId = String(body.userId || '').trim();
        if (!userId) return json({ ok: false, error: 'userId requis.' }, 400);

        try {
            const deleted = await adminDeleteUser(env, userId);
            return json({
                ok: true,
                deleted: {
                    id: deleted.id,
                    email: deleted.email || null,
                    minecraftPseudo: deleted.minecraftPseudo || null,
                    name: deleted.name || null
                }
            });
        } catch (err) {
            const msg = err.message || String(err);
            const status = /introuvable/i.test(msg) ? 404 : 400;
            return json({ ok: false, error: msg }, status);
        }
    }

    return json({ ok: false, error: 'GET, POST ou DELETE uniquement.' }, 405);
}
