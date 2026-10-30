// The bracelet, built to the SCENTÁLA mark (mark.js, measured off Scentala_logo.png): nine cream wax
// beads ringed in gold, counter-clockwise from just right of the cap; a brass-neck atomiser crown
// (dark-green shade under a pale bell) seated on the top bead; a leaf sprig completing the ring across
// the gap on the right.
// Everything is procedural — no meshes are generated offline.
//
// The product (from the SCENTÁLA brief): beads of beeswax, shea butter and jojoba oil, made porous
// with bamboo charcoal powder, coloured with candle dye and fragrance oil, then sealed with a
// water-based gloss. The shader-side of that story is: MeshPhysicalMaterial with a clearcoat (the
// sealer) and a soft sheen (the wax). `setVariant` re-tints the scented beads; `setInfusion` lights
// them up while particles pour in.
import { THREE, clamp } from './src/core/engine.js';
import { MARK, markPoint } from './mark.js';

export const RING_R = 0.55;                              // bead ring radius
export const BEADS = MARK.beads;                         // nine beads, counter-clockwise from the top
export const BEAD_R = RING_R * MARK.beadR;               // bead radius, as measured off the mark
export const COUNT = BEADS;
const STEP = MARK.step * Math.PI / 180;
const LEAF_H = 0.33;                                     // the leaf shape's height, before scaling

function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.16);
  s.bezierCurveTo(0.10, -0.10, 0.10, 0.09, 0, 0.17);
  s.bezierCurveTo(-0.10, 0.09, -0.10, -0.10, 0, -0.16);
  s.closePath();
  return s;
}

export function createBracelet({ renderer, env }) {
  const root = new THREE.Group();          // sits on the floor
  const pivot = new THREE.Group();         // ring centre — everything the drag rotates lives here
  pivot.position.y = RING_R + BEAD_R;      // the lowest bead just touches the floor
  root.add(pivot);
  root.name = 'scentala-bracelet';

  // ── Materials ─────────────────────────────────────────────────────────────
  const scent = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(MARK.beadFill), roughness: 0.52, metalness: 0,
    clearcoat: 0.85, clearcoatRoughness: 0.3, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xfff4e0),
    ior: 1.45, emissive: new THREE.Color(0x000000), envMapIntensity: 0.85,
  });
  const cord = new THREE.MeshStandardMaterial({ color: 0x9d9682, roughness: 0.95, metalness: 0 });
  const gold = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xb88746), metalness: 1, roughness: 0.22, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 2.4 });
  const brass = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xa07c36), metalness: 1, roughness: 0.3, envMapIntensity: 2.2 });
  const capGreen = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0x1e4d29), roughness: 0.36, metalness: 0.04, clearcoat: 0.9, clearcoatRoughness: 0.26, envMapIntensity: 0.9 });
  const cream = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xf3f1ea), roughness: 0.4, metalness: 0.04, clearcoat: 0.8, clearcoatRoughness: 0.3, envMapIntensity: 0.9 });
  const leafDark = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0x2c3a12), roughness: 0.68, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.45 });
  const leafLight = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0x4e5c26), roughness: 0.68, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.45 });
  const CAP_MAT = { gold, brass, green: capGreen, cream };
  if (env) for (const m of [scent, gold, brass, capGreen, cream, leafDark, leafLight]) m.envMap = env;

  // ── Beads: nine, counter-clockwise, each ringed in gold as in the mark ─────
  const beadGeo = new THREE.SphereGeometry(1, 28, 20);
  const rimGeo = new THREE.TorusGeometry(BEAD_R, 0.009, 8, 44);
  const beads = [];      // the scented ones (what setVariant re-tints)
  const all = [];
  for (let i = 0; i < BEADS; i++) {
    const a = MARK.start * Math.PI / 180 + i * STEP;
    const m = new THREE.Mesh(beadGeo, scent);
    m.position.set(Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0);
    m.position.multiplyScalar(1 + (((i * 37) % 11) - 5) * 0.0011);
    m.position.z = (((i * 53) % 9) - 4) * 0.0013;
    m.scale.setScalar(BEAD_R);
    m.castShadow = true; m.receiveShadow = true;
    pivot.add(m);
    all.push(m); beads.push(m);

    // The gold rim: the outline of the bead in the mark, sitting on its silhouette.
    const rim = new THREE.Mesh(rimGeo, gold);
    rim.position.copy(m.position).multiplyScalar(1.002);
    rim.castShadow = true;
    pivot.add(rim);
    all.push(rim);
  }

  // ── Elastic cord ──────────────────────────────────────────────────────────
  const cordMesh = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.013, 8, 112), cord);
  cordMesh.castShadow = true;
  pivot.add(cordMesh);

  // ── The atomiser cap, built straight from the measured profile ────────────
  const cap = new THREE.Group();
  const capBase = MARK.cap[0][0] * RING_R;
  cap.position.set(0, capBase, 0);
  for (const [y0, y1, r0, r1, colour, kind] of MARK.cap) {
    const h = (y1 - y0) * RING_R;
    const cy = ((y0 + y1) / 2) * RING_R - capBase;
    const mat = CAP_MAT[colour] || gold;
    let mesh;
    if (kind === 'lens') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 20), mat);
      mesh.scale.set(r0 * RING_R, h / 2, r0 * RING_R);
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1 * RING_R, r0 * RING_R, h, 4), mat);
      mesh.rotation.y = Math.PI / 4;
      if (kind === 'bell') {                    // round the top off
        const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        dome.scale.set(r1 * RING_R, r1 * RING_R * 0.32, r1 * RING_R);
        dome.position.y = h / 2;
        mesh.add(dome);
      }
    }
    mesh.position.y = cy;
    mesh.castShadow = true; mesh.receiveShadow = true;
    cap.add(mesh);
  }
  pivot.add(cap);

  // ── The leaf sprig, from the mark's base → tip pairs ──────────────────────
  const sprig = new THREE.Group();
  sprig.name = 'scentala-sprig';
  const leafGeo = new THREE.ExtrudeGeometry(leafShape(), { depth: 0.010, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 10 });
  leafGeo.center();
  MARK.plume.forEach(([ba, brr, ta, tr], i) => {
    const [bx, by] = markPoint(ba, brr, RING_R);
    const [tx, ty] = markPoint(ta, tr, RING_R);
    const L = Math.hypot(tx - bx, ty - by);
    const ang = Math.atan2(ty - by, tx - bx);
    const m = new THREE.Mesh(leafGeo, i % 2 ? leafLight : leafDark);
    m.scale.set(L, L / LEAF_H, 1);
    m.position.set((bx + tx) / 2, (by + ty) / 2, (i % 2 ? 0.022 : -0.022) + (i - 3) * 0.004);
    m.rotation.z = ang - Math.PI / 2;
    m.rotation.y = i % 2 ? 0.22 : -0.22;
    m.castShadow = true;
    sprig.add(m);
  });
  {
    // The vine across the gap, so the frond grows from something and the ring closes.
    const { from, to, r } = MARK.stem;
    const d2r = Math.PI / 180;
    const vine = new THREE.Mesh(new THREE.TorusGeometry(r * RING_R, 0.017, 10, 96, (to - from) * d2r), leafDark);
    vine.rotation.z = from * d2r;
    vine.position.z = -0.03;
    vine.castShadow = true;
    sprig.add(vine);
  }
  pivot.add(sprig);

  // ── Gold nameplate charm (canvas label, redrawn per variant), hung at the base ──
  const plate = (() => {
    const c = document.createElement('canvas'); c.width = 768; c.height = 240;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, color: 0xffffff, metalness: 0.85, roughness: 0.32, clearcoat: 0.4, envMapIntensity: 1.8 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.09), mat);
    const ang = -Math.PI / 2;                                // hangs from the bottom of the ring
    const rad = RING_R + BEAD_R + 0.07;
    mesh.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, 0);
    pivot.add(mesh);
    return { canvas: c, tex, mesh };
  })();

  function drawPlate(name, tint) {
    const { canvas: c } = plate;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, c.height);
    grd.addColorStop(0, '#f0d68f'); grd.addColorStop(0.5, '#b88746'); grd.addColorStop(1, '#7d5a28');
    g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(253,245,166,.55)'; g.lineWidth = 8; g.strokeRect(10, 10, c.width - 20, c.height - 20);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = tint ? '#1b2205' : '#2a1f0d';
    g.font = '400 118px "Italiana", "Bodoni Moda", serif';
    if ('letterSpacing' in g) g.letterSpacing = '10px';
    g.fillText(name.toUpperCase(), c.width / 2, c.height / 2 + 4);
    plate.tex.needsUpdate = true;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    fill: 0, energy: 0,
    tint: new THREE.Color('#FFD700'),           // current variant colour
    glow: 0,                                    // infusion, 0..1
    plateName: 'Lūmen', plateTint: true,
  };
  const tintTarget = state.tint.clone();

  function setVariant(color, name) {
    tintTarget.set(color);
    state.plateTint = true;
    if (name && name !== state.plateName) { state.plateName = name; drawPlate(name, true); }
    else if (name) drawPlate(name, true);
  }

  function setInfusion(v) { state.glow = clamp(v); }

  const emissive = new THREE.Color(), WHITE = new THREE.Color(0xffffff);
  function solve(dt) {
    const k = 1 - Math.exp(-9 * Math.max(dt, 0));
    scent.color.lerp(tintTarget, k);
    // A scent-glow: beads take on the variant colour and breathe with the infusion.
    emissive.copy(scent.color).lerp(WHITE, 0.35);
    scent.emissive.copy(emissive).multiplyScalar(state.glow * 0.4);
    state.energy = state.glow * 0.35;
    return state;
  }

  drawPlate(state.plateName, true);
  scent.color.copy(tintTarget);

  return { root, pivot, beads, all, cap, sprig, plate, state, setVariant, setInfusion, solve, RING_R, BEAD_R };
}
