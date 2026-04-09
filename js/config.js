const deg = (d) => (d * Math.PI) / 180;

export const config = {
  count: 200,
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

  // TMDB
  TMDB_API_KEY: "fdbd48d6b9b3ff8738ec2b019ef85004",   // <-- paste your TMDB API key here
  TMDB_LANGUAGE: "en-GB",

  // CSV source — swap to your personal file locally
  // e.g. CSV_PATH: "./data/Sams_Physical_Media.csv"
  CSV_PATH: "./data/sample.csv",

  // Covers
  COVERS_ROOT: "./data/covers",

};
