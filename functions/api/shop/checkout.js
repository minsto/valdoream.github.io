/*
 * Checkout boutique : utilise le compte connecte (pseudo Minecraft du profil).
 * Enregistre les achats sur le profil joueur + file Minecraft.
 */

import {
    getSessionUser,
    saveUser
} from '../auth/_lib';

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

function withQueue(content) {
    if (!content || typeof content !== 'object') return null;
    if (!Array.isArray(content.queue)) content.queue = [];
    if (!Array.isArray(content.sales)) content.sales = [];
    if (!Array.isArray(content.logs)) content.logs = [];
    return content;
}

function resolveCommand(template, player) {
    if (!template || typeof template !== 'string') return null;
    return template.replace(/\{player\}/gi, player).trim();
}

function productCommandList(product) {
    if (!product) return [];
    if (Array.isArray(product.commands) && product.commands.length) {
        return product.commands.map(c => String(c).trim()).filter(Boolean);
    }
    if (product.command) return [String(product.command).trim()];
    return [];
}

function isGradeProduct(product) {
    return product.category === 'grades' || /^grade\b/i.test(product.name || '');
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
            error: 'Connecte-toi avec Google ou Microsoft avant d acheter.'
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
        const content = withQueue(stored ?? {});
        if (!content.shop || !Array.isArray(content.shop)) {
            return json({ ok: false, error: 'Catalogue boutique introuvable.' }, 500);
        }

        const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const isoNow = new Date().toISOString();
        const queued = [];
        const missing = [];
        const purchaseRows = [];

        for (const item of items) {
            const product = content.shop.find(p => p.id === item.id || p.name === item.name);
            if (!product) {
                missing.push(item.name || item.id);
                continue;
            }

            const templates = productCommandList(product);
            if (!templates.length) {
                missing.push(product.name + ' (pas de commande configuree)');
                continue;
            }

            let itemQueued = false;

            for (const template of templates) {
                const command = resolveCommand(template, player);
                if (!command) continue;

                const entry = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    player,
                    command,
                    source: 'shop',
                    itemName: product.name,
                    userId: user.id,
                    status: 'pending',
                    createdAt: isoNow
                };
                content.queue.unshift(entry);
                queued.push(entry);
                itemQueued = true;

                content.logs.push(
                    `[Boutique]: ${player} a achete ${product.name} - commande en attente (${command})`
                );
            }

            if (!itemQueued) {
                missing.push(product.name + ' (commandes invalides)');
                continue;
            }

            content.sales.unshift({
                player,
                item: product.name,
                price: Number(product.price),
                date: now,
                userId: user.id
            });

            purchaseRows.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                item: product.name,
                price: Number(product.price),
                date: isoNow,
                category: product.category || 'items'
            });

            if (isGradeProduct(product)) {
                user.grade = product.name.replace(/^Grade\s+/i, '') || product.name;
            }
        }

        if (queued.length === 0) {
            return json({
                ok: false,
                error: 'Aucun article livrable : ' + (missing.join(', ') || 'panier invalide')
            }, 400);
        }

        if (!Array.isArray(user.purchases)) user.purchases = [];
        user.purchases = [...purchaseRows, ...user.purchases].slice(0, 200);
        await saveUser(env, user);
        await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));

        return json({
            ok: true,
            queued: queued.length,
            missing,
            message: queued.length + ' commande(s) envoyee(s) au serveur Valdoream.'
        });
    } catch (err) {
        return json({ ok: false, error: String(err) }, 502);
    }
}
