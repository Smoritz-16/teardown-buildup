// Cosmograph Daytona, calibre 4131: the truth model. One input, the movement's own time tau (seconds the balance has
// actually swung), poses every part and feeds every readout. Published figures: 4 Hz (28,800 vph), ~72 h reserve,
// 47 jewels, column wheel + vertical clutch, 12 h chronograph, 30.5 mm across. Tooth counts are a study model: the
// ratios are the real ones every watch needs (escape wheel x16 = fourth wheel at 1 rev/min, x60 = centre wheel at 1
// rev/h), the counts themselves are illustrative. No three.js here.
export const W = {hz: 4, vph: 28800, reserveH: 72, jewels: 47, dia: 30.5, escTeeth: 15, columns: 6, ratchet: 12};
export const BEAT_HZ = 2 * W.hz; // 8 beats a second: the tick you hear
const PITCH = 360 / W.escTeeth / 2; // escape wheel turns half a tooth per beat: 12 degrees
// train, in revolutions of each arbor per revolution of the fourth wheel (signs alternate mesh by mesh)
export const TRAIN = [
  {id: 'esc', name: 'Escape wheel', ratio: -16, teeth: 15},
  {id: 'w4', name: 'Fourth wheel', ratio: 1, teeth: 80},
  {id: 'w3', name: 'Third wheel', ratio: -1 / 8, teeth: 75},
  {id: 'w2', name: 'Centre wheel', ratio: 1 / 60, teeth: 64},
  {id: 'barrel', name: 'Barrel', ratio: -1 / 360, teeth: 96},
];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const s5 = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

/** balance amplitude in degrees either side of rest: healthy above ~36 h of reserve, falling as the spring runs down */
export const amplitude = (resH) => (resH <= 0 ? 0 : 205 + 105 * clamp(resH / 36, 0, 1));
/** balance angle in degrees at movement time tau */
export const balance = (tau, A) => A * Math.sin(2 * Math.PI * W.hz * tau);
/** beat geometry: i, the beat count; f, 0..1 through the impulse that sits on each zero crossing of the balance */
const IMP = 0.1; // the impulse and drop take a fifth of a beat, centred on the crossing
const beatAt = (tau) => {
  const u = tau * BEAT_HZ; // zero crossings of sin(2pi 4 t) fall every 1/8 s, at u integers
  const i = Math.floor(u + IMP);
  return {u, i, f: s5((u + IMP - i) / (2 * IMP))};
};
/** escape wheel angle in degrees: still between beats, half a tooth on each one */
export const escAngle = (tau) => {
  const {i, f} = beatAt(tau);
  return PITCH * (i - 1 + f);
};
/** pallet fork angle in degrees: banked against one pin, flicked to the other on every beat */
export const forkAngle = (tau) => {
  const {i, f} = beatAt(tau);
  const side = (k) => (k % 2 === 0 ? -1 : 1);
  return 9 * (side(i - 1) + (side(i) - side(i - 1)) * f);
};
/** the seconds the train has actually advanced: 1/8 s per beat, so hands and chronograph move in eight steps a second */
export const trainSeconds = (tau) => escAngle(tau) / PITCH / BEAT_HZ + 1 / (2 * BEAT_HZ);
/** every arbor's angle in degrees from the seconds the train has advanced (fourth wheel: 6 deg/s) */
export const trainAngles = (sec) => Object.fromEntries(TRAIN.map((w) => [w.id, sec * 6 * w.ratio]));
/** rev period of every arbor in seconds */
export const period = (w) => 60 / Math.abs(w.ratio);

// chronograph: the column wheel advances one ratchet tooth per push of the start/stop pusher. Between columns the
// clutch lever drops and the vertical clutch closes; on a column it is lifted and the clutch opens.
export const COLUMN_STEP = 360 / W.ratchet; // 30 degrees a push
export const chronoRunning = (pushes) => pushes % 2 === 1;
/** hands of the chronograph from elapsed seconds: centre seconds, 30-minute counter (jumps each minute), 12 h counter */
export const chronoHands = (el) => ({sec: (el % 60) * 6, min: Math.floor(el / 60) % 30 * 12, hr: ((el / 3600) % 12) * 30});
export const fmtElapsed = (el) => {
  const h = Math.floor(el / 3600);
  const m = Math.floor(el / 60) % 60;
  const s = el % 60;
  return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0').slice(0, 5)}`;
};
// winding: a study figure, about 45 turns of the crown from empty to full
export const H_PER_CROWN_TURN = 1.6;
// the rotor: bidirectional, about one hour of reserve per 650 turns of the weight (a study figure)
export const H_PER_ROTOR_TURN = 1 / 650;
