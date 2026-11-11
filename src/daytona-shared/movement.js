// Calibre 4131 as a study model, built from code in millimetres and seen from the case back: the main plate in its
// steel case ring, the barrel with a mainspring that coils tight as it is wound, the going train (centre, third and
// fourth wheels, escape wheel), the pallet fork, a large variable-inertia balance with gold nuts and a blue hairspring
// that breathes with every swing, bridges striped with Côtes de Genève, ruby jewels and blued screws. The chronograph
// sits on top: the column wheel with its six columns and ratchet, the clutch lever riding on it, the vertical clutch
// at the centre, the chronograph runner with its heart cam, the 30-minute counter wheel and the reset hammer. The crown
// and two pushers come through the case; the skeleton rotor rides over it all. update(st) poses every part.
import * as THREE from 'three';
import {COLUMN_STEP} from './kin.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const s5 = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

// arbor positions on the plate (x right, z toward the viewer; mm). Each centre distance is wheel radius + pinion
// radius of the pair, so every mesh closes.
export const P = {
  w2: [0, 0],
  w3: [3.41, -2.86],
  w4: [7.25, -2.18],
  esc: [8.21, 1.39],
  fork: [7.22, 4.12],
  bal: [5.52, 7.06],
  barrel: [-5.4, -1.97],
  crownWheel: [-10.82, -1.01],
  column: [-9.6, -7.9],
  minute: [-1.45, 5.75],
  inter: [-0.6, 3.6],
  lever: [-6.1, -4.7],
  hammer: [-7.2, 4.4],
};
const PUSH_A = 205 * D2R; // start / stop pusher (2 o'clock on the dial side, seen mirrored from the back)
const PUSH_B = 155 * D2R; // reset pusher (4 o'clock)
const CASE_R = 15.25;

// ------------------------------------------------------------ geometry helpers (shapes in XY, extruded up the y axis)
const up = (g) => g.rotateX(-Math.PI / 2); // shape y -> -z, extrusion -> +y
function extrude(shape, h, bevel = 0.04, curve = 24) {
  const g = new THREE.ExtrudeGeometry(shape, {depth: h, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: curve});
  return up(g);
}
function ringPath(r, cw = true) {
  const p = new THREE.Path();
  p.absarc(0, 0, r, 0, TAU, cw);
  return p;
}
/** a toothed wheel with spoke windows: teeth, outer radius, wheel height, spoke count (0 = solid), arbor hole */
function wheelGeo(teeth, R, h, {spokes = 5, hole = 0.18, club = false, depth} = {}) {
  const sh = new THREE.Shape();
  const td = depth ?? Math.min(0.32, R * 0.09);
  const rr = R - td;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    const da = TAU / teeth;
    const pts = club
      ? [[rr, a], [R, a + da * 0.32], [R, a + da * 0.42], [rr * 0.985, a + da * 0.55]]
      : [[rr, a], [rr, a + da * 0.18], [R, a + da * 0.32], [R, a + da * 0.58], [rr, a + da * 0.72]];
    pts.forEach(([r, b], k) => (i === 0 && k === 0 ? sh.moveTo(r * Math.cos(b), r * Math.sin(b)) : sh.lineTo(r * Math.cos(b), r * Math.sin(b))));
  }
  sh.closePath();
  if (spokes) {
    const ri = rr - Math.max(0.28, R * 0.1);
    const rh = Math.max(0.42, R * 0.24);
    const half = Math.asin(Math.min(0.9, 0.16 / ri)) + 0.06;
    for (let k = 0; k < spokes; k++) {
      const a0 = (k / spokes) * TAU + half;
      const a1 = ((k + 1) / spokes) * TAU - half;
      const w = new THREE.Path();
      w.absarc(0, 0, ri, a0, a1, false);
      w.absarc(0, 0, rh, a1 - 0.05, a0 + 0.05, true);
      w.closePath();
      sh.holes.push(w);
    }
  }
  if (hole) sh.holes.push(ringPath(hole));
  return extrude(sh, h, 0.03, 6);
}
const pinionGeo = (leaves, R, h) => wheelGeo(leaves, R, h, {spokes: 0, hole: 0, depth: R * 0.32});
function disc(r, h, seg = 48, hole = 0) {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, r, 0, TAU, false);
  if (hole) sh.holes.push(ringPath(hole));
  return extrude(sh, h, 0.04, seg);
}
/** a flat bar along a polyline (x, z points), width w, height h */
function barGeo(pts, w, h, round = true) {
  const sh = new THREE.Shape();
  const L = [];
  const R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const n = Math.hypot(dx, dz) || 1;
    const nx = -dz / n;
    const nz = dx / n;
    L.push([pts[i][0] + nx * w / 2, pts[i][1] + nz * w / 2]);
    R.push([pts[i][0] - nx * w / 2, pts[i][1] - nz * w / 2]);
  }
  // shape coords: (x, -z) so that after up() the bar lands on (x, z)
  const all = [...L, ...R.reverse()];
  all.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
  sh.closePath();
  const g = extrude(sh, h, 0.04, 4);
  if (round) {
    // rounded ends: add a disc at each end
    const ends = [pts[0], pts[pts.length - 1]].map(([x, z]) => disc(w / 2, h, 20).translate(x, 0, z));
    return mergeGeos([g, ...ends]);
  }
  return g;
}
function mergeGeos(list) {
  // a tiny merge (positions, normals, uv), enough for static parts
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'uv']) {
    const arrs = geos.map((g) => g.attributes[key]?.array).filter(Boolean);
    if (arrs.length !== geos.length) continue;
    const n = arrs.reduce((s, a) => s + a.length, 0);
    const m = new Float32Array(n);
    let o = 0;
    for (const a of arrs) {
      m.set(a, o);
      o += a.length;
    }
    out.setAttribute(key, new THREE.BufferAttribute(m, geos[0].attributes[key].itemSize));
  }
  return out;
}
/** a polygon (x, z points) extruded up: plates and bridges */
function plateGeo(pts, h, holes = []) {
  const sh = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
  sh.closePath();
  for (const [x, z, r] of holes) {
    const p = new THREE.Path();
    p.absarc(x, -z, r, 0, TAU, true);
    sh.holes.push(p);
  }
  return extrude(sh, h, 0.08, 24);
}
// a rounded outline from a list of circles (x, z, r) wrapped in order: bridge outlines
function blobPts(circles, n = 10) {
  const pts = [];
  for (let i = 0; i < circles.length; i++) {
    const [x, z, r] = circles[i];
    const prev = circles[(i - 1 + circles.length) % circles.length];
    const next = circles[(i + 1) % circles.length];
    const aIn = Math.atan2(z - prev[1], x - prev[0]) - Math.PI / 2;
    let aOut = Math.atan2(next[1] - z, next[0] - x) - Math.PI / 2;
    while (aOut < aIn) aOut += TAU;
    if (aOut - aIn > TAU - 0.01) aOut = aIn + TAU - 0.01;
    for (let k = 0; k <= n; k++) {
      const a = aIn + ((aOut - aIn) * k) / n;
      pts.push([x + r * Math.cos(a), z + r * Math.sin(a)]);
    }
  }
  return pts;
}
function heartGeo(s, h) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * TAU;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    i ? sh.lineTo((x / 17) * s, (y / 17) * s + s * 0.15) : sh.moveTo((x / 17) * s, (y / 17) * s + s * 0.15);
  }
  sh.holes.push(ringPath(0.16));
  return extrude(sh, h, 0.02, 4);
}
/** a ribbon standing on edge along a spiral: n points, height h; set(i, x, z) then commit() */
function ribbon(n, h, mat) {
  const pos = new Float32Array(n * 2 * 3);
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return {
    mesh: m,
    set(i, x, z) {
      pos[i * 6] = x;
      pos[i * 6 + 1] = 0;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x;
      pos[i * 6 + 4] = h;
      pos[i * 6 + 5] = z;
    },
    commit() {
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    },
  };
}
// Côtes de Genève: soft diagonal bands, used as the bridges' colour and roughness map (uv = shape mm)
function cotes() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const u = x / 256;
    const v = 0.5 + 0.5 * Math.cos(u * TAU);
    const k = Math.round(200 + 50 * Math.pow(v, 0.6));
    g.fillStyle = `rgb(${k},${k},${k + 3})`;
    g.fillRect(x, 0, 1, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.36, 0.36);
  t.rotation = -0.5;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// perlage on the main plate: overlapping circular grains
function perlage() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c3c6cb';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const cx = x * 64 + (y % 2 ? 32 : 0);
      const cy = y * 64;
      const gr = g.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, 40);
      gr.addColorStop(0, '#dfe1e4');
      gr.addColorStop(0.7, '#cdd0d4');
      gr.addColorStop(1, '#c2c5ca');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, 40, 0, TAU);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.28, 0.28);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildMovement() {
  const root = new THREE.Group();
  const M = {
    plate: new THREE.MeshStandardMaterial({color: '#f2f3f5', map: perlage(), roughness: 0.52, metalness: 0.9, envMapIntensity: 0.6}),
    bridge: new THREE.MeshStandardMaterial({color: '#e9ebee', map: cotes(), roughness: 0.4, metalness: 1, envMapIntensity: 0.7, transparent: true, opacity: 1}),
    gold: new THREE.MeshStandardMaterial({color: '#d9b46c', roughness: 0.3, metalness: 1}),
    rose: new THREE.MeshStandardMaterial({color: '#d99a7a', roughness: 0.32, metalness: 1}),
    steel: new THREE.MeshStandardMaterial({color: '#dfe2e6', roughness: 0.18, metalness: 1}),
    dark: new THREE.MeshStandardMaterial({color: '#7d828a', roughness: 0.35, metalness: 1}),
    ruby: new THREE.MeshPhysicalMaterial({color: '#c2133e', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.4}),
    blue: new THREE.MeshStandardMaterial({color: '#2f55d4', roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide}),
    spring: new THREE.MeshStandardMaterial({color: '#b9bdc4', roughness: 0.3, metalness: 1, side: THREE.DoubleSide}),
    caseM: new THREE.MeshStandardMaterial({color: '#aeb3ba', roughness: 0.16, metalness: 1}),
    red: new THREE.MeshBasicMaterial({color: '#e3172c', transparent: true, opacity: 0.9, depthWrite: false}),
  };
  const add = (parent, geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const at = (parent, [x, z], y = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  // every part belongs to an explode layer: base y and how far it rises when the movement comes apart
  const layers = [];
  const layer = (lift, delay) => {
    const g = new THREE.Group();
    root.add(g);
    layers.push({g, lift, delay});
    return g;
  };
  const Lcase = layer(0, 0);
  const Lplate = layer(0, 0);
  const Ltrain = layer(3.5, 0.55);
  const Lbal = layer(7, 0.45);
  const Lbarrel = layer(5, 0.5);
  const Lbridge = layer(14, 0.3);
  const Lchrono = layer(21, 0.15);
  const Lrotor = layer(30, 0);

  // ------------------------------------------------------------ case ring, crown, pushers
  {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, CASE_R + 2.6, 0, TAU, false);
    sh.holes.push(ringPath(CASE_R + 0.25));
    add(Lcase, extrude(sh, 2.6, 0.25, 96), M.caseM).position.y = -1.2;
  }
  const crown = new THREE.Group();
  crown.position.set(-CASE_R - 2.5, 4.1, P.crownWheel[1]);
  Lcase.add(crown);
  const crownHead = new THREE.Group();
  crown.add(crownHead);
  {
    // a fluted screw-down crown on its tube
    const g = new THREE.CylinderGeometry(1.9, 1.9, 1.6, 36, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (r > 1.0) {
        const k = 1 - 0.07 * (0.5 + 0.5 * Math.cos(a * 18));
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
      }
    }
    g.computeVertexNormals();
    g.rotateZ(Math.PI / 2);
    const head = add(crownHead, g, M.caseM);
    head.position.x = -1.3;
    const cap = add(crownHead, new THREE.CylinderGeometry(1.5, 1.6, 0.25, 36).rotateZ(Math.PI / 2), M.steel);
    cap.position.x = -2.2;
    add(crown, new THREE.CylinderGeometry(1.05, 1.05, 1.6, 24).rotateZ(Math.PI / 2), M.caseM).position.x = 0.2;
    const stem = add(crown, new THREE.CylinderGeometry(0.28, 0.28, 6.4, 12).rotateZ(Math.PI / 2), M.steel);
    stem.position.x = 3.4;
  }
  // winding pinion on the stem, meshing the crown wheel from the side
  const windPinion = add(crown, pinionGeo(14, 0.75, 0.6).rotateZ(Math.PI / 2), M.steel);
  windPinion.position.x = 6.15;
  const pusher = (ang) => {
    const g = new THREE.Group();
    g.position.set(Math.cos(ang) * (CASE_R + 2.6), 2.4, Math.sin(ang) * (CASE_R + 2.6));
    g.rotation.y = -ang;
    Lcase.add(g);
    add(g, new THREE.CylinderGeometry(0.95, 0.95, 1.4, 24).rotateZ(Math.PI / 2), M.caseM).position.x = 0.5;
    const btn = new THREE.Group();
    g.add(btn);
    add(btn, new THREE.CylinderGeometry(1.25, 1.25, 1.8, 28).rotateZ(Math.PI / 2), M.caseM).position.x = 2.0;
    add(btn, new THREE.CylinderGeometry(1.32, 1.32, 0.4, 28).rotateZ(Math.PI / 2), M.steel).position.x = 1.1;
    return {g, btn};
  };
  const pushA = pusher(PUSH_A);
  const pushB = pusher(PUSH_B);

  // ------------------------------------------------------------ main plate: perlage, sinks, a jewel at every lower pivot
  {
    const g = disc(CASE_R, 1.0, 120);
    add(Lplate, g, M.plate).position.y = -0.2;
    for (const k of ['w2', 'w3', 'w4', 'esc', 'fork', 'bal', 'barrel', 'column', 'minute', 'inter']) {
      const j = add(Lplate, disc(k === 'bal' || k === 'barrel' ? 0.55 : 0.4, 0.06, 20), M.ruby);
      j.position.set(P[k][0], 0.83, P[k][1]);
    }
  }

  // ------------------------------------------------------------ barrel and mainspring
  const barrel = at(Lbarrel, P.barrel, 1.3);
  const drum = new THREE.Group();
  barrel.add(drum);
  add(drum, wheelGeo(96, 5.0, 0.42, {spokes: 0, hole: 4.62}), M.gold).position.y = 0.05;
  add(drum, disc(4.75, 0.18, 64, 0.0), M.gold);
  {
    const wall = new THREE.Shape();
    wall.absarc(0, 0, 4.82, 0, TAU, false);
    wall.holes.push(ringPath(4.6));
    add(drum, extrude(wall, 1.75, 0.02, 64), M.gold);
  }
  const arbor = new THREE.Group();
  barrel.add(arbor);
  add(arbor, new THREE.CylinderGeometry(1.1, 1.1, 1.6, 24), M.steel).position.y = 0.95;
  add(arbor, new THREE.CylinderGeometry(0.45, 0.45, 3.4, 16), M.steel).position.y = 1.9;
  const MS = 520;
  const mainspring = ribbon(MS, 1.35, M.spring);
  mainspring.mesh.position.y = 0.22;
  barrel.add(mainspring.mesh);
  // ratchet wheel on the arbor, above the barrel bridge, and the crown wheel driving it
  const ratchet = at(Lbridge, P.barrel, 3.95);
  add(ratchet, wheelGeo(60, 3.9, 0.38, {spokes: 0, hole: 0.5, club: true}), M.steel);
  add(ratchet, disc(1.2, 0.1, 24), M.dark).position.y = 0.38;
  const crownWheel = at(Lbridge, P.crownWheel, 3.95);
  add(crownWheel, wheelGeo(24, 1.5, 0.38, {spokes: 0, hole: 0.2}), M.steel);
  // the click: a pawl against the ratchet so it only turns one way
  {
    const [bx, bz] = P.barrel;
    const a = -0.95;
    const c = [bx + Math.cos(a) * 4.5, bz + Math.sin(a) * 4.5];
    add(Lbridge, barGeo([[c[0] + 1.6, c[1] - 0.6], c], 0.55, 0.3), M.steel).position.y = 3.98;
  }

  // ------------------------------------------------------------ going train
  const arb = (parent, y0, y1, r = 0.16) => {
    const m = add(parent, new THREE.CylinderGeometry(r, r, y1 - y0, 12), M.steel);
    m.position.y = (y0 + y1) / 2;
  };
  const w2 = at(Ltrain, P.w2);
  add(w2, wheelGeo(64, 3.8, 0.24, {spokes: 4}), M.gold).position.y = 0.95;
  add(w2, pinionGeo(12, 0.75, 1.7), M.steel).position.y = 1.35;
  arb(w2, 0.8, 3.4, 0.2);
  const w3 = at(Ltrain, P.w3);
  add(w3, pinionGeo(10, 0.65, 0.45), M.steel).position.y = 0.88;
  add(w3, wheelGeo(75, 3.3, 0.22, {spokes: 5}), M.gold).position.y = 1.5;
  arb(w3, 0.8, 3.1);
  const w4 = at(Ltrain, P.w4);
  add(w4, pinionGeo(10, 0.6, 0.45), M.steel).position.y = 1.42;
  add(w4, wheelGeo(80, 3.2, 0.22, {spokes: 5}), M.gold).position.y = 2.0;
  arb(w4, 0.8, 3.1);
  const esc = at(Ltrain, P.esc);
  add(esc, pinionGeo(8, 0.5, 0.45), M.steel).position.y = 1.92;
  // the Chronergy escape wheel: skeletonised, nickel-phosphorus grey
  add(esc, wheelGeo(15, 2.1, 0.2, {spokes: 5, club: true, depth: 0.5}), M.dark).position.y = 2.42;
  arb(esc, 0.8, 3.1, 0.13);
  // pallet fork: local +x toward the balance, -x toward the escape wheel
  const fork = at(Ltrain, P.fork, 2.42);
  {
    const [fx, fz] = P.fork;
    const toBal = Math.atan2(P.bal[1] - fz, P.bal[0] - fx);
    fork.userData.base = -toBal;
    const body = new THREE.Group();
    fork.add(body);
    body.rotation.y = -toBal;
    add(body, barGeo([[-0.2, 0], [2.55, 0]], 0.34, 0.2), M.dark);
    add(body, barGeo([[2.55, -0.32], [3.0, -0.32]], 0.16, 0.2, false), M.dark);
    add(body, barGeo([[2.55, 0.32], [3.0, 0.32]], 0.16, 0.2, false), M.dark);
    add(body, barGeo([[-0.95, -1.55], [-0.35, -0.45], [-0.35, 0.45], [-0.95, 1.55]], 0.36, 0.2), M.dark);
    for (const s of [-1, 1]) {
      const stone = add(body, new THREE.BoxGeometry(0.5, 0.24, 0.24), M.ruby);
      stone.position.set(-1.22, 0.1, s * 1.55);
      stone.rotation.y = s * 0.5;
    }
    add(body, new THREE.CylinderGeometry(0.15, 0.15, 1.4, 12), M.steel).position.y = 0.1;
  }
  // ------------------------------------------------------------ balance: rim, arms, Microstella nuts, roller, hairspring
  const bal = at(Lbal, P.bal);
  const balWheel = new THREE.Group();
  bal.add(balWheel);
  {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, 4.65, 0, TAU, false);
    sh.holes.push(ringPath(4.15));
    add(balWheel, extrude(sh, 0.48, 0.05, 96), M.gold).position.y = 2.9;
    for (const a of [0, Math.PI / 2]) {
      const arm = add(balWheel, new THREE.BoxGeometry(8.5, 0.28, 0.5), M.gold);
      arm.position.y = 3.05;
      arm.rotation.y = a + 0.4;
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4 + Math.PI / 4;
      const nut = add(balWheel, new THREE.CylinderGeometry(0.42, 0.42, 0.5, 6), M.gold);
      nut.material = M.rose;
      nut.position.set(Math.cos(a) * 3.85, 3.15, Math.sin(a) * 3.85);
    }
    add(balWheel, new THREE.CylinderGeometry(0.16, 0.16, 2.6, 12), M.steel).position.y = 3.3;
    add(balWheel, disc(1.0, 0.16, 32), M.steel).position.y = 2.42;
    const pin = add(balWheel, new THREE.CylinderGeometry(0.12, 0.12, 0.4, 10), M.ruby);
    // the impulse pin starts pointing at the fork
    const toFork = Math.atan2(P.fork[1] - P.bal[1], P.fork[0] - P.bal[0]);
    pin.position.set(Math.cos(toFork) * 0.78, 2.42, Math.sin(toFork) * 0.78);
    add(balWheel, disc(0.55, 0.3, 24), M.steel).position.y = 3.55;
  }
  const HS = 900;
  const hair = ribbon(HS, 0.16, M.blue);
  hair.mesh.position.y = 3.6;
  bal.add(hair.mesh);
  const HAIR = {r0: 0.6, r1: 3.55, turns: 13};

  // ------------------------------------------------------------ bridges (Côtes de Genève), jewels and blued screws
  const bridges = [];
  const bridge = (circles, h, y, holes = [], jewels = [], screws = []) => {
    const g = new THREE.Group();
    Lbridge.add(g);
    g.position.y = y;
    const m = add(g, plateGeo(blobPts(circles), h, holes), M.bridge);
    for (const [x, z, r = 0.45] of jewels) {
      add(g, disc(r + 0.28, 0.06, 24, r), M.steel).position.set(x, h + 0.02, z);
      add(g, disc(r, 0.08, 20), M.ruby).position.set(x, h - 0.02, z);
    }
    for (const [x, z] of screws) {
      add(g, disc(0.55, 0.22, 20), M.blue).position.set(x, h + 0.02, z);
      const slot = add(g, new THREE.BoxGeometry(0.95, 0.12, 0.14), M.dark);
      slot.position.set(x, h + 0.24, z);
      slot.rotation.y = (x * 7 + z * 3) % 3;
    }
    bridges.push({g, m});
    return g;
  };
  // barrel bridge, with a window over the mainspring
  bridge([[...P.barrel, 5.6], [-12.3, 3.6, 1.6], [-7.2, 5.4, 1.4]], 0.5, 3.35, [[...P.barrel, 0.6]], [], [[-12.3, 3.6], [-7.2, 5.4], [-9.6, -5.7]]);
  // train bridge over the third, fourth and escape wheels
  bridge([[...P.w3, 1.6], [10.4, -6.5, 1.5], [...P.w4, 1.4], [11.6, 1.4, 1.3], [...P.esc, 1.2]], 0.55, 3.1, [], [[...P.w3], [...P.w4], [...P.esc, 0.35]], [[10.4, -6.5], [11.6, 1.4]]);
  // balance cock: one arm from the rim of the plate to over the balance staff
  bridge([[11.2, 9.4, 1.6], [...P.bal, 1.35]], 0.5, 4.15, [], [[...P.bal, 0.5]], [[11.2, 9.4]]);
  // pallet bridge
  bridge([[...P.fork, 0.9], [9.6, 6.2, 0.9]], 0.4, 3.1, [], [[...P.fork, 0.3]], [[9.6, 6.2]]);
  // chronograph bridge under the column wheel and clutch lever pivot
  bridge([[...P.column, 2.8], [-12.6, -2.6, 1.4], [...P.lever, 1.3]], 0.45, 2.35, [[...P.column, 0.35]], [], [[-12.6, -2.6]]);

  // ------------------------------------------------------------ chronograph
  // column wheel: ratchet below, six columns above, a polished cap
  const column = at(Lchrono, P.column, 2.82);
  add(column, wheelGeo(12, 2.05, 0.32, {spokes: 0, hole: 0.2, club: true, depth: 0.45}), M.steel);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    const c = add(column, new THREE.BoxGeometry(0.62, 0.95, 0.62), M.steel);
    c.position.set(Math.cos(a) * 1.25, 0.8, Math.sin(a) * 1.25);
    c.rotation.y = -a;
  }
  add(column, new THREE.CylinderGeometry(0.75, 0.75, 0.95, 24), M.steel).position.y = 0.8;
  add(column, disc(1.65, 0.16, 36, 0.2), M.steel).position.y = 1.3;
  // vertical clutch at the centre: the lower disc on the centre arbor, the upper one under the runner; open, a gap
  const clutch = at(Lchrono, P.w2);
  add(clutch, disc(1.55, 0.3, 40, 0.22), M.gold).position.y = 3.55;
  const clutchUp = new THREE.Group();
  clutch.add(clutchUp);
  add(clutchUp, disc(1.55, 0.3, 40, 0.22), M.steel).position.y = 3.9;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    const sp = add(clutchUp, barGeo([[Math.cos(a) * 0.7, Math.sin(a) * 0.7], [Math.cos(a + 1.6) * 1.35, Math.sin(a + 1.6) * 1.35]], 0.16, 0.08, false), M.blue);
    sp.position.y = 4.22;
  }
  // chronograph runner (centre seconds wheel) with its heart cam
  const runner = at(Lchrono, P.w2);
  add(runner, wheelGeo(90, 3.0, 0.2, {spokes: 5}), M.rose).position.y = 4.5;
  add(runner, heartGeo(1.05, 0.25), M.steel).position.y = 4.95;
  arb(runner, 3.4, 5.6, 0.2);
  // intermediate wheel and 30-minute counter with its heart
  const inter = at(Lchrono, P.inter);
  add(inter, wheelGeo(12, 0.7, 0.22, {spokes: 0, hole: 0.1}), M.steel).position.y = 4.5;
  arb(inter, 3.4, 5.0, 0.1);
  const minute = at(Lchrono, P.minute);
  add(minute, wheelGeo(30, 1.6, 0.2, {spokes: 3}), M.rose).position.y = 4.5;
  add(minute, heartGeo(0.8, 0.25), M.steel).position.y = 4.95;
  arb(minute, 3.4, 5.5, 0.12);
  // clutch lever: beak on the column wheel, pivot, fork under the clutch
  const lever = at(Lchrono, P.lever, 4.45);
  {
    const [px, pz] = P.lever;
    const rel = (x, z) => [x - px, z - pz];
    const toCol = Math.atan2(P.column[1] - pz, P.column[0] - px);
    const beak = [P.column[0] - Math.cos(toCol) * 1.75, P.column[1] - Math.sin(toCol) * 1.75];
    add(lever, barGeo([rel(...beak), rel(px, pz), rel(-2.0, -1.4), rel(-1.25, -0.2)], 0.5, 0.25), M.steel);
    add(lever, disc(0.55, 0.3, 20), M.blue).position.y = 0.02;
    lever.userData.beak = rel(...beak);
  }
  // operating lever from the start/stop pusher to the column wheel's ratchet
  const opLever = new THREE.Group();
  Lchrono.add(opLever);
  {
    const a = PUSH_A;
    const from = [Math.cos(a) * (CASE_R - 0.6), Math.sin(a) * (CASE_R - 0.6)];
    const to = [P.column[0] + 1.2, P.column[1] + 1.95];
    add(opLever, barGeo([from, [from[0] + 1.6, from[1] + 2.4], to], 0.45, 0.22), M.steel).position.y = 2.85;
    opLever.userData.dir = [Math.cos(a), Math.sin(a)];
  }
  // reset hammer: pivot, one head for the runner's heart, one for the counter's
  const hammer = at(Lchrono, P.hammer, 4.98);
  {
    const [hx, hz] = P.hammer;
    const rel = (x, z) => [x - hx, z - hz];
    add(hammer, barGeo([rel(hx, hz), rel(-3.6, 2.6), rel(-0.9, 1.4)], 0.55, 0.26), M.steel);
    add(hammer, barGeo([rel(-3.6, 2.6), rel(-2.1, 5.2)], 0.45, 0.26), M.steel);
    add(hammer, disc(0.6, 0.3, 20), M.blue).position.y = 0.02;
    const resetLever = add(Lchrono, barGeo([[Math.cos(PUSH_B) * (CASE_R - 0.6), Math.sin(PUSH_B) * (CASE_R - 0.6)], [-11.2, 5.6], [hx - 0.8, hz + 0.4]], 0.42, 0.22), M.steel);
    resetLever.position.y = 5.0;
  }

  // ------------------------------------------------------------ the rotor: a skeleton half-moon on a centre bearing
  const rotor = at(Lrotor, [0, 0], 6.3);
  {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, 14.6, Math.PI * 1.02, Math.PI * 1.98, false);
    sh.absarc(0, 0, 2.3, Math.PI * 1.98, Math.PI * 1.02, true);
    sh.closePath();
    // cut-outs: three windows through the weight
    for (const [a0, a1] of [[1.12, 1.34], [1.4, 1.6], [1.66, 1.88]]) {
      const w = new THREE.Path();
      w.absarc(0, 0, 11.2, Math.PI * a0, Math.PI * a1, false);
      w.absarc(0, 0, 4.2, Math.PI * a1, Math.PI * a0, true);
      w.closePath();
      sh.holes.push(w);
    }
    add(rotor, extrude(sh, 0.45, 0.06, 64), M.bridge);
    const rim = new THREE.Shape();
    rim.absarc(0, 0, 14.6, Math.PI * 1.02, Math.PI * 1.98, false);
    rim.absarc(0, 0, 12.2, Math.PI * 1.98, Math.PI * 1.02, true);
    rim.closePath();
    add(rotor, extrude(rim, 0.95, 0.08, 64), M.gold).position.y = -0.25;
    add(rotor, disc(2.3, 0.7, 40, 0.4), M.steel).position.y = -0.1;
    add(rotor, disc(1.0, 0.2, 24), M.ruby).position.y = 0.55;
  }

  // ------------------------------------------------------------ red overlay arrows: balance swing, crown turn
  const arrow = (r, span) => {
    const g = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 8, 48, span), M.red);
    arc.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 16), M.red);
    tip.position.set(Math.cos(span) * r, 0, -Math.sin(span) * r);
    tip.rotation.set(0, span, Math.PI / 2);
    tip.rotation.order = 'YXZ';
    g.add(arc, tip);
    g.renderOrder = 5;
    return g;
  };
  const balArrow = arrow(5.6, 1.1);
  balArrow.position.y = 3.2;
  bal.add(balArrow);
  const crownArrow = new THREE.Group();
  {
    const a = arrow(2.8, 4.2);
    a.rotation.z = Math.PI / 2;
    crownArrow.add(a);
  }
  crownArrow.position.set(-1.0, 0, 0);
  crown.add(crownArrow);

  // ------------------------------------------------------------ pose
  const S = {xray: 0, rotorShown: 1};
  const update = (st) => {
    const ex = st.explode ?? 0;
    for (const L of layers) L.g.position.y = L.lift * s5((ex - L.delay * 0.6) / 0.55);
    // rotor: lifted off and hidden, or riding
    const rOn = st.rotor ?? 1;
    Lrotor.position.y += (1 - rOn) * 22;
    Lrotor.visible = rOn > 0.02;
    rotor.rotation.y = -st.rotorAngle * D2R;
    // bridges: solid, or x-rayed so the wheels show through
    const xr = st.xray ?? 0;
    M.bridge.opacity = 1 - 0.8 * xr;
    M.bridge.depthWrite = xr < 0.5;
    for (const b of bridges) b.m.renderOrder = xr > 0.01 ? 4 : 0;

    // the train
    const A = st.train;
    w2.rotation.y = A.w2 * D2R;
    w3.rotation.y = A.w3 * D2R;
    w4.rotation.y = A.w4 * D2R;
    esc.rotation.y = A.esc * D2R;
    drum.rotation.y = A.barrel * D2R;
    fork.rotation.y = st.fork * D2R;
    balWheel.rotation.y = st.balance * D2R;
    // the hairspring: the inner end turns with the balance, the outer end is held at the stud
    {
      const phi = st.balance * D2R;
      const {r0, r1, turns} = HAIR;
      for (let i = 0; i < HS; i++) {
        const u = i / (HS - 1);
        const k = 1 - u;
        const r = r0 + (r1 - r0) * u + 0.035 * phi * k * u * 3;
        const a = u * turns * TAU + phi * k;
        hair.set(i, r * Math.cos(a), -r * Math.sin(a));
      }
      hair.commit();
    }
    // the mainspring: wound, the coils hug the arbor; run down, they lie against the barrel wall
    {
      const w = clamp(st.reserve / 72, 0, 1);
      const inA = 1.15;
      const inB = 1.15 + 1.25 + 0.6 * (1 - w);
      const outA = 3.1;
      const outB = 4.55;
      const lo = outA + (inA - outA) * w;
      const hi = outB + (inB - outB) * w;
      const turns = 9;
      const arbA = st.arbor * D2R;
      const drA = A.barrel * D2R;
      for (let i = 0; i < MS; i++) {
        const u = i / (MS - 1);
        let r;
        let a;
        if (u < 0.06) {
          // the inner end: a short lead from the arbor's hook out to the coils
          const v = u / 0.06;
          r = 1.15 + (lo - 1.15) * v;
          a = arbA + v * 0.8;
        } else {
          const v = (u - 0.06) / 0.94;
          r = lo + (hi - lo) * v;
          a = arbA + 0.8 + v * turns * TAU + (drA - arbA) * v;
        }
        mainspring.set(i, r * Math.cos(a), -r * Math.sin(a));
      }
      mainspring.commit();
    }
    arbor.rotation.y = st.arbor * D2R;
    ratchet.rotation.y = st.arbor * D2R;
    crownWheel.rotation.y = -st.arbor * D2R * (60 / 24);
    crownHead.rotation.x = st.crown * D2R;
    windPinion.rotation.x = st.crown * D2R;

    // chronograph
    column.rotation.y = -st.column * D2R;
    const engaged = st.clutch; // 0 open .. 1 closed
    clutchUp.position.y = 0.32 * (1 - engaged);
    lever.rotation.y = (1 - engaged) * 3.2 * D2R;
    runner.rotation.y = -st.chronoSec * D2R;
    inter.rotation.y = st.chronoSec * D2R * (90 / 12);
    minute.rotation.y = -st.chronoMin * D2R;
    hammer.rotation.y = (-7 + 7 * st.hammer) * D2R;
    const pa = st.pushA * 0.7;
    pushA.btn.position.x = -pa;
    opLever.position.set(-opLever.userData.dir[0] * pa, 0, -opLever.userData.dir[1] * pa);
    pushB.btn.position.x = -st.pushB * 0.7;

    // overlays
    const arrows = st.arrows ?? 1;
    const sw = Math.cos(2 * Math.PI * 4 * st.tau);
    balArrow.visible = arrows > 0.01 && st.balanceAmp > 0;
    balArrow.rotation.y = sw > 0 ? 0.3 : Math.PI + 0.3;
    balArrow.scale.set(1, 1, sw > 0 ? 1 : -1);
    crownArrow.visible = arrows > 0.01 && st.winding > 0.02;
    crownArrow.scale.setScalar(Math.max(0.01, st.winding));
  };
  root.scale.setScalar(0.01);
  // world-space anchor points (metres) for callouts, following the explode
  const anchors = () => {
    const w = (obj, x = 0, y = 0, z = 0) => obj.localToWorld(new V3(x, y, z));
    root.updateMatrixWorld(true);
    return {
      balance: w(bal, 4.4, 3.2, 1.2),
      hair: w(bal, -2.4, 3.7, -1.3),
      fork: w(fork, 0, 0.2, 0),
      esc: w(esc, 1.6, 2.5, -1.0),
      barrel: w(barrel, -1.2, 1.8, 3.6),
      column: w(column, 0, 1.4, 0),
      clutch: w(clutch, 1.2, 4.2, 0.9),
      runner: w(runner, 2.4, 4.7, 1.2),
      hammer: w(hammer, 1.4, 0.2, -0.9),
      crown: w(crown, -2.2, 0, 0),
      train: w(w4, -1.8, 2.1, 1.6),
      rotor: w(rotor, -6, 0.5, 6),
      minute: w(minute, 0.8, 4.7, 0.6),
    };
  };
  const crownPick = [crownHead];
  return {root, update, anchors, M, crownPick, S};
}
