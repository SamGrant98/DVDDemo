// js/filterPanel.js
//
// Top-left search + filter chip widget. On any change builds a predicate
// function and hands it to onFilterChange (which the caller passes to
// dvdStack.setFilter). The chips are extracted live from the rows so they
// match whatever collection is currently loaded.

export function mountFilterPanel({
  rows,
  toggleEl,
  bodyEl,
  badgeEl,
  searchEl,
  genresEl,
  decadesEl,
  ratingsEl,
  countEl,
  clearEl,
  onFilterChange,
}) {
  const state = {
    search: "",
    genres: new Set(),       // string genre names
    decades: new Set(),      // numeric decade starts (e.g. 1980)
    minRating: 0,            // 0 = no rating filter
  };

  const uniqueGenres = extractGenres(rows);
  const uniqueDecades = extractDecades(rows);
  const ratingOptions = [3, 3.5, 4, 4.5, 5];

  renderChips(genresEl, uniqueGenres.map(g => ({ value: g, label: g })));
  renderChips(decadesEl, uniqueDecades.map(d => ({ value: String(d), label: `${d}s` })));
  renderChips(ratingsEl, ratingOptions.map(r => ({ value: String(r), label: `${r}+ ★` })));

  toggleEl.addEventListener("click", (e) => {
    e.stopPropagation();
    bodyEl.hidden = !bodyEl.hidden;
  });

  document.addEventListener("click", (e) => {
    if (bodyEl.hidden) return;
    if (toggleEl.contains(e.target) || bodyEl.contains(e.target)) return;
    bodyEl.hidden = true;
  });

  searchEl.addEventListener("input", debounce(() => {
    state.search = searchEl.value.trim();
    update();
  }, 150));

  genresEl.addEventListener("click", (e) => handleChipClick(e, "genre"));
  decadesEl.addEventListener("click", (e) => handleChipClick(e, "decade"));
  ratingsEl.addEventListener("click", (e) => handleChipClick(e, "rating"));

  clearEl.addEventListener("click", () => {
    state.search = "";
    state.genres.clear();
    state.decades.clear();
    state.minRating = 0;
    searchEl.value = "";
    for (const chip of bodyEl.querySelectorAll(".chip--active")) {
      chip.classList.remove("chip--active");
    }
    update();
  });

  function handleChipClick(e, kind) {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const value = chip.dataset.value;

    if (kind === "rating") {
      const r = Number(value);
      state.minRating = state.minRating === r ? 0 : r;
      const container = chip.parentElement;
      for (const c of container.querySelectorAll(".chip")) {
        const isActive = state.minRating > 0 && Number(c.dataset.value) === state.minRating;
        c.classList.toggle("chip--active", isActive);
      }
    } else if (kind === "decade") {
      const d = Number(value);
      if (state.decades.has(d)) state.decades.delete(d);
      else state.decades.add(d);
      chip.classList.toggle("chip--active");
    } else {
      if (state.genres.has(value)) state.genres.delete(value);
      else state.genres.add(value);
      chip.classList.toggle("chip--active");
    }
    update();
  }

  function update() {
    const active = activeFilterCount();
    if (active > 0) {
      badgeEl.hidden = false;
      badgeEl.textContent = String(active);
    } else {
      badgeEl.hidden = true;
    }

    const predicate = makePredicate();
    const visible = predicate ? rows.filter(predicate).length : rows.length;
    countEl.textContent = predicate
      ? `${visible} of ${rows.length} films`
      : `${rows.length} films`;

    onFilterChange(predicate);
  }

  function activeFilterCount() {
    let n = 0;
    if (state.search) n++;
    n += state.genres.size;
    n += state.decades.size;
    if (state.minRating > 0) n++;
    return n;
  }

  function makePredicate() {
    const anyActive = state.search || state.genres.size || state.decades.size || state.minRating > 0;
    if (!anyActive) return null;

    const term = state.search.toLowerCase();
    return (row) => {
      if (term) {
        const haystack = `${row.title} ${row.director} ${row.starring}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (state.genres.size > 0) {
        const rowGenres = (row.genre || "").split(",").map(g => g.trim()).filter(Boolean);
        if (!rowGenres.some(g => state.genres.has(g))) return false;
      }
      if (state.decades.size > 0) {
        const year = Number(row.year);
        if (!year) return false;
        const decade = Math.floor(year / 10) * 10;
        if (!state.decades.has(decade)) return false;
      }
      if (state.minRating > 0) {
        const rating = Number(row.rating);
        if (!rating || rating < state.minRating) return false;
      }
      return true;
    };
  }

  update();
}

function extractGenres(rows) {
  const set = new Set();
  for (const r of rows) {
    if (!r.genre) continue;
    for (const g of r.genre.split(",")) {
      const t = g.trim();
      if (t) set.add(t);
    }
  }
  return [...set].sort();
}

function extractDecades(rows) {
  const set = new Set();
  for (const r of rows) {
    const y = Number(r.year);
    if (!y) continue;
    set.add(Math.floor(y / 10) * 10);
  }
  return [...set].sort((a, b) => a - b);
}

function renderChips(container, items) {
  container.innerHTML = "";
  for (const { value, label } of items) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = label;
    chip.dataset.value = value;
    container.appendChild(chip);
  }
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
