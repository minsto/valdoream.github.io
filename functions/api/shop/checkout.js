/*
 * Checkout boutique securise via PayPal.me
 *
 * 1) Cree une commande en attente (pas de livraison Minecraft)
 * 2) Renvoie l'URL PayPal.me avec le montant + reference commande
 * 3) L'admin confirme le paiement → livraison (voir /admin/api/shop/orders)
 *
 * Cloudflare (optionnel) :
 *   PAYPAL_ME_URL = https://paypal.me/RemyGrandmaison
 */

import { getSessionUser, envGet } from '../auth/_lib.js';

const CONTENT_KEY = 'content';
const DEFAULT_PAYPAL = 'https://paypal.me/RemyGrandmaison';

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
    if (!content || typeof content !== 'object') return null;
    if (!Array.isArray(content.shop)) content.shop = [];
    if (!Array.isArray(content.pendingOrders)) content.pendingOrders = [];
    if (!Array.isArray(content.queue)) content.queue = [];
    if (!Array.isArray(content.sales)) content.sales = [];
    if (!Array.isArray(content.logs)) content.logs = [];
    return content;
}

function orderId() {
    const n = Math.floor(Math.random() * 1e9).toString(36).toUpperCase().padStart(6, '0').slice(-6);
    return 'VD-' + n;
}

function paypalBase(env) {
    const raw = envGet(env, 'PAYPAL_ME_URL') || DEFAULT_PAYPAL;
    return String(raw).trim().replace(/\/+$/, '').split('?')[0];
}

function buildPaypalUrl(base, totalEur) {
    const amount = Number(totalEur);
    if (!Number.isFinite(amount) || amount <= 0) return base + '?locale.x=fr_FR&country.x=FR';
    // paypal.me/User/12.50 — montant en devise du compte (EUR ici)
    const fixed = amount.toFixed(2);
    return `${base}/${fixed}?locale.x=fr_FR&country.x=FR`;
}

export async function onRequest({ request, env }) {
    if (request.method !== 'POST') {
        return json({ ok: false, error: 'Utilise POST avec un corps JSON.' }, 405);
    }

    if (!env.CONTENT) {
        return json({
            ok: false,
            error: 'Base de donnees non branchee : binding KV CONTENT manquant.'
        }, 503);
    }

    const user = await getSessionUser(env, request);
    if (!user) {
        return json({
            ok: false,
            error: 'Connecte-toi avant d acheter (paiement securise PayPal).'
        }, 401);
    }

    if (user.banned) {
        return json({
            ok: false,
            error: 'Compte banni' + (user.banReason ? ' : ' + user.banReason : '.')
        }, 403);
    }

    const player = String(user.minecraftPseudo || '').trim();
    if (!player) {
        return json({
            ok: false,
            error: 'Ajoute ton pseudo Minecraft dans ton portail joueur avant d acheter.'
        }, 400);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const items = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
        return json({ ok: false, error: 'Panier vide.' }, 400);
    }

    try {
        const stored = await env.CONTENT.get(CONTENT_KEY, 'json');
        const content = withShop(stored ?? {});
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
            return json({
                ok: false,
                error: 'Aucun article valide : ' + (missing.join(', ') || 'panier invalide')
            }, 400);
        }

        total = Math.round(total * 100) / 100;
        const id = orderId();
        const isoNow = new Date().toISOString();
        const order = {
            id,
            status: 'awaiting_payment',
            userId: user.id,
            player,
            email: user.email || '',
            items: lines,
            total,
            currency: 'EUR',
            createdAt: isoNow,
            paidAt: null,
            note: 'Indique la reference ' + id + ' dans le message PayPal.'
        };

        content.pendingOrders = [order, ...content.pendingOrders.filter(o => o.status === 'awaiting_payment')].slice(0, 200);
        content.logs.push(`[Boutique]: commande ${id} creee pour ${player} — ${total.toFixed(2)} EUR (en attente PayPal)`);
        await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));

        const paypalUrl = buildPaypalUrl(paypalBase(env), total);

        return json({
            ok: true,
            pending: true,
            orderId: id,
            total,
            currency: 'EUR',
            player,
            paypalUrl,
            message:
                'Paiement securise PayPal. Indique la reference ' + id +
                ' dans le message du paiement. La livraison en jeu se fait apres verification.'
        });
    } catch (err) {
        return json({ ok: false, error: String(err) }, 502);
    }
}
