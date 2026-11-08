// Shared look for every generated picture: one palette, light and dark.
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const STYLE = `<style>
  svg { --bg:#f7f6f3; --card:#ffffff; --line:#e4e1da; --ink:#1c1b19; --muted:#6e6b64; --done:#2f7d52; --now:#c27a12; --todo:#a29f97; --unk:#8569b3; --nowbg:#fff5e3; --accent:#e8962e; }
  @media (prefers-color-scheme: dark) {
    svg { --bg:#121314; --card:#1b1c1e; --line:#2e3033; --ink:#ecebe7; --muted:#9a9a96; --done:#6bc48f; --now:#efb453; --todo:#6c6e72; --unk:#b29ce0; --nowbg:#2a2318; --accent:#f2a93b; }
  }
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: var(--ink); }
  .muted { fill: var(--muted); } .done { fill: var(--done); } .now { fill: var(--now); } .todo { fill: var(--todo); } .unk { fill: var(--unk); }
  .bg { fill: var(--bg); } .track { fill: var(--line); } .bar { fill: var(--done); } .rule { stroke: var(--line); }
  .card { fill: var(--card); stroke: var(--line); } .card.on { fill: var(--nowbg); stroke: var(--now); stroke-width: 2; }
  .accent { fill: var(--accent); }
</style>`;

// Greedy word wrap by an average glyph width; good enough for labels.
export function wrap(text, maxChars) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if ((line + ' ' + word).trim().length > maxChars && line) { out.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out;
}

// The BarkBot mark: a round speech bubble with one folded ear and two eyes.
export function mark(cx, cy, r, { fill = '#f4f2ee', ink = '#141414', ear = 'var(--accent)' } = {}) {
  const k = r / 20;
  return `<g transform="translate(${cx - r} ${cy - r}) scale(${k})">
<path d="M26 3 C33 1 39 4 39 11 C35 9 31 9 28 10 Z" fill="${ear}"/>
<path d="M20 2 A18 18 0 1 1 6.5 32.5 L2 38 L4.2 29.4 A18 18 0 0 1 20 2 Z" fill="${fill}"/>
<circle cx="14.5" cy="19" r="2.6" fill="${ink}"/><circle cx="25.5" cy="19" r="2.6" fill="${ink}"/>
</g>`;
}
