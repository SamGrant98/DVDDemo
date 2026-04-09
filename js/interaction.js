import * as THREE from "three";

export function createInteraction(camera, objectsRef, towerScroll) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function pick(x, y) {
    const objects = objectsRef(); // dynamic list during build
    if (!objects || objects.length === 0) return null;

    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(objects, false);
    return hits.length ? hits[0].object : null;
  }

  return {
    bindClicks(onPick) {
      window.addEventListener("pointerup", (e) => {
        if (towerScroll.didDrag()) return;
        onPick(pick(e.clientX, e.clientY));
      });
    }
  };
}
