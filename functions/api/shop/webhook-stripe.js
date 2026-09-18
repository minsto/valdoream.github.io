/*
 * Webhook Stripe : checkout.session.completed → livraison auto.
 *
 * Env : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * Dashboard Stripe → Webhooks → URL :
 *   https://valdoream.pages.dev/api/shop/webhook-stripe
 * Event : checkout.session.completed
 */

import { envGet } from '../auth/_lib.js';
import { fulfillPaidOrder, json } from './_fulfill.js';

async function hmacSha256Hex(secret, payload) {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return out === 0;
}

async function verifyStripeSignature(rawBody, header, secret) {
    if (!header || !secret) return false;
    const parts = Object.fromEntries(
        header.split(',').map(p => {
            const i = p.indexOf('=');
            return [p.slice(0, i), p.slice(i + 1)];
        })
    );
    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) return false;
    const age = Math.abs(Date.now() / 1000 - Number(t));
    if (!Number.isFinite(age) || age > 300) return false;
    const expected = await hmacSha256Hex(secret, t + '.' + rawBody);
    return timingSafeEqual(expected, v1);
}

export async function onRequestPost({ request, env }) {
    const secret = envGet(env, 'STRIPE_WEBHOOK_SECRET');
    const raw = await request.text();
    const sig = request.headers.get('Stripe-Signature') || '';

    if (secret) {
        const ok = await verifyStripeSignature(raw, sig, secret);
        if (!ok) return json({ ok: false, error: 'Signature Stripe invalide.' }, 400);
    } else if (!envGet(env, 'STRIPE_SECRET_KEY')) {
        return json({ ok: false, error: 'Stripe non configure.' }, 503);
    }

    let event;
    try {
        event = JSON.parse(raw);
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    if (event.type !== 'checkout.session.completed') {
        return json({ ok: true, ignored: event.type });
    }

    const session = event.data?.object || {};
    const orderId = session.metadata?.orderId || session.client_reference_id;
    if (!orderId) return json({ ok: false, error: 'orderId manquant' }, 400);
    if (session.payment_status && session.payment_status !== 'paid') {
        return json({ ok: true, skipped: 'not_paid' });
    }

    const result = await fulfillPaidOrder(env, orderId, {
        provider: 'stripe',
        providerRef: session.id || ''
    });
    if (!result.ok) return json(result, result.status || 400);
    return json({ ok: true, orderId, queued: result.queued, already: result.already });
}
