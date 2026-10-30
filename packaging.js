// The SCENTÁLA packaging (packaging.png of the brief): a plant-based kraft box, 8" × 8" × 3", a
// lift-off lid printed with the mark and the wordmark, and a barrier liner inside that keeps the
// fragrance in and the paper clean.
//
// The bracelet is 3.76" across (a 95 mm ring — nine 19 mm beads over a 7" wrist), so at 1 unit =
// 2.725" the box is 2.936 × 2.936 × 1.101 and the board is 0.022 thick.
//
// Also in here: the per-scent label card of the brief — SCENTÁLA / <Scent> of / <SERIES> beside the
// mark — redrawn on a canvas for whichever scent is on stage.
import { THREE, clamp } from './src/core/engine.js';
import { bakeTexture } from './src/core/textures.js';
import { drawMark } from './mark.js';

export const BOX = {
  inner: 2.892,         // 8" inside
  wall: 0.022,          // board thickness
  baseH: 0.734,         // tray wall height
  linerY: 0.03,         // top of the liner sheet
  lidH: 0.407,          // lid shell height
  closedY: 0.694,       // lid origin when shut (its top then sits at 1.101 = 3" total)
  openY: 1.60,
};

/** Plain kraft board: flat and matte, like the render, with only a faint fibre grain. */
function kraftMaps(renderer, { repeat = 1, tone = 1 } = {}) {
  const albedo = bakeTexture(renderer, 512, `
    void main(){
      float fib = fbm(vUv * vec2(160.0, 10.0), 160.0, 4, 0.5);
      float grain = fbm(vUv * 90.0, 90.0, 3, 0.5);
      vec3 base = vec3(0.69, 0.505, 0.302) * ${tone.toFixed(3)};
      gl_FragColor = vec4(base * (0.975 + fib * 0.035 + grain * 0.02), 1.0);
    }`);
  const rough = bakeTexture(renderer, 256, `
    void main(){
      float fib = fbm(vUv * 170.0, 170.0, 3, 0.5);
      gl_FragColor = vec4(1.0, clamp(0.9 - fib * 0.05, 0.3, 1.0), 0.0, 1.0);
    }`);
  albedo.repeat.set(repeat, repeat); rough.repeat.set(repeat, repeat);
  return { albedo, rough };
}

/** The lid face (packaging.png): the mark inside a fine ring, and the wordmark beneath it. */
function lidFace(renderer) {
  const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#b0804b'; g.fillRect(0, 0, S, S);
  // The ring the mark sits in.
  g.strokeStyle = 'rgba(70,48,20,.30)'; g.lineWidth = 4;
  g.beginPath(); g.arc(S / 2, S * 0.42, S * 0.155, 0, Math.PI * 2); g.stroke();
  drawMark(g, S / 2, S * 0.42, S * 0.105, { line: '#6f4f22' });
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#33301f';
  g.font = '400 104px "Bodoni Moda", Didot, serif';
  if ('letterSpacing' in g) g.letterSpacing = '30px';
  g.fillText('SCENTÁLA', S / 2 + 15, S * 0.735);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** The barrier liner: plain board with the round the bracelet beds into, debossed. */
function linerFace(renderer) {
  const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#c2a377'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(80,56,24,.30)'; g.lineWidth = 6;
  g.beginPath(); g.arc(S / 2, S / 2, 250, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(80,56,24,.14)'; g.lineWidth = 2;
  g.beginPath(); g.arc(S / 2, S / 2, 272, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function createPackaging({ renderer, env }) {
  const root = new THREE.Group();
  root.name = 'scentala-box';

  const kraft = kraftMaps(renderer, { repeat: 1 });
  const matBoard = new THREE.MeshStandardMaterial({ map: kraft.albedo, roughnessMap: kraft.rough, roughness: 0.86, metalness: 0, envMapIntensity: 0.55 });
  const kraftIn = kraftMaps(renderer, { repeat: 2, tone: 0.94 });
  const matInner = new THREE.MeshStandardMaterial({ map: kraftIn.albedo, roughnessMap: kraftIn.rough, roughness: 0.9, metalness: 0, envMapIntensity: 0.45 });
  if (env) { matBoard.envMap = env; matInner.envMap = env; }

  const { inner, wall, baseH, linerY, lidH, closedY, openY } = BOX;
  const half = inner / 2, outer = half + wall;
  const panel = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  // ── The tray ──────────────────────────────────────────────────────────────
  const base = new THREE.Group();
  base.add(panel(inner, wall, inner, matInner, 0, wall / 2, 0));                       // floor
  base.add(panel(inner, baseH, wall, matBoard, 0, baseH / 2, -half - wall / 2));        // back
  base.add(panel(inner, baseH, wall, matBoard, 0, baseH / 2, half + wall / 2));         // front
  base.add(panel(wall, baseH, inner, matBoard, -half - wall / 2, baseH / 2, 0));        // left
  base.add(panel(wall, baseH, inner, matBoard, half + wall / 2, baseH / 2, 0));         // right
  root.add(base);

  // ── The barrier liner ─────────────────────────────────────────────────────
  const linerMat = new THREE.MeshStandardMaterial({ map: linerFace(renderer), roughness: 0.9, metalness: 0, envMapIntensity: 0.35 });
  if (env) linerMat.envMap = env;
  const liner = new THREE.Mesh(new THREE.BoxGeometry(inner - 0.008, linerY, inner - 0.008), linerMat);
  liner.position.y = linerY / 2; liner.receiveShadow = true;
  base.add(liner);

  // ── The lid ───────────────────────────────────────────────────────────────
  const matLid = new THREE.MeshStandardMaterial({ map: lidFace(renderer), roughness: 0.9, metalness: 0, envMapIntensity: 0.55 });
  if (env) matLid.envMap = env;
  const lid = new THREE.Group();
  lid.add(panel(2 * outer, wall, 2 * outer, matBoard, 0, lidH - wall / 2, 0));            // top board
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2 * outer - 0.003, 2 * outer - 0.003), matLid);
  face.rotation.x = -Math.PI / 2; face.position.y = lidH + 0.0016; face.receiveShadow = true;
  lid.add(face);
  lid.add(panel(2 * outer, lidH, wall, matBoard, 0, lidH / 2, -outer + wall / 2));
  lid.add(panel(2 * outer, lidH, wall, matBoard, 0, lidH / 2, outer - wall / 2));
  lid.add(panel(wall, lidH, 2 * outer - 2 * wall, matBoard, -outer + wall / 2, lidH / 2, 0));
  lid.add(panel(wall, lidH, 2 * outer - 2 * wall, matBoard, outer - wall / 2, lidH / 2, 0));
  root.add(lid);

  const CLOSED = new THREE.Vector3(0, closedY, 0);
  const OPEN = new THREE.Vector3(0, openY, -0.42);
  const OPEN_ROT = new THREE.Euler(-0.34, 0, 0);

  // ── The label card (the brief's per-scent labels) ──────────────────────────
  const cardC = document.createElement('canvas'); cardC.width = 1400; cardC.height = 860;
  const cardTex = new THREE.CanvasTexture(cardC);
  cardTex.colorSpace = THREE.SRGBColorSpace; cardTex.anisotropy = 8;
  const cardMat = new THREE.MeshPhysicalMaterial({
    map: cardTex, roughness: 0.62, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.8,
  });
  if (env) cardMat.envMap = env;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.626), cardMat);
  card.castShadow = true;
  card.position.set(0, linerY + 0.30, -half + 0.08);
  card.rotation.x = -Math.PI / 2 + 0.40;
  base.add(card);

  function drawCard(name, series, tint) {
    const g = cardC.getContext('2d');
    g.fillStyle = '#f6f1e4'; g.fillRect(0, 0, 1400, 860);
    g.strokeStyle = 'rgba(120,100,60,.5)'; g.lineWidth = 6; g.strokeRect(16, 16, 1400 - 32, 860 - 32);
    drawMark(g, 330, 470, 150, { line: '#b88746' });
    g.save();
    g.translate(330, 300); g.rotate(-0.12);
    g.textAlign = 'center'; g.fillStyle = '#7d7d55';
    g.font = '400 italic 54px "Bodoni Moda", serif';
    if ('letterSpacing' in g) g.letterSpacing = '4px';
    g.fillText('SCENTÁLA', 0, 0);
    g.restore();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#1d2410';
    g.font = '400 78px "Bodoni Moda", Didot, serif';
    if ('letterSpacing' in g) g.letterSpacing = '6px';
    g.fillText('SCENTÁLA', 640, 300);
    g.fillStyle = tint || '#8B5E3C';
    g.font = '400 italic 150px "Bodoni Moda", serif';
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.fillText(name, 626, 450);
    const w = g.measureText(name).width;
    g.fillStyle = '#1d2410';
    g.font = '400 64px "Bodoni Moda", serif';
    g.fillText(' of', 626 + w, 450);
    g.font = '400 54px "Bodoni Moda", Didot, serif';
    if ('letterSpacing' in g) g.letterSpacing = '8px';
    g.fillText((series || '').toUpperCase() + ' SERIES', 640, 560);
    cardTex.needsUpdate = true;
  }
  drawCard('Sylva', 'Oake', '#8B5E3C');

  // ── Dimension annotations, drawn like the dieline: 8 in × 8 in × 3 in ─────
  const dims = new THREE.Group();
  const dimLine = new THREE.MeshBasicMaterial({ color: 0xf4e7bd, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const marker = (w, d, x, z, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), dimLine);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    dims.add(m);
  };
  // Upright: the standing height label is a billboard, so it always reads head-on instead of being
  // skewed by the camera's perspective — the "3 IN" callout stays legible at any orbit.
  function dimLabel(text, x, z, y, w = 0.30, upright = false) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#f6ecc9'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '500 58px "Hanken Grotesk", system-ui, sans-serif';
    if ('letterSpacing' in g) g.letterSpacing = '4px';
    g.fillText(text, 128, 52);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (upright) {
      const m = new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false });
      const sprite = new THREE.Sprite(m);
      sprite.scale.set(w, w * 96 / 256, 1);
      sprite.position.set(x, y, z);
      dims.add(sprite);
      return m;
    }
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 96 / 256), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    dims.add(mesh);
    return m;
  }
  const DY = baseH + 0.075, OFF = outer + 0.16;
  // Width and depth, with ticks at both ends — these lie on the floor, viewed from above.
  marker(2 * outer + 0.03, 0.013, 0, OFF, DY);
  marker(0.013, 2 * outer + 0.03, OFF, 0, DY);
  for (const s of [-1, 1]) { marker(0.013, 0.10, s * outer, OFF, DY); marker(0.10, 0.013, OFF, s * outer, DY); }

  // Height: 3" is the box's vertical thickness, so this dimension STANDS UP at the near-left corner,
  // floor to lid top, in a vertical plane the camera reads head-on — not a flat line on the ground.
  const hx = -OFF, hz = OFF, H = closedY + lidH;
  const hBar = new THREE.Mesh(new THREE.PlaneGeometry(0.013, H), dimLine);
  hBar.position.set(hx, H / 2, hz);
  dims.add(hBar);
  // A short horizontal tick at each end of the vertical bar.
  for (const s of [-1, 1]) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.013), dimLine);
    tick.position.set(hx, H / 2 + s * H / 2, hz);
    dims.add(tick);
  }
  const dimMats = [dimLine,
    dimLabel('8 IN', 0, OFF + 0.26, DY),
    dimLabel('8 IN', OFF + 0.26, 0, DY),
    dimLabel('3 IN', hx + 0.26, hz - 0.24, H * 0.5, 0.32, true),
  ];
  root.add(dims);
  function setDims(v) {
    const o = clamp(v);
    for (const m of dimMats) m.opacity = o;
    dims.visible = o > 0.01;
  }
  setDims(0);

  const state = { open: 0, opacity: 1 };
  function setOpen(v) {
    const e = clamp(v);
    state.open = e;
    lid.position.lerpVectors(CLOSED, OPEN, e);
    lid.rotation.set(OPEN_ROT.x * e, 0, 0);
  }
  setOpen(1);

  // The box fades in at the packaging beat and out again on the wrist.
  const fadeMats = [matBoard, matInner, linerMat, matLid, cardMat];
  function setOpacity(v) {
    const o = clamp(v);
    state.opacity = o;
    const tr = o < 0.999;
    for (const m of fadeMats) {
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = o; m.depthWrite = !tr || o > 0.55;
    }
    root.visible = o > 0.012;
  }
  setOpacity(0);

  return { root, base, lid, liner, card, dims, state, setOpen, setOpacity, setDims, setLabel: drawCard, BOX };
}
