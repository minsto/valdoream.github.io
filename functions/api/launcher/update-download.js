/*
 * Telecharge un asset de release privee sans exposer le token au launcher.
 * Redirige vers l'URL temporaire GitHub (S3) des que possible.
 */

import { envGet, json } from '../auth/_lib.js';

function githubToken(env) {
    return envGet(env, 'LAUNCHER_GITHUB_TOKEN') || envGet(env, 'GITHUB_TOKEN') || '';
}

function updateRepo(env) {
    return envGet(env, 'LAUNCHER_UPDATE_REPO') || 'minsto/ValdoreamLauncher-update';
}

export async function onRequestGet({ request, env }) {
    const token = githubToken(env);
    const repo = updateRepo(env);
    if (!token) {
        return json({ ok: false, error: 'GITHUB_TOKEN manquant.' }, 503);
    }

    const assetId = String(new URL(request.url).searchParams.get('asset') || '').trim();
    if (!/^\d+$/.test(assetId)) {
        return json({ ok: false, error: 'Asset invalide.' }, 400);
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/releases/assets/${assetId}`, {
        headers: {
            Accept: 'application/octet-stream',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'Valdoream-Update-Proxy'
        },
        redirect: 'manual'
    });

    if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('Location');
        if (loc) {
            return Response.redirect(loc, 302);
        }
    }

    if (!res.ok) {
        return json({
            ok: false,
            error: res.status === 404
                ? 'Fichier de mise a jour introuvable.'
                : `Telechargement GitHub ${res.status}`
        }, res.status === 404 ? 404 : 502);
    }

    return new Response(res.body, {
        status: 200,
        headers: {
            'Content-Type': res.headers.get('Content-Type') || 'application/zip',
            'Content-Length': res.headers.get('Content-Length') || '',
            'Cache-Control': 'no-store',
            'Content-Disposition': res.headers.get('Content-Disposition') || 'attachment; filename="Valdoream-update.zip"'
        }
    });
}
