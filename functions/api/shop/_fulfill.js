/*
 * Livraison commune apres paiement (Stripe / PayPal / confirm admin).
 */

import { saveUser } from '../auth/_lib.js';

export const CONTENT_KEY = 'content';

export function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0'
        }
    });
}

export function withShop(content) {
    if (!content || typeof content !== 'object') return {};
    if (!Array.isArray(content.pendingOrders)) content.pendingOrders = [];
    if (!Array.isArray(content.queue)) content.queue = [];
    if (!Array.isArray(content.sales)) content.sales = [];
    if (!Array.isArray(content.logs)) content.logs = [];
    if (!Array.isArray(content.shop)) content.shop = [];
    return content;
}

export function makeOrderId() {
    const n = Math.floor(Math.random() * 1e9).toString(36).toUpperCase().padStart(6, '0').slice(-6);
    return 'VD-' + n;
}

function productCommandList(line, catalog) {
    const product = (catalog || []).find(p => p.id === line.id || p.name === line.name) || line;
    if (Array.isArray(product.commands) && product.commands.length) {
        return product.commands.map(c => String(c).trim()).filter(Boolean);
    }
    if (product.command) return [String(product.command).trim()];
    if (line.command) return [String(line.command).trim()];
    return [];
}

function resolveCommand(template, player) {
    if (!template) return null;
    return String(template).replace(/\{player\}/gi, player).trim();
}

function isGradeProduct(line) {
    return line.category === 'grades' || /^grade\b/i.test(line.name || '');
}

/**
 * Marque la commande payee et pousse les commandes Minecraft.
 * Idempotent si deja paid.
 */
export async function fulfillPaidOrder(env, orderId, meta = {}) {
    if (!env.CONTENT) throw new Error('KV CONTENT manquant');
    const content = withShop(await env.CONTENT.get(CONTENT_KEY, 'json'));
    const idx = content.pendingOrders.findIndex(o => o.id === orderId);
    if (idx < 0) return { ok: false, error: 'Commande introuvable', status: 404 };

    const order = content.pendingOrders[idx];
    if (order.status === 'paid') {
        return { ok: true, order, queued: order.queued || 0, already: true };
    }
    if (order.status === 'cancelled') {
        return { ok: false, error: 'Commande annulee', status: 409 };
    }

    const player = String(order.player || '').trim();
    if (!player) return { ok: false, error: 'Pseudo Minecraft manquant', status: 400 };

    const isoNow = new Date().toISOString();
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    let queued = 0;

    for (const line of order.items || []) {
        const templates = productCommandList(line, content.shop);
        const qty = Math.max(1, Number(line.qty) || 1);
        for (let q = 0; q < qty; q++) {
            for (const template of templates) {
                const command = resolveCommand(template, player);
                if (!command) continue;
                content.queue.unshift({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    player,
                    command,
                    source: 'shop',
                    itemName: line.name,
                    orderId,
                    userId: order.userId,
                    status: 'pending',
                    createdAt: isoNow
                });
                queued += 1;
            }
        }
        content.sales.unshift({
            player,
            item: line.name,
            price: Number(line.price) * (Number(line.qty) || 1),
            date: now,
            userId: order.userId,
            orderId,
            provider: meta.provider || order.provider || ''
        });
    }

    order.status = 'paid';
    order.paidAt = isoNow;
    order.queued = queued;
    order.provider = meta.provider || order.provider || '';
    order.providerRef = meta.providerRef || order.providerRef || '';
    content.pendingOrders[idx] = order;
    content.logs.push(
        `[Boutique]: paiement OK ${orderId} via ${order.provider || '?'} — ${player} — ${queued} cmd`
    );

    if (order.userId) {
        try {
            const user = await env.CONTENT.get('user:' + order.userId, 'json');
            if (user && user.id) {
                if (!Array.isArray(user.purchases)) user.purchases = [];
                const rows = (order.items || []).map(line => ({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    item: line.name,
                    price: Number(line.price) * (Number(line.qty) || 1),
                    date: isoNow,
                    category: line.category || 'items',
                    orderId
                }));
                user.purchases = [...rows, ...user.purchases].slice(0, 200);
                const gradeLine = (order.items || []).find(isGradeProduct);
                if (gradeLine) {
                    user.grade = String(gradeLine.name).replace(/^Grade\s+/i, '') || gradeLine.name;
                }
                await saveUser(env, user);
            }
        } catch {
            /* ignore */
        }
    }

    await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));
    return { ok: true, order, queued };
}

export async function cancelOrder(env, orderId) {
    const content = withShop(await env.CONTENT.get(CONTENT_KEY, 'json'));
    const idx = content.pendingOrders.findIndex(o => o.id === orderId);
    if (idx < 0) return { ok: false, error: 'Commande introuvable', status: 404 };
    const order = content.pendingOrders[idx];
    if (order.status !== 'awaiting_payment') {
        return { ok: false, error: 'Commande deja traitee (' + order.status + ')', status: 409 };
    }
    order.status = 'cancelled';
    order.cancelledAt = new Date().toISOString();
    content.pendingOrders[idx] = order;
    content.logs.push(`[Boutique]: commande ${orderId} annulee`);
    await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));
    return { ok: true, order };
}
