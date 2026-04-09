import { config } from "./config.js";

export function mountUIControls(containerId = "controls") {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = `
    <div style="font-weight:700; margin-bottom:10px;">Tweak Controls</div>

    <div class="row"><label>Explode range</label><div class="val" id="v_range"></div></div>
    <input id="r_range" type="range" min="0" max="20" step="1" />

    <div class="row"><label>Explode distance</label><div class="val" id="v_dist"></div></div>
    <input id="r_dist" type="range" min="0" max="10" step="0.1" />

    <div class="row"><label>Explode rotation</label><div class="val" id="v_rot"></div></div>
    <input id="r_rot" type="range" min="0" max="3.2" step="0.01" />

    <div class="row"><label>Explode tilt</label><div class="val" id="v_tilt"></div></div>
    <input id="r_tilt" type="range" min="0" max="2.0" step="0.01" />

    <div class="row"><label>Float speed</label><div class="val" id="v_fspd"></div></div>
    <input id="r_fspd" type="range" min="0" max="5" step="0.01" />

    <div class="row"><label>Float amount</label><div class="val" id="v_famt"></div></div>
    <input id="r_famt" type="range" min="0" max="0.5" step="0.01" />

    <div class="row"><label>Focus zoom (Z)</label><div class="val" id="v_fz"></div></div>
    <input id="r_fz" type="range" min="3" max="12" step="0.1" />

    <div style="opacity:0.75; margin-top:10px;">
      Build: ${config.buildEnabled ? "on" : "off"} • Space skips build
    </div>
  `;

  const $ = (id) => document.getElementById(id);

  const bind = (sliderId, valueId, key, fmt = (v) => v) => {
    const s = $(sliderId);
    const v = $(valueId);

    const refresh = () => {
      s.value = config[key];
      v.textContent = fmt(config[key]);
    };

    s.addEventListener("input", () => {
      config[key] = Number(s.value);
      refresh();
    });

    refresh();
  };

  bind("r_range", "v_range", "explodeRange", (x) => `${x} dvds`);
  bind("r_dist", "v_dist", "explodeDistance", (x) => x.toFixed(1));
  bind("r_rot", "v_rot", "explodeRotate", (x) => x.toFixed(2));
  bind("r_tilt", "v_tilt", "explodeTilt", (x) => x.toFixed(2));
  bind("r_fspd", "v_fspd", "floatSpeed", (x) => x.toFixed(2));
  bind("r_famt", "v_famt", "floatAmount", (x) => x.toFixed(2));
  bind("r_fz", "v_fz", "focusCamZ", (x) => x.toFixed(1));
}
