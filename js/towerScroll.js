// js/towerScroll.js
import { config } from "./config.js";

export function createTowerScroll() {
  let scroll = 0;
  let target = 0;

  let pointerDown = false;
  let pointerMoved = false;
  let downY = 0;
  let lastY = 0;

  let locked = false;

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
  });

  window.addEventListener(
    "pointermove",
    (e) => {
      if (locked) return;
      if (!pointerDown) return;

      const dyTotal = e.clientY - downY;
      if (!pointerMoved && Math.abs(dyTotal) > config.dragThresholdPx) {
        pointerMoved = true;
      }
      if (!pointerMoved) return;

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
