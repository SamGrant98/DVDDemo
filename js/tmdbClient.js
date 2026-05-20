// js/tmdbClient.js
// Browser TMDB client. Hits /api/tmdb (server-side proxy) — no API key client-side.
// Keeps localStorage caches for /configuration (7 days) and per-title search results
// so return visits don't re-hammer the proxy.

const PROXY = "/api/tmdb";
const LS_CFG_KEY = "tmdb_cfg_v2";
const LS_CACHE_KEY = "tmdb_search_cache_v2";

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

export function createTMDBClient({ language = "en-GB" } = {}) {
  let cfg = readJSON(LS_CFG_KEY, null);
  let cache = readJSON(LS_CACHE_KEY, {});

  async function proxyFetch(path, params = {}) {
    const url = new URL(PROXY, window.location.origin);
    url.searchParams.set("path", path);
    if (language) url.searchParams.set("language", language);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && String(v).length) {
        url.searchParams.set(k, String(v));
      }
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url.toString());
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after")) || 1;
        await sleep((retryAfter + 0.25) * 1000);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`[TMDB proxy] ${res.status} for ${path} :: ${text.slice(0, 120)}`);
      }
      return res.json();
    }
    throw new Error(`[TMDB proxy] persistent 429 for ${path}`);
  }

  async function getConfig() {
    const now = Date.now();
    if (cfg && cfg._ts && (now - cfg._ts) < 7 * 24 * 60 * 60 * 1000) return cfg;

    const data = await proxyFetch("/configuration");
    cfg = {
      _ts: now,
      secure_base_url: data.images.secure_base_url,
      poster_sizes: data.images.poster_sizes,
    };
    writeJSON(LS_CFG_KEY, cfg);
    return cfg;
  }

  function pickPosterSize(sizes, preferred = "w342") {
    if (!Array.isArray(sizes) || !sizes.length) return "w342";
    if (sizes.includes(preferred)) return preferred;
    const mid = sizes[Math.floor(sizes.length / 2)];
    return mid || sizes[0];
  }

  function cacheKey(title, year) {
    return `${(title || "").trim().toLowerCase()}__${String(year || "").trim()}`;
  }

  async function searchMovie(title, year) {
    const key = cacheKey(title, year);
    if (cache[key]) return cache[key];

    const data = await proxyFetch("/search/movie", {
      query: title,
      year: year || undefined,
      include_adult: "false",
    });

    const best = (data.results || [])[0] || null;
    cache[key] = best;
    writeJSON(LS_CACHE_KEY, cache);
    return best;
  }

  async function getPosterURLFor(title, year, preferredSize = "w342") {
    const conf = await getConfig();
    const hit = await searchMovie(title, year);
    if (!hit || !hit.poster_path) return null;

    const size = pickPosterSize(conf.poster_sizes, preferredSize);
    return `${conf.secure_base_url}${size}${hit.poster_path}`;
  }

  return {
    getPosterURLFor,
  };
}
