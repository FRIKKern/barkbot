// Named things in a captured state, for Gate A and the inventory. Works on any output of
// scripts/oracle/collect.mjs, the oracle's or ours, so both sides are named the same way.

const CONTROL_TAGS = new Set(['button', 'input', 'textarea', 'select']);
const CONTROL_ROLES = new Set(['button', 'tab', 'combobox', 'textbox', 'switch', 'menuitem', 'checkbox']);

const ancestors = (els, e) => { const out = []; let p = e.parent; while (p !== undefined) { out.push(els[p]); p = els[p].parent; } return out; };
const inArticle = (els, e) => e.role === 'article' || ancestors(els, e).some((a) => a.role === 'article');
// The first text inside an element, for controls whose name is their content.
const innerText = (els, e) => els.find((x) => x.i > e.i && x.text && ancestors(els, x).includes(e))?.text;
const isControl = (e) => (CONTROL_TAGS.has(e.tag) || CONTROL_ROLES.has(e.role)) && e.box[2] >= 2 && e.box[3] >= 2;

// A control's name: its label, or its text, with two rules that make a name mean the same
// thing on both sides: a bot's tile in the rail is a "Bot tile" (bot names are data), and a
// picker is named by the label on its row ("Voice", not "Helix").
export function controlName(els, e) {
  if (e.role === 'combobox') {
    const row = els.filter((x) => x.text && !ancestors(els, x).includes(e) && x.box[0] < e.box[0] && Math.abs((x.box[1] + x.box[3] / 2) - (e.box[1] + e.box[3] / 2)) < 6);
    return row.sort((a, b) => b.box[0] - a.box[0])[0]?.text ?? null;
  }
  const inRail = ancestors(els, e).some((a) => a.label === 'Bots');
  if (inRail && e.tag === 'button' && e.box[2] === 54 && e.label !== 'Open account menu') return 'Bot tile';
  return e.label || e.text || innerText(els, e) || null;
}

export function controls(state) {
  const els = state.elements;
  const out = [];
  for (const e of els) {
    if (!isControl(e) || inArticle(els, e)) continue;
    const name = controlName(els, e);
    if (name) out.push({ name, e });
  }
  return out;
}

// Gate A's cases: every named element outside the conversation itself. Bubbles, their
// contents and the time line are the conversation's (lengths only, O2) and are left out.
export function namedElements(state) {
  const els = state.elements;
  const counts = new Map();
  const out = [];
  for (const e of els) {
    if (inArticle(els, e) || e.tag === 'time' || e.box[2] < 2 || e.box[3] < 2) continue;
    const name = isControl(e) ? controlName(els, e) : e.text || (e.label && ['aside', 'main', 'header', 'section', 'nav'].includes(e.tag) ? e.label : null);
    if (!name) continue;
    const key = `${isControl(e) ? 'control' : e.tag}:${name}`;
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    out.push({ key: n > 1 ? `${key}#${n}` : key, name, e });
  }
  return out;
}
