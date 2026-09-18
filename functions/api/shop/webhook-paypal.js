/*
 * Webhook PayPal (optionnel, redondance avec paypal-return).
 * Event : PAYMENT.CAPTURE.COMPLETED
 *
 * Env : PAYPAL_WEBHOOK_ID (optionnel verification), PAYPAL_CLIENT_ID/SECRET
 * URL : https://valdoream.pages.dev/api/shop/webhook-paypal
 */

import { envGet } from '../auth/_lib.js';
import { fulfillPaidOrder, json } from './_fulfill.js';

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

export async function onRequestPost({ request, env }) {
    const raw = await request.text();
    let event;
    try {
        event = JSON.parse(raw);
    } catch {
        return json({ ok: false, error: 'JSON invalide' }, 400);
    }

    const webhookId = envGet(env, 'PAYPAL_WEBHOOK_ID');
    if (webhookId) {
        const token = await paypalAccessToken(env);
        if (token) {
            const verify = await fetch(paypalApiBase(env) + '/v1/notifications/verify-webhook-signature', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    auth_algo: request.headers.get('paypal-auth-algo'),
                    cert_url: request.headers.get('paypal-cert-url'),
                    transmission_id: request.headers.get('paypal-transmission-id'),
                    transmission_sig: request.headers.get('paypal-transmission-sig'),
                    transmission_time: request.headers.get('paypal-transmission-time'),
                    webhook_id: webhookId,
                    webhook_event: event
                })
            });
            const v = await verify.json().catch(() => ({}));
            if (v.verification_status !== 'SUCCESS') {
                return json({ ok: false, error: 'Signature PayPal invalide' }, 400);
            }
        }
    }

    const type = event.event_type || '';
    if (type !== 'PAYMENT.CAPTURE.COMPLETED' && type !== 'CHECKOUT.ORDER.APPROVED') {
        return json({ ok: true, ignored: type });
    }

    const resource = event.resource || {};
    const orderId =
        resource.custom_id
        || resource.supplementary_data?.related_ids?.order_id
        || resource.purchase_units?.[0]?.custom_id
        || '';

    // custom_id devrait etre VD-XXXX
    let ref = orderId;
    if (!/^VD-/i.test(ref)) {
        // parfois dans invoice_id / description
        const desc = resource.description || '';
        const m = desc.match(/VD-[A-Z0-9]+/i);
        if (m) ref = m[0];
    }
    if (!ref) return json({ ok: true, skipped: 'no_order_id' });

    const result = await fulfillPaidOrder(env, ref, {
        provider: 'paypal',
        providerRef: resource.id || ''
    });
    if (!result.ok) return json(result, result.status || 400);
    return json({ ok: true, orderId: ref, queued: result.queued });
}
