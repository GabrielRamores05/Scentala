// The SCENTÁLA mark, measured off Scentala_logo.png and shared by everything that draws it: the 3D
// bracelet, the print on the lid, and the per-scent label cards. One source of truth.
//
// All radii are in units of the bead-ring radius R, all heights are measured up from the ring centre.
//   • nine cream beads, counter-clockwise from 90°, spaced 26.875°, bead radius 0.255R — a bead sits
//     dead centre at the top so the atomiser has something to mount on
//   • the atomiser cap, measured off the artwork: a gold tail, a gold collar lens, a brass neck, a
//     dark green shade and a pale bell, from 1.00R to 1.75R above the centre
//   • the leaf sprig, as base→tip pairs, completing the ring across the gap it leaves on the right
export const MARK = {
  beads: 9,
  start: 90,            // degrees — a bead sits dead centre at the top, and the atomiser mounts on it
  step: 26.875,
  beadR: 0.255,

  // [yFrom, yTo, rFrom, rTo, colour, kind] — bottom to top, y in R and r in R. The bead at the top
  // reaches 1.255R, so the tail is buried in that bead and the collar seats on its crown.
  cap: [
    [1.060, 1.315, 0.135, 0.150, 'gold', 'frustum'],   // tail: buried in the top bead, a stub showing
    [1.315, 1.435, 0.370, 0.370, 'gold', 'lens'],      // collar disc, the widest point
    [1.435, 1.520, 0.215, 0.200, 'brass', 'frustum'],  // neck
    [1.520, 1.675, 0.325, 0.257, 'green', 'frustum'],  // shade
    [1.682, 1.810, 0.257, 0.167, 'cream', 'bell'],     // pale bell on top
  ],

  // [baseAngle°, baseR, tipAngle°, tipR] — a frond grown along the vine, filling the arc the beads
  // leave open so the ring reads as a complete circle. Radii are inside the bead ring (1.255R).
  plume: [
    [-53, 1.02, -20, 1.14],
    [-47, 1.02, -8, 1.34],
    [-38, 1.02, 6, 1.44],
    [-27, 1.02, 18, 1.45],
    [-15, 1.02, 30, 1.42],
    [-3, 1.02, 42, 1.36],
    [9, 1.02, 54, 1.29],
    [21, 1.02, 66, 1.21],
    [33, 1.02, 78, 1.13],
    [45, 1.02, 88, 1.06],
  ],
  // The vine itself: an arc across the gap, so the leaves have something to grow from.
  stem: { from: -55, to: 62, r: 1.02 },

  colours: { gold: '#b88746', brass: '#8a6528', green: '#193d23', cream: '#e8e6e0' },
  beadFill: '#e8dcc8',
};

export const D2R = Math.PI / 180;
/** Ring-plane point at (angle°, radius in R) — in maths coords (y up). */
export const markPoint = (a, r, R) => [Math.cos(a * D2R) * r * R, Math.sin(a * D2R) * r * R];

/** Draw the mark in canvas 2D. R is the bead-ring radius in pixels. */
export function drawMark(g, cx, cy, R, { line = '#b88746' } = {}) {
  const C = MARK.colours;
  g.save();
  g.translate(cx, cy);

  // The leaf plume, behind the beads.
  MARK.plume.forEach(([ba, br, ta, tr], i) => {
    const [bx, by] = markPoint(ba, br, R); const [tx, ty] = markPoint(ta, tr, R);
    const mx = (bx + tx) / 2, my = (by + ty) / 2;
    const ang = Math.atan2(ty - by, tx - bx), len = Math.hypot(tx - bx, ty - by);
    const nx = Math.cos(ang + Math.PI / 2) * len * 0.15, ny = Math.sin(ang + Math.PI / 2) * len * 0.15;
    g.beginPath();
    g.moveTo(bx, -by);
    g.quadraticCurveTo(mx + nx, -(my + ny), tx, -ty);
    g.quadraticCurveTo(mx - nx, -(my - ny), bx, -by);
    g.fillStyle = i % 2 ? '#6e7c40' : '#3c4a1e';
    g.fill();
  });
  // The vine: an arc across the gap. Canvas angles run the other way, hence the negations.
  {
    const { from, to, r } = MARK.stem;
    g.beginPath();
    g.arc(0, 0, r * R, -from * D2R, -to * D2R, true);
    g.lineWidth = Math.max(1, R * 0.05); g.strokeStyle = '#3c4a1e'; g.lineCap = 'round'; g.stroke();
  }

  // The nine beads.
  const br = R * MARK.beadR;
  for (let i = 0; i < MARK.beads; i++) {
    const [x, y] = markPoint(MARK.start + i * MARK.step, 1, R);
    g.beginPath(); g.arc(x, -y, br, 0, Math.PI * 2);
    g.fillStyle = MARK.beadFill; g.fill();
    g.lineWidth = Math.max(1, R * 0.032); g.strokeStyle = line; g.stroke();
  }

  // The atomiser cap.
  for (const [y0, y1, r0, r1, colour, kind] of MARK.cap) {
    const col = C[colour] || colour;
    g.fillStyle = col; g.strokeStyle = 'rgba(40,40,30,.35)'; g.lineWidth = Math.max(1, R * 0.02);
    if (kind === 'lens') {
      g.beginPath(); g.ellipse(0, -((y0 + y1) / 2) * R, r0 * R, ((y1 - y0) / 2) * R, 0, 0, Math.PI * 2);
      g.fill(); g.stroke();
    } else {
      g.beginPath();
      g.moveTo(-r0 * R, -y0 * R); g.lineTo(r0 * R, -y0 * R);
      g.lineTo(r1 * R, -y1 * R); g.lineTo(-r1 * R, -y1 * R);
      g.closePath(); g.fill(); g.stroke();
      if (kind === 'bell') {   // round the top off
        g.beginPath(); g.ellipse(0, -y1 * R, r1 * R, r1 * R * 0.22, 0, Math.PI, 0);
        g.fill();
      }
    }
  }
  g.restore();
}
