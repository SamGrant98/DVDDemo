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

mountUIControls("controls");

const ui = document.getElementById("ui");
const meta = document.getElementById("meta");
const metaBody = document.getElementById("metaBody");
const btnBack = document.getElementById("btnBack");

// --- Renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111114);

// --- Camera ---
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);
camera.position.set(2.5, 6, config.towerCamZ);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false; // drag reserved for scroll
controls.enablePan = false;
controls.enableZoom = true;
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

// Expose for debugging if needed
window.__dvdStack = dvdStack;
window.__scene = scene;
window.__camera = camera;
window.__controls = controls;

// --- TMDB cover enrichment setup ---
const tmdb = createTMDBClient({
  apiKey: config.TMDB_API_KEY,
  language: config.TMDB_LANGUAGE || "en-GB",
});

const covers = createCoverService({
  tmdbClient: tmdb,
  localCoverRoot: config.COVERS_ROOT || "./data/covers",
});

// --- UI helpers ---
function showMetaFor(mesh) {
  if (!meta || !metaBody) return;

  const d = mesh?.userData?.data || {};
  meta.style.display = "block";

  const safeLink =
    d.letterboxd && typeof d.letterboxd === "string" && d.letterboxd.startsWith("http")
      ? d.letterboxd
      : "";

  metaBody.innerHTML = `
    <div style="font-weight:700; font-size:13px; margin-bottom:6px;">
      ${d.title || "Untitled"} ${d.year ? `(${d.year})` : ""}
    </div>
    ${d.director ? `<div><b>Director</b>: ${d.director}</div>` : ""}
    ${d.starring ? `<div><b>Starring</b>: ${d.starring}</div>` : ""}
    ${d.genre ? `<div><b>Genre</b>: ${d.genre}</div>` : ""}
    ${d.rating ? `<div><b>Rating</b>: ${d.rating} / 5</div>` : ""}
    ${
      safeLink
        ? `<div style="margin-top:8px;"><a href="${safeLink}" target="_blank" style="color:#fff;">Open on Letterboxd</a></div>`
        : ""
    }
  `;
}

function hideMeta() {
  if (!meta) return;
  meta.style.display = "none";
}

// Back button exits focus
if (btnBack) {
  btnBack.addEventListener("click", () => {
    dvdStack.setModeTower?.();
    hideMeta();
  });
}

// Click behaviour: focus / flip / exit
interaction.bindClicks((hit) => {
  if (dvdStack.isBuilding?.()) return;

  if (!hit) {
    dvdStack.setModeTower?.();
    hideMeta();
    return;
  }

  if (dvdStack.getMode?.() === "focus" && dvdStack.isFocusedMesh?.(hit) && config.featuredFlipEnabled) {
    dvdStack.toggleFlip?.();
    return;
  }

  dvdStack.setModeFocus?.(hit);

  const stackH = dvdStack.getStackHeight?.() ?? 0;
  if (stackH > 0 && hit.userData?.homePos) {
    towerScroll.setTarget(hit.userData.homePos.y / stackH);
  }

  showMetaFor(hit);
});

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
});

// ---------- Post-build camera hold ----------
let postBuildHold = false;
let releasedByUser = false;
let holdScroll = 0;

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

// ---------- BOOT: load CSV first ----------
ui.textContent = "Loading CSV…";
towerScroll.setLocked(true);

let booted = false;

try {
  const rows = await loadDVDCSV("./data/Sams_Physical_Media.csv");
  console.log("[CSV] rows loaded:", rows.length);

  // Enrich with TMDB posters (front cover fallback)
  if (config.TMDB_API_KEY && String(config.TMDB_API_KEY).trim().length) {
    ui.textContent = "Fetching posters from TMDB…";
    const enriched = await covers.enrichRows(rows);
    dvdStack.setData(enriched);
  } else {
    console.warn("[TMDB] No API key set. Using CSV data only.");
    ui.textContent = "No TMDB key set (covers disabled). Building tower…";
    dvdStack.setData(rows);
  }

  if (dvdStack.isBuilding()) {
    ui.textContent = "Building tower… (Space to skip)";
    towerScroll.setLocked(true);
  } else {
    ui.textContent = "Ready • drag / wheel to scroll";
    towerScroll.setLocked(false);
  }

  booted = true;
} catch (err) {
  console.error(err);
  ui.textContent = `CSV load failed: ${err?.message || err}`;
  towerScroll.setLocked(true);
  booted = false;
}

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
  } else if (!wasBuilding && building) {
    towerScroll.setLocked(true);
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

    const towerY = scroll * dvdStack.getStackHeight();

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

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
