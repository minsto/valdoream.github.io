/*
 * Telecharge un asset de release privee sans exposer le token au launcher.
 * Redirige vers l'URL temporaire GitHub (S3) des que possible.
 */

import { envGet, json } from '../auth/_lib.js';

const DEFAULT_REPOS = [
    'minsto/ValdoreamLuncher-update',
    'minsto/ValdoreamLauncher-update'
];

function githubToken(env) {
    let raw = envGet(env, 'LAUNCHER_GITHUB_TOKEN') || envGet(env, 'GITHUB_TOKEN') || '';
    return String(raw).trim().replace(/^["']|["']$/g, '').replace(/\r?\n/g, '');
}

function repoCandidates(env) {
    const preferred = envGet(env, 'LAUNCHER_UPDATE_REPO') || DEFAULT_REPOS[0];
    const fromQuery = '';
    return [preferred, ...DEFAULT_REPOS].filter((v, i, a) => v && a.indexOf(v) === i);
}

export async function onRequestGet({ request, env }) {
    const token = githubToken(env);
    if (!token) {
        return json({ ok: false, error: 'GITHUB_TOKEN manquant.' }, 503);
    }

    const url = new URL(request.url);
    const assetId = String(url.searchParams.get('asset') || '').trim();
    const repoParam = String(url.searchParams.get('repo') || '').trim();
    if (!/^\d+$/.test(assetId)) {
        return json({ ok: false, error: 'Asset invalide.' }, 400);
    }

    const candidates = repoParam
        ? [repoParam, ...repoCandidates(env)].filter((v, i, a) => a.indexOf(v) === i)
        : repoCandidates(env);

    let lastStatus = 404;
    for (const repo of candidates) {
        const res = await fetch(`https://api.github.com/repos/${repo}/releases/assets/${assetId}`, {
            headers: {
                Accept: 'application/octet-stream',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'Valdoream-Update-Proxy'
            },
            redirect: 'manual'
        });
        lastStatus = res.status;
        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get('Location');
            if (loc) return Response.redirect(loc, 302);
        }
        if (res.ok) {
            return new Response(res.body, {
                status: 200,
                headers: {
                    'Content-Type': res.headers.get('Content-Type') || 'application/zip',
                    'Content-Length': res.headers.get('Content-Length') || '',
                    'Cache-Control': 'no-store',
                    'Content-Disposition': res.headers.get('Content-Disposition')
                        || 'attachment; filename="Valdoream-update.zip"'
                }
            });
        }
    }

    return json({
        ok: false,
        error: lastStatus === 404
            ? 'Fichier de mise a jour introuvable.'
            : `Telechargement GitHub ${lastStatus}`
    }, lastStatus === 404 ? 404 : 502);
}
