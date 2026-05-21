const deg = (d) => (d * Math.PI) / 180;

export const config = {
  stepY: 0.34,

  // Elastic drag
  dragThresholdPx: 7,
  dragPower: 1.28,
  dragScale: 0.00019,

  // Camera: tower
  towerCamZ: 10.0,
  towerCamYOffset: 3.5,
  towerTargetYOffset: 1.5,

  dvdThickness: 0.2,     // thinner spine
  roundRadius: 0.05,      // corner roundness
  roundSegments: 4,       // 3–6 is fine (higher = smoother, more polys)


  // Camera: focus
  focusCamZ: 7.7,     // ✅ from your screenshot
  focusCamX: 2.0,
  focusCamYOffset: 2.0,
  focusTargetYOffset: 1.2,
  // Vertical lift of the focused DVD *above* the camera's look-at point.
  // 0 = DVD sits dead-centre in view (current desktop behaviour). >0 raises
  // the DVD so the meta panel can claim the bottom of the screen without
  // covering it — used on mobile.
  focusedDvdLift: 0,

  // Mouse sway (inverted)
  swayCamX: 1.2,
  swayTargetX: 0.35,

  // Explosion defaults (✅ from your screenshot)
  explodeRange: 11,
  explodeDistance: 5.0,
  explodeRotate: 1.55,
  explodeTilt: 1.25,
  verticalBreath: 0.4,

  // Float defaults (✅ from your screenshot)
  floatSpeed: 0.70,
  floatAmount: 0.12,

  // Featured DVD base orientation (radians)
  featuredTiltX: 0,
  featuredExtraTilt: 0,
  featuredRotY: deg(90),      // IMPORTANT: radians
  featuredRotZ: deg(90),      // IMPORTANT: radians
  featuredScale: 2.0,

  // Featured small mouse interaction
  featuredMouseTiltX: deg(8),   // up/down (pitch) max
  featuredMouseTiltY: deg(10),  // left/right (yaw) max
  featuredMouseSmoothing: 10.0, // feel

  // Clicking featured again flips it 180 degrees
  featuredFlipEnabled: true,

  // Smoothing
  smoothScroll: 10.0,
  smoothTransforms: 12.0,
  smoothCamera: 8.0,

  buildEnabled: true,
  buildInterval: 0.06,
  buildDropHeight: 2.2,
  buildDropSmooth: 14.0,
  buildAllowSkipKey: true,

  // Sort / filter reorder cascade — each DVD's move starts N ms after the
  // previous so the rearrangement reads as a wave rather than a snap.
  // Zeroed under reduced motion.
  reorderStaggerMs: 12,

  // TMDB — the API key now lives server-side in the /api/tmdb proxy
  // (Vercel env var TMDB_API_KEY). The client only configures the language.
  TMDB_LANGUAGE: "en-GB",

  // Demo CSV — loaded on first visit (or after a user clears their collection).
  // Once a user uploads their own CSV it lives in IndexedDB; the demo is the fallback.
  DEMO_CSV_PATH: "./data/demo.csv",

  // Covers
  COVERS_ROOT: "./data/covers",

};
