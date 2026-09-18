/*
 * Admin : commandes boutique (liste + confirm/cancel manuel).
 * Confirm utilise la meme livraison que les webhooks.
 */

import { cancelOrder, fulfillPaidOrder, json, withShop, CONTENT_KEY } from '../../api/shop/_fulfill.js';

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

    if (action === 'cancel') {
        const result = await cancelOrder(env, orderId);
        if (!result.ok) return json(result, result.status || 400);
        return json({ ok: true, order: result.order });
    }

    const result = await fulfillPaidOrder(env, orderId, { provider: 'admin' });
    if (!result.ok) return json(result, result.status || 400);
    return json({ ok: true, order: result.order, queued: result.queued, already: result.already });
}
