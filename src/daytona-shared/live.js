// The Daytona as a page you drive. The movement (movement.js) on the pale studio (stage.js) under a fixed 1600 x 900
// console: elapsed time and the balance trace on the left, the dial and the gear train on the right, the chronograph
// pushers at the bottom, camera / layers / overlays bottom right. Every number reads from kin.js through one input,
// tau, the movement's own time. Drag the crown to wind it; drag anywhere else to orbit (it swings the rotor too).
// Left alone it tours itself; any input hands over control, 25 s of quiet hands it back.
import * as THREE from 'three';
import {warmComposer} from '../kit/warm.js';
import {amplitude, balance, chronoHands, chronoRunning, COLUMN_STEP, escAngle, fmtElapsed, forkAngle, H_PER_CROWN_TURN, H_PER_ROTOR_TURN, period, TRAIN, trainAngles, trainSeconds, W} from './kin.js';
import {P} from './movement.js';
import {createWatchStage} from './stage.js';

const SW = 1600;
const SH = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const s5 = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const ease = (cur, tgt, dt, tc) => cur + (tgt - cur) * (1 - Math.exp(-dt / tc));
const PLAYS = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1];
const playText = (p) => (p >= 1 ? 'REAL TIME' : `1 / ${Math.round(1 / p)} SPEED`);
const C = {ink: '#16181b', mute: '#8b8f95', faint: '#c9ccd0', line: '#e1e3e6', panel: 'rgba(248,248,249,.94)', red: '#d6182b', blue: '#2f55d4', gold: '#b8924a'};

export const CAMS = ['hero', 'top', 'balance', 'escape', 'chrono', 'crown'];
const LAYERS = ['rotor', 'xray', 'explode'];
const OVER = ['callouts', 'arrows'];
const mm = (v) => v * 0.01;
const VIEWS = {
  hero: () => ({tx: 0, ty: 0.02, tz: 0.005, az: 22, el: 44, d: 1.12}),
  top: () => ({tx: 0, ty: 0, tz: 0.01, az: 0, el: 72, d: 1.22}),
  balance: () => ({tx: mm(P.bal[0]), ty: 0.03, tz: mm(P.bal[1]), az: 34, el: 50, d: 0.78}),
  escape: () => ({tx: mm(7.4), ty: 0.025, tz: mm(2.6), az: -14, el: 62, d: 0.56}),
  chrono: () => ({tx: mm(-4.4), ty: 0.04, tz: mm(-1.8), az: -30, el: 52, d: 0.98}),
  crown: () => ({tx: mm(-13.6), ty: 0.035, tz: mm(-1.0), az: -62, el: 26, d: 0.68}),
};
// which callouts each view shows
const CALLS = {
  hero: ['balance', 'barrel', 'column', 'crown', 'rotor'],
  top: ['balance', 'esc', 'train', 'barrel', 'clutch', 'column'],
  balance: ['balance', 'hair', 'fork'],
  escape: ['esc', 'fork', 'train'],
  chrono: ['column', 'clutch', 'runner', 'hammer', 'minute'],
  crown: ['crown', 'barrel'],
};

// the tour: a 56 s loop of camera moves, layer changes and pusher presses
const TOUR = [
  {t: 0, cam: 'hero', set: {rotor: 1, xray: 0, explode: 0, play: 3}, cap: 'Calibre 4131 from the case back. Drag to look around; the page tours itself when left alone.', wrist: true},
  {t: 6, cam: 'hero', set: {rotor: 0}, cap: 'Lift the rotor: the going train, the balance and the chronograph sit underneath.'},
  {t: 10, cam: 'balance', set: {play: 1, xray: 1}, cap: 'The balance swings about ±300°, four full swings a second: 28,800 beats an hour.'},
  {t: 17, cam: 'escape', set: {xray: 1}, cap: 'On every beat the pallet fork flicks across and the escape wheel moves on half a tooth.'},
  {t: 24, cam: 'top', set: {play: 3}, cap: '×16 to the fourth wheel (1 rev a minute, small seconds), ×60 to the centre wheel (1 rev an hour).'},
  {t: 29, cam: 'chrono', set: {xray: 0}, cap: 'Start: the column wheel steps one tooth, the lever drops between columns, the vertical clutch closes.', at: [[30.5, 'start']]},
  {t: 36, cam: 'hero', set: {explode: 1}, cap: 'Taken apart: each layer lifts off along the arbors it turns on.'},
  {t: 41, cam: 'chrono', set: {explode: 0}, cap: 'Stop, then reset: the hammer strikes both heart cams back to zero.', at: [[42.6, 'start'], [44.6, 'reset']]},
  {t: 47, cam: 'crown', set: {}, cap: 'Turn the crown to wind the mainspring: about 45 turns from empty to 72 hours.', wind: [47.8, 52.5]},
  {t: 53, cam: 'hero', set: {rotor: 1}, cap: 'Calibre 4131 · 4 Hz · 72 h · 47 jewels · column wheel and vertical clutch.'},
];
const TOUR_LEN = 56;

const CSS = `
html,body{background:#ecedef;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${SW}px;height:${SH}px;transform-origin:0 0;font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
#gl.crown{cursor:ns-resize}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(20,22,26,.04)}
.cp{font-size:9.6px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.tb{position:absolute;height:19px;padding:0 7px;display:flex;align-items:center;justify-content:center;font-size:8.8px;font-weight:600;letter-spacing:.9px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;color:${C.ink};white-space:nowrap;pointer-events:auto;cursor:pointer;user-select:none}
.tb:hover{filter:brightness(.95)}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:11.5px;font-weight:600;letter-spacing:.1px}
.call span{display:block;font-size:8.6px;font-weight:500;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;margin-top:2px}
.tourchip{position:absolute;left:800px;top:62px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:21px;padding:0 11px;border:1px solid #e1e3e6;background:rgba(255,255,255,.95);color:#16181b;font:600 8.8px Inter,sans-serif;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:${C.red}}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.cap{position:absolute;left:50%;transform:translateX(-50%);max-width:900px;top:94px;padding:6px 14px;background:rgba(255,255,255,.88);border:1px solid ${C.line};text-align:center;font-size:12.5px;font-weight:500;color:${C.ink};transition:opacity .4s;white-space:nowrap}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#8b8f95;text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};

function createConsole(app) {
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const btn = {};
  // ------------------------------------------------------------ title and the chronograph readout
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:47px;font-size:24px;font-weight:700;letter-spacing:-.2px">Daytona <span style="color:${C.red}">·</span> Calibre 4131</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.7px;font-size:9.4px">SELF-WINDING CHRONOGRAPH &nbsp;•&nbsp; 4 HZ &nbsp;•&nbsp; 72 H &nbsp;•&nbsp; 47 JEWELS</div>`);
  const big = add(`<div style="position:absolute;left:33px;top:103px;font-size:52px;font-weight:800;letter-spacing:-2.6px;line-height:1"></div>`);
  add(`<div style="position:absolute;left:35px;top:166px;width:247px;height:1px;background:${C.faint}"></div>`);
  const bigSub = add(`<div class="cp" style="position:absolute;left:35px;top:174px;font-weight:500;font-size:9px"></div>`);
  const timeNow = add(`<div class="cp" style="position:absolute;right:${SW - 282}px;top:174px;font-weight:500;font-size:9px"></div>`);
  add(`<div style="position:absolute;left:35px;top:192px;width:247px;height:1px;background:${C.faint}"></div>`);
  add(`<div style="position:absolute;left:35px;top:200px;font-size:12.5px;font-weight:500">Chronograph</div>`);

  // ------------------------------------------------------------ balance trace
  add(`<div class="pn" style="left:35px;top:236px;width:247px;height:212px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:248px;font-weight:700">BALANCE</div>`);
  const balHz = add(`<div class="cp mu" style="position:absolute;right:${SW - 271}px;top:248px;font-weight:500"></div>`);
  const trace = add(`<svg style="position:absolute;left:46px;top:266px" width="226" height="120"></svg>`);
  add(`<div style="position:absolute;left:46px;top:392px;width:226px;height:1px;background:${C.line}"></div>`);
  const balRead = add(`<div style="position:absolute;left:46px;top:400px;font-size:9.5px;color:${C.mute};line-height:1.6"></div>`);

  // ------------------------------------------------------------ power reserve
  add(`<div class="pn" style="left:35px;top:456px;width:247px;height:186px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:468px;font-weight:700">POWER RESERVE</div>`);
  const resState = add(`<div class="cp mu" style="position:absolute;right:${SW - 271}px;top:468px;font-weight:500"></div>`);
  const resBig = add(`<div style="position:absolute;left:45px;top:486px;font-size:36px;font-weight:800;letter-spacing:-1.6px;line-height:1"></div>`);
  const resUnit = add(`<div style="position:absolute;top:497px;font-size:10.5px;font-weight:500;letter-spacing:1px;line-height:1.35">H<br><span style="color:${C.mute};letter-spacing:1.5px">OF 72 LEFT</span></div>`);
  const resBar = add(`<svg style="position:absolute;left:46px;top:530px" width="226" height="30"></svg>`);
  const resRead = add(`<div style="position:absolute;left:46px;top:566px;font-size:9.5px;color:${C.mute};line-height:1.6"></div>`);
  btn.wind = add(`<div class="tb" style="left:46px;top:610px;width:108px;height:22px">WIND THE CROWN</div>`);
  btn.drain = add(`<div class="tb" style="left:160px;top:610px;width:112px;height:22px">LET IT RUN DOWN</div>`);

  // ------------------------------------------------------------ transport
  add(`<div class="pn" style="left:35px;top:796px;width:259px;height:89px"></div>`);
  btn.pause = add(`<div class="tb" style="left:45px;top:804px;width:99px;height:26px;background:${C.red};color:#fff;border-color:${C.red};font-size:9.6px">❚❚ &nbsp;PAUSE</div>`);
  btn.slower = add(`<div class="tb" style="left:149px;top:804px;width:66px;height:26px;font-size:9.6px">SLOWER</div>`);
  btn.faster = add(`<div class="tb" style="left:219px;top:804px;width:66px;height:26px;font-size:9.6px">FASTER</div>`);
  add(`<div class="cp" style="position:absolute;left:45px;top:840px;font-weight:500">PLAYBACK</div>`);
  const playVal = add(`<div class="cp" style="position:absolute;right:${SW - 284}px;top:840px;font-weight:700"></div>`);
  const SL = {x: 46, w: 238};
  add(`<div style="position:absolute;left:${SL.x}px;top:862px;width:${SL.w}px;height:2px;background:#e1e3e6"></div>`);
  const playKnob = add(`<div style="position:absolute;top:857px;width:9px;height:11px;margin-left:-4.5px;background:${C.red}"></div>`);
  const playHit = add(`<div style="position:absolute;left:${SL.x - 6}px;top:850px;width:${SL.w + 12}px;height:24px;pointer-events:auto;cursor:ew-resize"></div>`);

  // ------------------------------------------------------------ the dial
  add(`<div class="pn" style="left:1318px;top:36px;width:245px;height:262px"></div>`);
  add(`<div class="cp" style="position:absolute;left:1329px;top:47px;font-weight:700">DIAL SIDE</div>`);
  const dialT = add(`<div class="cp mu" style="position:absolute;right:${SW - 1552}px;top:47px;font-weight:500"></div>`);
  const dial = add(`<svg style="position:absolute;left:1328px;top:64px" width="226" height="226" viewBox="-113 -113 226 226"></svg>`);

  // ------------------------------------------------------------ gear train
  add(`<div class="pn" style="left:1318px;top:306px;width:245px;height:236px"></div>`);
  add(`<div class="cp" style="position:absolute;left:1329px;top:318px;font-weight:700">GOING TRAIN</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${SW - 1552}px;top:318px;font-weight:500">ONE REV EVERY</div>`);
  const trainSvg = add(`<svg style="position:absolute;left:1326px;top:334px" width="232" height="204"></svg>`);

  // ------------------------------------------------------------ chronograph pushers, bottom centre
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:790px;text-align:center;font-weight:500"><span style="color:${C.ink}">CHRONOGRAPH</span> &nbsp;— &nbsp;THE TWO PUSHERS</div>`);
  btn.start = add(`<div class="tb" style="left:676px;top:810px;width:120px;height:28px;font-size:10px;background:${C.red};color:#fff;border-color:${C.red}">START</div>`);
  btn.reset = add(`<div class="tb" style="left:804px;top:810px;width:120px;height:28px;font-size:10px">RESET</div>`);
  const chronoState = add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:848px;text-align:center;font-weight:500"></div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:872px;text-align:center;font-weight:500;color:${C.faint}">DRAG TO ORBIT &nbsp;·&nbsp; DRAG THE CROWN TO WIND &nbsp;·&nbsp; SPACE START / STOP &nbsp;·&nbsp; R RESET &nbsp;·&nbsp; H HIDES THE OVERLAY</div>`);

  // ------------------------------------------------------------ camera, layers, overlays
  add(`<div class="pn" style="left:1296px;top:720px;width:268px;height:165px"></div>`);
  const group = (title, keys, y) => {
    add(`<div class="cp mu" style="position:absolute;left:1305px;top:${y}px;font-weight:500">${title}</div>`);
    let x = 1305;
    let yy = y + 15;
    keys.forEach((k) => {
      const lab = k === 'xray' ? 'X-RAY' : k.toUpperCase();
      const w = Math.round(lab.length * 6.2 + 14);
      if (x + w > 1556) {
        x = 1305;
        yy += 23;
      }
      btn[k] = add(`<div class="tb" style="left:${x}px;top:${yy}px;width:${w}px">${lab}</div>`);
      x += w + 4;
    });
  };
  group('CAMERA', CAMS, 727);
  group('LAYERS', LAYERS, 794);
  group('OVERLAYS', OVER, 838);

  // ------------------------------------------------------------ callouts, caption
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="${SW}" height="${SH}"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const cap = add(`<div class="cap"></div>`);

  // static dial furniture: tachymetre bezel (graduated by 3600 / seconds), three counters, indices
  const dialStatic = (() => {
    let h = `<circle r="112" fill="#16181b"/><circle r="92" fill="#f4f4f2" stroke="#d0d2d6"/>`;
    for (const v of [400, 300, 250, 200, 170, 150, 130, 120, 110, 100, 90, 85, 80, 75, 70, 65, 60]) {
      const a = (3600 / v) * 6 * D2R;
      const x = Math.sin(a) * 102;
      const y = -Math.cos(a) * 102;
      h += `<text x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}" font-size="7" font-weight="600" text-anchor="middle" fill="#f4f4f2" transform="rotate(${((3600 / v) * 6).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${v}</text>`;
    }
    for (let i = 0; i < 60; i++) {
      const a = i * 6 * D2R;
      const r0 = i % 5 ? 86 : 82;
      h += `<line x1="${(Math.sin(a) * r0).toFixed(1)}" y1="${(-Math.cos(a) * r0).toFixed(1)}" x2="${(Math.sin(a) * 90).toFixed(1)}" y2="${(-Math.cos(a) * 90).toFixed(1)}" stroke="${C.ink}" stroke-width="${i % 5 ? 0.6 : 1.4}"/>`;
    }
    for (let i = 0; i < 12; i++) {
      if (i === 3 || i === 6 || i === 9) continue;
      const a = i * 30 * D2R;
      h += `<rect x="-2" y="-78" width="4" height="12" fill="${C.ink}" transform="rotate(${i * 30})"/>`;
    }
    const sub = (cx, cy, n, label) => {
      let s = `<circle cx="${cx}" cy="${cy}" r="22" fill="#16181b"/><circle cx="${cx}" cy="${cy}" r="20.5" fill="none" stroke="#f4f4f2" stroke-width=".6"/>`;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 360 * D2R;
        const r0 = i % (n / 6) === 0 ? 15.5 : 18;
        s += `<line x1="${(cx + Math.sin(a) * r0).toFixed(1)}" y1="${(cy - Math.cos(a) * r0).toFixed(1)}" x2="${(cx + Math.sin(a) * 20).toFixed(1)}" y2="${(cy - Math.cos(a) * 20).toFixed(1)}" stroke="#f4f4f2" stroke-width=".7"/>`;
      }
      s += `<text x="${cx}" y="${cy + 12}" font-size="4.6" letter-spacing=".6" text-anchor="middle" fill="#c9ccd0">${label}</text>`;
      return s;
    };
    h += sub(42, 0, 30, '30 MIN') + sub(-42, 0, 12, '12 H') + sub(0, 42, 60, 'SEC');
    h += `<text x="0" y="-42" font-size="6" font-weight="700" letter-spacing="1.6" text-anchor="middle" fill="${C.ink}">CHRONOGRAPH</text><text x="0" y="-34" font-size="4.6" letter-spacing="1.2" text-anchor="middle" fill="${C.mute}">CAL. 4131 · STUDY MODEL</text>`;
    h += `<text x="0" y="-96" font-size="5" letter-spacing="1.4" text-anchor="middle" fill="#8b8f95">TACHYMETRE</text>`;
    return h;
  })();
  const hand = (cx, cy, ang, len, w, col, tail = 0) =>
    `<g transform="translate(${cx} ${cy}) rotate(${ang.toFixed(2)})"><rect x="${-w / 2}" y="${-len}" width="${w}" height="${len + tail}" rx="${w / 2}" fill="${col}"/></g>`;

  return {
    btn,
    root: ui,
    playHit,
    knobX: (v) => SL.x + v * SL.w,
    SL,
    update(s) {
      // big readout: elapsed time, red while running
      big.textContent = fmtElapsed(s.elapsed);
      big.style.color = s.running ? C.red : C.ink;
      bigSub.innerHTML = s.running ? `<span style="color:${C.red}">● RUNNING</span>` : s.elapsed > 0 ? 'STOPPED' : 'AT ZERO';
      timeNow.innerHTML = `TIME <b style="color:${C.ink}">${s.clock}</b>`;

      // balance trace: the last half second of movement time, the beats marked
      balHz.innerHTML = `<b style="color:${C.ink}">${W.vph.toLocaleString('en-US')}</b> VPH`;
      {
        const Wd = 226;
        const X = (k) => 4 + k * (Wd - 8);
        const Y = (a) => 60 - (a / 340) * 50;
        let h = `<line x1="4" x2="${Wd - 4}" y1="60" y2="60" stroke="${C.line}"/>`;
        for (const v of [-300, 300]) h += `<line x1="4" x2="${Wd - 4}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.line}" stroke-dasharray="2 3"/><text x="${Wd - 4}" y="${Y(v) - 2}" font-size="6.2" text-anchor="end" fill="${C.mute}">${v > 0 ? '+' : '−'}300°</text>`;
        const span = 0.5;
        let p = '';
        for (let i = 0; i <= 120; i++) {
          const t = s.tau - span + (i / 120) * span;
          p += `${i ? 'L' : 'M'}${X(i / 120).toFixed(1)} ${Y(balance(t, s.amp)).toFixed(1)}`;
        }
        h += `<path d="${p}" fill="none" stroke="${C.ink}" stroke-width="1.3"/>`;
        // beats: the zero crossings, every 1/8 s
        const first = Math.ceil((s.tau - span) * 8);
        for (let k = first; k <= Math.floor(s.tau * 8); k++) {
          const x = X((k / 8 - (s.tau - span)) / span);
          const age = s.tau - k / 8;
          h += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="98" y2="108" stroke="${age < 0.03 ? C.red : C.faint}" stroke-width="${age < 0.03 ? 2 : 1}"/>`;
        }
        h += `<circle cx="${X(1)}" cy="${Y(s.bal).toFixed(1)}" r="3" fill="${C.red}"/>`;
        h += `<text x="4" y="118" font-size="6.2" letter-spacing=".8" fill="${C.mute}">BEATS · 8 A SECOND</text><text x="${Wd - 4}" y="118" font-size="6.2" letter-spacing=".8" text-anchor="end" fill="${C.mute}">LAST 0.5 S</text>`;
        trace.innerHTML = h;
      }
      balRead.innerHTML = `amplitude <b style="color:${C.ink}">±${Math.round(s.amp)}°</b> &nbsp;·&nbsp; now <b style="color:${C.ink}">${Math.round(s.bal) >= 0 ? '+' : ''}${Math.round(s.bal)}°</b><br>beats so far <b style="color:${C.ink}">${Math.floor(s.tau * 8).toLocaleString('en-US')}</b> &nbsp;·&nbsp; fork <b style="color:${C.ink}">${s.fork > 0 ? 'RIGHT' : 'LEFT'}</b>`;

      // power reserve
      const r = s.reserve;
      resBig.textContent = r < 10 ? r.toFixed(1) : Math.round(r);
      resBig.style.color = r <= 0 ? C.mute : r < 8 ? C.red : C.ink;
      resUnit.style.left = `${50 + resBig.getBoundingClientRect().width + 8}px`;
      resState.innerHTML = r <= 0 ? `<b style="color:${C.red}">STOPPED</b>` : r > 69 ? 'FULLY WOUND' : r < 8 ? 'RUNNING DOWN' : 'RUNNING';
      {
        let h = `<rect x="0" y="6" width="226" height="10" fill="#e6e7e9"/><rect x="0" y="6" width="${(226 * clamp(r / 72, 0, 1)).toFixed(1)}" height="10" fill="${r < 8 ? C.red : C.ink}"/>`;
        for (const hr of [0, 24, 48, 72]) h += `<line x1="${(hr / 72) * 225 + 0.5}" x2="${(hr / 72) * 225 + 0.5}" y1="16" y2="21" stroke="${C.mute}"/><text x="${clamp((hr / 72) * 226, 6, 216)}" y="29" font-size="6.5" text-anchor="middle" fill="${C.mute}">${hr} H</text>`;
        resBar.innerHTML = h;
      }
      resRead.innerHTML = `crown turns <b style="color:${C.ink}">${s.crownTurns.toFixed(1)}</b> &nbsp;·&nbsp; rotor turns <b style="color:${C.ink}">${Math.floor(s.rotorTurns)}</b><br>mainspring coils sit <b style="color:${C.ink}">${r > 36 ? 'tight on the arbor' : r > 0 ? 'out toward the wall' : 'slack on the wall'}</b>`;

      // transport
      playVal.textContent = s.playText;
      playKnob.style.left = `${(SL.x + s.playK * SL.w).toFixed(1)}px`;
      btn.pause.innerHTML = s.paused ? '▶ &nbsp;PLAY' : '❚❚ &nbsp;PAUSE';

      // dial: time, small seconds, chronograph hands
      {
        const t = s.clockSec;
        const hh = ((t / 3600) % 12) * 30;
        const mi = ((t / 60) % 60) * 6;
        const se = (t % 60) * 6;
        const ch = chronoHands(s.elapsed);
        let h = dialStatic;
        h += hand(0, 42, se, 18, 1.4, C.ink, 4) + hand(42, 0, ch.min, 18, 1.6, C.red, 3) + hand(-42, 0, ch.hr, 16, 1.8, '#f4f4f2', 3);
        for (const [cx, cy] of [[0, 42], [42, 0], [-42, 0]]) h += `<circle cx="${cx}" cy="${cy}" r="2" fill="${C.ink}" stroke="#f4f4f2" stroke-width=".5"/>`;
        h += hand(0, 0, hh, 50, 5, C.ink, 8) + hand(0, 0, mi, 76, 3.6, C.ink, 10) + hand(0, 0, ch.sec, 88, 1.3, C.red, 18);
        h += `<circle r="3.4" fill="${C.red}"/>`;
        dial.innerHTML = h;
        dialT.innerHTML = `<b style="color:${C.ink}">${s.clock}</b>`;
      }

      // going train: every arbor's period and a small live dial of its angle
      {
        const rows = [
          {name: 'Balance', sub: '4 HZ · ±' + Math.round(s.amp) + '°', per: '0.25 S', ang: s.bal},
          ...TRAIN.map((w) => ({name: w.name, sub: w.id === 'esc' ? '15 TEETH · ×16' : w.id === 'w4' ? 'SMALL SECONDS' : w.id === 'w3' ? '×1/8' : w.id === 'w2' ? 'MINUTE HAND · ×1/60' : 'MAINSPRING', per: fmtPeriod(period(w)), ang: s.train[w.id]})),
        ];
        let h = '';
        rows.forEach((row, i) => {
          const y = 6 + i * 33;
          const lit = (i === 0 && s.amp > 0) || (i === 1 && s.tau * 8 - Math.floor(s.tau * 8 + 0.1) > -0.1 && s.beatFlash);
          h += `<circle cx="16" cy="${y + 12}" r="10" fill="#fff" stroke="${i === 0 || (i === 1 && s.beatFlash) ? C.red : C.faint}"/>`;
          const a = row.ang * D2R;
          h += `<line x1="16" y1="${y + 12}" x2="${(16 + Math.sin(a) * 8).toFixed(2)}" y2="${(y + 12 - Math.cos(a) * 8).toFixed(2)}" stroke="${i === 0 ? C.red : C.ink}" stroke-width="1.4"/><circle cx="16" cy="${y + 12}" r="1.6" fill="${C.ink}"/>`;
          h += `<text x="34" y="${y + 10}" font-size="10.5" font-weight="600" fill="${C.ink}">${row.name}</text><text x="34" y="${y + 21}" font-size="6.6" letter-spacing="1" fill="${C.mute}">${row.sub}</text>`;
          h += `<text x="226" y="${y + 14}" font-size="10" font-weight="700" text-anchor="end" fill="${C.ink}">${row.per}</text>`;
          if (i < rows.length - 1) h += `<line x1="34" x2="226" y1="${y + 29}" y2="${y + 29}" stroke="${C.line}"/>`;
          void lit;
        });
        trainSvg.innerHTML = h;
      }

      // chronograph pushers and state
      btn.start.textContent = s.running ? 'STOP' : 'START';
      btn.start.style.background = s.running ? C.ink : C.red;
      btn.start.style.borderColor = s.running ? C.ink : C.red;
      btn.reset.style.opacity = s.running ? 0.45 : 1;
      chronoState.innerHTML = `COLUMN WHEEL STEP <b style="color:${C.ink}">${s.pushes % W.ratchet}</b> / ${W.ratchet} &nbsp;·&nbsp; LEVER <b style="color:${C.ink}">${s.running ? 'BETWEEN COLUMNS' : 'ON A COLUMN'}</b> &nbsp;·&nbsp; VERTICAL CLUTCH <b style="color:${s.running ? C.red : C.ink}">${s.running ? 'CLOSED' : 'OPEN'}</b>`;

      // toggles
      const tog = (k, on, col) => {
        btn[k].style.background = on ? col : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? col : C.line;
      };
      for (const k of CAMS) tog(k, s.cam === k, C.ink);
      for (const k of LAYERS) tog(k, !!s.layers[k], C.red);
      for (const k of OVER) tog(k, !!s.over[k], C.red);

      // callouts: two columns just outside the movement's silhouette, stacked so they never overlap
      let lh = '';
      let ch = '';
      const [bx0, bx1] = s.bbox;
      const items = s.callouts.filter((c) => c.at && c.o > 0.02).map((c) => ({...c, ax: c.at[0], ay: c.at[1], left: c.at[0] < (bx0 + bx1) / 2}));
      for (const left of [true, false]) {
        const col = items.filter((it) => it.left === left).sort((a, b) => a.ay - b.ay);
        let yPrev = -1e9;
        for (const it of col) {
          it.ly = clamp(Math.max(it.ay - 16, yPrev + 40), 124, 760);
          yPrev = it.ly;
          it.lx = left ? clamp(bx0 - 28 - it.w, 322, 800 - it.w) : clamp(bx1 + 28, 800, 1284 - it.w);
        }
      }
      for (const it of items) {
        const w = it.w;
        const near = it.left ? it.lx + w + 4 : it.lx - 4;
        const far = it.left ? it.lx : it.lx + w;
        lh += `<polyline points="${it.ax.toFixed(1)},${it.ay.toFixed(1)} ${near.toFixed(1)},${(it.ly + 16).toFixed(1)} ${far.toFixed(1)},${(it.ly + 16).toFixed(1)}" fill="none" stroke="${C.mute}" stroke-width=".8" opacity="${it.o.toFixed(2)}"/><circle cx="${it.ax.toFixed(1)}" cy="${it.ay.toFixed(1)}" r="2.4" fill="${C.red}" opacity="${it.o.toFixed(2)}"/>`;
        ch += `<div class="call" style="left:${it.lx.toFixed(1)}px;top:${(it.ly - 10).toFixed(1)}px;opacity:${it.o.toFixed(2)};width:${w}px;${it.left ? 'text-align:right' : ''}"><b>${it.name}</b><span>${it.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      cap.textContent = s.caption;
      cap.style.opacity = s.caption ? 1 : 0;
    },
  };
}
const fmtPeriod = (sec) => (sec < 60 ? `${sec.toFixed(2).replace(/\.?0+$/, '')} S` : sec < 3600 ? `${(sec / 60).toFixed(0)} MIN` : `${(sec / 3600).toFixed(0)} H`);

export function runLive() {
  const top = Number(document.body.dataset.top || 0);
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createWatchStage({canvas});
  const ui = createConsole(app);

  const TIERS = [
    {samples: 8, ao: true, shadow: 4096, pr: 2},
    {samples: 4, ao: false, shadow: 2048, pr: 1.5},
    {samples: 2, ao: false, shadow: 1024, pr: 1},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let scale = 1;
  const fit = () => {
    const h = innerHeight - top;
    scale = Math.min(innerWidth / SW, h / SH);
    app.style.transform = `translate(${(innerWidth - SW * scale) / 2}px, ${top + (h - SH * scale) / 2}px) scale(${scale})`;
    st.resize(SW, SH, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };
  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Turn your phone sideways for the full console';
  document.body.appendChild(note);

  // ------------------------------------------------------------ state
  let T = 0;
  let tau = 0;
  let reserve = 52;
  let crownDeg = 0;
  let crownTurns = 0;
  let rotorDeg = 0;
  let rotorVel = 0;
  let rotorTurns = 0;
  let winding = 0;
  let windAuto = 0; // seconds of automatic crown turning left (the WIND button)
  let drain = 0;
  let pushes = 0;
  let chronoAcc = 0;
  let chronoFrom = 0;
  let columnShown = 0;
  let clutch = 0;
  let hammer = 0;
  let hammerT = -9;
  let pushAT = -9;
  let pushBT = -9;
  let playI = 3;
  let paused = false;
  let view = 'hero';
  const layers = {rotor: 1, xray: 0, explode: 0};
  const shown = {rotor: 1, xray: 0, explode: 0};
  const over = {callouts: 1, arrows: 1};
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEWS.hero(), az: 60, el: 30, d: 1.5};
  let hidden = false;
  let caption = '';
  let snap = false; // tests: jump the camera and layers straight to their targets
  // the wall clock at load, in seconds of the day, rounded to a beat; the hands run from it on movement time
  const now = new Date();
  const clock0 = Math.round((now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 8) / 8;

  const elapsedNow = () => (chronoRunning(pushes) ? chronoAcc + trainSeconds(tau) - chronoFrom : chronoAcc);
  const startStop = () => {
    if (chronoRunning(pushes)) chronoAcc = elapsedNow();
    else chronoFrom = trainSeconds(tau);
    pushes++;
    pushAT = T;
  };
  const reset = () => {
    pushBT = T;
    if (chronoRunning(pushes)) return; // the reset pusher is locked while the chronograph runs
    hammerT = T;
  };

  // ------------------------------------------------------------ autopilot
  const AP = {on: false, t0: 0, last: -1};
  let lastInput = -99;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.last = -1;
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    caption = '';
    off.az = 0;
    off.el = 0;
    off.k = 1;
  };
  tourChip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (AP.on) takeOver();
    else startTour();
  });
  const press = (k) => {
    takeOver();
    if (CAMS.includes(k)) {
      view = k;
      off.az = 0;
      off.el = 0;
      off.k = 1;
    } else if (LAYERS.includes(k)) layers[k] = layers[k] ? 0 : 1;
    else if (OVER.includes(k)) over[k] = over[k] ? 0 : 1;
    else if (k === 'start') startStop();
    else if (k === 'reset') reset();
    else if (k === 'pause') paused = !paused;
    else if (k === 'slower') playI = Math.max(0, playI - 1);
    else if (k === 'faster') playI = Math.min(PLAYS.length - 1, playI + 1);
    else if (k === 'wind') {
      windAuto = 3.2;
      if (view !== 'crown' && view !== 'hero') view = 'crown';
    } else if (k === 'drain') drain = 2.5;
  };
  for (const [k, n] of Object.entries(ui.btn)) {
    n.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      press(k);
    });
  }
  const setPlayFrom = (cx) => {
    const [x] = toStage(cx, 0);
    playI = Math.round(clamp((x - ui.SL.x) / ui.SL.w, 0, 1) * (PLAYS.length - 1));
  };
  ui.playHit.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    takeOver();
    setPlayFrom(e.clientX);
    const mv = (ev) => setPlayFrom(ev.clientX);
    const upH = () => {
      removeEventListener('pointermove', mv);
      removeEventListener('pointerup', upH);
    };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', upH);
  });
  addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'h') hidden = !hidden;
    else if (key === ' ') press('start');
    else if (key === 'r') press('reset');
    else if (key === 'x') press('xray');
    else if (key === 'e') press('explode');
    else if (key === 'w') press('wind');
    else if (key === 'p') press('pause');
    else if (key >= '1' && key <= '6') press(CAMS[+key - 1]);
    else return;
    e.preventDefault();
  });

  // pointer: on the crown it winds, anywhere else it orbits and swings the rotor
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onCrown = (cx, cy) => {
    const [x, y] = toStage(cx, cy);
    ndc.set((x / SW) * 2 - 1, -(y / SH) * 2 + 1);
    st.camera.updateMatrixWorld();
    ray.setFromCamera(ndc, st.camera);
    return ray.intersectObjects(st.eng.crownPick, true).length > 0;
  };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    takeOver();
    drag = {x: e.clientX, y: e.clientY, crown: onCrown(e.clientX, e.clientY)};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add(drag.crown ? 'crown' : 'drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      canvas.classList.toggle('crown', onCrown(e.clientX, e.clientY));
      return;
    }
    const dx = (e.clientX - drag.x) / scale;
    const dy = (e.clientY - drag.y) / scale;
    if (drag.crown) {
      // turning the crown: drag down or right winds; the other way the click lets it slip
      const d = (dy + dx * 0.5) * 2.2;
      crownDeg += d;
      if (d > 0) windBy(d / 360);
      winding = 1;
    } else {
      off.az += dx * 0.3;
      off.el = clamp(off.el + dy * 0.2, -30, 45);
      rotorVel += dx * 6;
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
    lastInput = T;
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag', 'crown');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.35, 2.4);
    },
    {passive: false},
  );
  const windBy = (turns) => {
    crownTurns += turns;
    reserve = clamp(reserve + turns * H_PER_CROWN_TURN, 0, W.reserveH);
  };

  // ------------------------------------------------------------ frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const frame = (nowMs) => {
    const dt = Math.min(0.1, Math.max(0, (nowMs - last) / 1000));
    last = nowMs;
    T += dt;
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.022 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    // the tour drives the same controls a visitor would
    let wrist = false;
    if (AP.on) {
      const c = (T - AP.t0) % TOUR_LEN;
      if (c < AP.last) AP.last = -1;
      const step = TOUR.filter((s) => s.t <= c).pop();
      for (const s of TOUR) {
        if (s.t > AP.last && s.t <= c) {
          view = s.cam;
          for (const [k, v] of Object.entries(s.set)) k === 'play' ? (playI = v) : (layers[k] = v);
          paused = false;
        }
        for (const [t, act] of s.at || []) if (t > AP.last && t <= c) act === 'start' ? startStop() : reset();
      }
      if (step.wind && c >= step.wind[0] && c <= step.wind[1]) {
        const d = 300 * dt;
        crownDeg += d;
        windBy(d / 360);
        winding = 1;
      }
      wrist = !!step.wrist;
      caption = step.cap;
      AP.last = c;
    } else if (T - lastInput > IDLE) startTour();

    if (windAuto > 0) {
      windAuto -= dt;
      const d = 520 * dt;
      crownDeg += d;
      windBy(d / 360);
      winding = 1;
    }
    if (drain > 0) {
      drain -= dt;
      reserve = Math.max(0, reserve - dt * 26);
    }
    winding = Math.max(0, winding - dt * 2.2);

    // movement time: the balance only swings while the spring has power
    const p = PLAYS[playI];
    if (!paused && reserve > 0) {
      const dtau = dt * p;
      tau += dtau;
      reserve = Math.max(0, reserve - dtau / 3600);
    }
    // the rotor: a weight on a bearing, swung by the wrist (the tour, or orbiting), winding both ways
    if (wrist) rotorVel += Math.sin(T * 2.1) * 900 * dt;
    rotorVel += -Math.sin(rotorDeg * D2R) * 260 * dt; // gravity pulls the weight down
    rotorVel *= Math.exp(-dt * 1.4);
    if (!paused) {
      const dR = rotorVel * dt;
      rotorDeg += dR;
      rotorTurns += Math.abs(dR) / 360;
      reserve = clamp(reserve + (Math.abs(dR) / 360) * H_PER_ROTOR_TURN * 60, 0, W.reserveH);
    }

    // chronograph mechanics, eased
    const running = chronoRunning(pushes);
    columnShown = ease(columnShown, pushes * COLUMN_STEP, dt, 0.06);
    clutch = ease(clutch, running ? 1 : 0, dt, 0.05);
    const hk = T - hammerT;
    hammer = hk < 0.12 ? s5(hk / 0.12) : hk < 0.7 ? 1 : 1 - s5((hk - 0.7) / 0.25);
    if (hk >= 0.12 && hk < 0.2 && !running) chronoAcc = 0;
    const pA = T - pushAT < 0.35 ? Math.sin((Math.PI * (T - pushAT)) / 0.35) : 0;
    const pB = T - pushBT < 0.35 ? Math.sin((Math.PI * (T - pushBT)) / 0.35) : 0;
    for (const k of LAYERS) shown[k] = snap ? layers[k] : ease(shown[k], layers[k], dt, k === 'explode' ? 0.5 : 0.25);

    // the movement pose, all from tau
    const sec = trainSeconds(tau);
    const A = amplitude(reserve);
    const train = trainAngles(sec);
    const elapsed = elapsedNow();
    const ch = chronoHands(elapsed);
    const bal = balance(tau, A);
    const state = {
      tau,
      train,
      balance: bal,
      balanceAmp: A,
      fork: A > 0 ? forkAngle(tau) : forkAngle(Math.floor(tau * 8) / 8 + 0.06),
      reserve,
      arbor: train.barrel + (reserve / 6) * 360,
      crown: crownDeg,
      winding,
      rotorAngle: rotorDeg,
      rotor: shown.rotor,
      xray: shown.xray,
      explode: shown.explode,
      column: columnShown,
      clutch,
      chronoSec: ch.sec,
      chronoMin: ch.min,
      hammer,
      pushA: pA,
      pushB: pB,
      arrows: over.arrows,
    };
    // camera
    const tgt = VIEWS[view]();
    tgt.az += off.az;
    tgt.el = clamp(tgt.el + off.el, 5, 89);
    tgt.d *= off.k * (1 + 0.32 * shown.explode);
    tgt.ty += 0.09 * shown.explode;
    const k = snap ? 1 : 1 - Math.exp(-dt / 0.45);
    snap = false;
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd']) cam[key] += (tgt[key] - cam[key]) * k;
    st.frame(state, {...cam, az: cam.az * D2R, el: cam.el * D2R});

    // callouts
    const anc = st.eng.anchors();
    const show = new Set(over.callouts ? CALLS[view] : []);
    if (shown.rotor < 0.5) show.delete('rotor');
    const proj = (v) => st.project(v.x, v.y, v.z);
    const C_ = [
      {key: 'balance', name: 'Balance wheel', sub: A > 0 ? `±${Math.round(A)}° · 4 HZ` : 'STOPPED', w: 112},
      {key: 'hair', name: 'Blue hairspring', sub: 'BREATHES WITH EVERY SWING', w: 150},
      {key: 'fork', name: 'Pallet fork', sub: 'CHRONERGY · NICKEL-PHOSPHORUS', w: 168},
      {key: 'esc', name: 'Escape wheel', sub: 'HALF A TOOTH PER BEAT', w: 128},
      {key: 'train', name: 'Going train', sub: '×16 · ×8 · ×7.5', w: 110},
      {key: 'barrel', name: 'Mainspring barrel', sub: `${reserve.toFixed(1)} H LEFT`, w: 124},
      {key: 'column', name: 'Column wheel', sub: `6 COLUMNS · STEP ${pushes % W.ratchet}`, w: 132},
      {key: 'clutch', name: 'Vertical clutch', sub: running ? 'CLOSED · CHRONO RUNS' : 'OPEN', w: 132},
      {key: 'runner', name: 'Chronograph runner', sub: 'CENTRE SECONDS · HEART CAM', w: 150},
      {key: 'hammer', name: 'Reset hammer', sub: 'STRIKES BOTH HEARTS', w: 120},
      {key: 'minute', name: '30-minute counter', sub: `${Math.floor(elapsed / 60) % 30} MIN`, w: 118},
      {key: 'crown', name: 'Crown', sub: 'DRAG TO WIND', w: 90},
      {key: 'rotor', name: 'Rotor', sub: 'WINDS BOTH WAYS', w: 100},
    ];
    let bx0 = 1e9;
    let bx1 = -1e9;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const q = st.project(Math.cos(a) * 0.178, 0, Math.sin(a) * 0.178);
      if (q) {
        bx0 = Math.min(bx0, q[0]);
        bx1 = Math.max(bx1, q[0]);
      }
    }
    const callouts = C_.map((c) => ({...c, at: show.has(c.key) ? proj(anc[c.key]) : null, o: show.has(c.key) ? 1 : 0}));

    ui.root.style.display = hidden ? 'none' : '';
    const clockSec = clock0 + sec;
    const hh = Math.floor(clockSec / 3600) % 24;
    const clock = `${String(hh).padStart(2, '0')}:${String(Math.floor(clockSec / 60) % 60).padStart(2, '0')}:${String(Math.floor(clockSec % 60)).padStart(2, '0')}`;
    ui.update({
      tau,
      amp: A,
      bal,
      fork: state.fork,
      reserve,
      crownTurns,
      rotorTurns,
      elapsed,
      running,
      pushes,
      train,
      clock,
      clockSec,
      beatFlash: tau * 8 - Math.floor(tau * 8) < 0.12 && A > 0,
      paused,
      playText: playText(p),
      playK: playI / (PLAYS.length - 1),
      cam: view,
      layers,
      over,
      callouts,
      bbox: [bx0, bx1],
      caption,
    });
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : '▶ RESUME TOUR';
    }
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {st, press, startTour, takeOver, snap: () => (snap = true), jump: (sec) => {
    startTour();
    AP.t0 = T - sec;
    snap = true;
  }, run: (sec) => (tau += sec), get state() {
    return {tau, reserve, pushes, view, layers};
  }};
  void escAngle;
}
