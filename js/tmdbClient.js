// js/tmdbClient.js
// TMDB v3 client (browser). Requires config.TMDB_API_KEY.
// Caches config + search results in localStorage.

const TMDB_API = "https://api.themoviedb.org/3";
const LS_CFG_KEY = "tmdb_cfg_v1";
const LS_CACHE_KEY = "tmdb_search_cache_v1";

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

export function createTMDBClient({ apiKey, language = "en-GB" }) {
  if (!apiKey) {
    console.warn("[TMDB] Missing apiKey. Set config.TMDB_API_KEY.");
  }

  let cfg = readJSON(LS_CFG_KEY, null);
  let cache = readJSON(LS_CACHE_KEY, {});

  async function tmdbFetch(path, params = {}) {
    const url = new URL(TMDB_API + path);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("language", language);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && String(v).length) url.searchParams.set(k, String(v));
    }

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`[TMDB] ${res.status} ${res.statusText} for ${path} :: ${text.slice(0, 120)}`);
    }
    return res.json();
  }

  async function getConfig() {
    // Cache for ~7 days
    const now = Date.now();
    if (cfg && cfg._ts && (now - cfg._ts) < 7 * 24 * 60 * 60 * 1000) return cfg;

    const data = await tmdbFetch("/configuration");
    // image URL = secure_base_url + size + file_path
    cfg = {
      _ts: now,
      secure_base_url: data.images.secure_base_url,
      poster_sizes: data.images.poster_sizes
    };
    writeJSON(LS_CFG_KEY, cfg);
    return cfg;
  }

  function pickPosterSize(sizes, preferred = "w342") {
    if (!Array.isArray(sizes) || !sizes.length) return "w342";
    if (sizes.includes(preferred)) return preferred;
    // fall back to something mid-ish
    const mid = sizes[Math.floor(sizes.length / 2)];
    return mid || sizes[0];
  }

  function cacheKey(title, year) {
    return `${(title || "").trim().toLowerCase()}__${String(year || "").trim()}`;
  }

  async function searchMovie(title, year) {
    const key = cacheKey(title, year);
    if (cache[key]) return cache[key];

    // Light throttle so we don't spam TMDB on first load
    await sleep(120);

    const data = await tmdbFetch("/search/movie", {
      query: title,
      year: year || undefined,
      include_adult: "false"
    });

    const best = (data.results || [])[0] || null;
    cache[key] = best;
    writeJSON(LS_CACHE_KEY, cache);
    return best;
  }

  async function getPosterURLFor(title, year, preferredSize = "w342") {
    if (!apiKey) return null;

    const conf = await getConfig();
    const hit = await searchMovie(title, year);
    if (!hit || !hit.poster_path) return null;

    const size = pickPosterSize(conf.poster_sizes, preferredSize);
    return `${conf.secure_base_url}${size}${hit.poster_path}`;
  }

  return {
    getPosterURLFor
  };
}
