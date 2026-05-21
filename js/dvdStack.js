// js/dvdStack.js
import * as THREE from "three";
import { config } from "./config.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";


function setDepthOverride(mesh, enabled) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (enabled) {
    mesh.userData._depthPrev = mats.map(m => ({ depthTest: m.depthTest, depthWrite: m.depthWrite }));
    mesh.userData._renderOrderPrev = mesh.renderOrder;
    mesh.renderOrder = 9999;
    for (const m of mats) {
      m.depthTest = false;
      m.depthWrite = false;
      m.needsUpdate = true;
    }
  } else {
    if (mesh.userData._renderOrderPrev !== undefined) mesh.renderOrder = mesh.userData._renderOrderPrev;
    if (mesh.userData._depthPrev) {
      mats.forEach((m, i) => {
        const prev = mesh.userData._depthPrev[i];
        if (!prev) return;
        m.depthTest = prev.depthTest;
        m.depthWrite = prev.depthWrite;
        m.needsUpdate = true;
      });
    }
    delete mesh.userData._depthPrev;
    delete mesh.userData._renderOrderPrev;
  }
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * BoxGeometry face order:
 * 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
 */
const FACE_SPINE_POSX = 0; // +X
const FACE_SPINE_NEGX = 1; // -X
const FACE_COVER      = 2; // +Y (cover face)
const FACE_BACK       = 3; // -Y (back face)
const FACE_SIDE_POSZ  = 4; // +Z
const FACE_SIDE_NEGZ  = 5; // -Z

// Sort modes for the tower. `compare = null` preserves the row's original
// CSV order. Re-sorts mutate each mesh's userData.index + homePos.y and the
// existing position smoother animates them into place.
export const SORT_MODES = {
  default: { label: "Default", compare: null },
  title:   { label: "Title",   compare: (a, b) => (a.title || "").localeCompare(b.title || "") },
  year:    { label: "Year",    compare: (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0) },
  rating:  { label: "Rating",  compare: (a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) },
};

export function createDVDStack(scene) {
  const width  = 2.0;
  const thick  = config.dvdThickness;     // e.g. 0.18
  const height = 1.45;
  const STEP_Y = config.dvdThickness;


  const geo = new RoundedBoxGeometry(width, thick, height, config.roundSegments, config.roundRadius);


  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");

  let rows = [];
  const dvds = [];

  let building = true;
  let buildIndex = 0;
  let buildTimer = 0;

  let mode = "tower";
  let focused = null;
  let flipY = 0;

  let currentSortMode = "default";
  let filterPredicate = null;
  let visibleCount = 0;

  let mouseTarget = { x: 0, y: 0 };
  let mouseSmooth = { x: 0, y: 0 };

  const stackHeight = () => {
    // When a filter is active the tower compresses to just the visible items;
    // otherwise it spans the full collection so the scroll range is calibrated
    // for the build animation too.
    if (filterPredicate) return Math.max(0, (visibleCount - 1) * STEP_Y);
    return Math.max(0, (rows.length - 1) * STEP_Y);
  };

  // --- Shared base materials ---
  const blackMat = new THREE.MeshStandardMaterial({
    color: 0x050506,
    roughness: 0.95,
    metalness: 0.02,
  });

  // Used for cover/spine/back where we set maps/colors per-DVD
  const tintMatTemplate = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.02,
  });

  function makeMaterials() {
    // Default: cover/back/spines are tintable, everything else black-ish
    const m0 = tintMatTemplate.clone(); // +X (spine)
    const m1 = tintMatTemplate.clone(); // -X (spine)
    const m2 = tintMatTemplate.clone(); // +Y (cover)
    const m3 = tintMatTemplate.clone(); // -Y (back)

    // IMPORTANT: these must be tintable if we want spine text visible on Z faces
    const m4 = tintMatTemplate.clone(); // +Z (side/spine)
    const m5 = tintMatTemplate.clone(); // -Z (side/spine)

    // Start spines/back/sides with a neutral dark tint until we compute avg
    m0.color.setHex(0x222222);
    m1.color.setHex(0x222222);
    m3.color.setHex(0x222222);
    m4.color.setHex(0x222222);
    m5.color.setHex(0x222222);

    // If you truly want "rest black", you can keep bottoms etc black,
    // but in this setup the only "black-only" faces are none — because we want the title visible from more angles.
    // If you want to force any faces black later, say which ones.
    return [m0, m1, m2, m3, m4, m5];
  }

  // --- Average colour extraction from image ---
  function averageColorFromImage(img) {
    const w = 32, h = 32;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);

    const { data } = ctx.getImageData(0, 0, w, h);

    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      if (a < 0.2) continue;
      r += data[i] * a;
      g += data[i + 1] * a;
      b += data[i + 2] * a;
      n += a;
    }
    if (n <= 1e-6) return new THREE.Color(0.15, 0.15, 0.15);

    r /= (255 * n);
    g /= (255 * n);
    b /= (255 * n);

    return new THREE.Color(
      Math.min(0.85, Math.max(0.05, r)),
      Math.min(0.85, Math.max(0.05, g)),
      Math.min(0.85, Math.max(0.05, b))
    );
  }

  function colorToCss(col) {
    const r = Math.round(col.r * 255);
    const g = Math.round(col.g * 255);
    const b = Math.round(col.b * 255);
    return `rgb(${r},${g},${b})`;
  }

  // Greedy word-wrap. Splits `text` into lines that each measure within
  // maxWidth using the canvas's current font, capped at maxLines (any
  // overflow gets an ellipsis on the final line).
  function wrapText(ctx, text, maxWidth, maxLines = Infinity) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [];

    const lines = [];
    let current = "";
    let i = 0;
    for (; i < words.length; i++) {
      const word = words[i];
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        if (lines.length >= maxLines) break;
        current = word;
      } else {
        current = test;
      }
    }
    if (current && lines.length < maxLines) {
      lines.push(current);
      i++;
    }

    if (lines.length >= maxLines && i < words.length) {
      let last = lines[lines.length - 1];
      while (ctx.measureText(last + "…").width > maxWidth && last.length > 1) {
        last = last.slice(0, -1);
      }
      lines[lines.length - 1] = last.trim() + "…";
    }
    return lines;
  }

  // --- Spine title texture ---
  // 8:1 aspect canvas — closer match to the actual visible face aspects
  // (±X is 7.25:1, ±Z is 10:1) so the text doesn't get distorted. Auto-fits
  // the font down to a minimum size before truncating with an ellipsis as a
  // last resort. Year sits to the right in dimmer text.
  function makeSpineTexture(title, year, tintColor) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 128;
    const ctx = c.getContext("2d");

    // Background tint
    ctx.fillStyle = colorToCss(tintColor);
    ctx.fillRect(0, 0, c.width, c.height);

    // Subtle case-wrap bands top and bottom
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, c.width, 8);
    ctx.fillRect(0, c.height - 8, c.width, 8);

    const text = String(title || "Untitled").trim();
    const yearText = year ? String(year) : "";

    const FONT = "Georgia, 'Times New Roman', serif";
    const padding = 28;
    const titleBudget = c.width - padding * 2 - (yearText ? 120 : 0);

    const TARGET_SIZE = 78;
    const MIN_SIZE = 32;

    let fontSize = TARGET_SIZE;
    let displayed = text;
    ctx.font = `600 ${fontSize}px ${FONT}`;
    ctx.textBaseline = "middle";

    // Shrink the font for long titles down to MIN_SIZE…
    while (ctx.measureText(displayed).width > titleBudget && fontSize > MIN_SIZE) {
      fontSize -= 2;
      ctx.font = `600 ${fontSize}px ${FONT}`;
    }
    // …and truncate with an ellipsis only if still too long at min size.
    if (ctx.measureText(displayed).width > titleBudget) {
      while (ctx.measureText(displayed + "…").width > titleBudget && displayed.length > 1) {
        displayed = displayed.slice(0, -1);
      }
      displayed = displayed.trim() + "…";
    }

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(displayed, padding, c.height / 2);

    if (yearText) {
      ctx.font = `400 ${Math.round(fontSize * 0.5)}px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.textAlign = "right";
      ctx.fillText(yearText, c.width - padding, c.height / 2);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.center.set(0.5, 0.5);
    return tex;
  }

  // --- Back metadata texture (tinted background) ---
  // Mirrors the spine treatment: Georgia serif, auto-fit title (shrinks
  // before truncating), every body field word-wraps so long director /
  // starring lists don't overflow off the case.
  function makeBackMetaTexture(data, tintColor) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 768;
    const ctx = c.getContext("2d");

    const bg = tintColor
      ? tintColor.clone().multiplyScalar(0.45)
      : new THREE.Color(0.08, 0.08, 0.08);
    ctx.fillStyle = colorToCss(bg);
    ctx.fillRect(0, 0, c.width, c.height);

    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, "rgba(0,0,0,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);

    const FONT = "Georgia, 'Times New Roman', serif";
    const padding = 28;
    const maxWidth = c.width - padding * 2;
    ctx.textBaseline = "top";

    // ---- Title (auto-fit, wrap to 2 lines max) ----
    const TITLE_MAX = 40;
    const TITLE_MIN = 24;
    let titleSize = TITLE_MAX;
    const titleText = String(data.title || "Untitled").trim();
    ctx.font = `700 ${titleSize}px ${FONT}`;
    while (ctx.measureText(titleText).width > maxWidth && titleSize > TITLE_MIN) {
      titleSize -= 2;
      ctx.font = `700 ${titleSize}px ${FONT}`;
    }
    ctx.fillStyle = "#ffffff";
    const titleLines = wrapText(ctx, titleText, maxWidth, 2);
    let y = 30;
    for (const ln of titleLines) {
      ctx.fillText(ln, padding, y);
      y += Math.round(titleSize * 1.1);
    }
    y += 18;

    // ---- Body fields ----
    function field(label, value, { maxLines = 3 } = {}) {
      if (!value) return;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `400 13px ${FONT}`;
      ctx.fillText(String(label).toUpperCase(), padding, y);
      y += 18;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `400 20px ${FONT}`;
      const lines = wrapText(ctx, String(value), maxWidth, maxLines);
      for (const ln of lines) {
        ctx.fillText(ln, padding, y);
        y += 24;
      }
      y += 10;
    }

    field("Year", data.year);
    field("Director", data.director, { maxLines: 2 });
    if (data.starring) field("Starring", data.starring, { maxLines: 2 });
    field("Genre", data.genre, { maxLines: 2 });
    field("Your rating", data.rating ? `${data.rating} / 5` : "");
    field("TMDB", (typeof data.cover?.voteAverage === "number")
      ? `${data.cover.voteAverage.toFixed(1)} / 10`
      : "");

    // ---- Notes (italic, fills remaining space above footer) ----
    if (data.notes) {
      y += 6;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `400 13px ${FONT}`;
      ctx.fillText("NOTES", padding, y);
      y += 22;

      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `italic 19px ${FONT}`;
      const footerY = c.height - 60;
      const lineHeight = 24;
      const maxLines = Math.max(0, Math.floor((footerY - y) / lineHeight));
      const notesLines = wrapText(ctx, data.notes, maxWidth, maxLines);
      for (const ln of notesLines) {
        if (y + lineHeight > footerY) break;
        ctx.fillText(ln, padding, y);
        y += lineHeight;
      }
    }

    if (data.letterboxd) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = `400 15px ${FONT}`;
      ctx.fillText("Letterboxd link in side panel", padding, c.height - 38);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.center.set(0.5, 0.5);
    tex.rotation = -Math.PI / 2;
    return tex;
  }

  function applyCoverTexture(mesh, url) {
    if (!mesh || !url) return;

    const mats = mesh.material;
    const coverMat = mats[FACE_COVER];
    if (!coverMat) return;

    textureLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;

        // Portrait → rotate in UV space
        tex.center.set(0.5, 0.5);
        tex.rotation = -Math.PI / 2;

        tex.needsUpdate = true;
        coverMat.map = tex;
        coverMat.needsUpdate = true;

        const img = tex.image;
        if (img && img.width && img.height) {
          const avg = averageColorFromImage(img);
          mesh.userData.avgColor = avg;

          // ✅ Apply tint + title texture to ALL vertical side faces (X and Z)
          const spineTex = makeSpineTexture(
            mesh.userData.data?.title,
            mesh.userData.data?.year,
            avg,
          );
          for (const face of [FACE_SPINE_POSX, FACE_SPINE_NEGX, FACE_SIDE_POSZ, FACE_SIDE_NEGZ]) {
            mats[face].color.copy(avg);
            mats[face].map = spineTex;
            mats[face].needsUpdate = true;
          }

          // Back metadata (tinted)
          const backTex = makeBackMetaTexture(mesh.userData.data, avg);
          mats[FACE_BACK].color.copy(avg);
          mats[FACE_BACK].map = backTex;
          mats[FACE_BACK].needsUpdate = true;
        }
      },
      undefined,
      (err) => console.warn("[COVER] Failed to load:", url, err)
    );
  }

  function addDVD(i, instant = false) {
    const d = rows[i];
    const m = new THREE.Mesh(geo, makeMaterials());

    const y = i * STEP_Y;

    m.position.set(
      (Math.random() - 0.5) * 0.7,
      instant ? y : (y + (config.buildDropHeight ?? 2.0)),
      (Math.random() - 0.5) * 0.7
    );
    m.rotation.set(0, (Math.random() - 0.5) * 0.35, 0);

    const rnd = mulberry32(i + 1);

    m.userData = {
      index: i,
      data: d,
      homePos: new THREE.Vector3(m.position.x, y, m.position.z),
      homeRot: m.rotation.clone(),
      targetPos: m.position.clone(),
      targetRot: m.rotation.clone(),
      avgColor: new THREE.Color(0.15, 0.15, 0.15),
      rand: {
        yaw: rnd() * 2 - 1,
        tiltX: rnd() * 2 - 1,
        tiltZ: rnd() * 2 - 1,
        push: rnd() * 2 - 1,
      },
    };

    m.userData.targetPos.copy(m.userData.homePos);
    m.userData.targetRot.copy(m.userData.homeRot);

    // Default back metadata (dark), will be re-tinted once poster loads
    m.material[FACE_BACK].map = makeBackMetaTexture(d, m.userData.avgColor);
    m.material[FACE_BACK].needsUpdate = true;

    // Default spine title (dark), will be re-tinted once poster loads
    const spineTex = makeSpineTexture(d.title, d.year, m.userData.avgColor);
    for (const face of [FACE_SPINE_POSX, FACE_SPINE_NEGX, FACE_SIDE_POSZ, FACE_SIDE_NEGZ]) {
      m.material[face].map = spineTex;
      m.material[face].needsUpdate = true;
    }

    const posterUrl = d?.cover?.posterUrl;
    if (posterUrl) applyCoverTexture(m, posterUrl);

    scene.add(m);
    dvds.push(m);

    return m;
  }

  function setData(csvRows) {
    rows = csvRows || [];

    for (const m of dvds) scene.remove(m);
    dvds.length = 0;

    building = Boolean(config.buildEnabled);
    buildIndex = 0;
    buildTimer = 0;

    mode = "tower";
    focused = null;
    flipY = 0;
    currentSortMode = "default";

    if (!building) {
      while (buildIndex < rows.length) addDVD(buildIndex++, true);
      building = false;
    }
  }

  // Shared "apply current view" routine — handles sort + filter together so
  // the two can compose. Caches each mesh's original CSV index on first run
  // so subsequent re-sorts always resolve from a stable baseline.
  function applyView() {
    if (mode === "focus") setModeTower();

    const sort = SORT_MODES[currentSortMode];

    const visible = [];
    for (const m of dvds) {
      if (m.userData.originalIndex === undefined) {
        m.userData.originalIndex = m.userData.index;
      }
      const passes = filterPredicate ? filterPredicate(m.userData.data) : true;
      m.visible = passes;
      if (passes) visible.push(m);
    }
    visibleCount = visible.length;

    if (sort.compare) {
      visible.sort((a, b) => sort.compare(a.userData.data, b.userData.data));
    } else {
      visible.sort((a, b) => a.userData.originalIndex - b.userData.originalIndex);
    }

    // Reorder cascade: each new-position-i DVD's target update is held back
    // by i * staggerMs. updateTargets honours `reorderStartAt` and keeps the
    // mesh's target frozen at its previous position until its turn arrives —
    // visually that reads as a wave moving through the tower rather than a
    // simultaneous snap.
    const now = performance.now();
    const stagger = Math.max(0, config.reorderStaggerMs ?? 0);

    for (let i = 0; i < visible.length; i++) {
      visible[i].userData.index = i;
      visible[i].userData.homePos.y = i * STEP_Y;
      visible[i].userData.reorderStartAt = stagger > 0 ? now + i * stagger : 0;
    }
  }

  function setSortMode(modeName) {
    if (!SORT_MODES[modeName]) return;
    currentSortMode = modeName;
    applyView();
  }

  function setFilter(predicate) {
    filterPredicate = predicate || null;
    applyView();
  }

  function skipBuild() {
    if (!building) return;
    while (buildIndex < rows.length) addDVD(buildIndex++, true);
    building = false;
  }

  function updateBuild(dt) {
    if (!building) return;

    buildTimer += dt;
    const interval = Number.isFinite(config.buildInterval) ? config.buildInterval : 0.06;

    let adds = 0;
    while (buildTimer >= interval && buildIndex < rows.length && adds < 3) {
      buildTimer -= interval;
      addDVD(buildIndex++, false);
      adds++;
    }

    if (buildIndex >= rows.length) building = false;
  }

  function setModeTower() {
    if (focused) setDepthOverride(focused, false);
    mode = "tower";
    focused = null;
    flipY = 0;
  }

  function setModeFocus(mesh) {
    if (!mesh) return;
    if (focused && focused !== mesh) setDepthOverride(focused, false);
    mode = "focus";
    focused = mesh;
    flipY = 0;
    setDepthOverride(focused, true);
  }

  function toggleFlip() {
    flipY = flipY === 0 ? Math.PI : 0;
  }

  function isFocusedMesh(mesh) {
    return focused === mesh;
  }

  function setFeaturedMouseNDC(ndc) {
    mouseTarget.x = ndc.x;
    mouseTarget.y = ndc.y;
  }

  function getFocusedY() {
    return focused ? focused.userData.homePos.y : 0;
  }

  function updateTargets(time, dt) {
    const aMouse = 1 - Math.exp(-config.featuredMouseSmoothing * dt);
    mouseSmooth.x += (mouseTarget.x - mouseSmooth.x) * aMouse;
    mouseSmooth.y += (mouseTarget.y - mouseSmooth.y) * aMouse;

    if (mode === "tower") {
      // Honour reorder stagger — DVDs whose start-time hasn't arrived yet
      // keep their current target (effectively their previous Y), so the
      // rearrangement cascades visually through the tower.
      const now = performance.now();
      for (const m of dvds) {
        const u = m.userData;
        if (u.reorderStartAt && now < u.reorderStartAt) continue;
        u.targetPos.copy(u.homePos);
        u.targetRot.copy(u.homeRot);
      }
      return;
    }

    const idx = focused.userData.index;
    const fy = focused.userData.homePos.y;

    // Featured DVD sits at the camera look-at Y plus an optional lift, so
    // it can float above the look-at point (used on mobile to keep the
    // DVD clear of the bottom info panel).
    const featuredPos = new THREE.Vector3(
      0,
      fy + config.focusTargetYOffset + (config.focusedDvdLift ?? 0),
      0.6,
    );

    for (const m of dvds) {
      const u = m.userData;

      u.targetPos.copy(u.homePos);
      u.targetRot.copy(u.homeRot);

      if (m === focused) {
        const mouseYaw = mouseSmooth.x * config.featuredMouseTiltY;
        const mousePitch = mouseSmooth.y * config.featuredMouseTiltX;

        u.targetPos.copy(featuredPos);
        u.targetRot.set(
          config.featuredTiltX + mousePitch,
          config.featuredRotY + mouseYaw + flipY,
          config.featuredRotZ
        );
        continue;
      }

      const dy = u.index - idx;
      const ady = Math.abs(dy);
      if (ady > config.explodeRange) continue;

      const t = 1 - ady / config.explodeRange;

      const dir = new THREE.Vector3(u.homePos.x, 0, u.homePos.z);
      if (dir.lengthSq() < 1e-6) dir.set(u.rand.push, 0, 0.4);
      dir.normalize();

      u.targetPos.copy(u.homePos).add(dir.multiplyScalar(config.explodeDistance * t));
      u.targetPos.y = u.homePos.y + Math.sign(dy) * (config.verticalBreath * t);
      u.targetPos.y += Math.sin(time * config.floatSpeed + u.index * 0.7) * (config.floatAmount * t);

      const extraYaw = u.rand.yaw * config.explodeRotate * t;
      const tiltX = u.rand.tiltX * config.explodeTilt * t;
      const tiltZ = u.rand.tiltZ * config.explodeTilt * t;

      u.targetRot.set(tiltX, u.homeRot.y + extraYaw, tiltZ);
    }
  }

  function apply(dt) {
    const a = 1 - Math.exp(-config.smoothTransforms * dt);
    const ay = building ? (1 - Math.exp(-(config.buildDropSmooth ?? 14.0) * dt)) : a;

    for (const m of dvds) {
      const u = m.userData;

      m.position.x += (u.targetPos.x - m.position.x) * a;
      m.position.y += (u.targetPos.y - m.position.y) * ay;
      m.position.z += (u.targetPos.z - m.position.z) * a;

      m.rotation.x += (u.targetRot.x - m.rotation.x) * a;
      m.rotation.y += (u.targetRot.y - m.rotation.y) * a;
      m.rotation.z += (u.targetRot.z - m.rotation.z) * a;

      if (mode === "focus" && focused && m === focused) {
        m.scale.lerp(new THREE.Vector3(config.featuredScale, config.featuredScale, config.featuredScale), a);
      } else {
        m.scale.lerp(new THREE.Vector3(1, 1, 1), a);
      }
    }
  }

  return {
    dvds,
    setData,

    isBuilding: () => building,
    updateBuild,
    skipBuild,
    getBuildHeight: () => Math.max(0, (buildIndex - 1) * STEP_Y),
    getStackHeight: stackHeight,

    getMode: () => mode,
    setModeTower,
    setModeFocus,
    getFocused: () => focused,
    getFocusedY,
    isFocusedMesh,
    toggleFlip,

    setFeaturedMouseNDC,

    setSortMode,
    getSortMode: () => currentSortMode,
    setFilter,
    clearFilter: () => setFilter(null),
    getVisibleCount: () => (filterPredicate ? visibleCount : rows.length),

    updateTargets,
    apply,

    applyCoverTexture,
  };
}
