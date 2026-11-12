// A tiny Chrome DevTools Protocol client for the oracle: Grok Bot.app started
// with --remote-debugging-port. Node 22's built-in WebSocket, no installs.
// Read-only by design (O1): it reads the page; gestures live in recipes.
export const PORT = Number(process.env.ORACLE_PORT || 9333);

export async function targets(port = PORT) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return res.json();
}

// The app's main window: the first page target that is not DevTools.
export async function mainPage(port = PORT) {
  const pages = (await targets(port)).filter((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!pages.length) throw new Error(`no page on port ${port}: is it running with --remote-debugging-port=${port}?`);
  return pages[0];
}

export async function connect(target, port = PORT) {
  const t = target || (await mainPage(port));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error(`could not connect to the browser on port ${port}`)); });
  let id = 0;
  const waiting = new Map();
  const listeners = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, bad } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? bad(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) (listeners.get(msg.method) || []).forEach((f) => f(msg.params));
  };
  // A connection that drops fails every call still waiting, and every later one: without
  // this a caller waited forever on a browser that was gone.
  let closed = null;
  const drop = (why) => { closed = closed || new Error(why); for (const { bad } of waiting.values()) bad(closed); waiting.clear(); };
  ws.onclose = () => drop('the browser closed the connection');
  ws.onerror = () => drop('the connection to the browser failed');
  const send = (method, params = {}) => new Promise((ok, bad) => {
    if (closed) return bad(closed);
    waiting.set(++id, { ok, bad });
    ws.send(JSON.stringify({ id, method, params }));
  });
  // Evaluate a function in the page and return its JSON result.
  const evaluate = async (fn, ...args) => {
    const r = await send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const on = (method, f) => listeners.set(method, [...(listeners.get(method) || []), f]);
  return { send, evaluate, on, close: () => ws.close(), target: t };
}
