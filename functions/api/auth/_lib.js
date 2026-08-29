/*
 * Auth joueurs : sessions + profils dans Workers KV.
 *
 * Cles KV :
 *   user:{id}
 *   user_by_email:{email}
 *   session:{token}
 *   oauth_state:{state}
 */

export const SESSION_COOKIE = 'valdoream_session';
export const SESSION_DAYS = 30;

export function json(payload, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0',
            ...extraHeaders
        }
    });
}

export function envGet(env, name) {
    if (!env) return undefined;
    if (env[name] != null && String(env[name]).trim() !== '') return String(env[name]).trim();
    // Tolere un espace accidentel dans le nom de variable Cloudflare.
    const spaced = name + ' ';
    if (env[spaced] != null && String(env[spaced]).trim() !== '') return String(env[spaced]).trim();
    return undefined;
}

export function siteUrl(env, request) {
    if (envGet(env, 'SITE_URL')) return envGet(env, 'SITE_URL').replace(/\/+$/, '');
    try {
        return new URL(request.url).origin;
    } catch {
        return 'https://valdoream.pages.dev';
    }
}

export function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i === -1) continue;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        out[k] = decodeURIComponent(v);
    }
    return out;
}

export function sessionCookieHeader(token, maxAgeSec = SESSION_DAYS * 86400) {
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookie() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function randomToken(bytes = 32) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getSessionUser(env, request) {
    if (!env.CONTENT) return null;
    const cookies = parseCookies(request.headers.get('Cookie'));
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;

    const session = await env.CONTENT.get('session:' + token, 'json');
    if (!session || !session.userId) return null;
    if (session.expiresAt && Date.now() > session.expiresAt) {
        await env.CONTENT.delete('session:' + token);
        return null;
    }

    const user = await env.CONTENT.get('user:' + session.userId, 'json');
    return user || null;
}

export async function createSession(env, userId) {
    const token = randomToken(32);
    const expiresAt = Date.now() + SESSION_DAYS * 86400 * 1000;
    await env.CONTENT.put('session:' + token, JSON.stringify({ userId, expiresAt }), {
        expirationTtl: SESSION_DAYS * 86400
    });
    return token;
}

export function emptyUser(partial) {
    return {
        id: partial.id,
        email: partial.email,
        name: partial.name || '',
        provider: partial.provider,
        picture: partial.picture || null,
        minecraftPseudo: partial.minecraftPseudo || null,
        minecraftUuid: partial.minecraftUuid || null,
        discordPseudo: partial.discordPseudo || null,
        grade: partial.grade || 'Joueur',
        banned: Boolean(partial.banned),
        banReason: partial.banReason || null,
        purchases: Array.isArray(partial.purchases) ? partial.purchases : [],
        createdAt: partial.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

export async function upsertOAuthUser(env, { email, name, provider, picture }) {
    const emailKey = String(email || '').trim().toLowerCase();
    if (!emailKey) throw new Error('Email OAuth manquant.');

    const existingId = await env.CONTENT.get('user_by_email:' + emailKey);
    let user;

    if (existingId) {
        user = await env.CONTENT.get('user:' + existingId, 'json');
        if (!user) user = emptyUser({ id: existingId, email: emailKey, name, provider, picture });
        else {
            user.name = name || user.name;
            user.picture = picture || user.picture;
            user.provider = provider || user.provider;
            user.updatedAt = new Date().toISOString();
        }
    } else {
        const id = randomToken(16);
        user = emptyUser({ id, email: emailKey, name, provider, picture });
        await env.CONTENT.put('user_by_email:' + emailKey, id);
    }

    await env.CONTENT.put('user:' + user.id, JSON.stringify(user));
    return user;
}

export async function saveUser(env, user) {
    user.updatedAt = new Date().toISOString();
    await env.CONTENT.put('user:' + user.id, JSON.stringify(user));
    return user;
}

export async function findUserByMinecraft(env, pseudo) {
    // Scan leger via index optionnel ; sinon null (utilise lors du sync ban admin).
    const index = await env.CONTENT.get('minecraft_index:' + String(pseudo).toLowerCase());
    if (!index) return null;
    return env.CONTENT.get('user:' + index, 'json');
}

export async function setMinecraftIndex(env, userId, pseudo) {
    if (!pseudo) return;
    await env.CONTENT.put('minecraft_index:' + String(pseudo).toLowerCase(), userId);
}

export const PSEUDO_RE = /^[a-zA-Z0-9_]{3,16}$/;
export const DISCORD_RE = /^.{2,32}#[0-9]{4}$|^[a-zA-Z0-9._]{2,32}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toHex(buffer) {
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, saltHex = null) {
    const salt = saltHex
        ? Uint8Array.from(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)))
        : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        key,
        256
    );
    return { salt: toHex(salt), hash: toHex(bits) };
}

export async function verifyPassword(password, saltHex, hashHex) {
    const next = await hashPassword(password, saltHex);
    return next.hash === hashHex;
}

export async function createCaptcha(env) {
    const a = 2 + Math.floor(Math.random() * 8);
    const b = 1 + Math.floor(Math.random() * 9);
    const id = randomToken(12);
    await env.CONTENT.put(
        'captcha:' + id,
        JSON.stringify({ answer: String(a + b), createdAt: Date.now() }),
        { expirationTtl: 300 }
    );
    return { id, question: 'Combien font ' + a + ' + ' + b + ' ?' };
}

export async function consumeCaptcha(env, id, answer) {
    if (!id || answer == null) return false;
    const key = 'captcha:' + String(id);
    const data = await env.CONTENT.get(key, 'json');
    await env.CONTENT.delete(key);
    if (!data) return false;
    return String(answer).trim() === String(data.answer);
}

export async function createPasswordUser(env, { email, password, name }) {
    const emailKey = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(emailKey)) throw new Error('Email invalide.');
    if (!password || String(password).length < 8) {
        throw new Error('Mot de passe trop court (8 caracteres minimum).');
    }

    const existingId = await env.CONTENT.get('user_by_email:' + emailKey);
    if (existingId) throw new Error('Un compte existe deja avec cet email.');

    const { salt, hash } = await hashPassword(password);
    const id = randomToken(16);
    const user = emptyUser({
        id,
        email: emailKey,
        name: name || emailKey.split('@')[0],
        provider: 'password'
    });
    user.passwordSalt = salt;
    user.passwordHash = hash;

    await env.CONTENT.put('user_by_email:' + emailKey, id);
    await env.CONTENT.put('user:' + id, JSON.stringify(user));
    return user;
}

export async function loginPasswordUser(env, { email, password }) {
    const emailKey = String(email || '').trim().toLowerCase();
    const existingId = await env.CONTENT.get('user_by_email:' + emailKey);
    if (!existingId) throw new Error('Email ou mot de passe incorrect.');

    const user = await env.CONTENT.get('user:' + existingId, 'json');
    if (!user || !user.passwordHash || !user.passwordSalt) {
        throw new Error('Ce compte utilise une autre methode de connexion.');
    }

    const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!ok) throw new Error('Email ou mot de passe incorrect.');
    return user;
}

export async function verifyBotProtection(env, request, body) {
    const siteKey = envGet(env, 'TURNSTILE_SITE_KEY') || '';
    const secretKey = envGet(env, 'TURNSTILE_SECRET_KEY') || '';
    const turnstileReady = Boolean(siteKey && secretKey);

    // Prefer Cloudflare Turnstile when BOTH keys are configured.
    if (turnstileReady) {
        const token = body?.turnstileToken;
        if (!token) {
            return {
                ok: false,
                error: 'Valide le captcha anti-bot (case Cloudflare), puis reessaie.'
            };
        }

        const ip = request.headers.get('CF-Connecting-IP') || '';
        const form = new URLSearchParams();
        form.set('secret', secretKey);
        form.set('response', token);
        if (ip) form.set('remoteip', ip);

        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: form
        });
        const data = await res.json().catch(() => ({}));
        if (!data.success) {
            return { ok: false, error: 'Captcha refuse. Recharge la page et reessaie.' };
        }
        return { ok: true, mode: 'turnstile' };
    }

    // Fallback: simple math captcha (weaker, but works without Turnstile keys).
    const captchaOk = await consumeCaptcha(env, body?.captchaId, body?.captchaAnswer);
    if (!captchaOk) {
        return { ok: false, error: 'Captcha incorrect ou expire. Reessaie.' };
    }
    return { ok: true, mode: 'math' };
}

export async function resolveMinecraftUuid(pseudo) {
    try {
        const res = await fetch('https://playerdb.co/api/player/minecraft/' + encodeURIComponent(pseudo), {
            headers: { 'User-Agent': 'ValdoreamPortal/1.0' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const id = data?.data?.player?.id || data?.data?.player?.raw_id;
        return id ? String(id).replace(/-/g, '') : null;
    } catch {
        return null;
    }
}

export function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
        picture: user.picture,
        minecraftPseudo: user.minecraftPseudo,
        minecraftUuid: user.minecraftUuid,
        discordPseudo: user.discordPseudo,
        grade: user.grade || 'Joueur',
        banned: Boolean(user.banned),
        banReason: user.banReason,
        purchases: user.purchases || [],
        skin: {
            avatar: user.minecraftPseudo
                ? 'https://mc-heads.net/avatar/' + encodeURIComponent(user.minecraftPseudo) + '/128'
                : null,
            body: user.minecraftPseudo
                ? 'https://mc-heads.net/body/' + encodeURIComponent(user.minecraftPseudo) + '/right'
                : null
        },
        createdAt: user.createdAt
    };
}
