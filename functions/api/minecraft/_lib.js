/*
 * Utilitaires partages pour les endpoints Minecraft (mod NeoForge / bridge).
 */

export const CONTENT_KEY = 'content';
export const LIVE_KEY = 'minecraft_live';
export const MAX_LIVE_LOGS = 400;
export const LIVE_STALE_MS = 30_000;

export function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0'
        }
    });
}

export function checkServerKey(request, env) {
    const expected = env.SERVER_API_KEY;
    if (!expected) return 'SERVER_API_KEY non configuree dans Cloudflare Pages.';
    const got = request.headers.get('X-Server-Key') || request.headers.get('x-server-key');
    if (!got || got !== expected) return 'Cle serveur invalide.';
    return null;
}

export async function readContent(env) {
    const raw = await env.CONTENT.get(CONTENT_KEY, 'json');
    if (!raw || typeof raw !== 'object') {
        return { queue: [], logs: [], sales: [], shop: [], players: [], news: [], posts: [] };
    }
    if (!Array.isArray(raw.queue)) raw.queue = [];
    if (!Array.isArray(raw.logs)) raw.logs = [];
    return raw;
}

export async function writeContent(env, content) {
    await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));
}

export async function readLive(env) {
    const raw = await env.CONTENT.get(LIVE_KEY, 'json');
    if (!raw || typeof raw !== 'object') {
        return {
            connected: false,
            lastSeen: null,
            online: 0,
            maxPlayers: 0,
            players: [],
            tps: null,
            consoleLogs: []
        };
    }
    if (!Array.isArray(raw.consoleLogs)) raw.consoleLogs = [];
    if (!Array.isArray(raw.players)) raw.players = [];
    return raw;
}

export async function writeLive(env, live) {
    await env.CONTENT.put(LIVE_KEY, JSON.stringify(live));
}

export function trimLogs(lines, max = MAX_LIVE_LOGS) {
    if (!Array.isArray(lines)) return [];
    return lines.length > max ? lines.slice(lines.length - max) : lines;
}

export function isLiveConnected(live) {
    if (!live?.lastSeen) return false;
    const age = Date.now() - new Date(live.lastSeen).getTime();
    return age <= LIVE_STALE_MS;
}

export function queueSummary(queue) {
    const pending = queue.filter(q => q.status === 'pending');
    const recent = queue
        .filter(q => q.status !== 'pending')
        .slice(0, 30);
    return { pending, recent, pendingCount: pending.length };
}
