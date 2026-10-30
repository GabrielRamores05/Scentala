// A forearm, wrist and hand, so the bracelet can be shown worn.
//
// The skin is ONE surface, not a pile of grouped primitives. It is built as an implicit surface: the
// arm is described as signed-distance shapes (an oval tapered capsule for the forearm, ellipsoids for
// the palm masses, tapered capsules for the finger and thumb bones), those are merged with a smooth
// union, and the zero level set is polygonised with marching cubes. That is why the fingers grow out of
// the palm instead of sitting on it, and why the whole thing reads as one body.
//
// Everything is sized off the bracelet, the one fixed fact in the scene: the bead ring is 0.55R across
// with 0.255R beads, so its inner opening is 0.41 — the brief's 57 mm wrist. The wrist is therefore a
// 0.398 oval, which seats the ring with a hair of clearance and never cuts into it, and the hand is
// built to real anatomy at that scale: a palm ~1.2 units across the knuckles, fingers a little longer
// than the palm, a proper thumb on the radial (index) side.
//
// Local frame: +X runs to the elbow (off-frame right), −X to the fingertips, +Y is the back of the
// hand, +Z is the thumb side. The ring sits at the origin, its plane square to the forearm.
import { THREE } from './src/core/engine.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

const SKIN = 0xd9ab86;
const NAIL = 0xe4c3ae;

// The field is sampled over this box (local units). The forearm is carried to a rounded elbow just
// inside the far face, so the surface never opens onto the sampling boundary.
const BOX_MIN = [-2.99, -0.60, -0.92];
const BOX_SIZE = [5.44, 1.20, 1.84];
const RES = 104;
const BLEND = 0.014;          // smooth-union radius (tight enough that held-together fingers stay distinct)
const FAR = 100;

// ── Signed-distance primitives ────────────────────────────────────────────────
// Capsules and spheres are exact; the ellipsoid is the standard approximation, which is plenty for a
// field that is only ever read at its zero crossing.
function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * t);
}
function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const k1 = Math.sqrt((x / rx) * (x / rx) + (y / ry) * (y / ry) + (z / rz) * (z / rz));
  return k0 * (k0 - 1) / (k1 || 1e-6);
}
// A capsule whose section is an oval, squashed on Y — a forearm is wider across than it is deep.
function sdOvalCapsule(px, py, pz, ax, ay, az, bx, by, bz, ra, rb, ky) {
  return sdCapsule(px, py / ky, pz, ax, ay / ky, az, bx, by / ky, bz, ra, rb);
}
function smin(a, b) {
  const h = Math.max(BLEND - Math.abs(a - b), 0) / BLEND;
  return Math.min(a, b) - h * h * BLEND * 0.25;
}

export function createHand({ env }) {
  const root = new THREE.Group();
  root.name = 'scentala-arm';

  const skin = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(SKIN), roughness: 0.56, metalness: 0,
    sheen: 0.62, sheenRoughness: 0.58, sheenColor: new THREE.Color(0xffd3b4),
    clearcoat: 0.14, clearcoatRoughness: 0.74, envMapIntensity: 0.75,
  });
  const nailMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(NAIL), roughness: 0.22, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.1,
  });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x27310f, roughness: 0.94, metalness: 0, envMapIntensity: 0.5 });
  if (env) { skin.envMap = env; nailMat.envMap = env; sleeve.envMap = env; }

  // ── The primitives that make up the arm ───────────────────────────────────
  // Each entry is [distance function, local AABB].
  const prims = [];
  const capsule = (a, b, ra, rb) => prims.push([
    (x, y, z) => sdCapsule(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], ra, rb),
    [Math.min(a[0], b[0]) - rb, Math.min(a[1], b[1]) - rb, Math.min(a[2], b[2]) - rb,
      Math.max(a[0], b[0]) + rb, Math.max(a[1], b[1]) + rb, Math.max(a[2], b[2]) + rb],
  ]);
  const ellipsoid = (c, r) => prims.push([
    (x, y, z) => sdEllipsoid(x, y, z, c[0], c[1], c[2], r[0], r[1], r[2]),
    [c[0] - r[0], c[1] - r[1], c[2] - r[2], c[0] + r[0], c[1] + r[1], c[2] + r[2]],
  ]);

  // Forearm: a long oval taper, wrist to elbow, closed with a rounded elbow cap.
  const KY = 0.80;
  prims.push([
    (x, y, z) => sdOvalCapsule(x, y, z, 0.02, 0, 0, 1.86, 0, 0, 0.400, 0.548, KY),
    [-0.42, -0.36, -0.58, 2.34, 0.36, 0.58],
  ]);
  ellipsoid([1.86, 0, 0], [0.40, 0.44, 0.55]);

  // Wrist: 0.398 across — just inside the bead ring's 0.41 opening.
  ellipsoid([0.02, 0, 0], [0.23, 0.335, 0.398]);

  // Palm: one long, flat mass, plus the thenar and hypothenar eminences and the knuckle ridge.
  // Flatter (thinner on Y) and a touch longer than a boxy hand, as in the reference.
  ellipsoid([-0.710, -0.018, 0.000], [0.700, 0.122, 0.470]);
  ellipsoid([-0.520, -0.044, 0.330], [0.400, 0.112, 0.220]);
  ellipsoid([-0.660, -0.044, -0.360], [0.390, 0.106, 0.206]);
  ellipsoid([-1.330, 0.004, 0.000], [0.200, 0.116, 0.450]);

  // ── Fingers: index, middle, ring, little — close at the knuckles, a few degrees of fan at the tips.
  const ZAX = new THREE.Vector3(0, 0, 1);
  const YAX = new THREE.Vector3(0, 1, 0);
  const PHAL = [0.42, 0.34, 0.24];
  // Held together (0.20 between knuckles ≈ touching at these radii), long and slim, with just a
  // gentle downward curl — the relaxed, closed hand of the reference, not a splayed one.
  const FINGERS = [
    { k: [-1.330, -0.004, 0.320], len: 1.360, r: 0.086, curl: 0.115, spread: 0.010 },
    { k: [-1.345, 0.005, 0.106], len: 1.450, r: 0.090, curl: 0.090, spread: 0.000 },
    { k: [-1.335, -0.004, -0.108], len: 1.380, r: 0.086, curl: 0.108, spread: -0.012 },
    { k: [-1.305, -0.020, -0.322], len: 1.130, r: 0.076, curl: 0.148, spread: -0.040 },
  ];
  const tips = [];
  for (const f of FINGERS) {
    const pts = [new THREE.Vector3(...f.k)];
    const rad = [f.r];
    let d = new THREE.Vector3(-1, 0, 0).applyAxisAngle(YAX, f.spread).normalize();
    let r = f.r;
    for (let i = 0; i < 3; i++) {
      d = d.clone().applyAxisAngle(ZAX, f.curl * (i === 1 ? 1.4 : i === 2 ? 0.9 : 0.8)).normalize();
      pts.push(pts[i].clone().addScaledVector(d, f.len * PHAL[i]));
      r *= (i === 2 ? 0.80 : 0.91);
      rad.push(r);
    }
    for (let i = 0; i < 3; i++) {
      const a = pts[i], b = pts[i + 1];
      capsule([a.x, a.y, a.z], [b.x, b.y, b.z], rad[i], rad[i + 1]);
    }
    tips.push({ p: pts[3], d: d.clone(), r: rad[3] });
  }

  // ── Thumb: three bones set across the palm, on the radial side.
  {
    const pts = [[-0.580, -0.050, 0.340]];
    let d = new THREE.Vector3(-0.80, -0.05, 0.58).normalize();
    const lens = [0.340, 0.270, 0.200];
    const rad = [0.104, 0.094, 0.083, 0.073];
    for (let i = 0; i < 3; i++) {
      const a = pts[i];
      const b = [a[0] + d.x * lens[i], a[1] + d.y * lens[i], a[2] + d.z * lens[i]];
      pts.push(b);
      capsule(a, b, rad[i], rad[i + 1]);
      d = d.clone().applyAxisAngle(ZAX, i < 2 ? 0.20 : 0.26).applyAxisAngle(YAX, -0.30).normalize();
    }
    tips.push({ p: new THREE.Vector3(...pts[3]), d: d.clone(), r: rad[3] });
  }

  // ── Build the field and polygonise it ─────────────────────────────────────
  const mc = new MarchingCubes(RES, skin, false, false, 260000);
  mc.isolation = 0;
  mc.reset();
  const field = mc.field;
  field.fill(FAR);

  const res = RES;
  const pad = BLEND * 2.2;
  for (const [sdf, bb] of prims) {
    let i0 = Math.max(0, Math.floor((bb[0] - pad - BOX_MIN[0]) / BOX_SIZE[0] * res));
    let i1 = Math.min(res - 1, Math.ceil((bb[3] + pad - BOX_MIN[0]) / BOX_SIZE[0] * res));
    let j0 = Math.max(0, Math.floor((bb[1] - pad - BOX_MIN[1]) / BOX_SIZE[1] * res));
    let j1 = Math.min(res - 1, Math.ceil((bb[4] + pad - BOX_MIN[1]) / BOX_SIZE[1] * res));
    let k0 = Math.max(0, Math.floor((bb[2] - pad - BOX_MIN[2]) / BOX_SIZE[2] * res));
    let k1 = Math.min(res - 1, Math.ceil((bb[5] + pad - BOX_MIN[2]) / BOX_SIZE[2] * res));
    for (let k = k0; k <= k1; k++) {
      const pz = BOX_MIN[2] + (k / res) * BOX_SIZE[2];
      const koff = k * res * res;
      for (let j = j0; j <= j1; j++) {
        const py = BOX_MIN[1] + (j / res) * BOX_SIZE[1];
        const joff = koff + j * res;
        for (let i = i0; i <= i1; i++) {
          const px = BOX_MIN[0] + (i / res) * BOX_SIZE[0];
          const d = sdf(px, py, pz);
          const idx = joff + i;
          field[idx] = smin(field[idx], d);
        }
      }
    }
  }
  mc.update();
  mc.position.set(BOX_MIN[0] + BOX_SIZE[0] / 2, BOX_MIN[1] + BOX_SIZE[1] / 2, BOX_MIN[2] + BOX_SIZE[2] / 2);
  mc.scale.set(BOX_SIZE[0] / 2, BOX_SIZE[1] / 2, BOX_SIZE[2] / 2);
  mc.castShadow = true; mc.receiveShadow = true;
  mc.frustumCulled = false;
  root.add(mc);

  // ── Nails: a flattened table on the back of each fingertip ────────────────
  for (const t of tips) {
    const up = new THREE.Vector3(t.d.y, -t.d.x, 0).normalize();
    const n = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), nailMat);
    n.scale.set(t.r * 0.94, t.r * 0.30, t.r * 0.74);
    n.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    n.position.copy(t.p).addScaledVector(t.d, t.r * 0.28).addScaledVector(up, t.r * 0.66);
    n.castShadow = true; n.receiveShadow = true;
    root.add(n);
  }

  // ── The shirt cuff, down the forearm and out of frame ────────────────────
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.606, 0.640, 0.78, 44, 1, true), sleeve);
  cuff.rotation.z = -Math.PI / 2; cuff.position.x = 2.02; cuff.scale.x = 0.82;
  cuff.castShadow = true; cuff.receiveShadow = true;
  root.add(cuff);
  const cuffCap = new THREE.Mesh(new THREE.CylinderGeometry(0.640, 0.640, 0.02, 44), sleeve);
  cuffCap.rotation.z = -Math.PI / 2; cuffCap.position.x = 1.63; cuffCap.scale.x = 0.82;
  root.add(cuffCap);

  // Where the bracelet sits: the ring plane perpendicular to the forearm axis (+X).
  const wristAnchor = new THREE.Object3D();
  wristAnchor.position.set(0.0, 0.0, 0.0);
  root.add(wristAnchor);

  // Resting pose: the forearm runs in from the right, the wrist sits centre-frame and the hand reaches
  // left, relaxed and barely drooping, clear of the floor.
  root.rotation.set(0.10, 0.30, 0.04);
  root.position.set(0.40, 0.90, 0.02);

  const fadeMats = [skin, nailMat, sleeve];
  let opacity = 1;
  function setOpacity(v) {
    const o = Math.min(1, Math.max(0, v));
    const tr = o < 0.999;
    for (const m of fadeMats) {
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = o; m.depthWrite = !tr || o > 0.55;
    }
    opacity = o;
    root.visible = o > 0.012;
  }
  setOpacity(0);

  return { root, wrist: wristAnchor, skin, sleeve, setOpacity, get opacity() { return opacity; } };
}
