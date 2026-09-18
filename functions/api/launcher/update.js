/*
 * Check de mise a jour launcher pour un depot GitHub PRIVE.
 *
 * Le token GitHub reste cote Cloudflare (GITHUB_TOKEN / LAUNCHER_GITHUB_TOKEN).
 * Le launcher ne voit jamais le token : il appelle seulement cette API publique.
 *
 * Cloudflare Pages → Settings → Environment variables :
 *   GITHUB_TOKEN            = PAT fine-grained (Contents: Read) sur le repo update
 *   LAUNCHER_UPDATE_REPO     = minsto/ValdoreamLauncher-update  (optionnel)
 */

import { envGet, json, siteUrl } from '../auth/_lib.js';

const MAX_ZIP = 80 * 1024 * 1024;

function parseSemver(tag) {
    const match = String(tag || '').trim().match(/^v?(\d+)\.(\d+)(?:\.(\d+))?$/i);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
}

function formatSemver(parts) {
    return parts ? parts.join('.') : '';
}

function newer(remote, local) {
    const a = parseSemver(remote);
    const b = parseSemver(local);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
    }
    return false;
}

function pickZipAsset(assets) {
    const zips = (assets || []).filter((item) => String(item.name || '').toLowerCase().endsWith('.zip'));
    return zips.find((item) => /valdoream/i.test(item.name || '')) || zips[0] || null;
}

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
        return json({
            ok: false,
            configured: false,
            error: 'Mises a jour privees non configurees (GITHUB_TOKEN manquant sur Cloudflare).'
        }, 503);
    }

    const currentRaw = new URL(request.url).searchParams.get('current') || '0.0.0';
    const current = formatSemver(parseSemver(currentRaw)) || String(currentRaw).replace(/^v/i, '');

    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'Valdoream-Update-Proxy'
        }
    });

    if (res.status === 404) {
        return json({
            ok: false,
            configured: true,
            current,
            latest: current,
            available: false,
            repo,
            error: `Aucune release sur ${repo}. Publie une release (tag 1.1.4+) avec un .zip.`
        });
    }
    if (res.status === 401 || res.status === 403) {
        return json({
            ok: false,
            configured: true,
            current,
            error: 'Token GitHub refuse (droits Contents: Read sur le repo update).'
        }, 403);
    }
    if (!res.ok) {
        return json({
            ok: false,
            configured: true,
            current,
            error: `GitHub ${res.status}`
        }, 502);
    }

    const release = await res.json();
    const tag = String(release.tag_name || '').trim();
    const latestParts = parseSemver(tag);
    const latest = formatSemver(latestParts) || current;
    const zip = pickZipAsset(release.assets);
    const zipBytes = Number(zip?.size || 0);
    const assetId = zip?.id;
    const newerTag = Boolean(latestParts && parseSemver(current) && newer(tag, current));
    const tooHeavy = newerTag && zipBytes > MAX_ZIP;
    const realUpdate = Boolean(
        newerTag
        && !release.draft
        && !release.prerelease
        && assetId
        && !tooHeavy
    );

    const origin = siteUrl(env, request);
    const zipUrl = realUpdate
        ? `${origin}/api/launcher/update-download?asset=${encodeURIComponent(String(assetId))}`
        : '';

    return json({
        ok: true,
        configured: true,
        current,
        latest,
        available: realUpdate,
        title: release.name || latest,
        url: release.html_url || '',
        zipUrl,
        assetApiUrl: '',
        zipballUrl: '',
        zipBytes: zipBytes || 0,
        assetId: realUpdate ? assetId : null,
        repo,
        private: true,
        error: tooHeavy
            ? `Le zip GitHub fait ${(zipBytes / (1024 * 1024)).toFixed(1)} Mo (trop gros / node_modules).`
            : ''
    });
}
