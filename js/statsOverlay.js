// js/statsOverlay.js
//
// Modal showing collection stats: by-decade, by-genre, by-rating distributions
// plus a one-line summary (total / average rating / year range). Pure HTML+CSS
// bars — no chart library, no SVG.

export function mountStatsOverlay({
  rows,
  toggleEl,
  modal,
  closeButton,
  summaryEl,
  decadesEl,
  genresEl,
  ratingsEl,
}) {
  function open() {
    render();
    modal.hidden = false;
  }
  function close() {
    modal.hidden = true;
  }

  toggleEl.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  function render() {
    summaryEl.textContent = summary(rows);
    renderBars(decadesEl, byDecade(rows));
    renderBars(genresEl, byGenre(rows));
    renderBars(ratingsEl, byRating(rows));
  }

  render();
}

function summary(rows) {
  const total = rows.length;
  const rated = rows.filter(r => Number(r.rating) > 0);
  const avg = rated.length
    ? (rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length).toFixed(2)
    : "—";
  const years = rows.map(r => Number(r.year)).filter(Boolean);
  const earliest = years.length ? Math.min(...years) : null;
  const latest = years.length ? Math.max(...years) : null;
  const range = earliest && latest ? `${earliest}–${latest}` : "—";
  return `${total} films · avg rating ${avg} · ${range}`;
}

function byDecade(rows) {
  const counts = new Map();
  for (const r of rows) {
    const y = Number(r.year);
    if (!y) continue;
    const decade = Math.floor(y / 10) * 10;
    counts.set(decade, (counts.get(decade) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, count]) => ({ label: `${decade}s`, count }));
}

function byGenre(rows) {
  const counts = new Map();
  for (const r of rows) {
    if (!r.genre) continue;
    for (const g of r.genre.split(",")) {
      const t = g.trim();
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([genre, count]) => ({ label: genre, count }));
}

function byRating(rows) {
  const counts = new Map();
  for (const r of rows) {
    const rt = Number(r.rating);
    if (!rt) continue;
    counts.set(rt, (counts.get(rt) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rating, count]) => ({ label: `${rating} ★`, count }));
}

function renderBars(container, data) {
  container.innerHTML = "";
  if (!data.length) {
    container.innerHTML = `<p class="muted" style="margin:0;">No data</p>`;
    return;
  }
  const max = Math.max(...data.map(d => d.count));
  for (const { label, count } of data) {
    const row = document.createElement("div");
    row.className = "stats__bar";
    const labelEl = document.createElement("div");
    labelEl.className = "stats__bar-label";
    labelEl.textContent = label;
    const track = document.createElement("div");
    track.className = "stats__bar-track";
    const fill = document.createElement("div");
    fill.className = "stats__bar-fill";
    fill.style.width = `${(count / max) * 100}%`;
    track.appendChild(fill);
    const countEl = document.createElement("div");
    countEl.className = "stats__bar-count";
    countEl.textContent = count;
    row.append(labelEl, track, countEl);
    container.appendChild(row);
  }
}
