// js/collectionEditor.js
//
// Add / Edit / Delete a single film. The form modal posts mutations through
// the IndexedDB persistence layer, then reloads so the boot flow renders the
// updated tower.
//
// Editing the demo collection silently forks: the current demo rows become the
// user's collection (with the mutation applied), and "Reset to demo" in the
// upload modal becomes the escape hatch.

import { saveActiveCollection } from "./collectionStore.js";

export function mountEditor({
  formModal,
  formEl,
  formCloseButton,
  formCancelButton,
  formTitleEl,
  addButton,
  editButton,
  deleteButton,
  starInput,
  getCurrentRows,
  getFocusedRow,
}) {
  let editingId = null;

  function open({ mode, row }) {
    editingId = mode === "edit" ? row?.__id ?? null : null;
    formTitleEl.textContent = mode === "edit" ? "Edit film" : "Add a film";
    populate(row || {});
    formModal.hidden = false;
    formEl.elements.title.focus();
  }

  function close() {
    formModal.hidden = true;
    editingId = null;
    formEl.reset();
    setStarUI(0);
  }

  function populate(row) {
    formEl.elements.title.value = row.title || "";
    formEl.elements.year.value = row.year || "";
    formEl.elements.director.value = row.director || "";
    formEl.elements.starring.value = row.starring || "";
    formEl.elements.genre.value = row.genre || "";
    formEl.elements.rating.value = row.rating || "";
    formEl.elements.letterboxd.value = row.letterboxd || "";
    formEl.elements.notes.value = row.notes || "";
    setStarUI(row.rating || 0);
  }

  // ----- Star rating widget -----
  // Clicking a star sets the rating to that whole number; clicking the same
  // star again clears to 0. Half-star values that exist in the data (e.g. 3.5
  // from earlier entries) are rendered as half-filled stars but a fresh click
  // commits to a whole number. The hidden input named "rating" is the source
  // of truth that FormData reads on submit.
  function setStarUI(value) {
    if (!starInput) return;
    const v = Number(value) || 0;
    starInput.querySelectorAll(".star-input__star").forEach((s) => {
      const sv = Number(s.dataset.value);
      s.classList.remove("is-full", "is-half");
      if (sv <= v) s.classList.add("is-full");
      else if (sv - 0.5 <= v) s.classList.add("is-half");
    });
  }

  if (starInput) {
    starInput.addEventListener("click", (e) => {
      const clear = e.target.closest(".star-input__clear");
      const star  = e.target.closest(".star-input__star");
      if (clear) {
        formEl.elements.rating.value = "";
        setStarUI(0);
        return;
      }
      if (star) {
        const v = Number(star.dataset.value);
        const current = Number(formEl.elements.rating.value) || 0;
        const next = (current === v) ? 0 : v;
        formEl.elements.rating.value = next || "";
        setStarUI(next);
      }
    });
    // Hover preview — light up stars up to the hovered one, restore on leave.
    starInput.addEventListener("mouseover", (e) => {
      const star = e.target.closest(".star-input__star");
      if (!star) return;
      setStarUI(Number(star.dataset.value));
    });
    starInput.addEventListener("mouseleave", () => {
      setStarUI(Number(formEl.elements.rating.value) || 0);
    });
  }

  formCloseButton.addEventListener("click", close);
  formCancelButton.addEventListener("click", close);
  formModal.addEventListener("click", (e) => {
    if (e.target === formModal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !formModal.hidden) close();
  });

  addButton?.addEventListener("click", (e) => {
    e.preventDefault();
    open({ mode: "add", row: null });
  });

  editButton?.addEventListener("click", () => {
    const focused = getFocusedRow();
    if (focused) open({ mode: "edit", row: focused });
  });

  deleteButton?.addEventListener("click", async () => {
    const focused = getFocusedRow();
    if (!focused) return;
    if (!confirm(`Delete "${focused.title}" from your collection?`)) return;
    await applyMutation(rows => rows.filter(r => r.__id !== focused.__id));
  });

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(formEl);
    const fields = {
      title: String(data.get("title") || "").trim(),
      year: String(data.get("year") || "").trim(),
      director: String(data.get("director") || "").trim(),
      starring: String(data.get("starring") || "").trim(),
      genre: String(data.get("genre") || "").trim(),
      rating: String(data.get("rating") || "").trim(),
      letterboxd: String(data.get("letterboxd") || "").trim(),
      notes: String(data.get("notes") || "").trim(),
    };

    if (!fields.title) return;

    if (editingId) {
      await applyMutation(rows =>
        rows.map(r => (r.__id === editingId ? { ...r, ...fields } : r))
      );
    } else {
      const newRow = { __id: crypto.randomUUID(), ...fields };
      await applyMutation(rows => [newRow, ...rows]);
    }
  });

  async function applyMutation(mutateFn) {
    const current = getCurrentRows() || [];
    // Strip enrichment artifacts (cover URLs etc.) before persisting; they're
    // re-fetched from TMDB on the next load.
    const clean = current.map(r => {
      const { cover, ...rest } = r;
      return rest;
    });
    const next = mutateFn(clean);
    const saved = await saveActiveCollection(next, "user");
    if (!saved) {
      alert("Could not save changes. Your browser may be in private mode or out of storage.");
      return;
    }
    location.reload();
  }
}
