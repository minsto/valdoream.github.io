/*
 * File d'attente Minecraft : le mod NeoForge interroge cette adresse pour
 * recuperer les commandes a executer, puis confirme quand c'est fait.
 */

import {
    checkServerKey,
    json,
    queueSummary,
    readContent,
    writeContent
} from './_lib';

export async function onRequest({ request, env }) {
    if (!env.CONTENT) {
        return json({ ok: false, error: 'Binding KV CONTENT manquant.' }, 503);
    }

    const authErr = checkServerKey(request, env);
    if (authErr) return json({ ok: false, error: authErr }, 401);

    try {
        const content = await readContent(env);

        if (request.method === 'GET') {
            const summary = queueSummary(content.queue);
            return json({
                ok: true,
                pending: summary.pending,
                recent: summary.recent,
                count: summary.pendingCount
            });
        }

        if (request.method === 'POST') {
            let body;
            try {
                body = await request.json();
            } catch {
                return json({ ok: false, error: 'JSON invalide.' }, 400);
            }

            const id = body?.id;
            const status = body?.status;
            if (!id || !['done', 'failed'].includes(status)) {
                return json({ ok: false, error: 'Corps attendu : { id, status: "done"|"failed", error? }' }, 400);
            }

            const entry = content.queue.find(q => q.id === id);
            if (!entry) {
                return json({ ok: false, error: 'Commande introuvable : ' + id }, 404);
            }

            entry.status = status;
            entry.doneAt = new Date().toISOString();
            if (body.error) entry.error = String(body.error);

            const stamp = new Date().toLocaleTimeString('fr-FR');
            content.logs.push(
                `[MC ${stamp}]: ${entry.command} -> ${status}${body.error ? ' (' + body.error + ')' : ''}`
            );

            await writeContent(env, content);
            return json({ ok: true, id, status });
        }

        return json({ ok: false, error: 'GET ou POST uniquement.' }, 405);
    } catch (err) {
        return json({ ok: false, error: String(err) }, 502);
    }
}
