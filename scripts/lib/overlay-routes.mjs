// How a person opens each overlay the app can show, read from the overlay registry
// (app/src/components/overlays/index.tsx), not from a hand-written list (task-f53de46036d37cdf):
// a new overlay is checked the day it is registered, and one with no way in is named, not skipped.
//
// The registry's `overlays` keys are the layers. A layer opens by the first of:
//   triggers   a button whose label the `triggers` map names (Composer actions -> composer-menu)
//   pickers    a combobox whose label the `pickers` map names (Language -> language-picker)
//   data-picker  a button carrying data-picker="<layer>" (the Voice row -> voice-picker)
//   go         a row in another layer whose handler the registry wires to go('<layer>')
//              (account-menu's onSettings -> settings; the row is the Item whose onPick is that prop)
//   page       the same view as another layer, on a page its tabs reach (settings-computer is
//              <Settings page="Computer">: settings, then its Computer tab)
// Each step says what it presses and how the rule knows it worked: `opens` (a visible
// .overlay[data-overlay=...]) or `current` (the pressed tab is the current page).
import { readFileSync, readdirSync } from 'node:fs';
import { path } from './data.mjs';

const OVERLAYS = path('app', 'src', 'components', 'overlays');

// The object literal assigned to `const <name>` in src, as text (its top-level braces).
const block = (src, name) => {
  const at = src.search(new RegExp(`const ${name}\\b[^=]*=\\s*\\{`));
  if (at < 0) return null;
  let i = src.indexOf('{', src.indexOf('=', at)), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i + 1, j);
  }
  return null;
};
// 'Label': 'overlay' pairs of a flat string map.
const pairs = (text) => Object.fromEntries([...(text ?? '').matchAll(/^\s*'?([^':\n]+?)'?\s*:\s*'([\w-]+)'/gm)].map((m) => [m[1], m[2]]));

export function overlayRoutes({ index = readFileSync(`${OVERLAYS}/index.tsx`, 'utf8'), sources = null } = {}) {
  const files = sources ?? readdirSync(OVERLAYS).filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(`${OVERLAYS}/${f}`, 'utf8'))
    .concat(readdirSync(path('app', 'src', 'components')).filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(path('app', 'src', 'components', f), 'utf8')));
  const reg = block(index, 'overlays');
  if (!reg) return { routes: [], unrouted: ['(no `overlays` registry found in overlays/index.tsx)'] };
  // Each entry: its key, and its text up to the next key.
  const keys = [...reg.matchAll(/^\s{2}'?([\w-]+)'?\s*:\s*\(/gm)];
  const entries = keys.map((m, i) => ({ name: m[1], text: reg.slice(m.index, keys[i + 1]?.index ?? reg.length) }));
  const triggers = pairs(block(index, 'triggers'));
  const pickers = pairs(block(index, 'pickers'));
  const component = (e) => e.text.match(/=>\s*\(?\s*<(\w+)/)?.[1] ?? null;
  const page = (e) => e.text.match(/\bpage="([^"]+)"/)?.[1] ?? null;

  const memo = new Map();
  const route = (name, seen = new Set()) => {
    if (memo.has(name)) return memo.get(name);
    if (seen.has(name)) return null;
    seen.add(name);
    const e = entries.find((x) => x.name === name);
    let r = null;
    const label = Object.keys(triggers).find((k) => triggers[k] === name);
    const pick = Object.keys(pickers).find((k) => pickers[k] === name);
    if (label) r = { layer: name, steps: [{ press: 'button', name: label, opens: name }] };
    else if (pick) r = { layer: name, steps: [{ press: '[role=combobox]', name: pick, opens: name }] };
    else if (files.some((f) => f.includes(`data-picker="${name}"`))) r = { layer: name, steps: [{ press: `[data-picker="${name}"]`, name: null, opens: name }] };
    if (!r) {
      // go('<name>') from another layer: that layer's route, then the row whose onPick is the prop.
      for (const p of entries) {
        const prop = p.text.match(new RegExp(`(\\w+)=\\{\\(\\)\\s*=>\\s*go\\('${name}'\\)\\}`))?.[1];
        if (!prop) continue;
        const row = files.map((f) => f.match(new RegExp(`label="([^"]+)"\\s+onPick=\\{${prop}\\b`))?.[1]).find(Boolean);
        const up = row && route(p.name, seen);
        if (up) { r = { layer: name, steps: [...up.steps, { press: `.overlay[data-overlay="${up.layer}"] [role=menuitem]`, name: row, opens: name }] }; break; }
      }
    }
    if (!r && e && page(e)) {
      // The same view on another page: the layer that shows it with no page, then its tab.
      const home = entries.find((x) => x !== e && component(x) === component(e) && !page(x));
      const up = home && route(home.name, seen);
      if (up) r = { layer: up.layer, steps: [...up.steps, { press: `.overlay[data-overlay="${up.layer}"] button`, name: page(e), current: true }] };
    }
    memo.set(name, r);
    return r;
  };
  const routes = [], unrouted = [];
  for (const e of entries) {
    const r = route(e.name);
    if (r) routes.push({ overlay: e.name, ...r });
    else unrouted.push(e.name);
  }
  return { routes, unrouted };
}
