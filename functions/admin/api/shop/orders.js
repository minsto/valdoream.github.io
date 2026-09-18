/*
 * Admin : commandes boutique en attente de paiement PayPal.
 *
 * GET  → liste des pendingOrders
 * POST { orderId, action: 'confirm'|'cancel' }
 *   confirm → livre Minecraft (queue) + marque paye
 *   cancel  → annule
 *
 * Protege par /admin/_middleware.js (Basic Auth).
 */

import { saveUser } from '../../../api/auth/_lib.js';

const CONTENT_KEY = 'content';

function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0'
        }
    });
}

function withShop(content) {
    if (!content || typeof content !== 'object') return {};
    if (!Array.isArray(content.pendingOrders)) content.pendingOrders = [];
    if (!Array.isArray(content.queue)) content.queue = [];
    if (!Array.isArray(content.sales)) content.sales = [];
    if (!Array.isArray(content.logs)) content.logs = [];
    if (!Array.isArray(content.shop)) content.shop = [];
    return content;
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

export async function onRequest({ request, env }) {
    if (!env.CONTENT) {
        return json({ ok: false, error: 'KV CONTENT manquant.' }, 503);
    }

    if (request.method === 'GET') {
        const content = withShop(await env.CONTENT.get(CONTENT_KEY, 'json'));
        const pending = content.pendingOrders.filter(o => o.status === 'awaiting_payment');
        const recent = content.pendingOrders.filter(o => o.status !== 'awaiting_payment').slice(0, 30);
        return json({ ok: true, pending, recent });
    }

    if (request.method !== 'POST') {
        return json({ ok: false, error: 'GET ou POST uniquement.' }, 405);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const orderId = String(body?.orderId || '').trim();
    const action = String(body?.action || '').trim();
    if (!orderId || !['confirm', 'cancel'].includes(action)) {
        return json({ ok: false, error: 'orderId + action (confirm|cancel) requis.' }, 400);
    }

    const content = withShop(await env.CONTENT.get(CONTENT_KEY, 'json'));
    const idx = content.pendingOrders.findIndex(o => o.id === orderId);
    if (idx < 0) {
        return json({ ok: false, error: 'Commande introuvable.' }, 404);
    }

    const order = content.pendingOrders[idx];
    if (order.status !== 'awaiting_payment') {
        return json({ ok: false, error: 'Commande deja traitee (' + order.status + ').' }, 409);
    }

    const isoNow = new Date().toISOString();
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    if (action === 'cancel') {
        order.status = 'cancelled';
        order.cancelledAt = isoNow;
        content.pendingOrders[idx] = order;
        content.logs.push(`[Boutique]: commande ${orderId} annulee (admin)`);
        await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));
        return json({ ok: true, order });
    }

    // confirm → livrer
    const player = String(order.player || '').trim();
    if (!player) {
        return json({ ok: false, error: 'Pseudo Minecraft manquant sur la commande.' }, 400);
    }

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
            orderId
        });
    }

    order.status = 'paid';
    order.paidAt = isoNow;
    order.queued = queued;
    content.pendingOrders[idx] = order;
    content.logs.push(`[Boutique]: paiement confirme ${orderId} — ${player} — ${queued} commande(s) serveur`);

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
            /* livraison serveur prioritaire */
        }
    }

    await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));
    return json({ ok: true, order, queued });
}
