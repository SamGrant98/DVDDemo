// js/towerScroll.js
import { config } from "./config.js";

export function createTowerScroll() {
  let scroll = 0;
  let target = 0;

  let pointerDown = false;
  let pointerMoved = false;
  let downY = 0;
  let lastY = 0;
  let pointerDownTime = 0;

  let locked = false;

  // Drag classification grace window. Movement during the first
  // `tapGraceMs` after a pointer-down does NOT classify as a drag,
  // regardless of distance — quick taps usually have some natural drift
  // and we don't want that to count as scrolling.
  const tapGraceMs = 150;

  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  window.addEventListener(
    "wheel",
    (e) => {
      if (locked) return;
      target = clamp01(target + e.deltaY * 0.0005);
    },
    { passive: true }
  );

  window.addEventListener("pointerdown", (e) => {
    if (locked) return;
    pointerDown = true;
    pointerMoved = false;
    downY = lastY = e.clientY;
    pointerDownTime = performance.now();
  });

  window.addEventListener(
    "pointermove",
    (e) => {
      if (locked) return;
      if (!pointerDown) return;

      const dyTotal = e.clientY - downY;
      const elapsed = performance.now() - pointerDownTime;

      if (!pointerMoved) {
        // Need BOTH movement past the distance threshold AND time past the
        // tap-grace window before we commit to "this is a drag, not a
        // tap". Without the time gate, even very fast taps would cross the
        // distance threshold during normal finger wobble and be classified
        // as drags (and then scroll the tower instead of focusing a DVD).
        const distOK = Math.abs(dyTotal) > config.dragThresholdPx;
        const timeOK = elapsed > tapGraceMs;
        if (distOK && timeOK) {
          pointerMoved = true;
        } else {
          return;
        }
      }

      const dy = e.clientY - lastY;
      lastY = e.clientY;

      const sign = Math.sign(dy) || 1;
      const mag = Math.pow(Math.abs(dy), config.dragPower) * config.dragScale;
      target = clamp01(target + sign * mag);
    },
    { passive: true }
  );

  window.addEventListener("pointerup", () => {
    pointerDown = false;
  });

  window.addEventListener("pointercancel", () => {
    pointerDown = false;
    pointerMoved = false;
  });

  return {
    update(dt) {
      const a = 1 - Math.exp(-config.smoothScroll * dt);
      scroll += (target - scroll) * a;
      return scroll;
    },

    setTarget(t) {
      target = clamp01(t);
    },

    // Exposed so main.js can detect "user is trying to scroll" — used to
    // exit focus mode on scroll input (target changes immediately on
    // wheel/drag, before scroll smooths into it).
    getTarget() { return target; },

    // NEW: hard set both current scroll + target (prevents 1-frame camera jumps)
    snapTo(t) {
      const v = clamp01(t);
      scroll = v;
      target = v;
    },

    didDrag() {
      return pointerMoved;
    },

    setLocked(v) {
      locked = !!v;
      if (locked) pointerMoved = false;
    },
  };
}
