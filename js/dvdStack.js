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

  let mouseTarget = { x: 0, y: 0 };
  let mouseSmooth = { x: 0, y: 0 };

  const stackHeight = () => Math.max(0, (rows.length - 1) * STEP_Y);

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

  // --- Spine title texture ---
  function makeSpineTexture(title, tintColor) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext("2d");

    ctx.fillStyle = colorToCss(tintColor);
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, c.width, 10);
    ctx.fillRect(0, c.height - 10, c.width, 10);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px system-ui";
    ctx.textBaseline = "middle";

    const text = (title || "Untitled").trim();
    const maxChars = 18;
    const t = text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;

    ctx.fillText(t, 18, c.height / 2);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = THREE.ClampToEdgeWrapping; 
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;

    // Rotate so it reads nicely along the side UVs
    tex.center.set(0.5, 0.5);
    // tex.rotation = Math.PI / 2;

    return tex;
  }

  // --- Back metadata texture (tinted background) ---
  function makeBackMetaTexture(data, tintColor) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 768;

    const ctx = c.getContext("2d");

    const bg = tintColor ? tintColor.clone().multiplyScalar(0.45) : new THREE.Color(0.08, 0.08, 0.08);
    ctx.fillStyle = colorToCss(bg);
    ctx.fillRect(0, 0, c.width, c.height);

    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, "rgba(0,0,0,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px system-ui";
    ctx.textBaseline = "top";
    ctx.fillText(data.title || "Untitled", 24, 24);

    ctx.font = "22px system-ui";
    let y = 84;

    function line(label, value) {
      if (!value) return;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(label, 24, y);
      y += 26;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(value, 24, y);
      y += 46;
    }

    line("Year", data.year);
    line("Director", data.director);
    line("Genre", data.genre);
    line("Rating", data.rating ? `${data.rating} / 5` : "");

    if (data.letterboxd) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "18px system-ui";
      ctx.fillText("Letterboxd link in side panel", 24, c.height - 42);
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
          const spineTex = makeSpineTexture(mesh.userData.data?.title, avg);
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
    const spineTex = makeSpineTexture(d.title, m.userData.avgColor);
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

    if (!building) {
      while (buildIndex < rows.length) addDVD(buildIndex++, true);
      building = false;
    }
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
      for (const m of dvds) {
        const u = m.userData;
        u.targetPos.copy(u.homePos);
        u.targetRot.copy(u.homeRot);
      }
      return;
    }

    const idx = focused.userData.index;
    const fy = focused.userData.homePos.y;

    const featuredPos = new THREE.Vector3(0, fy + config.focusTargetYOffset, 0.6);

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

    updateTargets,
    apply,

    applyCoverTexture,
  };
}
