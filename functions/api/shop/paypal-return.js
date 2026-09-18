/*
 * Retour navigateur apres approbation PayPal → capture + livraison auto.
 * GET /api/shop/paypal-return?token=PAYPAL_ORDER_ID&orderId=VD-XXX
 */

import { envGet, siteUrl } from '../auth/_lib.js';
import { CONTENT_KEY, fulfillPaidOrder, withShop } from './_fulfill.js';

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

function redirect(origin, query) {
    return Response.redirect(origin + '/?' + query, 302);
}

export async function onRequestGet({ request, env }) {
    const origin = siteUrl(env, request);
    const url = new URL(request.url);
    const paypalToken = url.searchParams.get('token') || '';
    let orderId = url.searchParams.get('orderId') || '';

    if (!paypalToken) {
        return redirect(origin, 'shop=error&reason=missing_token');
    }

    const token = await paypalAccessToken(env);
    if (!token) {
        return redirect(origin, 'shop=error&reason=paypal_config');
    }

    // Si orderId absent, retrouver via providerRef
    if (!orderId && env.CONTENT) {
        const content = withShop(await env.CONTENT.get(CONTENT_KEY, 'json'));
        const found = content.pendingOrders.find(o => o.providerRef === paypalToken);
        if (found) orderId = found.id;
    }

    const cap = await fetch(
        paypalApiBase(env) + '/v2/checkout/orders/' + encodeURIComponent(paypalToken) + '/capture',
        {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        }
    );
    const capData = await cap.json().catch(() => ({}));
    const status = capData.status || '';
    const customId =
        capData.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id
        || capData.purchase_units?.[0]?.custom_id
        || orderId;

    if (!cap.ok && status !== 'COMPLETED') {
        // Deja capturee ?
        if (capData.name === 'ORDER_ALREADY_CAPTURED' && customId) {
            await fulfillPaidOrder(env, customId, { provider: 'paypal', providerRef: paypalToken });
            return redirect(origin, 'shop=success&orderId=' + encodeURIComponent(customId));
        }
        return redirect(origin, 'shop=error&reason=capture');
    }

    const ref = customId || orderId;
    if (!ref) return redirect(origin, 'shop=error&reason=no_order');

    const result = await fulfillPaidOrder(env, ref, {
        provider: 'paypal',
        providerRef: paypalToken
    });
    if (!result.ok) {
        return redirect(origin, 'shop=error&reason=fulfill');
    }
    return redirect(origin, 'shop=success&orderId=' + encodeURIComponent(ref));
}
