// Storage: the app's own key-value store inside Zapli (it travels with the app's export and its backups), with a
// copy in localStorage that also serves browsers and previews. Every read and write may fail, so the game keeps its
// values in memory and carries on. Each value carries `at` (when it was saved), so the newer of the two copies wins
// when they differ.
export function createStore(prefix, names) {
  const key = (name) => `${prefix}/${name}`;
  const values = {};
  const memory = new Map();
  const chains = {};
  const timers = {};
  let kv = null;
  let lastAt = 0;

  function lsRead(k) {
    try {
      return window.localStorage.getItem(k);
    } catch (e) {
      return memory.has(k) ? memory.get(k) : null;
    }
  }
  function lsWrite(k, raw) {
    memory.set(k, raw);
    try {
      window.localStorage.setItem(k, raw);
      return true;
    } catch (e) {
      return false; // full or blocked: the copy in memory keeps this session going
    }
  }
  function parse(raw) {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function loadLocal() {
    for (const name of names) {
      const v = parse(lsRead(key(name)));
      values[name] = v;
      if (v && typeof v.at === "number") lastAt = Math.max(lastAt, v.at);
    }
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
      Promise.resolve(promise).then(
        (v) => {
          window.clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          window.clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  function push(name) {
    if (!kv) return;
    const value = values[name];
    chains[name] = (chains[name] || Promise.resolve())
      .then(() => kv.set(key(name), value))
      .catch(() => {
        // The localStorage copy still holds it; the next save tries again.
      });
  }

  // Reads Zapli's copies (when the page runs inside Zapli) and keeps the newer of each pair. Resolves true when
  // anything changed from the local copies.
  async function loadKv(host) {
    const api = host && host.data && host.data.kv;
    if (!api || typeof api.get !== "function" || typeof api.set !== "function") return false;
    try {
      await withTimeout(host.ready, 2500);
      const got = await withTimeout(Promise.all(names.map((n) => api.get(key(n)))), 2500);
      kv = api;
      let changed = false;
      names.forEach((name, i) => {
        const remote = got[i] && typeof got[i] === "object" ? got[i] : null;
        const local = values[name];
        if (remote && (!local || (remote.at || 0) >= (local.at || 0))) {
          if (JSON.stringify(remote) !== JSON.stringify(local)) {
            values[name] = remote;
            lsWrite(key(name), JSON.stringify(remote));
            changed = true;
          }
          if (typeof remote.at === "number") lastAt = Math.max(lastAt, remote.at);
        } else if (local) push(name);
      });
      return changed;
    } catch (e) {
      kv = null;
      return false;
    }
  }

  function get(name) {
    const v = values[name];
    return v && !v.none ? v : null;
  }

  // Saves at once to localStorage and, a moment later (or at once with `now`), to Zapli.
  function set(name, value, now) {
    lastAt = Math.max(lastAt + 1, Date.now());
    const v = Object.assign({}, value, { at: lastAt });
    values[name] = v;
    lsWrite(key(name), JSON.stringify(v));
    window.clearTimeout(timers[name]);
    timers[name] = 0;
    if (now) push(name);
    else timers[name] = window.setTimeout(() => push(name), 300);
  }

  // A removed value stays as a marker, so an older copy elsewhere cannot come back.
  const remove = (name) => set(name, { none: true });

  function flush() {
    for (const name of names) {
      if (timers[name]) {
        window.clearTimeout(timers[name]);
        timers[name] = 0;
        push(name);
      }
    }
  }

  return { loadLocal, loadKv, get, set, remove, flush };
}
