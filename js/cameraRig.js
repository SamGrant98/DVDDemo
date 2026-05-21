import { config } from "./config.js";

export function createCameraRig(camera, controls) {
  let mouseX01 = 0.5;
  let mouseY01 = 0.5;
  // When non-null, getMouseNDC() returns this instead of the mouse-derived
  // value. Used by main.js to feed device-orientation (gyro) into both the
  // tower sway AND the focused-DVD tilt, in place of pointer position.
  let swayOverride = null;

  window.addEventListener("mousemove", (e) => {
    mouseX01 = e.clientX / Math.max(1, window.innerWidth);
    mouseY01 = e.clientY / Math.max(1, window.innerHeight);
  }, { passive: true });

  function damp(current, target, lambda, dt) {
    const a = 1 - Math.exp(-lambda * dt);
    return current + (target - current) * a;
  }

  function readNDC() {
    if (swayOverride) return swayOverride;
    // inverted (matches your sway choice)
    return {
      x: -((mouseX01 * 2) - 1),
      y: -((mouseY01 * 2) - 1),
    };
  }

  return {
    getMouseNDC: readNDC,
    setSwayOverride(ndc) { swayOverride = ndc || null; },

    updateBuild(dt, buildY) {
      const buildOffset = Number.isFinite(config.buildCameraYOffset) ? config.buildCameraYOffset : 3.2;

      camera.position.x = damp(camera.position.x, 2.5, config.smoothCamera, dt);
      camera.position.y = damp(camera.position.y, buildY + buildOffset, config.smoothCamera, dt);
      camera.position.z = damp(camera.position.z, config.towerCamZ, config.smoothCamera, dt);

      if (controls) {
        controls.target.x = damp(controls.target.x, 0, config.smoothCamera, dt);
        controls.target.y = damp(controls.target.y, buildY + 1.0, config.smoothCamera, dt);
        controls.target.z = damp(controls.target.z, 0, config.smoothCamera, dt);
      }
    },


    updateTower(dt, towerY) {
      // Reads from readNDC so gyro override drives the camera sway too,
      // not just the focused-DVD tilt.
      const sway = readNDC().x;

      camera.position.x = damp(camera.position.x, 2.5 + sway * config.swayCamX, config.smoothCamera, dt);
      camera.position.y = damp(camera.position.y, towerY + config.towerCamYOffset, config.smoothCamera, dt);
      camera.position.z = damp(camera.position.z, config.towerCamZ, config.smoothCamera, dt);

      controls.target.x = damp(controls.target.x, sway * config.swayTargetX, config.smoothCamera, dt);
      controls.target.y = damp(controls.target.y, towerY + config.towerTargetYOffset, config.smoothCamera, dt);
      controls.target.z = damp(controls.target.z, 0, config.smoothCamera, dt);
    },

    updateFocus(dt, focusY) {
      camera.position.x = damp(camera.position.x, config.focusCamX, config.smoothCamera, dt);
      camera.position.y = damp(camera.position.y, focusY + config.focusCamYOffset, config.smoothCamera, dt);
      camera.position.z = damp(camera.position.z, config.focusCamZ, config.smoothCamera, dt);

      controls.target.x = damp(controls.target.x, 0, config.smoothCamera, dt);
      controls.target.y = damp(controls.target.y, focusY + config.focusTargetYOffset, config.smoothCamera, dt);
      controls.target.z = damp(controls.target.z, 0, config.smoothCamera, dt);
    }
  };
}
