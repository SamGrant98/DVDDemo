// js/csvUpload.js
//
// Drag-drop + file picker UI for users uploading their own CSV collection.
// On success, saves to IndexedDB and reloads so the boot flow picks the new
// collection up fresh. On failure, shows inline validation errors in the modal.

import { parseCollectionText } from "./csvLoader.js";
import {
  saveActiveCollection,
  clearActiveCollection,
  hasUserCollection,
} from "./collectionStore.js";

export async function mountUploader({
  openButton,
  modal,
  closeButton,
  dropzone,
  fileInput,
  statusEl,
  resetButton,
  resetSection,
}) {
  // Reveal the reset link only if the active collection is user-uploaded.
  if (resetSection) {
    resetSection.hidden = !(await hasUserCollection());
  }

  function open() {
    modal.hidden = false;
    statusEl.textContent = "";
  }
  function close() {
    modal.hidden = true;
  }

  openButton?.addEventListener("click", open);
  closeButton?.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dropzone--over");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dropzone--over");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dropzone--over");
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  });

  async function handleFile(file) {
    if (!/\.csv$/i.test(file.name)) {
      statusEl.textContent = "That doesn't look like a CSV file.";
      return;
    }

    statusEl.textContent = "Reading…";
    let parsed;
    try {
      const text = await file.text();
      parsed = parseCollectionText(text);
    } catch (err) {
      statusEl.textContent = `Could not parse the file (${err?.message || err}).`;
      return;
    }

    const { rows, headers } = parsed;

    const errors = [];
    if (!headers.includes("Movie Title")) {
      errors.push('Missing required column: "Movie Title".');
    }
    if (!rows.length) {
      errors.push("No valid rows found.");
    }
    if (errors.length) {
      statusEl.textContent = errors.join(" ");
      return;
    }

    statusEl.textContent = `Saving ${rows.length} films…`;
    const saved = await saveActiveCollection(rows, "user");
    if (!saved) {
      statusEl.textContent = "Could not save to local storage.";
      return;
    }

    statusEl.textContent = `Loaded ${rows.length} films. Reloading…`;
    setTimeout(() => location.reload(), 500);
  }

  if (resetButton) {
    resetButton.addEventListener("click", async (e) => {
      e.preventDefault();
      const confirmReset = confirm(
        "Reset to the demo collection? Your uploaded data will be cleared from this browser."
      );
      if (!confirmReset) return;
      await clearActiveCollection();
      location.reload();
    });
  }
}
