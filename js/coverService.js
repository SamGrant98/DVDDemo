// js/coverService.js
// Applies TMDB poster URLs onto your CSV rows.
// Also supports local override covers later (front/back).

export function slugify(s) {
  return (s || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createCoverService({ tmdbClient, localCoverRoot = "./data/covers" }) {
  async function enrichRows(rows) {
    const out = [];
    for (const r of rows) {
      const title = r.title;
      const year = r.year;

      const slug = slugify(`${title}-${year}`);
      // Later: if you add files like data/covers/<slug>-front.jpg you can prefer them.
      const localFront = `${localCoverRoot}/${slug}-front.jpg`;
      const localBack  = `${localCoverRoot}/${slug}-back.jpg`;

      // We won't check local existence yet (would require HEAD + CORS nuances),
      // but we store the paths so you can start dropping images in and wire it up later.
      const enr = await tmdbClient.getEnrichmentFor(title, year, "w342");

      out.push({
        ...r,
        cover: {
          slug,
          posterUrl: enr?.posterUrl ?? null,
          backdropUrl: enr?.backdropUrl ?? null,
          voteAverage: enr?.voteAverage ?? null,
          voteCount: enr?.voteCount ?? null,
          overview: enr?.overview ?? null,        // TMDB synopsis paragraph
          tmdbId: enr?.tmdbId ?? null,
          localFront,
          localBack
        }
      });
    }
    return out;
  }

  return { enrichRows };
}
