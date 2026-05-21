// js/sceneBackdrop.js
//
// Atmospheric backdrop for the 3D scene:
//   - A slow-drifting dust particle field around the tower
//   - A scene.background colour that lerps toward a desaturated version of
//     the focused DVD's average cover colour
//   - A *procedural* radial gradient driven by a ShaderMaterial, centred on
//     screen, fading to dark at the edges. Driven by the focused DVD's
//     average cover colour. Replaces the earlier TMDB-backdrop-image quad
//     (which had two problems: low source resolution that pixellated when
//     scaled up, and visible plane corners when the camera offset moved off
//     centre during focus mode).
//
// Single `update(dt, focusedMesh, opts)` tick called from the main animate
// loop. `opts.reducedMotion` collapses transitions to instant.

import * as THREE from "three";

const DEFAULT_BG = new THREE.Color(0x111114);

export function createSceneBackdrop(scene, {
  particleCount = 350,
  particleBounds = 40,
  particleSize = 0.05,
  particleOpacity = 0.28,
  desaturateBlend = 0.78,        // 0 = full cover colour, 1 = full dark
  bgLerpSpeed = 1.6,             // per second; ~1.6 = ~600ms to land
  gradientMaxBrightness = 0.55,  // peak intensity of the radial highlight
  gradientFalloff = 1.4,         // higher = tighter highlight, lower = broader
  gradientZ = -50,
} = {}) {
  // ----- Particle field -----
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 2 * particleBounds;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2 * particleBounds;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1.5 * particleBounds - 10;
    velocities[i * 3]     = (Math.random() - 0.5) * 0.04;
    velocities[i * 3 + 1] = 0.03 + Math.random() * 0.05;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: particleSize,
    transparent: true,
    opacity: particleOpacity,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // ----- Background colour (the "void" colour outside the gradient) -----
  scene.background = DEFAULT_BG.clone();
  const targetBg = DEFAULT_BG.clone();
  const tmpColor = new THREE.Color();

  // ----- Procedural radial gradient -----
  // The fragment shader uses gl_FragCoord / resolution to compute a
  // screen-space radial gradient, so the highlight is always centred on the
  // viewport regardless of camera offset or quad world-position. The quad
  // itself just needs to be large enough that it covers the screen.
  const backdropGeo = new THREE.PlaneGeometry(500, 500);
  const backdropMat = new THREE.ShaderMaterial({
    uniforms: {
      centerColor: { value: new THREE.Color(0, 0, 0) },
      brightness:  { value: 0 },
      falloff:     { value: gradientFalloff },
      resolution:  { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec2 resolution;
      uniform vec3 centerColor;
      uniform float brightness;
      uniform float falloff;
      void main() {
        // Centre at (0,0), scaled so corners reach roughly ±1, aspect-corrected.
        vec2 p = (gl_FragCoord.xy / resolution) - 0.5;
        float aspect = resolution.x / resolution.y;
        p.x *= aspect;
        float d = length(p) * falloff;
        // Smooth fade — 1 at centre, 0 by d=1
        float intensity = 1.0 - smoothstep(0.0, 1.0, d);
        vec3 col = centerColor * intensity * brightness;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthWrite: false,
  });
  const backdropMesh = new THREE.Mesh(backdropGeo, backdropMat);
  backdropMesh.position.z = gradientZ;
  backdropMesh.renderOrder = -1; // draws first in opaque batch
  scene.add(backdropMesh);

  let currentGradientBrightness = 0;
  let targetGradientBrightness = 0;
  const currentGradientColor = new THREE.Color(0, 0, 0);
  const targetGradientColor = new THREE.Color(0, 0, 0);

  function update(dt, focusedMesh, opts = {}) {
    const { reducedMotion = false } = opts;

    // Particles drift — skipped under reduced-motion.
    if (!reducedMotion) {
      const posArr = geo.attributes.position.array;
      const step = dt * 60;
      for (let i = 0; i < particleCount; i++) {
        const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
        posArr[ix] += velocities[ix] * step;
        posArr[iy] += velocities[iy] * step;
        posArr[iz] += velocities[iz] * step;
        if (posArr[iy] >  particleBounds) posArr[iy] = -particleBounds;
        if (posArr[iy] < -particleBounds) posArr[iy] =  particleBounds;
        if (posArr[ix] >  particleBounds) posArr[ix] = -particleBounds;
        if (posArr[ix] < -particleBounds) posArr[ix] =  particleBounds;
        if (posArr[iz] >  particleBounds) posArr[iz] = -particleBounds;
        if (posArr[iz] < -particleBounds) posArr[iz] =  particleBounds;
      }
      geo.attributes.position.needsUpdate = true;
    }

    // Determine targets.
    if (focusedMesh?.userData?.avgColor) {
      tmpColor.copy(focusedMesh.userData.avgColor);
      tmpColor.lerp(DEFAULT_BG, desaturateBlend);
      targetBg.copy(tmpColor);
      targetGradientColor.copy(focusedMesh.userData.avgColor);
      targetGradientBrightness = gradientMaxBrightness;
    } else {
      targetBg.copy(DEFAULT_BG);
      targetGradientBrightness = 0;
    }

    // Frame-rate-independent lerp, instant under reduced-motion.
    const lerpAlpha = reducedMotion ? 1 : (1 - Math.exp(-bgLerpSpeed * dt));
    scene.background.lerp(targetBg, lerpAlpha);
    currentGradientBrightness += (targetGradientBrightness - currentGradientBrightness) * lerpAlpha;
    currentGradientColor.lerp(targetGradientColor, lerpAlpha);

    backdropMat.uniforms.brightness.value = currentGradientBrightness;
    backdropMat.uniforms.centerColor.value.copy(currentGradientColor);
  }

  function setSize(w, h) {
    backdropMat.uniforms.resolution.value.set(w, h);
  }

  return { update, setSize, particles: points, backdrop: backdropMesh };
}
