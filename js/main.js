// js/main.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { config } from "./config.js";
import { mountUIControls } from "./uiControls.js";
import { loadDVDCSV } from "./csvLoader.js";
import { createTowerScroll } from "./towerScroll.js";
import { createDVDStack } from "./dvdStack.js";
import { createCameraRig } from "./cameraRig.js";
import { createInteraction } from "./interaction.js";

// NEW: TMDB + cover enrichment
import { createTMDBClient } from "./tmdbClient.js";
import { createCoverService } from "./coverService.js";

// Collection persistence (IndexedDB)
import { loadActiveCollection } from "./collectionStore.js";

// CSV upload modal (drag-drop + file picker + template download)
import { mountUploader } from "./csvUpload.js";

// Per-DVD add/edit/delete editor
import { mountEditor } from "./collectionEditor.js";

// Search + filter chip widget
import { mountFilterPanel } from "./filterPanel.js";

// Collection stats overlay (modal with bar charts)
import { mountStatsOverlay } from "./statsOverlay.js";

// Synthesised SFX (Web Audio API, no assets)
import {
  initAudio,
  setAudioEnabled, isAudioEnabled,
  setAmbientEnabled, isAmbientEnabled,
  playThunk, playScrollTick, playExplosion,
} from "./audio.js";

// Atmospheric backdrop (drifting particles + colour-reactive background)
import { createSceneBackdrop } from "./sceneBackdrop.js";

// Dev tuning panel — only mounts when ?dev=1 is in the URL.
if (new URLSearchParams(window.location.search).has("dev")) {
  mountUIControls("controls");
}

const ui = document.getElementById("ui");
const meta = document.getElementById("meta");
const metaBody = document.getElementById("metaBody");
const btnBack = document.getElementById("btnBack");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingStatus = document.getElementById("loadingStatus");
const emptyState = document.getElementById("emptyState");

// Status messages go to both the bottom-left strip and the boot overlay so
// the user sees the same text wherever they're looking during load.
function setStatus(text) {
  ui.textContent = text;
  if (loadingStatus) loadingStatus.textContent = text;
}

function dismissLoading() {
  if (!loadingOverlay) return;
  loadingOverlay.classList.add("is-hidden");
  setTimeout(() => { loadingOverlay.hidden = true; }, 500);
}

// --- Renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// scene.background is now owned by the backdrop (see createSceneBackdrop).

// --- Camera ---
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);
camera.position.set(2.5, 6, config.towerCamZ);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false; // drag reserved for scroll
controls.enablePan = false;
controls.enableZoom = false;   // wheel reserved for tower scroll — was fighting it
controls.enableDamping = true;

// --- Lights ---
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(6, 10, 4);
scene.add(dir);

// --- Modules ---
const towerScroll = createTowerScroll();
const dvdStack = createDVDStack(scene);
const cameraRig = createCameraRig(camera, controls);
const interaction = createInteraction(camera, () => dvdStack.dvds, towerScroll);
const backdrop = createSceneBackdrop(scene);

// Expose for debugging if needed
window.__dvdStack = dvdStack;
window.__scene = scene;
window.__camera = camera;
window.__controls = controls;

// --- TMDB cover enrichment setup ---
const tmdb = createTMDBClient({
  language: config.TMDB_LANGUAGE || "en-GB",
});

const covers = createCoverService({
  tmdbClient: tmdb,
  localCoverRoot: config.COVERS_ROOT || "./data/covers",
});

// --- Editor / state ---

// Currently focused DVD's row data (for editor Edit/Delete actions).
let focusedRowData = null;

// Currently displayed rows (demo or user collection). Source of truth for the
// editor's mutations.
let currentRows = [];

// --- UI helpers ---
function formatVotes(n) {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderStarRow(rating) {
  const r = Number(rating);
  if (!r || r <= 0) return "";
  const full = Math.floor(r);
  const half = (r - full) >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  // Filled: ★  Half: ⯨ (approximation)  Empty: ☆
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

function showMetaFor(mesh) {
  if (!meta || !metaBody) return;

  const d = mesh?.userData?.data || {};
  focusedRowData = mesh?.userData?.data || null;
  meta.style.display = "block";

  const safeLink =
    d.letterboxd && typeof d.letterboxd === "string" && d.letterboxd.startsWith("http")
      ? d.letterboxd
      : "";

  const thumbUrl = d.cover?.backdropUrl;
  const thumbHtml = thumbUrl
    ? `<div class="meta__thumb"><img src="${escapeHtml(thumbUrl)}" alt="" /></div>`
    : "";

  const genres = String(d.genre || "").split(",").map(g => g.trim()).filter(Boolean);
  const chipsHtml = genres.length
    ? `<div class="meta__chips">${genres.map(g =>
        `<span class="meta__chip">${escapeHtml(g)}</span>`
      ).join("")}</div>`
    : "";

  const stars = renderStarRow(d.rating);
  const yourRatingHtml = d.rating
    ? `<div class="meta__rating">
        <span class="meta__rating-stars">${stars}</span>
        <span class="meta__rating-num">${escapeHtml(d.rating)} / 5</span>
      </div>`
    : "";

  const tmdbAvg = d.cover?.voteAverage;
  const tmdbVotes = d.cover?.voteCount;
  const tmdbHtml = (typeof tmdbAvg === "number")
    ? `<div class="meta__row"><span class="meta__k">TMDB</span>${tmdbAvg.toFixed(1)} / 10${tmdbVotes ? ` <span class="meta__dim">(${formatVotes(tmdbVotes)} votes)</span>` : ""}</div>`
    : "";

  const overviewHtml = d.cover?.overview
    ? `<div class="meta__overview">${escapeHtml(d.cover.overview)}</div>`
    : "";

  const notesHtml = d.notes
    ? `<div class="meta__notes"><div class="meta__k">Notes</div>${escapeHtml(d.notes)}</div>`
    : "";

  metaBody.innerHTML = `
    ${thumbHtml}
    <div class="meta__title">
      ${escapeHtml(d.title || "Untitled")}${d.year ? ` <span class="meta__year">(${escapeHtml(d.year)})</span>` : ""}
    </div>
    ${chipsHtml}
    ${d.director ? `<div class="meta__row"><span class="meta__k">Director</span>${escapeHtml(d.director)}</div>` : ""}
    ${d.starring ? `<div class="meta__row"><span class="meta__k">Starring</span>${escapeHtml(d.starring)}</div>` : ""}
    ${yourRatingHtml}
    ${tmdbHtml}
    ${notesHtml}
    ${overviewHtml}
    ${safeLink ? `<div class="meta__link"><a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener">Open on Letterboxd ↗</a></div>` : ""}
  `;
}

function hideMeta() {
  if (!meta) return;
  meta.style.display = "none";
  focusedRowData = null;
}

// Back button exits focus
if (btnBack) {
  btnBack.addEventListener("click", () => {
    dvdStack.setModeTower?.();
    hideMeta();
  });
}

// Click behaviour: focus / flip / exit. Bound to the canvas (not window) so
// clicks on UI overlays (meta panel buttons, modals, filter panel) don't
// trigger a spurious "no hit → deselect" via the raycaster.
interaction.bindClicks((hit) => {
  if (dvdStack.isBuilding?.()) return;

  if (!hit) {
    dvdStack.setModeTower?.();
    hideMeta();
    return;
  }

  if (dvdStack.getMode?.() === "focus" && dvdStack.isFocusedMesh?.(hit) && config.featuredFlipEnabled) {
    dvdStack.toggleFlip?.();
    playThunk({ pitch: 1.2 }); // higher pitch differentiates flip from focus
    return;
  }

  dvdStack.setModeFocus?.(hit);
  playThunk();
  playExplosion(); // layered swoosh as neighbouring DVDs cascade outward

  const stackH = dvdStack.getStackHeight?.() ?? 0;
  if (stackH > 0 && hit.userData?.homePos) {
    towerScroll.setTarget(hit.userData.homePos.y / stackH);
  }

  showMetaFor(hit);
}, renderer.domElement, () => dvdStack.getFocused?.());

// Esc exits focus, Space skips build
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    dvdStack.setModeTower?.();
    hideMeta();
  }
  if (config.buildAllowSkipKey && e.code === "Space") {
    if (dvdStack.isBuilding?.()) dvdStack.skipBuild?.();
  }
});

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  backdrop.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Mobile / touch device tuning ----------
// Detected once at boot. Mutates `config` so the focused-DVD framing has more
// breathing room on phone screens and finger-drag scrolls faster than mouse
// wheel does. Desktop is untouched.
const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
const isNarrowScreen  = window.matchMedia("(max-width: 720px)").matches;
const isMobileLayout  = isCoarsePointer || isNarrowScreen;

if (isMobileLayout) {
  config.focusCamZ          = 11.5;  // push camera back from focused DVD
  config.featuredScale      = 1.45;  // smaller "hero" size — was 2.0
  config.focusCamX          = 0.4;   // less off-axis offset
  config.focusTargetYOffset = 0.6;
  // Lifts the focused DVD above the camera look-at so it sits above the
  // bottom info panel. Tuned to leave roughly the upper two-thirds of the
  // screen for the DVD and the lower third for the panel.
  config.focusedDvdLift     = 1.5;

  // ---- Touch input feel ----
  // Reverted the tap-detection bumps that made things worse. Stick with
  // the default 7px drag threshold and instead make scroll FASTER once it
  // does start, which was the original ask.
  config.dragScale          = (config.dragScale ?? 0.00019) * 2.5;
  config.smoothScroll       = 15.0;

  // ---- Mobile-only tilt amplification ----
  // The featured-DVD sway is small (8°/10°) by default and gets harder to
  // see at the smaller mobile featuredScale. Doubling so the gyro-driven
  // tilt is unmistakably visible.
  config.featuredMouseTiltX = (config.featuredMouseTiltX ?? 0) * 2;
  config.featuredMouseTiltY = (config.featuredMouseTiltY ?? 0) * 2;
}

// ---------- Mobile gyro tilt -----------------------------------------------
// On touch devices, use DeviceOrientationEvent to drive the focused-DVD sway
// instead of the pointer. iOS 13+ requires explicit permission gated on a
// user gesture — we try on first pointerdown. Android works without prompt.
// If the user denies (or the API doesn't exist) we fall back silently to
// pointer/mouseNDC.
let gyroEnabled = false;
let gyroEventCount = 0;
const gyroState = { x: 0, y: 0 };
function handleDeviceOrientation(e) {
  if (e.gamma == null || e.beta == null) return;
  // gamma  ∈ [-90, 90]  — phone tilt left/right (positive = right)
  // beta   ∈ [-180,180] — phone tilt forward/back (~30° is "comfy hold")
  //
  // Inverted to match the mouse convention used by getMouseNDC: phone-right
  // produces a negative x so the camera shifts LEFT, which visually moves
  // the tower RIGHT — i.e. the tower "follows" the phone tilt.
  gyroState.x = Math.max(-1, Math.min(1, -e.gamma / 25));
  gyroState.y = Math.max(-1, Math.min(1, -(e.beta - 30) / 25));
  if (gyroEventCount < 3) {
    console.log("[gyro] event", { gamma: e.gamma, beta: e.beta, x: gyroState.x, y: gyroState.y });
    gyroEventCount++;
  }
}
function attachGyroListeners() {
  // Some Android browsers only fire `deviceorientationabsolute`, so listen
  // to both. The handler is idempotent on event values.
  window.addEventListener("deviceorientation", handleDeviceOrientation);
  window.addEventListener("deviceorientationabsolute", handleDeviceOrientation);
  gyroEnabled = true;
  console.log("[gyro] listeners attached");
}
function tryEnableGyro() {
  if (gyroEnabled) return;
  if (typeof DeviceOrientationEvent === "undefined") {
    console.log("[gyro] DeviceOrientationEvent unsupported");
    return;
  }
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    // iOS 13+ — must be called from a user gesture handler. We don't use
    // { once: true } on the click listener so the user can re-try by
    // tapping again if they dismiss the permission prompt the first time.
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        console.log("[gyro] iOS permission:", state);
        if (state === "granted") attachGyroListeners();
      })
      .catch((err) => console.log("[gyro] permission error:", err));
  } else {
    attachGyroListeners();
  }
}
// No auto-attach: iOS Safari needs requestPermission() to come from an
// explicit user-gesture click on an "enable" affordance. The Tilt toggle in
// the ⋯ menu provides that gesture and gives the user visible control.
function disableGyro() {
  if (!gyroEnabled) return;
  window.removeEventListener("deviceorientation", handleDeviceOrientation);
  window.removeEventListener("deviceorientationabsolute", handleDeviceOrientation);
  gyroEnabled = false;
  gyroState.x = 0;
  gyroState.y = 0;
  cameraRig.setSwayOverride(null);
  console.log("[gyro] disabled");
}
// Debug handle for the console
window.__gyro = { state: gyroState, isEnabled: () => gyroEnabled, events: () => gyroEventCount };

// ---------- Post-build camera hold ----------
let postBuildHold = false;
let releasedByUser = false;
let holdScroll = 0;

// Tracked scroll position for the ratchet-tick SFX
let lastScrollForTick = 0;

// Tracked towerScroll target for the "scroll-while-focused exits focus"
// behaviour. Null until first frame after focus begins.
let lastTargetForExit = null;

window.addEventListener(
  "wheel",
  () => {
    if (postBuildHold) releasedByUser = true;
  },
  { passive: true }
);

window.addEventListener(
  "pointermove",
  () => {
    if (postBuildHold && towerScroll.didDrag()) releasedByUser = true;
  },
  { passive: true }
);

// Mount the upload modal so users can swap in their own collection.
await mountUploader({
  openButton: document.getElementById("btnLoadYours"),
  modal: document.getElementById("uploadModal"),
  closeButton: document.getElementById("modalClose"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  statusEl: document.getElementById("uploadStatus"),
  resetButton: document.getElementById("resetToDemo"),
  resetSection: document.getElementById("resetSection"),
});

// Mount the add/edit/delete editor.
mountEditor({
  formModal: document.getElementById("editorModal"),
  formEl: document.getElementById("editorForm"),
  formCloseButton: document.getElementById("editorClose"),
  formCancelButton: document.getElementById("editorCancel"),
  formTitleEl: document.getElementById("editorTitle"),
  addButton: document.getElementById("addFilm"),
  editButton: document.getElementById("btnEdit"),
  deleteButton: document.getElementById("btnDelete"),
  starInput: document.getElementById("ratingStarInput"),
  getCurrentRows: () => currentRows,
  getFocusedRow: () => focusedRowData,
});

// Wire the sort bar — segments live inside the consolidated top toolbar.
const sortBar = document.getElementById("sortBar");
sortBar?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-sort]");
  if (!btn) return;
  const mode = btn.dataset.sort;
  dvdStack.setSortMode(mode);
  sortBar.querySelectorAll("button[data-sort]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.sort === mode);
  });
});

// Wire the audio toggles. Off by default; persisted to localStorage. Master
// "Sound" gates everything; "Ambient drone" is a separate continuous sound
// (only audible when sound is also on).
initAudio();
const audioToggle = document.getElementById("audioToggle");
const ambientToggle = document.getElementById("ambientToggle");
function syncAudioToggleUI() {
  audioToggle?.setAttribute("aria-pressed", isAudioEnabled() ? "true" : "false");
  ambientToggle?.setAttribute("aria-pressed", isAmbientEnabled() ? "true" : "false");
}
syncAudioToggleUI();
audioToggle?.addEventListener("click", () => {
  setAudioEnabled(!isAudioEnabled());
  syncAudioToggleUI();
});
ambientToggle?.addEventListener("click", () => {
  setAmbientEnabled(!isAmbientEnabled());
  syncAudioToggleUI();
});

// ----- Tilt toggle (gyro) -----
// On iOS Safari, this click IS the user gesture that requestPermission()
// needs. If the iPhone has "Motion & Orientation Access" disabled in
// Settings → Safari, the call resolves to "denied" without showing a
// prompt — the toggle just stays off and we log it.
const tiltToggle = document.getElementById("tiltToggle");
function syncTiltToggleUI() {
  tiltToggle?.setAttribute("aria-pressed", gyroEnabled ? "true" : "false");
}
syncTiltToggleUI();
tiltToggle?.addEventListener("click", () => {
  if (gyroEnabled) {
    disableGyro();
  } else {
    tryEnableGyro();
    // gyroEnabled flips async on iOS; sync UI again after the prompt resolves
    setTimeout(syncTiltToggleUI, 800);
  }
  syncTiltToggleUI();
});

// ----- Reduced motion (settings toggle) -----
// Affects: particle drift, ambient colour transitions, float on exploded
// DVDs, mouse-sway tilt on focused mesh, reorder cascade timing.
const RM_KEY = "dvdshelf_reduced_motion";
let reducedMotion = (() => {
  try { return localStorage.getItem(RM_KEY) === "1"; } catch { return false; }
})();

// Snapshot the original config values once so we can restore them when the
// user turns reduced motion back off. Capture AFTER the mobile mutations
// above so reduced-motion restores to the mobile-tuned defaults, not the
// desktop ones.
const motionDefaults = {
  floatAmount: config.floatAmount,
  featuredMouseTiltX: config.featuredMouseTiltX,
  featuredMouseTiltY: config.featuredMouseTiltY,
  reorderStaggerMs: config.reorderStaggerMs,
};
function applyReducedMotion() {
  if (reducedMotion) {
    config.floatAmount = 0;
    config.featuredMouseTiltX = 0;
    config.featuredMouseTiltY = 0;
    config.reorderStaggerMs = 0;
  } else {
    Object.assign(config, motionDefaults);
  }
}
applyReducedMotion();

const reducedMotionToggle = document.getElementById("reducedMotionToggle");
function syncReducedMotionUI() {
  reducedMotionToggle?.setAttribute("aria-pressed", reducedMotion ? "true" : "false");
}
syncReducedMotionUI();
reducedMotionToggle?.addEventListener("click", () => {
  reducedMotion = !reducedMotion;
  try { localStorage.setItem(RM_KEY, reducedMotion ? "1" : "0"); } catch {}
  syncReducedMotionUI();
  applyReducedMotion();
});

// ----- More menu (open / close + close-on-outside-click) -----
const moreToggle = document.getElementById("moreToggle");
const moreBody = document.getElementById("moreBody");
function openMore() {
  moreBody?.classList.add("is-open");
  moreToggle?.setAttribute("aria-expanded", "true");
}
function closeMore() {
  moreBody?.classList.remove("is-open");
  moreToggle?.setAttribute("aria-expanded", "false");
}
moreToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (moreBody.classList.contains("is-open")) closeMore();
  else openMore();
});
document.addEventListener("click", (e) => {
  if (!moreBody?.classList.contains("is-open")) return;
  if (moreToggle.contains(e.target) || moreBody.contains(e.target)) return;
  closeMore();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && moreBody?.classList.contains("is-open")) closeMore();
});

// Stats / Credits menu items also close the menu before their modal opens.
document.getElementById("statsToggle")?.addEventListener("click", closeMore);

// ----- Credits modal -----
const creditsToggle = document.getElementById("creditsToggle");
const creditsModal = document.getElementById("creditsModal");
const creditsClose = document.getElementById("creditsClose");
creditsToggle?.addEventListener("click", () => {
  closeMore();
  if (creditsModal) creditsModal.hidden = false;
});
creditsClose?.addEventListener("click", () => { if (creditsModal) creditsModal.hidden = true; });
creditsModal?.addEventListener("click", (e) => {
  if (e.target === creditsModal) creditsModal.hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && creditsModal && !creditsModal.hidden) creditsModal.hidden = true;
});

// ---------- BOOT: load active collection (IndexedDB → demo fallback) ----------
setStatus("Loading collection…");
towerScroll.setLocked(true);

let booted = false;

try {
  // 1. Try the user's saved collection from IndexedDB; fall back to the bundled demo.
  let rows;
  const stored = await loadActiveCollection();
  if (stored?.rows?.length) {
    console.log(`[collection] Loaded ${stored.rows.length} rows from IndexedDB (source: ${stored.source})`);
    rows = stored.rows;
  } else {
    console.log("[collection] No saved collection — loading demo");
    rows = await loadDVDCSV(config.DEMO_CSV_PATH || "./data/demo.csv");
  }
  currentRows = rows;

  // 2. Enrich with TMDB posters via the /api/tmdb proxy. If the proxy is
  //    unavailable (local static dev, network failure, missing env var), fall
  //    back to rendering without covers rather than failing the whole boot.
  setStatus("Fetching posters from TMDB…");
  try {
    const enriched = await covers.enrichRows(rows);
    dvdStack.setData(enriched);
  } catch (err) {
    console.warn("[TMDB] Cover enrichment failed; using CSV data only.", err);
    setStatus("Could not fetch posters — building tower without them…");
    dvdStack.setData(rows);
  }

  // Tower is now feeding the renderer; dismiss the boot overlay.
  dismissLoading();

  // 3. Mount the search + filter chip widget now that we have rows
  //    available for chip extraction (genres, decades, etc.).
  mountFilterPanel({
    rows,
    toggleEl: document.getElementById("filterToggle"),
    bodyEl: document.getElementById("filterBody"),
    badgeEl: document.getElementById("filterBadge"),
    searchEl: document.getElementById("filterSearch"),
    genresEl: document.getElementById("filterGenres"),
    decadesEl: document.getElementById("filterDecades"),
    ratingsEl: document.getElementById("filterRatings"),
    countEl: document.getElementById("filterCount"),
    clearEl: document.getElementById("filterClear"),
    onFilterChange: (predicate) => {
      dvdStack.setFilter(predicate);
      // Surface an empty-state overlay only when an active filter yields zero
      // films — never on an unfiltered (full) view.
      const noResults = predicate !== null && rows.filter(predicate).length === 0;
      if (emptyState) emptyState.hidden = !noResults;
    },
  });

  // Wire the empty-state's "Clear filters" button to the filter panel's clear.
  document.getElementById("emptyClear")?.addEventListener("click", () => {
    document.getElementById("filterClear")?.click();
  });

  // 4. Mount the collection stats overlay (modal with bar charts).
  mountStatsOverlay({
    rows,
    toggleEl: document.getElementById("statsToggle"),
    modal: document.getElementById("statsModal"),
    closeButton: document.getElementById("statsClose"),
    summaryEl: document.getElementById("statsSummary"),
    decadesEl: document.getElementById("statsDecades"),
    genresEl: document.getElementById("statsGenres"),
    ratingsEl: document.getElementById("statsRatings"),
  });

  if (dvdStack.isBuilding()) {
    setStatus("Building tower… (Space to skip)");
    towerScroll.setLocked(true);
  } else {
    setStatus("Ready • drag / wheel to scroll");
    towerScroll.setLocked(false);
  }

  booted = true;
} catch (err) {
  console.error(err);
  ui.textContent = `CSV load failed: ${err?.message || err}`;
  towerScroll.setLocked(true);
  booted = false;
}

// ---------- Cross-origin page fades ----------
// Any link to a madebysam.dev property (the main site, sibling subdomains)
// triggers a body fade-out before navigation, so the cross-origin jump
// feels continuous instead of a hard cut. Browser handles the inbound fade
// via the page-fade-in keyframe on body.
document.querySelectorAll('a[href*="madebysam.dev"]').forEach((a) => {
  // Skip if it's set to open in a new tab — that's a different intent.
  if (a.target === "_blank") return;
  a.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    document.body.classList.add("is-leaving");
    setTimeout(() => { window.location.href = a.href; }, 300);
  });
});

// ---------- LOOP ----------
const clock = new THREE.Clock();
let wasBuilding = true;

function animate() {
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;

  if (!booted) {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
    return;
  }

  const building = dvdStack.isBuilding();

  // Handle build -> tower transition BEFORE any camera update (prevents 1-frame jump)
  if (wasBuilding && !building) {
    postBuildHold = true;
    releasedByUser = false;

    const stackH = dvdStack.getStackHeight();
    const buildH = dvdStack.getBuildHeight();
    holdScroll = stackH > 0 ? buildH / stackH : 1;

    // Hard snap scroll to held point
    towerScroll.snapTo(holdScroll);

    towerScroll.setLocked(false);
    ui.textContent = "Built! Drag / wheel to scroll • Click a DVD to focus • Click again to flip";

    // Auto-fade the bottom-left status after a few seconds — by then the user
    // has either read it or moved on.
    setTimeout(() => ui.classList.add("is-faded"), 4000);
  } else if (!wasBuilding && building) {
    towerScroll.setLocked(true);
    ui.classList.remove("is-faded");
    ui.textContent = "Building tower… (Space to skip)";
  }

  if (building) {
    dvdStack.updateBuild(dt);
    dvdStack.apply(dt);
    cameraRig.updateBuild(dt, dvdStack.getBuildHeight());
  } else {
    let scroll = towerScroll.update(dt);

    if (postBuildHold && !releasedByUser) {
      scroll = holdScroll;
    } else if (postBuildHold && releasedByUser) {
      postBuildHold = false;
    }

    // Step-focus on scroll: when a DVD is focused and the user scrolls,
    // step the focus to the next / previous visible DVD instead of
    // exiting focus. Snap the scroll target to the new focused DVD's
    // position so the camera follows cleanly and the next scroll input
    // starts from a fresh baseline.
    const currentTarget = towerScroll.getTarget();
    if (
      dvdStack.getMode() === "focus" &&
      lastTargetForExit != null
    ) {
      const delta = currentTarget - lastTargetForExit;
      if (Math.abs(delta) > 0.015) {
        const direction = delta > 0 ? 1 : -1;
        const focused = dvdStack.getFocused();
        const next = dvdStack.findNeighbour(focused, direction);
        if (next) {
          dvdStack.setModeFocus(next);
          showMetaFor(next);
          const stackH = dvdStack.getStackHeight();
          const snappedTarget = stackH > 0
            ? (next.userData.homePos.y / stackH)
            : 0;
          towerScroll.snapTo(snappedTarget);
          lastTargetForExit = snappedTarget;
        } else {
          // Hit the end of the visible set in that direction —
          // reset baseline so accumulated scroll doesn't bounce.
          lastTargetForExit = currentTarget;
        }
      }
    } else {
      lastTargetForExit = currentTarget;
    }

    // Wheel-ratchet tick when the scroll moves meaningfully. playScrollTick
    // applies its own rate-limit, so we don't need to throttle further.
    if (Math.abs(scroll - lastScrollForTick) > 0.015) {
      lastScrollForTick = scroll;
      playScrollTick();
    }

    const towerY = scroll * dvdStack.getStackHeight();

    // Feed gyro (if enabled) into the camera rig so BOTH the tower sway
    // (updateTower) and the focused-DVD tilt (setFeaturedMouseNDC below)
    // are driven by phone orientation. Falls back silently to mouse.
    if (gyroEnabled) cameraRig.setSwayOverride(gyroState);

    if (dvdStack.getMode() === "focus") {
      dvdStack.setFeaturedMouseNDC(cameraRig.getMouseNDC());
    } else {
      dvdStack.setFeaturedMouseNDC({ x: 0, y: 0 });
    }

    dvdStack.updateTargets(time, dt);
    dvdStack.apply(dt);

    if (dvdStack.getMode() === "tower") {
      cameraRig.updateTower(dt, towerY);
    } else {
      cameraRig.updateFocus(dt, dvdStack.getFocusedY());
    }
  }

  wasBuilding = building;

  backdrop.update(dt, dvdStack.getFocused?.() || null, { reducedMotion });

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
