/*
 * Cree une commande + session Stripe Checkout ou ordre PayPal (API).
 *
 * Body: { items, method: 'stripe'|'paypal' }
 *
 * Env Cloudflare :
 *   STRIPE_SECRET_KEY
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_MODE = live | sandbox  (defaut live)
 *   SITE_URL (optionnel)
 *   PAYPAL_ME_URL (fallback manuel si API absente)
 */

import { getSessionUser, envGet, siteUrl } from '../auth/_lib.js';
import { CONTENT_KEY, json, withShop, makeOrderId } from './_fulfill.js';

const DEFAULT_PAYPAL_ME = 'https://paypal.me/RemyGrandmaison';

function paypalApiBase(env) {
    const mode = (envGet(env, 'PAYPAL_MODE') || 'live').toLowerCase();
    return mode === 'sandbox'
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';
}

async function paypalAccessToken(env) {
    const id = envGet(env, 'PAYPAL_CLIENT_ID');
    const secret = envGet(env, 'PAYPAL_CLIENT_SECRET');
    if (!id || !secret) return null;
    const auth = btoa(id + ':' + secret);
    const res = await fetch(paypalApiBase(env) + '/v1/oauth2/token', {
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + auth,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
}

async function createPaypalOrder(env, order, origin) {
    const token = await paypalAccessToken(env);
    if (!token) return { ok: false, error: 'PayPal API non configuree (PAYPAL_CLIENT_ID / SECRET).' };

    const returnUrl = origin + '/api/shop/paypal-return?orderId=' + encodeURIComponent(order.id);
    const cancelUrl = origin + '/?shop=cancel&orderId=' + encodeURIComponent(order.id);

    const res = await fetch(paypalApiBase(env) + '/v2/checkout/orders', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: order.id,
                custom_id: order.id,
                description: 'Valdoream ' + order.id + ' — ' + order.player,
                amount: {
                    currency_code: 'EUR',
                    value: Number(order.total).toFixed(2)
                }
            }],
            application_context: {
                brand_name: 'Valdoream',
                landing_page: 'NO_PREFERENCE',
                user_action: 'PAY_NOW',
                return_url: returnUrl,
                cancel_url: cancelUrl
            }
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        return { ok: false, error: data.message || data.details?.[0]?.description || 'PayPal order failed' };
    }
    const approve = (data.links || []).find(l => l.rel === 'approve');
    return {
        ok: true,
        providerRef: data.id,
        checkoutUrl: approve?.href || ''
    };
}

async function createStripeSession(env, order, origin) {
    const key = envGet(env, 'STRIPE_SECRET_KEY');
    if (!key) return { ok: false, error: 'Stripe non configure (STRIPE_SECRET_KEY).' };

    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', origin + '/?shop=success&orderId=' + encodeURIComponent(order.id));
    params.set('cancel_url', origin + '/?shop=cancel&orderId=' + encodeURIComponent(order.id));
    params.set('client_reference_id', order.id);
    params.set('metadata[orderId]', order.id);
    params.set('metadata[player]', order.player);
    params.set('locale', 'fr');
    params.set('currency', 'eur');

    (order.items || []).forEach((line, i) => {
        const prefix = 'line_items[' + i + ']';
        params.set(prefix + '[quantity]', String(Math.max(1, line.qty || 1)));
        params.set(prefix + '[price_data][currency]', 'eur');
        params.set(prefix + '[price_data][unit_amount]', String(Math.round(Number(line.price) * 100)));
        params.set(prefix + '[price_data][product_data][name]', String(line.name || 'Article Valdoream'));
        params.set(prefix + '[price_data][product_data][description]', 'Commande ' + order.id + ' — ' + order.player);
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        return { ok: false, error: data.error?.message || 'Stripe session failed' };
    }
    return { ok: true, providerRef: data.id, checkoutUrl: data.url };
}

function paypalMeUrl(env, total) {
    const base = (envGet(env, 'PAYPAL_ME_URL') || DEFAULT_PAYPAL_ME).replace(/\/+$/, '').split('?')[0];
    const amount = Number(total);
    if (!Number.isFinite(amount) || amount <= 0) return base + '?locale.x=fr_FR&country.x=FR';
    return `${base}/${amount.toFixed(2)}?locale.x=fr_FR&country.x=FR`;
}

export async function onRequest({ request, env }) {
    if (request.method === 'GET') {
        // Methodes dispo (pour l'UI)
        return json({
            ok: true,
            stripe: Boolean(envGet(env, 'STRIPE_SECRET_KEY')),
            paypal: Boolean(envGet(env, 'PAYPAL_CLIENT_ID') && envGet(env, 'PAYPAL_CLIENT_SECRET')),
            paypalMe: true
        });
    }

    if (request.method !== 'POST') {
        return json({ ok: false, error: 'Utilise POST.' }, 405);
    }

    if (!env.CONTENT) {
        return json({ ok: false, error: 'KV CONTENT manquant.' }, 503);
    }

    const user = await getSessionUser(env, request);
    if (!user) return json({ ok: false, error: 'Connecte-toi avant d acheter.' }, 401);
    if (user.banned) {
        return json({ ok: false, error: 'Compte banni' + (user.banReason ? ' : ' + user.banReason : '.') }, 403);
    }
    const player = String(user.minecraftPseudo || '').trim();
    if (!player) {
        return json({ ok: false, error: 'Ajoute ton pseudo Minecraft dans le portail avant d acheter.' }, 400);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const method = String(body?.method || 'stripe').toLowerCase();
    const items = body?.items;
    if (!Array.isArray(items) || !items.length) {
        return json({ ok: false, error: 'Panier vide.' }, 400);
    }

    const content = withShop(await env.CONTENT.get(CONTENT_KEY, 'json'));
    if (!content.shop.length) {
        return json({ ok: false, error: 'Catalogue boutique introuvable.' }, 500);
    }

    const lines = [];
    const missing = [];
    let total = 0;
    for (const item of items) {
        const product = content.shop.find(p => p.id === item.id || p.name === item.name);
        if (!product) {
            missing.push(item.name || item.id);
            continue;
        }
        const price = Number(product.price);
        if (!Number.isFinite(price) || price < 0) {
            missing.push(product.name + ' (prix invalide)');
            continue;
        }
        const qty = Math.max(1, Math.min(20, Number(item.qty) || 1));
        lines.push({
            id: product.id,
            name: product.name,
            price,
            qty,
            category: product.category || 'items',
            command: product.command || '',
            commands: Array.isArray(product.commands) ? product.commands : undefined
        });
        total += price * qty;
    }
    if (!lines.length) {
        return json({ ok: false, error: 'Aucun article valide : ' + (missing.join(', ') || 'panier') }, 400);
    }
    total = Math.round(total * 100) / 100;

    const id = makeOrderId();
    const origin = siteUrl(env, request);
    const order = {
        id,
        status: 'awaiting_payment',
        provider: method,
        userId: user.id,
        player,
        email: user.email || '',
        items: lines,
        total,
        currency: 'EUR',
        createdAt: new Date().toISOString(),
        paidAt: null
    };

    let pay;
    if (method === 'stripe') {
        pay = await createStripeSession(env, order, origin);
        order.provider = 'stripe';
    } else if (method === 'paypal') {
        pay = await createPaypalOrder(env, order, origin);
        order.provider = 'paypal';
    } else if (method === 'paypal_me') {
        pay = { ok: true, checkoutUrl: paypalMeUrl(env, total), providerRef: '' };
        order.provider = 'paypal_me';
        order.note = 'Indique la reference ' + id + ' dans le message PayPal (livraison apres verif admin).';
    } else {
        return json({ ok: false, error: 'Methode invalide (stripe|paypal|paypal_me).' }, 400);
    }

    if (!pay.ok || !pay.checkoutUrl) {
        return json({ ok: false, error: pay.error || 'Impossible de creer le paiement.' }, 502);
    }

    order.providerRef = pay.providerRef || '';
    content.pendingOrders = [order, ...content.pendingOrders].slice(0, 200);
    content.logs.push(`[Boutique]: ${id} creee (${order.provider}) — ${player} — ${total.toFixed(2)} EUR`);
    await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));

    return json({
        ok: true,
        pending: true,
        auto: method === 'stripe' || method === 'paypal',
        orderId: id,
        total,
        currency: 'EUR',
        player,
        method: order.provider,
        checkoutUrl: pay.checkoutUrl,
        message: method === 'paypal_me'
            ? 'PayPal.me : mets la reference ' + id + ' dans le message. Livraison apres confirmation staff.'
            : 'Paiement securise. Apres paiement, la livraison en jeu est automatique.'
    });
}
