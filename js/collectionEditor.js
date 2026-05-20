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
