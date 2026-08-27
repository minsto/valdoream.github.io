/*
 * Checkout boutique : enregistre l'achat et place les commandes Minecraft en file
 * d'attente. Le serveur NeoForge (ou le script bridge) les execute ensuite.
 *
 * Pas de paiement Stripe ici : c'est la livraison en jeu. Brancher Stripe avant
 * la mise en production.
 */

const CONTENT_KEY = 'content';
const PSEUDO_RE = /^[a-zA-Z0-9_]{3,16}$/;

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

export async function onRequest({ request, env }) {
    if (request.method !== 'POST') {
        return json({ ok: false, error: 'Utilise POST avec un corps JSON.' }, 405);
    }

    if (!env.CONTENT) {
        return json({
            ok: false,
            error: 'Base de donnees non branche : binding KV CONTENT manquant.'
        }, 503);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const player = String(body?.player ?? '').trim();
    if (!PSEUDO_RE.test(player)) {
        return json({
            ok: false,
            error: 'Pseudo Minecraft invalide (3 a 16 caracteres : lettres, chiffres, _).'
        }, 400);
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
        const queued = [];
        const missing = [];

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
                    status: 'pending',
                    createdAt: new Date().toISOString()
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
                date: now
            });
        }

        if (queued.length === 0) {
            return json({
                ok: false,
                error: 'Aucun article livrable : ' + (missing.join(', ') || 'panier invalide')
            }, 400);
        }

        await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));

        return json({
            ok: true,
            queued: queued.length,
            missing,
            message: queued.length + ' commande(s) envoyee(s) au serveur Minecraft.'
        });
    } catch (err) {
        return json({ ok: false, error: String(err) }, 502);
    }
}
