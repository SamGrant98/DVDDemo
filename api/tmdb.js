// /api/tmdb — TMDB v3 proxy
//
// Client calls this with ?path=/configuration or ?path=/search/movie&query=...
// The API key lives in TMDB_API_KEY (Vercel env var); it never reaches the browser.
//
// Edge cache headers keep popular searches warm across all visitors, which is
// our main defence against rate-limit pressure as the public tool gets traffic.

const TMDB_API = "https://api.themoviedb.org/3";

const ALLOWED_PATHS = new Set([
  "/configuration",
  "/search/movie",
]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "TMDB_API_KEY not configured on server" });
    return;
  }

  const { path, ...rest } = req.query;
  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Missing required query param: path" });
    return;
  }

  if (!ALLOWED_PATHS.has(path)) {
    res.status(400).json({ error: `Path not allowed: ${path}` });
    return;
  }

  const url = new URL(TMDB_API + path);
  url.searchParams.set("api_key", apiKey);
  if (!rest.language) url.searchParams.set("language", "en-GB");

  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && v !== null && String(v).length) {
      url.searchParams.set(k, String(v));
    }
  }

  try {
    const upstream = await fetch(url.toString());

    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get("retry-after") || "1";
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({
        error: "TMDB rate limit hit",
        retryAfter: Number(retryAfter),
      });
      return;
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      res.status(upstream.status).json({
        error: "TMDB upstream error",
        status: upstream.status,
        body: text.slice(0, 200),
      });
      return;
    }

    const data = await upstream.json();

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800",
    );
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({
      error: "Proxy request failed",
      message: err?.message || String(err),
    });
  }
}
