// What one state looks like, read inside the page: every visible element's box and look.
// The same function reads the oracle (capture.mjs) and ours (gate.mjs), so both sides are
// measured by one instrument. Conversation text is kept as a length; UI labels as text (O2).
// It runs in the page: no imports, no closures.
export function collect() {
  const KEYS = ['background-color', 'background-image', 'color', 'opacity', 'border-top-width', 'border-top-color', 'border-radius',
    'font-size', 'font-weight', 'line-height', 'letter-spacing', 'box-shadow', 'text-transform'];
  const DEF = { 'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', opacity: '1', 'border-top-width': '0px', 'border-radius': '0px', 'box-shadow': 'none', 'text-transform': 'none', 'letter-spacing': 'normal' };
  const els = [];
  const all = document.body.querySelectorAll('*');
  const index = new Map();
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const style = {};
    for (const k of KEYS) { const v = cs.getPropertyValue(k); if (v && v !== DEF[k]) style[k] = v.length > 160 ? v.slice(0, 160) : v; }
    if (style['border-top-width'] === undefined) delete style['border-top-color'];
    const inBubble = !!el.closest('[role=article][data-role]');
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    const ctl = el.matches('button,[role=button],[role=tab],[role=combobox],h1,h2,h3,h4,label,time,[role=heading]');
    const sectionTitle = !inBubble && own && own.length <= 40 && !own.includes('\n');
    const e = {
      i: els.length, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || undefined,
      label: el.getAttribute('aria-label')?.slice(0, 80) || undefined, dataRole: el.dataset.role || undefined,
      box: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10),
      parent: undefined, style,
      text: (sectionTitle || (ctl && !inBubble && own.length <= 40)) && own ? own : undefined,
      textLength: own && !(sectionTitle || (ctl && !inBubble)) ? own.length : undefined,
    };
    if (el.tagName.toLowerCase() === 'svg') e.icon = true;
    index.set(el, e.i);
    let p = el.parentElement;
    while (p && !index.has(p)) p = p.parentElement;
    if (p) e.parent = index.get(p);
    els.push(e);
  }
  return { viewport: [innerWidth, innerHeight, devicePixelRatio], elements: els };
}
