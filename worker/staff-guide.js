/**
 * lyricstamp-guide Worker.
 *
 * Serves the static LyricStamp user guide (docs/manual) through the ASSETS
 * binding, and adds a /download/mac route that hands the desktop app's latest
 * macOS .dmg to the browser from the GitHub release.
 *
 * UNLIKE the Rhythm / Statement Automator guides, this site is PUBLIC — there
 * is no Cloudflare Access in front of it. LyricStamp is a local-only app with
 * no cloud database, and the guide + download expose no user data or app API,
 * so it's safe to share with other churches.
 *
 * Download proxy: this exists only to give a stable "latest release" URL and to
 * pick the right asset — it is NOT an access-control gate. If the optional
 * env.GITHUB_WORKER_TOKEN secret is set (the same read-only, Contents-scoped
 * fine-grained token used by the other two guides), it's used server-side to
 * resolve GitHub's short-lived signed asset URL, then the browser is redirected
 * straight to it — the token never reaches the client. If the repo's releases
 * are public, the token is optional: the Worker falls back to the unauthenticated
 * GitHub API before reporting an error.
 */
const OWNER = "ajhochy";
const REPO = "lyricstamp";

/**
 * Pick the best macOS .dmg from a release's assets for the single /download/mac
 * route. Tolerates both the current/older "AbleSet.Sync-x.y.z-arm64.dmg" naming
 * and future "LyricStamp-*.dmg" naming. Preference order:
 *   1. universal build (works on Apple Silicon + Intel)
 *   2. arm64 build (Apple Silicon — the app does not ship a separate Intel build)
 *   3. any other .dmg
 * LyricStamp-named assets are preferred over legacy AbleSet.Sync names at each tier.
 */
function pickMacDmg(assets) {
  const dmgs = (assets || []).filter((a) => /\.dmg$/i.test(a.name));
  if (dmgs.length === 0) return null;
  const isLyricStamp = (a) => /lyricstamp/i.test(a.name);
  const score = (a) => {
    let s = 0;
    if (/universal/i.test(a.name)) s += 100;
    else if (/arm64|aarch64|apple.?silicon/i.test(a.name)) s += 50;
    else if (/x64|intel|x86_64/i.test(a.name)) s += 10;
    if (isLyricStamp(a)) s += 5; // prefer new branding within the same tier
    return s;
  };
  return dmgs.slice().sort((a, b) => score(b) - score(a))[0];
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const m = pathname.match(/^\/download\/(mac)\/?$/);
    if (m) return downloadLatestMac(env);
    // Not a download route — serve the static guide.
    return env.ASSETS.fetch(request);
  },
};

async function downloadLatestMac(env) {
  const token = env.GITHUB_WORKER_TOKEN; // optional — public fallback if absent

  const api = (path, accept, redirect) => {
    const headers = {
      Accept: accept || "application/vnd.github+json",
      "User-Agent": "lyricstamp-guide",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`https://api.github.com${path}`, { redirect: redirect || "follow", headers });
  };

  const relRes = await api(`/repos/${OWNER}/${REPO}/releases/latest`);
  if (relRes.status === 401 || relRes.status === 403) {
    return text(
      token
        ? `GitHub rejected the download token (HTTP ${relRes.status}). It may be expired or lack Contents read access.`
        : `GitHub denied access and no download token is configured (HTTP ${relRes.status}). If the repo's releases are private, set the GITHUB_WORKER_TOKEN secret.`,
      502,
    );
  }
  if (relRes.status === 404) {
    return text(`No published release found for ${OWNER}/${REPO} yet.`, 404);
  }
  if (!relRes.ok) return text(`Couldn't read the latest release (HTTP ${relRes.status}).`, 502);
  const rel = await relRes.json();

  const asset = pickMacDmg(rel.assets);
  if (!asset) return text(`No macOS .dmg found in release ${rel.tag_name || "latest"}.`, 404);

  // Ask GitHub for the bytes; it answers with a 302 to a short-lived signed URL.
  const assetRes = await api(
    `/repos/${OWNER}/${REPO}/releases/assets/${asset.id}`,
    "application/octet-stream",
    "manual",
  );
  const loc = assetRes.headers.get("location");
  if ([301, 302, 307, 308].includes(assetRes.status) && loc) {
    return Response.redirect(loc, 302);
  }
  // Fallback: stream the body straight through if no redirect was issued.
  if (assetRes.ok) {
    return new Response(assetRes.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asset.name}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return text(`Couldn't fetch the installer (HTTP ${assetRes.status}).`, 502);
}

function text(body, status) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
