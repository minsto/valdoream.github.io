/*
 * Check de mise a jour launcher pour un depot GitHub PRIVE.
 *
 * Cloudflare Pages → Environment variables :
 *   GITHUB_TOKEN            = PAT fine-grained (Contents: Read) sur le repo update
 *   LAUNCHER_UPDATE_REPO     = minsto/ValdoreamLauncher-update  (optionnel)
 *
 * Important GitHub : /releases/latest ignore les draft et pre-release.
 * On liste donc les releases si /latest renvoie 404.
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

function ghHeaders(token) {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Valdoream-Update-Proxy'
    };
}

function scoreRelease(release) {
    // Prefere stable publiee, puis pre-release publiee (jamais les drafts).
    if (release.draft) return -1;
    const parts = parseSemver(release.tag_name);
    if (!parts) return -1;
    const base = parts[0] * 1e6 + parts[1] * 1e3 + parts[2];
    return release.prerelease ? base : base + 1e9;
}

function pickBestRelease(list) {
    const scored = (list || [])
        .map((r) => ({ r, score: scoreRelease(r) }))
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score);
    return scored[0]?.r || null;
}

async function fetchLatestRelease(repo, token) {
    const latestRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: ghHeaders(token)
    });
    if (latestRes.status === 401 || latestRes.status === 403) {
        return { status: latestRes.status, release: null, listHint: null };
    }
    if (latestRes.ok) {
        return { status: 200, release: await latestRes.json(), listHint: null };
    }

    // /latest = 404 si aucune release stable (draft / pre-release only, ou vide)
    const listRes = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, {
        headers: ghHeaders(token)
    });
    if (listRes.status === 401 || listRes.status === 403) {
        return { status: listRes.status, release: null, listHint: null };
    }
    if (!listRes.ok) {
        return {
            status: listRes.status || latestRes.status,
            release: null,
            listHint: listRes.status === 404 ? 'no-access' : null
        };
    }
    const list = await listRes.json();
    if (!Array.isArray(list) || !list.length) {
        return { status: 404, release: null, listHint: 'empty' };
    }
    const published = list.filter((r) => !r.draft);
    const stable = published.filter((r) => !r.prerelease);
    if (!published.length) {
        return { status: 404, release: null, listHint: 'draft-only' };
    }
    if (!stable.length) {
        // Utilise la pre-release la plus recente (mieux qu'un 404 silencieux)
        return { status: 200, release: pickBestRelease(published), listHint: 'prerelease-only' };
    }
    return { status: 200, release: pickBestRelease(stable), listHint: null };
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

    const { status, release, listHint } = await fetchLatestRelease(repo, token);

    if (status === 401 || status === 403) {
        return json({
            ok: false,
            configured: true,
            current,
            error: 'Token GitHub refuse (Contents: Read sur ValdoreamLauncher-update, repo coche).'
        }, 403);
    }
    if (status !== 200 || !release) {
        let error = `Aucune release sur ${repo}.`;
        if (listHint === 'draft-only') {
            error = 'La release est encore en brouillon (Draft). Clique Publish release sur GitHub.';
        } else if (listHint === 'empty') {
            error = `Aucune release sur ${repo}. Cree une release avec un .zip.`;
        } else if (listHint === 'no-access') {
            error = `GitHub 404 sur ${repo} : le PAT n'a pas acces (coche le repo dans le fine-grained token, Contents: Read) ou le nom du repo est faux.`;
        } else {
            error = `Aucune release lisible sur ${repo} (404). Verifie le nom du repo et que la release est publiee.`;
        }
        return json({
            ok: false,
            configured: true,
            current,
            latest: current,
            available: false,
            repo,
            error
        });
    }

    const tag = String(release.tag_name || '').trim();
    const latestParts = parseSemver(tag);
    const latest = formatSemver(latestParts) || current;
    const zip = pickZipAsset(release.assets);
    const zipBytes = Number(zip?.size || 0);
    const assetId = zip?.id;
    const newerTag = Boolean(latestParts && parseSemver(current) && newer(tag, current));
    const tooHeavy = newerTag && zipBytes > MAX_ZIP;
    const realUpdate = Boolean(newerTag && !release.draft && assetId && !tooHeavy);

    let error = '';
    if (tooHeavy) {
        error = `Le zip GitHub fait ${(zipBytes / (1024 * 1024)).toFixed(1)} Mo (trop gros / node_modules).`;
    } else if (newerTag && !assetId) {
        error = 'Release trouvee mais sans fichier .zip attache.';
    } else if (newerTag && release.draft) {
        error = 'Release encore en brouillon — publie-la sur GitHub.';
    } else if (listHint === 'prerelease-only' && !newerTag) {
        error = '';
    }

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
        prerelease: Boolean(release.prerelease),
        error
    });
}
