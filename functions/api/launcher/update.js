/*
 * Check de mise a jour launcher pour un depot GitHub PRIVE.
 *
 * Cloudflare Pages → Environment variables (Production + Redeploy) :
 *   GITHUB_TOKEN            = PAT fine-grained (Contents: Read) sur le repo update
 *   LAUNCHER_UPDATE_REPO     = owner/repo  (optionnel)
 *
 * Ajoute ?debug=1 pour diagnostiquer (sans exposer le token).
 */

import { envGet, json, siteUrl } from '../auth/_lib.js';

const MAX_ZIP = 80 * 1024 * 1024;
const DEFAULT_REPOS = [
    'minsto/ValdoreamLuncher-update',
    'minsto/ValdoreamLauncher-update'
];

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
    let raw = envGet(env, 'LAUNCHER_GITHUB_TOKEN') || envGet(env, 'GITHUB_TOKEN') || '';
    raw = String(raw).trim().replace(/^["']|["']$/g, '').replace(/\r?\n/g, '');
    return raw;
}

function updateRepo(env) {
    return envGet(env, 'LAUNCHER_UPDATE_REPO') || DEFAULT_REPOS[0];
}

function repoCandidates(env) {
    const preferred = updateRepo(env);
    return [preferred, ...DEFAULT_REPOS].filter((v, i, a) => v && a.indexOf(v) === i);
}

function ghHeaders(token) {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Valdoream-Update-Proxy'
    };
}

function scoreRelease(release) {
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

async function probeRepo(repo, token) {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: ghHeaders(token)
    });
    return { repo, status: res.status, ok: res.ok };
}

async function resolveAccessibleRepo(env, token) {
    const probes = [];
    for (const repo of repoCandidates(env)) {
        const probe = await probeRepo(repo, token);
        probes.push(probe);
        if (probe.ok) return { repo, probes };
        if (probe.status === 401 || probe.status === 403) {
            return { repo, probes, authFail: probe.status };
        }
    }
    return { repo: updateRepo(env), probes, authFail: null };
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
        return { status: 200, release: pickBestRelease(published), listHint: 'prerelease-only' };
    }
    return { status: 200, release: pickBestRelease(stable), listHint: null };
}

export async function onRequestGet({ request, env }) {
    const token = githubToken(env);
    const debug = new URL(request.url).searchParams.get('debug') === '1';
    if (!token) {
        return json({
            ok: false,
            configured: false,
            error: 'Mises a jour privees non configurees (GITHUB_TOKEN manquant sur Cloudflare Production).',
            debug: debug ? { tokenPresent: false } : undefined
        }, 503);
    }

    const currentRaw = new URL(request.url).searchParams.get('current') || '0.0.0';
    const current = formatSemver(parseSemver(currentRaw)) || String(currentRaw).replace(/^v/i, '');

    const resolved = await resolveAccessibleRepo(env, token);
    if (resolved.authFail) {
        return json({
            ok: false,
            configured: true,
            current,
            error: `Token GitHub refuse (${resolved.authFail}). Regenerer le PAT (Contents: Read).`,
            debug: debug
                ? {
                    tokenPresent: true,
                    tokenPrefix: token.slice(0, 10) + '…',
                    tokenLen: token.length,
                    probes: resolved.probes
                }
                : undefined
        }, 403);
    }
    if (!resolved.probes?.some((p) => p.ok)) {
        return json({
            ok: false,
            configured: true,
            current,
            latest: current,
            available: false,
            repo: resolved.repo,
            error: 'Le PAT ne voit aucun repo update. Sur le fine-grained token : Resource owner = ton compte, Only select repositories = ValdoreamLauncher-update, Contents Read. Puis Cloudflare Production + Redeploy.',
            debug: debug
                ? {
                    tokenPresent: true,
                    tokenPrefix: token.slice(0, 10) + '…',
                    tokenLen: token.length,
                    probes: resolved.probes
                }
                : undefined
        });
    }

    const repo = resolved.repo;
    const { status, release, listHint } = await fetchLatestRelease(repo, token);

    if (status === 401 || status === 403) {
        return json({
            ok: false,
            configured: true,
            current,
            error: 'Token GitHub refuse sur les releases (Contents: Read requis).'
        }, 403);
    }
    if (status !== 200 || !release) {
        let error = `Aucune release sur ${repo}.`;
        if (listHint === 'draft-only') {
            error = 'La release est encore en brouillon (Draft). Clique Publish release sur GitHub.';
        } else if (listHint === 'empty') {
            error = `Repo OK mais aucune release. Cree une release publiee avec un .zip.`;
        } else if (listHint === 'no-access') {
            error = `Acces repo OK mais releases 404 — verifie Contents: Read.`;
        }
        return json({
            ok: false,
            configured: true,
            current,
            latest: current,
            available: false,
            repo,
            error,
            debug: debug ? { probes: resolved.probes, listHint } : undefined
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
    }

    const origin = siteUrl(env, request);
    const zipUrl = realUpdate
        ? `${origin}/api/launcher/update-download?asset=${encodeURIComponent(String(assetId))}&repo=${encodeURIComponent(repo)}`
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
        error,
        debug: debug ? { probes: resolved.probes } : undefined
    });
}
