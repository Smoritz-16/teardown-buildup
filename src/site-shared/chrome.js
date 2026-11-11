// Shared page chrome for every model on the teardown-buildup site. Any new model page calls both:
//   addHome(uiRoot)                         a "← ALL MODELS" link back to the landing page, top left
//   actionBar(uiRoot, items, {top})         the model's main actions in one centred row at the bottom
// items: [{key, label, w?, gap?}] -> returns {key: element}; style each element's state in the page's own update.
const INK = '#16181b';
const LINE = '#e1e3e6';
export function addHome(root, href = 'index.html') {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = '← ALL MODELS';
  a.setAttribute('aria-label', 'Back to all models');
  Object.assign(a.style, {position: 'absolute', left: '35px', top: '7px', height: '20px', padding: '0 9px', display: 'flex', alignItems: 'center', border: `1px solid ${LINE}`, background: 'rgba(255,255,255,.95)', color: INK, font: "600 8.8px Inter,sans-serif", letterSpacing: '1.3px', textDecoration: 'none', pointerEvents: 'auto', cursor: 'pointer', zIndex: 60});
  a.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.appendChild(a);
  return a;
}
export function actionBar(root, items, {top = 810, height = 28, centre = 800} = {}) {
  const total = items.reduce((s, it, i) => s + (it.w ?? 96) + (i ? it.gap ?? 8 : 0), 0);
  let x = centre - total / 2;
  const out = {};
  items.forEach((it, i) => {
    if (i) x += it.gap ?? 8;
    const d = document.createElement('div');
    d.className = 'tb';
    d.textContent = it.label;
    Object.assign(d.style, {position: 'absolute', left: `${x}px`, top: `${top}px`, width: `${it.w ?? 96}px`, height: `${height}px`, fontSize: '10px', pointerEvents: 'auto', cursor: 'pointer'});
    root.appendChild(d);
    out[it.key] = d;
    x += it.w ?? 96;
  });
  return out;
}
