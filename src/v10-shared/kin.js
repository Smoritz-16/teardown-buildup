// V10 kinematics: the Lamborghini Huracán / Audi R8 5.2 FSI. 90° V, five shared crankpins 72° apart, firing order
// 1-6-5-10-2-7-3-8-4-9, so the gaps between power strokes alternate 90° and 54° (the 5.2's uneven firing). Bore 84.5,
// stroke 92.8, rod 154, bore spacing 90, compression 12.5:1. The piston of every cylinder from the exact slider-crank,
// valve lift over the 720° cycle, and a chamber pressure model for the indicator diagram. Engine space is millimetres:
// crank axis on z (front = +z), y up.
export const E = {bore: 84.5, r: 46.4, rod: 154, comp: 30, deck: 238, pinZ: [180, 90, 0, -90, -180], rodOff: 9, cr: 12.5};
export const STROKE = 2 * E.r;
const S = Math.SQRT1_2;
// bank frames in the XY plane: b along the cylinder axis, p outward across the bank
export const BANK = {
  L: {b: [S, S], p: [S, -S], sign: 1},
  R: {b: [-S, S], p: [-S, -S], sign: -1},
};
// cylinders 1..10: bank 1 (1-5) on the right (-x), bank 2 (6-10) on the left (+x); 1 and 6 share the front pin
export const CYL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => {
  const left = c > 5;
  const pin = (c - 1) % 5;
  return {c, bank: left ? 'L' : 'R', pin, z: E.pinZ[pin] + (left ? E.rodOff : -E.rodOff)};
});
export const ORDER = [1, 6, 5, 10, 2, 7, 3, 8, 4, 9];
// firing TDC of each cylinder in crank degrees: 90° to the partner on the same pin, then 54° to the next pin
export const FIRE = {1: 0, 6: 90, 5: 144, 10: 234, 2: 288, 7: 378, 3: 432, 8: 522, 4: 576, 9: 666};
export const GAPS = ORDER.map((c, i) => ((FIRE[ORDER[(i + 1) % 10]] - FIRE[c] + 720) % 720));
// pin angles clockwise from +y seen from the front, from the firing order: phase = bank angle - TDC angle
export const PIN_PHASE = [315, 27, 243, 99, 171];
const mod = (a, m) => ((a % m) + m) % m;

export const bankXY = (bank, w, d) => {
  const B = BANK[bank];
  return [d * B.b[0] + w * B.p[0], d * B.b[1] + w * B.p[1]];
};
export const pinXY = (p, th) => {
  const a = ((th + PIN_PHASE[p]) * Math.PI) / 180;
  return [E.r * Math.sin(a), E.r * Math.cos(a)];
};
/** cylinder index i (0-based): the piston pin's distance along the bank axis, the crank pin, the pin point */
export const piston = (i, th) => {
  const cy = CYL[i];
  const B = BANK[cy.bank];
  const P = pinXY(cy.pin, th);
  const pb = P[0] * B.b[0] + P[1] * B.b[1];
  const pp = P[0] * B.p[0] + P[1] * B.p[1];
  const s = pb + Math.sqrt(E.rod * E.rod - pp * pp);
  return {s, P, pin: [s * B.b[0], s * B.b[1]]};
};
// the pin distance at TDC and BDC (the same for every cylinder)
export const S_TDC = E.r + E.rod;
export const S_BDC = E.rod - E.r;
/** four-stroke phase of cylinder c in degrees after its firing TDC: 0-180 power, 180-360 exhaust, 360-540 intake, 540-720 compression */
export const psi = (c, th) => mod(th - FIRE[c], 720);
export const STROKES = ['POWER', 'EXHAUST', 'INTAKE', 'COMPRESSION'];
export const strokeOf = (ps) => STROKES[Math.floor(mod(ps, 720) / 180)];

// valves: lift 0..1 as a smooth bump between opening and closing (degrees after firing TDC)
export const VALVE = {ex: [140, 380], in: [340, 580], lift: 10.5};
const bump = (ps, [a, b]) => {
  const x = (mod(ps - a, 720)) / (b - a);
  return x >= 0 && x <= 1 ? Math.sin(Math.PI * x) ** 2 : 0;
};
export const liftEx = (ps) => bump(ps, VALVE.ex);
export const liftIn = (ps) => bump(ps, VALVE.in);
/** piston position as a fraction of the stroke from TDC (0 at TDC, 1 at BDC), at phase ps */
export const pistonFrac = (ps) => {
  const a = (ps * Math.PI) / 180;
  const sp = E.r * Math.cos(a) + Math.sqrt(E.rod * E.rod - (E.r * Math.sin(a)) ** 2);
  return (S_TDC - sp) / STROKE;
};
/** cylinder volume in units of the clearance volume (1 at TDC, cr at BDC) */
export const volume = (ps) => 1 + (E.cr - 1) * pistonFrac(ps);
/** chamber pressure in bar: a polytropic compression, a fast burn just after TDC, a polytropic expansion */
export const pressure = (ps) => {
  ps = mod(ps, 720);
  const V = volume(ps);
  if (ps >= 360 && ps < 540) return 0.9;
  if (ps >= 180 && ps < 360) return 1.1 + 0.4 * Math.max(0, 1 - (ps - 180) / 40);
  if (ps >= 540) return Math.max(0.9, 0.95 * Math.pow(E.cr / V, 1.32));
  // power: the burn rises over the first 10 degrees, then the gas expands
  const comp = 0.95 * Math.pow(E.cr / V, 1.32);
  const burn = 54 * Math.pow(1 / V, 1.28);
  const k = Math.min(1, ps / 10);
  return Math.max(1.1, comp + (burn - comp) * (k * k * (3 - 2 * k)));
};
/** the charge colour key: 0 air & fuel, 1 compressed, 2 combustion, 3 exhaust */
export const chargeOf = (ps) => {
  ps = mod(ps, 720);
  if (ps < 60) return 2;
  if (ps < 360) return 3;
  if (ps < 540) return 0;
  return 1;
};
