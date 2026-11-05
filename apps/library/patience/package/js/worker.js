// The solver's worker. The page sends a position and a budget of time and positions; the worker searches in short
// slices, so a newer request (or "stop") ends an older search at once, and answers with the verdict and, for a win,
// the path. It has no access to the page or to Zapli: it only gets positions and sends answers.
//
// Messages in: {id, type: "check", state, ms, nodes} for one position; {id, type: "last", states, ms, nodes} for the
// most recent of several positions that can still be won (each gets up to `ms`); {type: "stop"}.
// Messages out: {id, status: "win" | "lost" | "limit", path} or, for "last", {id, index, path} (index -1: none).
import { createSearch } from "./solver.js";

let current = 0;
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

// Runs one search until it ends, the budget is spent or a newer request arrives (then null).
async function run(id, state, ms, nodes) {
  const search = createSearch(state, { maxNodes: nodes });
  const end = Date.now() + ms;
  for (;;) {
    const status = search.step(25);
    if (current !== id) return null;
    if (status !== "running") return { status, path: search.path };
    if (Date.now() > end) return { status: "limit", path: null };
    await pause();
    if (current !== id) return null;
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === "stop") {
    current = 0;
    return;
  }
  const id = msg.id;
  current = id;
  if (msg.type === "check") {
    const r = await run(id, msg.state, msg.ms, msg.nodes);
    if (r) self.postMessage({ id, status: r.status, path: r.path });
    return;
  }
  if (msg.type === "last") {
    for (let i = 0; i < msg.states.length; i++) {
      const r = await run(id, msg.states[i], msg.ms, msg.nodes);
      if (!r) return;
      if (r.status === "win") {
        self.postMessage({ id, index: i, path: r.path });
        return;
      }
    }
    self.postMessage({ id, index: -1, path: null });
  }
};
