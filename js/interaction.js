import * as THREE from "three";

export function createInteraction(camera, objectsRef, towerScroll) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function pick(x, y, prefer) {
    const objects = objectsRef(); // dynamic list during build
    if (!objects || objects.length === 0) return null;

    // Filter out hidden (filtered-out) DVDs before raycasting — otherwise the
    // raycaster can match a non-visible mesh sitting behind the visible tower.
    const candidates = objects.filter(o => o.visible);
    if (candidates.length === 0) return null;

    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(candidates, false);
    if (!hits.length) return null;

    // When a "preferred" mesh is provided (typically the focused DVD) and the
    // ray hit it, return it regardless of distance. This matches the visual
    // truth created by depth-override + renderOrder=9999 on the focused mesh,
    // and prevents the click-to-flip from snagging a closer-in-Z DVD.
    if (prefer) {
      const preferredHit = hits.find(h => h.object === prefer);
      if (preferredHit) return prefer;
    }

    return hits[0].object;
  }

  return {
    bindClicks(onPick, targetEl, getPrefer) {
      // Default to window, but main.js passes the canvas so clicks on UI
      // overlays (meta panel buttons, modals, filter panel) never reach the
      // raycaster and trigger a spurious deselect. getPrefer is invoked per
      // click and should return the currently focused mesh (or null).
      const el = targetEl || window;
      el.addEventListener("pointerup", (e) => {
        if (towerScroll.didDrag()) return;
        const prefer = typeof getPrefer === "function" ? getPrefer() : null;
        onPick(pick(e.clientX, e.clientY, prefer));
      });
    }
  };
}
