import { Engine, THREE, damp, clamp, smooth, lerp, studioEnvironment } from './src/core/engine.js';
import { sampleSurface } from './src/core/assets.js';
import { Pointer } from './src/core/input.js';
import { smoothScroll, gsap, reveal } from './src/core/scroll.js';
import { preloader, cursor, magnetic } from './src/core/ui.js';
import { PlanarReflection } from './src/core/reflector.js';
import { createBracelet, RING_R, BEAD_R } from './bracelet.js';
import { createFloor } from './floor.js';
import { createPackaging, BOX } from './packaging.js';
import { createHand } from './hand.js';
import { createStream, createFlyer, burnKey, BURN_GLSL, BURN_A, BURN_B, DUR } from './stream.js';

const D2R = Math.PI / 180;
const Q = new URLSearchParams(location.search);
const P_END = 1 + DUR * 1.25 + 0.04;          // stream progress at which every particle has landed
const FILL0 = 0.5, FILL_STEP = 0.17;           // hero level, and what each collection adds
const CENTRE_Y = RING_R + BEAD_R;              // ring centre height

// ─── The customizer: the eight scent variants (Product Menu, SCENTÁLA) ──────────
const SERIES = [
  {
    key: 'zest', name: 'Zest', sub: 'Citrus Collection', tint: '#FFD700',
    latin: 'Lemon · grapefruit · tangerine · spearmint',
    body: 'Bright, invigorating scents that lift you awake — light enough for a classroom, sharp enough to matter. Cold-pressed citrus oils keep their bitterness, backed by green tea, neroli and a breath of mint.',
    variants: [
      { name: 'Lūmen', price: '₱85', note: 'lemon · bergamot · green tea · neroli · musk', tint: '#FFD700' },
      { name: 'Aër', price: '₱95', note: 'grapefruit · spearmint · jasmine · white cedar', tint: '#32CD32' },
      { name: 'Citra', price: '₱110', note: 'tangerine · orange · magnolia · lily · white amber', tint: '#FFA500' },
    ],
  },
  {
    key: 'creme', name: 'Crème', sub: 'Sweet Gourmand Collection', tint: '#FFFDD0',
    latin: 'Vanilla · caramel · cocoa · praline',
    body: 'Warm, indulgent and edible in the best way — comfort you can wear. Vanilla, caramel and almond settle next to cocoa and brown sugar, so the sweetness never shouts.',
    variants: [
      { name: 'Dulcis', price: '₱95', note: 'vanilla · caramel · almond · sugar petals · musk', tint: '#FFFDD0' },
      { name: 'Noisette', price: '₱120', note: 'cocoa · roasted hazelnut · brown sugar · milk cream · sandalwood', tint: '#FFDAB9' },
      { name: 'Ambrois', price: '₱130', note: 'golden caramel · orange zest · cream · praline · vanilla · cedarwood', tint: '#D2B48C' },
    ],
  },
  {
    key: 'oake', name: 'Oake', sub: 'Woody Keynote', tint: '#8B5E3C',
    latin: 'Oak · vetiver · cedar · sandalwood',
    body: 'Deep, grounded elegance for a quiet presence. Green leaf and oak over vetiver, cedar and sandalwood, finished with musk and amber — the scent of a walk that settles you.',
    variants: [
      { name: 'Sylva', price: '₱110', note: 'green leaf · rosemary · oak · vetiver · musk · amber', tint: '#8B5E3C' },
      { name: 'Serenum', price: '₱140', note: 'cedar · sandalwood · juniper · citrus · vanilla-amber', tint: '#556B2F' },
    ],
  },
];
const VARIANTS = [];
SERIES.forEach(s => s.variants.forEach(v => VARIANTS.push({ ...v, series: s.name })));

// ─── Engine ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gl');
const engine = new Engine({
  canvas, fov: 26, near: 0.05, far: 60, dpr: 1.5, background: 0x0c1103,
  post: {
    ao: { aoRadius: 0.4, intensity: 1.5, distanceFalloff: 0.5 },
    bloom: { intensity: 0.82, luminanceThreshold: 0.78, luminanceSmoothing: 0.28, radius: 0.72 },
    tone: 'aces',
    vignette: { offset: 0.2, darkness: 0.82 },
    noise: 0.045,
    ca: 0.0006,
  },
});
const { scene, camera, renderer } = engine;
scene.background = new THREE.Color(0x0c1103);
// The studio rig is defined relative to the camera (camera on +Z looking at the bracelet) and rotated with the
// orbit, the way a photographer moves the softboxes with the camera: highlights stay pinned on the beads.
const RIG = [
  { pos: [-0.42, 2.0, 7.6], size: [0.13, 11], intensity: 8, color: 0xfff3dc },
  { pos: [0.9, 1.6, 7.6], size: [0.06, 11], intensity: 3.5, color: 0xfff0d6 },
  { pos: [-7.6, 2.2, 0.9], size: [0.7, 12], intensity: 9, color: 0xffeecf },
  { pos: [7.6, 2.2, -0.6], size: [0.5, 12], intensity: 6, color: 0xffe9c8 },
  { pos: [-3.0, 2.8, -7.0], size: [0.45, 11], intensity: 5.5, color: 0xf3d089 },
  { pos: [3.4, 2.8, -7.0], size: [0.4, 11], intensity: 4.5, color: 0xe9c079 },
  { pos: [0.6, 9, 0.4], size: [3.0, 0.35], intensity: 2.0, color: 0xfff4e6 },
  { pos: [-4.5, 1.0, 6.0], size: [2.4, 2.4], intensity: 0.45, color: 0xe7e2c2 },
];
const ENV = studioEnvironment(renderer, { top: 0x0d1305, bottom: 0x010200, blur: 0.012, panels: RIG });
scene.environment = ENV;
scene.environmentIntensity = 1;
// r186 ignores material.envMapIntensity unless the material owns its envMap, so every lit material gets ENV explicitly
// (and its rotation is driven with the orbit, like scene.environmentRotation would be).
const envMats = new Set();
function useEnv(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) if (m && (m.isMeshStandardMaterial) && !envMats.has(m)) { m.envMap = ENV; m.needsUpdate = true; envMats.add(m); }
  });
}

const pointer = new Pointer({ lambda: 6 });

// ─── Loader (no GLBs: the bracelet is procedural, so progress is a timed fill) ──
const loaderEl = document.querySelector('.loader');
const ldPct = loaderEl.querySelector('.ld-pct');
const ldProg = loaderEl.querySelector('.ld-prog');
const LD_C = 2 * Math.PI * 30;
if (ldProg) { ldProg.style.strokeDasharray = String(LD_C); }
const fakeAssets = { progress: 0 };
const loader = preloader({
  assets: fakeAssets, el: loaderEl, minTime: 1500,
  onValue: v => {
    ldPct.textContent = Math.round(v * 100);
    if (ldProg) ldProg.style.strokeDashoffset = String(LD_C * (1 - v));
  },
});
// A gentle gate so the word forms on screen before the world loads.
gsap.to(fakeAssets, { progress: 1, duration: 1.5, ease: 'power1.inOut' });

// Fonts must exist before we paint them into textures.
const fontsReady = Promise.race([
  Promise.all(['400 120px "Bodoni Moda"', 'italic 400 120px "Bodoni Moda"', '400 120px Italiana', '500 30px "Hanken Grotesk"'].map(f => document.fonts.load(f))),
  new Promise(r => setTimeout(r, 3500)),
]);

// ─── Lights ────────────────────────────────────────────────────────────────────
const KEY_POS = new THREE.Vector3(-3.3, 3.8, -3.1);
const key = new THREE.SpotLight(0xffe2b6, 170, 20, 0.34, 0.6, 1.7);
key.position.copy(KEY_POS);
key.target.position.set(0, 0.6, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 14;
key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
scene.add(key, key.target);
const fill = new THREE.SpotLight(0xfff0dd, 26, 18, 0.15, 0.8, 1.6);
fill.position.set(3.4, 1.05, 4.6); fill.target.position.set(0, 0.7, 0);
scene.add(fill, fill.target);
const noteKey = new THREE.SpotLight(0xfff0dc, 0, 12, 0.45, 0.8, 1.5);
scene.add(noteKey, noteKey.target);
const noteRim = new THREE.SpotLight(0xf3d089, 0, 12, 0.5, 0.8, 1.5);
scene.add(noteRim, noteRim.target);
for (const l of [key, fill, noteKey, noteRim]) l.layers.enable(1);

// ─── Floor & reflection ────────────────────────────────────────────────────────
const reflection = new PlanarReflection(renderer, { resolution: 0.5 });
engine.onResize((w, h, dpr) => reflection.setSize(w, h, dpr));
const floor = createFloor(renderer, reflection);
scene.add(floor.mesh);
floor.mesh.layers.enable(1);
floor.U.uCauDir.value.set(0.72, 0.69).normalize();

// Backlight haze behind the bracelet (additive, drawn over the floor so there is no horizon line).
const glow = (() => {
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0.34, 0.30, 0.07) }, uI: { value: 0.1 } },
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform vec3 uCol; uniform float uI;
      void main(){ vec2 p = (vUv - 0.5) * 2.0; p.y -= 0.08;
        float r = length(p * vec2(1.0, 1.6));
        float g = exp(-r * r * 7.0) * 0.8 + exp(-r * r * 26.0) * 0.9;
        float col = exp(-pow(p.x * 11.0, 2.0)) * exp(-pow((p.y - 0.05) * 2.6, 2.0)) * 0.55;
        gl_FragColor = vec4(uCol * (g + col) * uI, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 11), m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.layers.enable(1);
  scene.add(mesh);
  reflection.hidden.push(mesh);
  return { mesh, m };
})();

// The title, in the scene, behind the bracelet.
const title = { mesh: null, mat: null, v: 0 };
function makeTitle() {
  const c = document.createElement('canvas'); c.width = 4096; c.height = 1100;
  const g = c.getContext('2d');
  // Transparent background: with additive blending only the glyphs add light, so the plane's edges never show.
  const grd = g.createLinearGradient(0, 180, 0, 900);
  grd.addColorStop(0, '#fdf5a6'); grd.addColorStop(0.55, '#c39a52'); grd.addColorStop(1, '#5f7a2e');
  g.fillStyle = grd; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = '400 900px "Bodoni Moda", Didot, serif';
  if ('letterSpacing' in g) g.letterSpacing = '-24px';
  g.fillText('Scentála', 2048, 830);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(0, 0, 0) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 7.4 * 1100 / 4096), mat);
  mesh.position.set(0, 1.05, -2.1);
  mesh.renderOrder = -5;
  mesh.layers.enable(1);
  scene.add(mesh);
  title.mesh = mesh; title.mat = mat;
}

// ─── The bracelet, its box and the arm it is worn on ───────────────────────────
let bracelet = null, box = null, arm = null;
const braceletWorld = new THREE.Vector3();
// The one-shot ingredient flyer (a product click pours gold + ingredient chips into the beads).
const FLY_END = 1.2;                 // flyer progress at which every particle has landed
const flyer = { points: null, uniforms: null, P: 0, active: false, glow: 0 };
// Where the ring sits when it is lying in the box (ring centre, in box-local space): the mark is not
// centred on its ring, so the whole thing is nudged to sit square in the tray.
const IN_BOX = new THREE.Vector3(-0.05, 0, 0);
const Q_Y90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const Q_FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// ─── Collections: a procedural medallion (a giant scented bead) per series ─────
function makeMedallion(series) {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(series.tint), roughness: 0.36, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.18, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff4e0),
    ior: 1.45, envMapIntensity: 1.0,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.3, 40, 28), mat);
  sphere.castShadow = true;
  group.add(sphere);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.017, 10, 96),
    new THREE.MeshPhysicalMaterial({ color: 0xb88746, metalness: 1, roughness: 0.25, envMapIntensity: 2.3 }));
  group.add(ring);

  // A canvas label under the medallion, so the collection names itself in 3D.
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#FDF5A6'; g.font = '400 104px "Italiana", "Bodoni Moda", serif';
  g.fillText(series.name, 512, 92);
  g.fillStyle = '#B88746'; g.font = '500 42px "Hanken Grotesk", system-ui, sans-serif';
  if ('letterSpacing' in g) g.letterSpacing = '6px';
  g.fillText(series.sub.toUpperCase(), 512, 184);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.215), labelMat);
  label.position.set(0, -0.56, 0);
  group.add(label);
  return { group, sphere, label, labelMat };
}

// Scroll stops: camera orbit around the bracelet, where it sits on screen (lx, ly in NDC) and where the medallion floats.
const STOPS = [
  { yaw: 0, elev: 7, dist: 4.9, look: [0, 0.78, 0], lx: 0.08, ly: 0.04 },
  { yaw: 30, elev: 10, dist: 4.7, look: [0, 0.76, 0], lx: 0.12, ly: 0, note: { nx: 0.58, ny: 0.1, dz: 0.3, side: 1 } },
  { yaw: -32, elev: 13, dist: 4.8, look: [0, 0.78, 0], lx: -0.21, ly: 0, note: { nx: -0.64, ny: 0.14, dz: 0.3, side: -1 } },
  { yaw: 52, elev: 17, dist: 4.7, look: [0, 0.72, 0], lx: 0.12, ly: 0.03, note: { nx: 0.54, ny: -0.08, dz: 0.35, side: 1 } },
  // IV — into the box, the lid shuts, and 8 × 8 × 3 is called out on the board.
  { yaw: 12, elev: 33, dist: 5.50, look: [0, 0.34, 0], lx: 0.22, ly: 0.02, hold: 0.50 },
  // V — the lid lifts slowly with the scroll.
  { yaw: 30, elev: 20, dist: 5.00, look: [0, 0.42, 0], lx: 0.26, ly: 0.02, hold: 0.52 },
  // VI — and out again, onto the wrist. Aimed left of the hand so it sits right of frame, clearing the copy.
  { yaw: -14, elev: 8, dist: 5.55, look: [-0.72, 0.74, 0], lx: 0.22, ly: 0.02, hold: 0.66 },
  { yaw: 26, elev: 10, dist: 7.0, look: [0, 0.72, 0], lx: 0.48, ly: 0.05 },
  { yaw: -20, elev: 7, dist: 5.2, look: [0, 0.72, 0], lx: 0.34, ly: 0 },
  { yaw: -34, elev: 13, dist: 6.6, look: [0, 0.7, 0], lx: 0.0, ly: 0.12 },
];
const mobile = () => innerWidth / innerHeight < 0.8;
function stopView(k) {
  const s = STOPS[Math.min(k, STOPS.length - 1)];
  if (!mobile()) return s;
  // Portrait: the bracelet rides high, the copy sits underneath, medallions float above the ring.
  const m = { ...s, lx: 0, ly: 0.47, dist: s.dist * 2.0 };
  if (s.note) m.note = { ...s.note, nx: s.note.side * 0.5, ny: 0.64, dz: 0.5 };
  if (k === 0) { m.ly = 0.17; m.dist = s.dist * 1.75; }
  if (k === 4) { m.ly = 0.34; m.dist = s.dist * 1.3; }
  return m;
}

const notes = SERIES.map((s, i) => ({ ...s, i, stop: i + 1, P: 0, arrive: 0, group: new THREE.Group(), rest: new THREE.Vector3(), from: new THREE.Vector3(), mesh: null, stream: null, U: null, side: 1 }));
for (const n of notes) {
  const med = makeMedallion(n);
  n.group.add(med.group);
  n.mesh = med.sphere;
  n.labelMat = med.labelMat;
  scene.add(n.group);
  n.group.visible = false;
  n.group.traverse(o => o.layers.enable(1));
}

// Burn-dissolve for the medallions (discard below a moving threshold, glowing gold at the front).
function burnMaterial(n, dir, mm, freq) {
  const U = { uBurn: { value: -1 }, uDir: { value: dir }, uMM: { value: new THREE.Vector2(...mm) }, uFreq: { value: freq }, uEdge: { value: new THREE.Color(1.0, 0.72, 0.22) } };
  n.mesh.material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocalP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vLocalP; uniform float uBurn, uFreq; uniform vec3 uDir, uEdge; uniform vec2 uMM; ${BURN_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float bk = burnKey(vLocalP, uDir, uMM, uFreq);
        if (bk < uBurn) discard;
        float bEdge = (1.0 - smoothstep(0.0, 0.045, bk - uBurn)) * step(-0.05, uBurn);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uEdge * bEdge * 7.0;`);
  };
  n.mesh.material.customProgramCacheKey = () => 'burn-' + n.key;
  n.mesh.material.needsUpdate = true;
  n.U = U;
}

// ─── Particles: dust, intro infusion ──────────────────────────────────────────
const dust = (() => {
  const N = 700;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.5 + Math.pow(Math.random(), 0.7) * 4.5;
    pos.set([Math.cos(a) * r, Math.random() * 3.2, Math.sin(a) * r], i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uDpr: { value: 1 }, uI: { value: 1 } },
    vertexShader: `attribute float seed; uniform float uTime, uDpr; varying float vA;
      void main(){ vec3 p = position; float t = uTime * (0.03 + seed * 0.04);
        p += vec3(sin(t * 3.1 + seed * 40.), 0.0, cos(t * 2.7 + seed * 27.)) * 0.4; p.y = mod(p.y + t * 0.6, 3.2);
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        vA = (0.25 + 0.75 * fract(seed * 91.7)) * smoothstep(0.0, 0.4, p.y) * smoothstep(3.2, 2.4, p.y);
        gl_PointSize = (1.0 + seed * 2.2) * uDpr * (4.0 / -mv.z); }`,
    fragmentShader: `varying float vA; uniform float uI; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); gl_FragColor = vec4(vec3(1.0, .84, .48) * a * vA * 0.5 * uI, 1.); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 9;
  scene.add(pts);
  engine.onResize((w, h, dpr) => { mat.uniforms.uDpr.value = dpr; });
  return mat;
})();

// Six spiral ribbons of gold that unwind into the bracelet, inner ends first.
function introCloud(N) {
  const local = new Float32Array(N * 3), normal = new Float32Array(N * 3), color = new Float32Array(N * 3), key = new Float32Array(N);
  const R = 6;
  for (let i = 0; i < N; i++) {
    const r = i % R, u = Math.pow(Math.random(), 0.85);
    const a = r * Math.PI * 2 / R + u * 2.8 + (Math.random() - 0.5) * 0.12;
    const rad = 0.95 + u * 2.6 + (Math.random() - 0.5) * 0.12 * (1 + u);
    const y = 0.35 + u * 2.3 + Math.sin(u * 7 + r) * 0.18 + (Math.random() - 0.5) * 0.1;
    local.set([Math.cos(a) * rad, y, Math.sin(a) * rad * 0.75 - 0.2], i * 3);
    normal.set([-Math.sin(a) * 0.5, 0.35, Math.cos(a) * 0.5], i * 3);
    const g = Math.random();
    color.set([1.0, 0.68 + g * 0.2, 0.24 + g * 0.2], i * 3);
    key[i] = Math.min(0.92, u * 0.86 + Math.random() * 0.05);
  }
  return { local, normal, color, key };
}
const intro = { P: 0, stream: null };

// ─── Interaction: drag to spin ─────────────────────────────────────────────────
const drag = { on: false, x0: 0, y0: 0, lx: 0, dx: 0, dy: 0, used: false, id: null };
let canGrab = true;   // false once the bracelet belongs to the box or the wrist
const phys = { spin: 0, spinV: 0, roll: 0, rollV: 0, pitch: 0, pitchV: 0, lift: 0, liftV: 0, demo: 0 };
const cur = cursor({ color: '#f0e2b4', blend: 'normal', size: 34 });
cur?.set('hidden');
let overBracelet = false, cursorState = '';
const braceletRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
function setCursor(s, label) { if (!cur || cursorState === s + label) return; cursorState = s + label; cur.set(s, label); }
function isUi(t) { return !!t.closest?.('a,button,.product,.nav,.tw-nav,.variant'); }
addEventListener('pointerdown', e => {
  if (!bracelet || !canGrab || (e.pointerType === 'mouse' && e.button !== 0) || isUi(e.target)) return;
  const x = e.clientX, y = e.clientY;
  if (x < braceletRect.x0 || x > braceletRect.x1 || y < braceletRect.y0 || y > braceletRect.y1) return;
  drag.on = true; drag.x0 = drag.lx = x; drag.y0 = y; drag.dx = drag.dy = 0; drag.id = e.pointerId; drag.touch = e.pointerType !== 'mouse';
  if (!drag.used) { drag.used = true; document.body.classList.add('has-tilted'); }
  phys.demo = 0;
  if (e.pointerType === 'mouse') e.preventDefault();
}, { passive: false });
addEventListener('pointermove', e => {
  if (drag.on && e.pointerId === drag.id) {
    drag.dx = e.clientX - drag.x0; drag.dy = e.clientY - drag.y0;
    phys.spinV += (e.clientX - drag.lx) * 0.028;
    drag.lx = e.clientX;
  }
  overBracelet = canGrab && e.clientX > braceletRect.x0 && e.clientX < braceletRect.x1 && e.clientY > braceletRect.y0 && e.clientY < braceletRect.y1 && !isUi(e.target);
}, { passive: true });
const release = e => { if (drag.on && (!e || e.pointerId === drag.id)) drag.on = false; };
addEventListener('pointerup', release);
addEventListener('pointercancel', release);

// ─── Story (scroll) ────────────────────────────────────────────────────────────
const stopEls = [...document.querySelectorAll('[data-stop]')];
const footEl = document.querySelector('.foot');
const cards = [...document.querySelectorAll('.note-card')];
const beatCards = [...document.querySelectorAll('.beat-card')];
const heroEls = document.querySelectorAll('.hero-eyebrow, .hero-foot, .scroll-cue');
let anchors = [], footPauseY = Infinity;
function measure() {
  anchors = stopEls.map(el => el.offsetTop);
  anchors.push(footEl.offsetTop - innerHeight * 0.2);
  footPauseY = footEl.offsetTop + innerHeight * 0.3;
}
addEventListener('resize', measure);
function storyAt(y) {
  if (y <= anchors[0]) return 0;
  for (let k = 0; k < anchors.length - 1; k++) {
    if (y < anchors[k + 1]) return k + (y - anchors[k]) / (anchors[k + 1] - anchors[k]);
  }
  return anchors.length - 1;
}

// ─── Camera ────────────────────────────────────────────────────────────────────
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion();
// Scratch for the IV/V choreography: the ring centre and its orientation, one slot per pose.
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const poseP = new THREE.Vector3(), poseQ = new THREE.Quaternion(), restP = new THREE.Vector3();
const inP = new THREE.Vector3(), overP = new THREE.Vector3(), outP = new THREE.Vector3(), wristP = new THREE.Vector3();
const boxQ = new THREE.Quaternion(), outQ = new THREE.Quaternion(), armQ = new THREE.Quaternion();
const cs = { yaw: 0, elev: 5, dist: 7.4, lx: 0, ly: 0, look: new THREE.Vector3() };
function blendStops(S, out) {
  const n = STOPS.length - 1;
  const i = Math.min(n - 1, Math.max(0, Math.floor(S)));
  const a = stopView(i), b = stopView(i + 1);
  const hold = a.hold ?? (a.note ? 0.24 : 0.05);
  const f = smooth(hold, 0.96, S - i);
  out.yaw = lerp(a.yaw, b.yaw, f); out.elev = lerp(a.elev, b.elev, f); out.dist = lerp(a.dist, b.dist, f);
  out.lx = lerp(a.lx, b.lx, f); out.ly = lerp(a.ly, b.ly, f);
  out.look.set(lerp(a.look[0], b.look[0], f), lerp(a.look[1], b.look[1], f), lerp(a.look[2], b.look[2], f));
  // Arc the orbit slightly upwards mid-transition.
  out.elev += Math.sin(f * Math.PI) * 3;
  return out;
}
function placeCamera(c, cam, extraYaw = 0, extraElev = 0) {
  const yaw = (c.yaw + extraYaw) * D2R, el = (c.elev + extraElev) * D2R;
  cam.position.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)).multiplyScalar(c.dist).add(c.look);
  cam.lookAt(c.look);
  // Lens shift instead of re-aiming: the bracelet moves on screen without changing the perspective.
  const t = Math.tan(cam.fov * D2R / 2);
  cam.filmOffset = -c.lx * cam.getFilmWidth() * cam.aspect * t;
  cam.updateProjectionMatrix();
  // Vertical placement: nudge the aim so the look point lands at NDC y = ly.
  if (c.ly) {
    const dy = c.ly * t * c.dist;
    v1.set(0, 1, 0).applyQuaternion(cam.quaternion);
    cam.lookAt(v2.copy(c.look).addScaledVector(v1, -dy));
  }
  cam.updateMatrixWorld();
}
// Medallion rest positions for a given stop, computed from that stop's camera so they land where the layout wants them.
const stopCam = new THREE.PerspectiveCamera(26, 1, 0.05, 60);
function notePose(n, out) {
  const s = stopView(n.stop);
  stopCam.aspect = camera.aspect; stopCam.fov = camera.fov;
  const c = { ...s, look: new THREE.Vector3(...s.look) };
  placeCamera(c, stopCam);
  const z = s.dist - s.note.dz;
  const t = Math.tan(stopCam.fov * D2R / 2);
  const fwd = v1.set(0, 0, -1).applyQuaternion(stopCam.quaternion);
  const right = v2.set(1, 0, 0).applyQuaternion(stopCam.quaternion);
  const up = v3.set(0, 1, 0).applyQuaternion(stopCam.quaternion);
  const ndcX = s.note.nx, ndcY = s.note.ny;
  v4.set(ndcX, ndcY, 0.5).unproject(stopCam).sub(stopCam.position).normalize();
  const cosA = v4.dot(fwd);
  out.rest.copy(stopCam.position).addScaledVector(v4, z / cosA);
  out.from.copy(out.rest).addScaledVector(right, s.note.side * 2.6).addScaledVector(up, 0.9).addScaledVector(fwd, 0.6);
  out.camRight = right.clone(); out.camFwd = fwd.clone();
}

// ─── Frame loop ────────────────────────────────────────────────────────────────
const toastEl = document.querySelector('.toast');
const gaugeFill = document.querySelector('.gauge-fill');
const gaugeV = document.querySelector('.gauge-v');
const gaugeScent = document.querySelector('.gauge-scent');
const gaugeTicks = [...document.querySelectorAll('.gauge-tick')];
const rootStyle = document.documentElement.style;
let S = 0, Sraw = 0;
let introFill = 0, absorb = 0;
const heroIn = { v: 0 };
const grabBox = new THREE.Box3();
const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const streamScratch = [];   // reused each frame so the stream update allocates nothing

let curVariant = -1;
function setVariant(i) {
  const v = VARIANTS[i];
  if (!v || i === curVariant) return;
  curVariant = i;
  bracelet.setVariant(v.tint, v.name);
  rootStyle.setProperty('--accent', v.tint);
  if (gaugeScent) gaugeScent.textContent = v.name;
  document.querySelectorAll('[data-variant]').forEach(b => b.classList.toggle('on', +b.dataset.variant === i));
}

function tick(dt, t) {
  pointer.update(dt);
  Sraw = storyAt(window.scrollY);
  S = damp(S, Sraw, 5.5, dt);
  document.body.classList.toggle('is-story', S > 0.55 && S < 8.4);
  canGrab = S < 2.95;

  // Camera
  blendStops(S, cs);
  // IV: shot wide while the bracelet goes into the box, then the lens pushes in on the lid label.
  const dWide = smooth(3.30, 4.00, S) * (1 - smooth(3.96, 4.26, S));
  const dPush = smooth(4.30, 4.48, S) * (1 - smooth(4.56, 4.88, S));
  if (dWide + dPush > 0.001) {
    cs.dist *= 1 + 0.42 * dWide - 0.32 * dPush;
    cs.elev += 16 * dPush;
    cs.lx = lerp(cs.lx, 0.52, dPush);                        // keep the printed label clear of the copy
    const ly = BOX.closedY + BOX.lidH;                       // the printed face of the lid
    cs.look.lerp(v4.set(0, ly - 0.01, 0), dPush);
  }
  const par = drag.on ? 0 : 1;
  placeCamera(cs, camera, pointer.sx * 2.2 * par + Math.sin(t * 0.21) * 0.6, pointer.sy * 1.2 * par + Math.sin(t * 0.33) * 0.25);
  scene.environmentRotation.y = cs.yaw * D2R;
  for (const m of envMats) m.envMapRotation.y = cs.yaw * D2R;

  // ── Bracelet physics: drag spins the ring, the tilt follows the camera. Past the collections the
  // box and the wrist take the ring over, so the free-standing tilt is damped out first.
  const free = 1 - smooth(2.85, 3.40, S);
  const held = drag.on && free > 0.6;
  const rollT = (held ? clamp(-drag.dx * 0.0055, -1.35, 1.35) : phys.demo * 0.6 - pointer.sx * 0.05 * (S < 0.5 ? 1 : 0)) * free;
  const pitchT = (held && !drag.touch ? clamp(drag.dy * 0.0038, -0.7, 0.7) : 0) * free;
  const K = held ? 70 : 34, C = held ? 13 : 5.2;
  phys.rollV += (K * (rollT - phys.roll) - C * phys.rollV) * dt; phys.roll += phys.rollV * dt;
  phys.pitchV += (K * (pitchT - phys.pitch) - C * phys.pitchV) * dt; phys.pitch += phys.pitchV * dt;
  phys.spinV *= Math.exp(-(held ? 5 : 1.1) * dt);
  phys.spin += phys.spinV * dt;
  const idleSpin = Math.sin(t * 0.2) * 0.05;
  const tilt = Math.max(Math.abs(Math.sin(phys.roll)), Math.abs(Math.sin(phys.pitch)));
  const liftT = held ? 0.2 + 0.3 * tilt : Math.max(0, 0.3 * tilt - 0.02);
  phys.liftV += (46 * (liftT - phys.lift) - 10 * phys.liftV) * dt; phys.lift += phys.liftV * dt;
  if (phys.lift < 0) { phys.lift = 0; phys.liftV = -phys.liftV * 0.18; }
  // Tilt axes follow the camera; the spin rides the ring's own normal (local +Z).
  const fwdFlat = v1.set(-Math.sin(cs.yaw * D2R), 0, -Math.cos(cs.yaw * D2R));
  const rightFlat = v2.set(Math.cos(cs.yaw * D2R), 0, -Math.sin(cs.yaw * D2R));
  qA.setFromAxisAngle(fwdFlat, -phys.roll);
  qB.setFromAxisAngle(rightFlat, phys.pitch);
  qC.setFromAxisAngle(v3.set(0, 0, 1), phys.spin + idleSpin);
  bracelet.pivot.quaternion.copy(qC).premultiply(qA).premultiply(qB);

  // ── IV / V: the bracelet goes into its box, the lid closes, and then it comes out onto a wrist.
  // Everything is expressed as "where the ring centre should be", then turned into the root transform.
  const wOver = smooth(3.00, 3.44, S) * (1 - smooth(3.40, 3.76, S));   // carried over the open box
  const wIn = smooth(3.40, 3.78, S) * (1 - smooth(5.50, 5.86, S));     // bedded in the tray
  const wOut = smooth(5.50, 5.86, S) * (1 - smooth(5.86, 6.12, S));    // lifted out again
  const wWrist = smooth(5.86, 6.18, S) * (1 - smooth(6.54, 6.94, S));  // worn
  const wAll = wOver + wIn + wOut + wWrist;

  if (box) {
    // The box comes up, then fades as the hand takes over.
    box.setOpacity(smooth(3.16, 3.56, S) * (1 - smooth(5.62, 5.96, S)));
    box.root.scale.setScalar(0.9 + 0.1 * smooth(3.14, 3.56, S));
    // The lid shuts under the lens, then opens slowly with the scroll through V.
    box.setOpen(1 - smooth(3.88, 4.26, S) + smooth(4.82, 5.68, S));
    // 8 in × 8 in × 3 in, called out on the closed board.
    box.setDims(smooth(4.02, 4.28, S) * (1 - smooth(4.44, 4.66, S)));
  }
  // The arm slides in from the right as the lid comes off, and leaves with the beat.
  if (arm) { arm.setOpacity(smooth(5.62, 6.02, S) * (1 - smooth(6.48, 6.86, S))); }

  poseP.set(0, phys.lift + CENTRE_Y, 0);
  poseQ.identity();
  if (wAll > 0.002 && box && arm) {
    // The ring centre, laid flat in the tray.
    inP.set(box.root.position.x + IN_BOX.x, BOX.linerY + BEAD_R + 0.008, box.root.position.z + IN_BOX.z);
    boxQ.setFromAxisAngle(AXIS_Y, -0.2).multiply(Q_FLAT);
    overP.copy(inP).setY(inP.y + 0.66);
    outP.copy(inP).setY(inP.y + 0.58);
    // The ring centre on the wrist, its plane square to the forearm.
    arm.root.updateWorldMatrix(true, false);
    arm.wrist.getWorldPosition(wristP);
    armQ.copy(arm.root.quaternion).multiply(Q_Y90);
    outQ.copy(boxQ).slerp(armQ, 0.5);

    // Normalise the active poses by max(wAll, 1): while IV/V overlap (wAll > 1) the weights
    // stay inside the hull, and on the wrist→floor return (wAll ≤ 1) the rest term (1 - wAll)
    // completes a clean blend — with 1/wAll the bracelet overshot the wrist and then snapped.
    const k = 1 / Math.max(wAll, 1);
    poseP.set(0, 0, 0)
      .addScaledVector(overP, wOver * k)
      .addScaledVector(inP, wIn * k)
      .addScaledVector(outP, wOut * k)
      .addScaledVector(wristP, wWrist * k)
      .addScaledVector(restP.set(0, phys.lift + CENTRE_Y, 0), Math.max(0, 1 - wAll));
    poseQ.slerp(boxQ, clamp(wOver * k + wIn * k)).slerp(outQ, clamp(wOut * k)).slerp(armQ, clamp(wWrist * k));
  }
  // On the way back from the wrist it arcs up and over, rather than sliding through the box.
  const retT = clamp((S - 6.50) / 0.48);
  if (retT > 0 && retT < 1) poseP.y += Math.sin(retT * Math.PI) * 0.34;
  bracelet.root.quaternion.copy(poseQ);
  bracelet.root.position.copy(poseP).addScaledVector(v1.set(0, CENTRE_Y, 0).applyQuaternion(poseQ), -1);
  bracelet.pivot.updateWorldMatrix(true, true);
  bracelet.root.getWorldPosition(braceletWorld);

  // ── Collections: arrive with scroll, dissolve on a timer once you have read about them
  let noteFill = 0;
  absorb = 0;
  for (const n of notes) {
    const k = n.stop;
    n.arrive = smooth(k - 0.62, k - 0.06, S);
    const want = S > k + 0.14 ? P_END : 0;
    const rate = want > n.P ? P_END / 3.6 : P_END / 1.8;
    n.P = want > n.P ? Math.min(want, n.P + rate * dt) : Math.max(want, n.P - rate * dt);
    const e = 1 - Math.pow(1 - n.arrive, 3);
    n.group.position.lerpVectors(n.from, n.rest, e);
    const calm = 1 - clamp(n.P * 2);
    n.group.position.y += Math.sin(t * 0.9 + n.i * 2) * 0.035 * calm;
    n.group.rotation.set(Math.sin(t * 0.5 + n.i) * 0.05 * calm, (1 - e) * n.side * -1.6 + Math.sin(t * 0.35 + n.i) * 0.2 * calm, (1 - e) * 0.4 * (n.i % 2 ? 1 : -1));
    const sc = 0.55 + 0.45 * e;
    n.group.scale.setScalar(sc);
    n.U.uBurn.value = n.P > 0 ? Math.min(n.P, 1) * BURN_A - BURN_B : -1;
    n.group.visible = n.arrive > 0.001 && n.P < 1.0;
    n.labelMat.opacity = n.arrive * (1 - clamp(n.P * 1.6)) * 0.95;
    const su = n.stream.uniforms;
    su.uP.value = n.P;
    n.stream.points.visible = n.P > 0.001 && n.P < P_END;
    const arrived = clamp((n.P - 0.45) / (P_END - 0.45));
    noteFill += arrived;
    absorb += n.P > 0.3 && n.P < P_END ? Math.sin(clamp((n.P - 0.3) / (P_END - 0.3)) * Math.PI) : 0;
  }
  intro.stream.uniforms.uP.value = intro.P;
  intro.stream.points.visible = intro.P > 0.001 && intro.P < P_END;
  introFill = FILL0 * clamp((intro.P - 0.42) / (P_END - 0.42 - 0.05));
  absorb += intro.P > 0.3 && intro.P < P_END ? Math.sin(clamp((intro.P - 0.3) / (P_END - 0.3)) * Math.PI) * 0.8 : 0;
  const lvl = clamp(introFill + noteFill * FILL_STEP);
  bracelet.state.fill = lvl;
  // The product-click bump: a short extra glow so the beads flash in the freshly chosen tint.
  bracelet.setInfusion(damp(bracelet.state.glow, lvl * (1 + clamp(absorb) * 0.25) + flyer.glow, 4, dt));
  flyer.glow = Math.max(0, flyer.glow - dt * 0.75);
  bracelet.solve(dt);

  // Streams need the bracelet's pose (ring centre in world space).
  const axisC = v4.set(braceletWorld.x, braceletWorld.y + CENTRE_Y, braceletWorld.z);
  streamScratch.length = 0;
  streamScratch.push(intro.stream);
  for (const n of notes) streamScratch.push(n.stream);
  for (const st of streamScratch) {
    if (!st || !st.points.visible) continue;
    const u = st.uniforms;
    u.uTime.value = t;
    u.uBottleM.value.copy(bracelet.pivot.matrixWorld);
    u.uSurf.value.copy(axisC);
    u.uAxisC.value.copy(axisC);
    u.uAxisR.value = RING_R * 1.12;
  }
  for (const n of notes) if (n.stream.points.visible) n.stream.uniforms.uNoteM.value.copy(n.mesh.matrixWorld);

  // The ingredient flyer: ride the ring's live pose and walk its one-shot progress.
  if (flyer.active && flyer.uniforms) {
    const fu = flyer.uniforms;
    fu.uTime.value = t;
    fu.uRingM.value.copy(bracelet.pivot.matrixWorld);
    fu.uRingR.value = RING_R;
    fu.uP.value = flyer.P;
    flyer.P += dt;
    if (flyer.P >= FLY_END) { flyer.P = FLY_END; flyer.active = false; flyer.points.visible = false; }
  }

  // Medallion lighting follows whichever collection is on stage.
  let best = null, bw = 0;
  for (const n of notes) { if (!n.group.visible) continue; const w = n.arrive * (1 - clamp(n.P)); if (w > bw) { bw = w; best = n; } }
  if (best) {
    const p = best.group.position;
    noteKey.position.copy(p).addScaledVector(best.camRight, -best.side * 1.2).add(v1.set(0, 2.6, 0)).addScaledVector(best.camFwd, -1.8);
    noteKey.target.position.copy(p);
    noteRim.position.copy(p).addScaledVector(best.camRight, best.side * 1.6).add(v1.set(0, 1.4, 0)).addScaledVector(best.camFwd, 2.2);
    noteRim.target.position.copy(p);
  }
  // The worn beat gets its own pair of beauty lights on the arm — a rim behind the wrist and a soft
  // bounce under it, so the hand is sculpted instead of flat.
  const armV = arm ? arm.opacity : 0;
  if (!best && armV > 0.01) {
    noteKey.position.copy(wristP).add(v1.set(-1.15, 1.55, -1.70));
    noteKey.target.position.copy(wristP);
    noteRim.position.copy(wristP).add(v1.set(1.05, -0.85, 1.55));
    noteRim.target.position.copy(wristP);
  }
  noteKey.intensity = damp(noteKey.intensity, 34 * bw + 34 * armV, 6, dt);
  noteRim.intensity = damp(noteRim.intensity, 40 * bw + 26 * armV, 6, dt);

  // ── Floor: contact shadow plus a warm pool of infused light under the ring
  const fu = floor.U;
  fu.uTime.value = t;
  fu.uBase.value.set(braceletWorld.x, phys.lift, braceletWorld.z);
  fu.uYaw.value.set(Math.cos(phys.spin), Math.sin(phys.spin));
  fu.uCauC.value.copy(braceletWorld).setY(0).addScaledVector(v1.set(0.72, 0, 0.69), 0.16);
  fu.uCauLen.value = 1.15;
  fu.uCauI.value = clamp(lvl * 1.25) * 0.6 * (0.7 + clamp(absorb) * 0.5) * (1 - clamp(phys.lift * 1.6) * 0.7);
  fu.uWob.value = 0.12 + bracelet.state.energy;
  fu.uPool.value.set(0, 0, 0);

  // Glow plane sits behind the bracelet, facing the camera.
  v1.copy(camera.position).sub(cs.look).setY(0).normalize();
  glow.mesh.position.set(-v1.x * 5.5, 1.1, -v1.z * 5.5);
  glow.mesh.lookAt(camera.position.x, 1.1, camera.position.z);
  glow.m.uniforms.uI.value = 0.1 + clamp(absorb) * 0.04;

  // Title: only in the hero.
  if (title.mat) {
    const tv = heroIn.v * (1 - smooth(0.02, 0.4, S));
    title.mat.color.setScalar(tv * 0.6);
    title.mesh.visible = tv > 0.002;
    title.mesh.position.y = 1.05 + S * 0.6;
    // Fit the word to the visible width at its depth (portrait screens).
    const dz = camera.position.distanceTo(title.mesh.position);
    const visW = 2 * dz * Math.tan(camera.fov * D2R / 2) * camera.aspect;
    title.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 7.4));
  }
  dust.uniforms.uTime.value = t;

  // ── Screen-space box for grabbing the bracelet
  grabBox.set(v1.set(-0.75, -0.75, -0.16), v2.set(1.05, 1.20, 0.16));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < 8; i++) {
    corners[i].set(i & 1 ? grabBox.max.x : grabBox.min.x, i & 2 ? grabBox.max.y : grabBox.min.y, i & 4 ? grabBox.max.z : grabBox.min.z).add(v2.set(braceletWorld.x, CENTRE_Y + phys.lift, braceletWorld.z)).project(camera);
    const sx = (corners[i].x + 1) / 2 * innerWidth, sy = (1 - corners[i].y) / 2 * innerHeight;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  const padX = (x1 - x0) * 0.08;
  Object.assign(braceletRect, { x0: x0 - padX, x1: x1 + padX, y0: y0 - 8, y1: y1 + 8 });
  if (drag.on) setCursor('drag', 'Spin');
  else if (overBracelet) setCursor('drag', 'Drag');
  else if (cursorState === 'dragDrag' || cursorState === 'dragSpin') setCursor('', '');

  // ── HTML
  for (let i = 0; i < cards.length; i++) {
    const k = i + 1;
    const vis = smooth(k - 0.42, k - 0.04, S) * (1 - smooth(k + 0.42, k + 0.6, S));
    cards[i].style.opacity = vis.toFixed(3);
    cards[i].style.transform = `translate3d(0, ${((1 - vis) * (S < k ? 30 : -30)).toFixed(1)}px, 0)`;
  }
  // The packaging and on-the-wrist beats are stops 4 and 5.
  for (let i = 0; i < beatCards.length; i++) {
    const k = i + 4;
    const vis = smooth(k - 0.42, k - 0.04, S) * (1 - smooth(k + 0.5, k + 0.7, S));
    beatCards[i].style.opacity = vis.toFixed(3);
    beatCards[i].style.transform = `translate3d(0, ${((1 - vis) * (S < k ? 30 : -30)).toFixed(1)}px, 0)`;
  }
  const hv = 1 - smooth(0.05, 0.3, S);
  for (const el of heroEls) el.style.opacity = (hv * heroIn.v).toFixed(3);
  gaugeFill.style.setProperty('--fill', lvl.toFixed(4));
  gaugeV.textContent = Math.round(lvl * 100);
  for (let i = 0; i < gaugeTicks.length; i++) gaugeTicks[i].classList.toggle('on', notes[i].P > P_END * 0.7);

  // ── Offscreen passes
  if (!Q.has('norefl')) reflection.update(scene, camera);

  engine.paused = window.scrollY > footPauseY;
}

// ─── Shop: the kraft bag that fills itself (Sola-style add → arc → nest) ────────
const sbagBtn = document.getElementById('sbagBtn');
const sbagBadge = document.getElementById('sbagBadge');
const sbagItems = document.getElementById('sbagItems');
const sbagVessel = sbagBtn.querySelector('.sbag-vessel');
const flightdeck = document.getElementById('flightdeck');
const speek = document.getElementById('speek');
const speekList = document.getElementById('speekList');
const speekCount = document.getElementById('speekCount');
const speekEmpty = document.getElementById('speekEmpty');
const speekTotal = document.getElementById('speekTotal');
const speekShip = document.getElementById('speekShip');
const speekGrand = document.getElementById('speekGrand');
const speekCheckout = document.getElementById('speekCheckout');
const bagCountEl = document.querySelector('.bag-n');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const bag = []; let bagUid = 0, toastT;
const POKE_X = [-16, -5, 7, -12, 14, 2, -9, 12], POKE_Y = [4, 1, 6, 3, 5, 4, 1, 5], POKE_ROT = [-14, -5, 9, -10, 14, 2, -8, 11];
const money = n => '₱' + Math.round(n).toLocaleString('en-US');
const pouch = () => sbagVessel.getBoundingClientRect();
const mouth = () => { const b = pouch(); return { cx: b.left + b.width * 0.5, cy: b.top + b.height * (52 / 194) }; };
const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function bead(tint, cls) {
  const e = document.createElement('span');
  e.className = cls;
  e.style.background = `radial-gradient(120% 120% at 34% 28%, #fff8e6 0%, ${tint} 46%, rgba(0,0,0,.5) 100%)`;
  return e;
}

// A pair arcs into the mouth, then settles as a nested bead inside the bag.
function flyToBag(fromEl, item, done) {
  const s = fromEl.getBoundingClientRect();
  const sx = s.left + s.width / 2, sy = s.top + s.height / 2;
  const m = mouth(), dx = m.cx - sx, dy = m.cy - sy;
  const c = Math.max(150, Math.hypot(dx, dy) * 0.42);
  const px = sx + dx * 0.5 + dx * 0.06;
  const py = Math.min(sy, m.cy) - c;
  const el = bead(item.tint, 'flier');
  el.style.width = el.style.height = '40px';
  flightdeck.appendChild(el);
  if (reduced) { el.remove(); done(); return; }
  const sc1 = (pouch().width * 0.34) / 40, dur = 640, t0 = performance.now();
  (function step(now) {
    const t = Math.min(1, (now - t0) / dur), e = easeInOutCubic(t), u = 1 - e;
    const x = u * u * sx + 2 * u * e * px + e * e * m.cx;
    const y = u * u * sy + 2 * u * e * py + e * e * m.cy;
    const sc = 1 + (sc1 - 1) * e;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%,-50%) scale(${sc.toFixed(3)}) rotate(${(e * 200).toFixed(0)}deg)`;
    el.style.opacity = t > 0.86 ? String(Math.max(0, (1 - t) / 0.14)) : '1';
    if (t < 1) requestAnimationFrame(step); else { el.remove(); done(); }
  })(t0);
}

function addPoke(item) {
  const n = bag.length - 1, i = n % POKE_X.length;
  const b = pouch(), sc = b.width / 172;
  const el = bead(item.tint, 'sbag-item');
  el.dataset.uid = String(item.uid);
  el.style.zIndex = String(2 + n);
  const x = POKE_X[i] * sc, y = POKE_Y[i] * sc, r = POKE_ROT[i];
  el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r}deg)`;
  sbagItems.appendChild(el);
  if (!reduced) el.animate(
    [{ opacity: 0, transform: `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${(y - 26).toFixed(1)}px) scale(.7) rotate(${r - 16}deg)` },
     { opacity: 1, transform: `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(1) rotate(${r}deg)` }],
    { duration: 460, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  while (sbagItems.children.length > 12) sbagItems.removeChild(sbagItems.firstChild);
}

function bump() {
  const n = bag.length;
  bagCountEl.textContent = n;
  sbagBadge.textContent = n;
  sbagBadge.dataset.empty = n === 0 ? 'true' : 'false';
  sbagBadge.classList.remove('pop'); void sbagBadge.offsetWidth; sbagBadge.classList.add('pop');
  sbagBtn.classList.remove('land'); void sbagBtn.offsetWidth; sbagBtn.classList.add('land');
  sbagBtn.setAttribute('aria-label', n ? `Open bag — ${n} ${n === 1 ? 'bracelet' : 'bracelets'}` : 'Open bag — empty');
}

function peekRow(item) {
  const li = document.createElement('li');
  li.className = 'speek-row';
  const meta = document.createElement('div');
  meta.className = 'speek-meta';
  meta.innerHTML = `<strong></strong><span></span>`;
  meta.querySelector('strong').textContent = item.name;
  meta.querySelector('span').textContent = `${item.series || 'Scentála'} · bracelet`;
  const price = document.createElement('span');
  price.className = 'speek-price'; price.textContent = money(item.price);
  const rm = document.createElement('button');
  rm.className = 'speek-rm'; rm.type = 'button'; rm.setAttribute('aria-label', `Remove ${item.name}`);
  rm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  rm.addEventListener('click', () => {
    const at = bag.findIndex(x => x.uid === item.uid);
    if (at < 0) return;
    bag.splice(at, 1);
    const poke = sbagItems.querySelector(`[data-uid="${item.uid}"]`);
    if (poke) poke.remove();
    bump(); renderPeek();
  });
  li.append(bead(item.tint, 'speek-bead'), meta, price, rm);
  return li;
}

function renderPeek() {
  const n = bag.length;
  speekList.replaceChildren(...bag.map(peekRow));
  speekCount.textContent = n ? `${n} ${n === 1 ? 'bracelet' : 'bracelets'}` : 'Empty';
  speekEmpty.style.display = n ? 'none' : '';
  const sub = bagTotal();
  speekTotal.textContent = money(sub);
  speekShip.textContent = 'Free';
  speekGrand.textContent = money(sub);
  speekCheckout.disabled = !n;
  speekCheckout.querySelector('span').textContent = 'Checkout';
}

// ── Drawer views: bag → checkout (payment + PH delivery address) → confirmation ──
const speekBagView = document.getElementById('speekBagView');
const speekCheckoutView = document.getElementById('speekCheckoutView');
const speekDoneView = document.getElementById('speekDoneView');
const checkoutSummary = document.getElementById('checkoutSummary');
const speekGrand2 = document.getElementById('speekGrand2');
const speekPlace = document.getElementById('speekPlace');
const payHint = document.getElementById('payHint');
const payCard = document.getElementById('payCard');
const payWallet = document.getElementById('payWallet');
const fCard = document.getElementById('fCard'), fExp = document.getElementById('fExp'), fCvc = document.getElementById('fCvc'), fName = document.getElementById('fName'), fMobile = document.getElementById('fMobile');
const fRegion = document.getElementById('fRegion'), fCity = document.getElementById('fCity'), fBrgy = document.getElementById('fBrgy'),
  fStreet = document.getElementById('fStreet'), fZone = document.getElementById('fZone'), fHouse = document.getElementById('fHouse'), fZip = document.getElementById('fZip'), fFull = document.getElementById('fFull'), fNote = document.getElementById('fNote');
const doneRef = document.getElementById('doneRef'), doneLines = document.getElementById('doneLines'), doneAddr = document.getElementById('doneAddr'), doneCount = document.getElementById('doneCount');
const bagTotal = () => bag.reduce((a, b) => a + b.price, 0);
const PAY_LABEL = { card: 'Card', gcash: 'GCash', maya: 'PayMaya' };

// The receipt: every bracelet in the bag, then the totals.
function renderCheckout() {
  checkoutSummary.replaceChildren(...bag.map(it => {
    const row = document.createElement('div'); row.className = 'order-item';
    const info = document.createElement('div'); info.className = 'order-info';
    info.innerHTML = `<strong></strong><span></span>`;
    info.querySelector('strong').textContent = it.name;
    info.querySelector('span').textContent = `${it.series || 'Scentála'} · 13 scented wax beads + elastic cord · customisable gold charms`;
    const line = document.createElement('span'); line.className = 'order-line'; line.textContent = money(it.price);
    row.append(bead(it.tint, 'order-bead'), info, line);
    return row;
  }));
  const sub = bagTotal();
  const totals = document.createElement('div'); totals.className = 'order-totals';
  totals.innerHTML = `
    <div class="ot"><dt>Subtotal (${bag.length} ${bag.length === 1 ? 'bracelet' : 'bracelets'})</dt><dd>${money(sub)}</dd></div>
    <div class="ot"><dt>Delivery</dt><dd>Free</dd></div>
    <div class="ot grand"><dt>Total</dt><dd>${money(sub)}</dd></div>`;
  checkoutSummary.appendChild(totals);
  speekGrand2.textContent = money(sub);
}

function showView(v) {
  speekBagView.hidden = v !== 'bag';
  speekCheckoutView.hidden = v !== 'checkout';
  speekDoneView.hidden = v !== 'done';
  if (v === 'checkout') speekCheckoutView.querySelector('.speek-flow').scrollTop = 0;
}

function setPay(kind) {
  document.querySelectorAll('.pay-opt').forEach(b => { const on = b.dataset.pay === kind; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
  const wallet = kind !== 'card';
  payCard.hidden = wallet; payWallet.hidden = !wallet;
  payHint.textContent = `You will be redirected to ${PAY_LABEL[kind]} to approve the payment.`;
}
document.querySelectorAll('.pay-opt').forEach(b => b.addEventListener('click', () => setPay(b.dataset.pay)));

// The full address is composed from the parts until the shopper edits it themselves.
let addrEdited = false;
function composeAddress() {
  if (addrEdited || document.activeElement === fFull) return;
  fFull.value = [fHouse.value, fStreet.value, fZone.value, fBrgy.value, fCity.value, fZip.value, fRegion.value]
    .map(s => (s || '').trim()).filter(Boolean).join(', ');
}
[fHouse, fStreet, fZone, fBrgy, fCity, fZip].forEach(el => el.addEventListener('input', composeAddress));
fRegion.addEventListener('change', composeAddress);
fFull.addEventListener('input', () => { addrEdited = fFull.value.trim().length > 0; });

fCard.addEventListener('input', () => { fCard.value = fCard.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim(); });
fExp.addEventListener('input', () => { const v = fExp.value.replace(/\D/g, '').slice(0, 4); fExp.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v; });

function validateOrder() {
  const kind = document.querySelector('.pay-opt.on').dataset.pay;
  const checks = kind === 'card'
    ? [[fCard, /^\d{4} \d{4} \d{4} \d{4}$/], [fExp, /^\d{2}\/\d{2}$/], [fCvc, /^\d{3,4}$/], [fName, /\S/]]
    : [[fMobile, /^0?9\d{2}\s?\d{3}\s?\d{4}$/]];
  checks.push([fRegion, /\S/], [fCity, /\S/], [fBrgy, /\S/], [fStreet, /\S/]);
  let ok = true, firstBad = null;
  for (const [el, re] of checks) {
    const good = re.test(el.value.trim());
    el.closest('.field').classList.toggle('bad', !good);
    if (!good) { ok = false; firstBad = firstBad || el; }
  }
  if (firstBad) firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return ok;
}

function openPeek() {
  renderPeek();
  showView('bag');
  speek.classList.add('open');
  speek.setAttribute('aria-hidden', 'false');
  speek.removeAttribute('inert');
  document.body.style.overflow = 'hidden';
  window.__lenis?.stop?.();
}
function closePeek() {
  speek.classList.remove('open');
  speek.setAttribute('aria-hidden', 'true');
  speek.setAttribute('inert', '');
  document.body.style.overflow = '';
  window.__lenis?.start?.();
}
sbagBtn.addEventListener('click', openPeek);
document.getElementById('speekScrim').addEventListener('click', closePeek);
['speekClose', 'speekClose2', 'speekClose3', 'doneClose'].forEach(id => document.getElementById(id).addEventListener('click', closePeek));
addEventListener('keydown', e => { if (e.key === 'Escape' && speek.classList.contains('open')) closePeek(); });
document.getElementById('speekBack').addEventListener('click', () => showView('bag'));

speekCheckout.addEventListener('click', () => {
  if (speekCheckout.disabled || !bag.length) return;
  renderCheckout();
  showView('checkout');
});

speekPlace.addEventListener('click', () => {
  if (!bag.length || !validateOrder()) return;
  const kind = document.querySelector('.pay-opt.on').dataset.pay;
  const label = PAY_LABEL[kind];
  const sub = bagTotal();
  const ref = 'SC-' + String(Date.now()).slice(-6) + '-' + Math.floor(Math.random() * 90 + 10);
  doneRef.innerHTML = `Thank you — order <b>${ref}</b> is placed. We will message you to confirm.`;
  doneCount.textContent = `${bag.length} ${bag.length === 1 ? 'bracelet' : 'bracelets'} · ${money(sub)}`;
  doneLines.innerHTML = bag.map(it => `<div class="speek-line"><dt>${it.name} · ${it.series || 'Scentála'}</dt><dd>${money(it.price)}</dd></div>`).join('')
    + `<div class="speek-line"><dt>Paid with ${label}</dt><dd>${money(sub)}</dd></div>`;
  doneAddr.textContent = `Delivering to ${fFull.value.trim() || 'your address'}${fNote.value.trim() ? ` — “${fNote.value.trim()}”` : ''}.`;
  bag.length = 0; sbagItems.replaceChildren();
  bump(); renderPeek();
  showView('done');
});

// The dock lives with the shop beat: it fades in when the products scroll into view.
const shopSec = document.getElementById('shop');
if (shopSec) new IntersectionObserver(es => {
  for (const e of es) document.body.classList.toggle('is-shop', e.isIntersecting);
}, { threshold: 0.02 }).observe(shopSec);

// ── The ingredient flyer: a product click bursts gold into the beads ──────────
// The particles arc from the clicked card (its screen point, unprojected into the scene) onto points
// around the bead ring, and the note's ingredients ride alongside as gold word chips. One reusable
// Points, one progress uniform; the tint is the chosen variant's.
function launchFlyer(fromEl, i) {
  const v = VARIANTS[i];
  if (!v || !flyer.points || !bracelet) return;
  const r = fromEl.getBoundingClientRect();
  const nx = ((r.left + r.width / 2) / innerWidth) * 2 - 1;
  const ny = 1 - ((r.top + r.height / 2) / innerHeight) * 2;
  const dir = v4.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
  flyer.uniforms.uOrigin.value.copy(camera.position).addScaledVector(dir, 2.6);
  flyer.uniforms.uTint.value.set(v.tint);
  flyer.uniforms.uSpin.value = Math.random() * 6.283;
  flyer.glow = 0.55;                 // the short infusion bump: the beads flash in the new tint
  flyer.P = 0;
  if (reduced) { flyer.points.visible = false; flyer.active = false; return; }
  flyer.active = true;
  flyer.points.visible = true;
  spawnChips(r, v);
}

// Ingredient word chips, strung from the note: they arc to beads spread around the ring and dissolve in.
function spawnChips(from, v) {
  const words = v.note.split('·').map(s => s.trim()).filter(Boolean).slice(0, 6);
  const slots = [0, 2, 4, 6, 8, 1];
  const tmp = new THREE.Vector3(), t0 = performance.now();
  const sx = from.left + from.width / 2, sy = from.top + from.height / 2;
  words.forEach((word, k) => {
    const el = document.createElement('span');
    el.className = 'fly-chip';
    el.textContent = word;
    flightdeck.appendChild(el);
    const delay = k * 90, dur = 900;
    (function step(now) {
      const tt = (now - t0 - delay) / dur;
      if (tt < 0) { requestAnimationFrame(step); return; }
      const e = Math.min(1, tt), ease = easeInOutCubic(e), u = 1 - ease;
      bracelet.beads[slots[k % slots.length]].getWorldPosition(tmp).project(camera);
      const tx = (tmp.x + 1) / 2 * innerWidth, ty = (1 - tmp.y) / 2 * innerHeight;
      const d = Math.hypot(tx - sx, ty - sy);
      const cxp = (sx + tx) / 2, cyp = Math.min(sy, ty) - Math.min(300, d * 0.5 + 70);
      const x = u * u * sx + 2 * u * ease * cxp + ease * ease * tx;
      const y = u * u * sy + 2 * u * ease * cyp + ease * ease * ty;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%,-50%) scale(${(1 - 0.4 * ease).toFixed(3)})`;
      el.style.opacity = e > 0.8 ? String(Math.max(0, (1 - e) / 0.2)) : String(Math.min(1, e * 5));
      if (e < 1) requestAnimationFrame(step); else el.remove();
    })(t0);
  });
}

document.querySelectorAll('.add').forEach(b => b.addEventListener('click', () => {
  const i = +b.dataset.variant;
  const v = VARIANTS[i];
  if (v) { setVariant(i); launchFlyer(b, i); }
  const item = { uid: ++bagUid, name: v?.name || b.dataset.item, series: v?.series || '', tint: v?.tint || '#b88746', price: parseFloat(String(v?.price).replace(/[^\d.]/g, '')) || 0 };
  toastEl.textContent = `${b.dataset.item} — added. Wrapped in kraft and sent out from Naga.`;
  toastEl.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 3200);
  flyToBag(b, item, () => { bag.push(item); addPoke(item); bump(); if (speek.classList.contains('open')) renderPeek(); });
}));
document.querySelectorAll('.variant').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.variant; setVariant(i); launchFlyer(b, i); }));

// ─── Boot ─────────────────────────────────────────────────────────────────────
magnetic();
smoothScroll({ lerp: 0.08 });
reveal('.house h2, .shop h2', { type: 'lines', stagger: 0.1 });
reveal('.lede', { type: 'lines', stagger: 0.05, y: '100%' });

await fontsReady;
bracelet = createBracelet({ renderer, env: ENV });
scene.add(bracelet.root);
useEnv(bracelet.root);

// The one-shot ingredient flyer: built once, reused for every product click.
const fly = createFlyer(900, { size: 14 });
flyer.points = fly.points;
flyer.uniforms = fly.uniforms;
flyer.points.visible = false;
scene.add(flyer.points);
engine.onResize((w, h, dpr) => { flyer.uniforms.uDpr.value = dpr * h / 900; });

// The packaging (image 4 of the brief) and the arm the bracelet is worn on (images 5, 6, 8).
box = createPackaging({ renderer, env: ENV });
box.root.position.set(0, 0, 0);
scene.add(box.root);
useEnv(box.root);
arm = createHand({ env: ENV });
scene.add(arm.root);
useEnv(arm.root);
box.setLabel('Sylva', 'Oake', '#8B5E3C');

makeTitle();
setVariant(0);

// Sample every medallion into a stream (in mesh-local space, keyed by the same burn function the shader uses).
function buildStreams() {
  measure();
  for (const n of notes) {
    notePose(n, n);
    n.side = STOPS[n.stop].note.side;
    n.group.position.copy(n.rest); n.group.rotation.set(0, 0, 0); n.group.scale.setScalar(1);
    n.group.updateMatrixWorld(true);
  }
}
buildStreams();
const invM = new THREE.Matrix4(), nm = new THREE.Matrix3();
for (const n of notes) {
  const COUNT = 12000;
  const smp = sampleSurface(n.mesh, COUNT);
  invM.copy(n.mesh.matrixWorld).invert();
  nm.getNormalMatrix(invM);
  const local = new Float32Array(COUNT * 3), normal = new Float32Array(COUNT * 3), keyA = new Float32Array(COUNT);
  // Direction toward the bracelet, in mesh space: the side facing the ring burns first.
  const toB = v1.set(0, 0.7, 0).sub(n.rest).transformDirection(invM).normalize();
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < COUNT; i++) {
    v2.fromArray(smp.position, i * 3).applyMatrix4(invM);
    local.set([v2.x, v2.y, v2.z], i * 3);
    v3.fromArray(smp.normal, i * 3).applyMatrix3(nm).normalize();
    normal.set([v3.x, v3.y, v3.z], i * 3);
    const d = v2.dot(toB); mn = Math.min(mn, d); mx = Math.max(mx, d);
  }
  const freq = 2.4;
  for (let i = 0; i < COUNT; i++) keyA[i] = burnKey(local[i * 3], local[i * 3 + 1], local[i * 3 + 2], toB, [mn, mx], freq);
  n.stream = createStream({ local, normal, color: smp.color, key: keyA }, { size: 20 });
  n.stream.uniforms.uSpin.value = n.side * 0.6;
  n.stream.points.visible = false;
  n.stream.points.layers.enable(1);
  scene.add(n.stream.points);
  burnMaterial(n, toB.clone(), [mn, mx], freq);
  engine.onResize((w, h, dpr) => { n.stream.uniforms.uDpr.value = dpr * h / 900; });
}
intro.stream = createStream(introCloud(12000), { size: 20 });
intro.stream.points.visible = false;
scene.add(intro.stream.points);
engine.onResize((w, h, dpr) => { intro.stream.uniforms.uDpr.value = dpr * h / 900; });
addEventListener('resize', () => buildStreams());

// Declared after the pointer handlers use it.
// (pointer state lives in input.js; nothing else to wire here)

engine.onTick(tick);
// Warm every program: show everything once, compile, hide again.
for (const n of notes) { n.group.visible = true; n.stream.points.visible = true; }
intro.stream.points.visible = true;
box.setOpacity(1); arm.setOpacity(1);
renderer.compile(scene, camera);
box.setOpacity(0); arm.setOpacity(0);
engine.start();
await loader.finish();
if (cursorState === '') cur?.set('');

// Intro: an empty bracelet; gold gathers from the dark and pours itself in. Then a nudge that says "you can spin this".
if (Q.has('skip')) { heroIn.v = 1; intro.P = P_END; } else {
  gsap.to(heroIn, { v: 1, duration: 2.6, ease: 'power2.inOut', delay: 0.3 });
  gsap.to(intro, { P: P_END, duration: 4.4, ease: 'power1.inOut', delay: 0.1 });
}
gsap.from('.nav', { opacity: 0, y: -10, duration: 1.4, ease: 'power3.out', delay: 1.2 });
if (!Q.has('still')) gsap.timeline({ delay: 4.6 }).to(phys, { demo: 0.32, duration: 0.7, ease: 'power2.inOut' }).to(phys, { demo: -0.2, duration: 0.8, ease: 'power2.inOut' }).to(phys, { demo: 0, duration: 0.9, ease: 'power2.inOut' });

const scrollForS = v => { const k = Math.min(Math.floor(v), anchors.length - 1), f = v - k; const a = anchors[k], b = anchors[k + 1] ?? a; return a + (b - a) * f; };
window.__scen = { studioEnvironment, renderer, ENV, envMats, key, fill, noteKey, noteRim, go: v => window.__lenis.scrollTo(scrollForS(v), { immediate: true }), anchors: () => anchors, S: () => S, notes, SERIES, VARIANTS, bracelet: () => bracelet, box: () => box, arm: () => arm, phys, drag, intro, scene, engine, floor, glow, title, reflection, setVariant, THREE };

// Steer the gallery thumbnail: after the intro, a three-quarter hero of the bracelet.
window.__thumb = { wait: 3200 };
