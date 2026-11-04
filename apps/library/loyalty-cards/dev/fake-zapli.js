// Development only (not shipped): a stand-in for Zapli's bridge, injected by dev/shots.mjs before the page's scripts,
// so the page runs its phone path in a headless browser: records with watches, the key-value store, declared
// actions, the scanner (answers what the check sets in window.__scanAnswer, or fails with the code set in
// window.__scanFail), the picker and haptics. It records the calls in window.__calls.
(() => {
  const calls = [];
  // Kept in sessionStorage, so a reload (a rotation on the phone) finds the records and photos again.
  const saved = JSON.parse(sessionStorage.getItem("__fakeZapli") || "null");
  const records = saved ? saved.records : { card: [], importLog: [] };
  const kv = new Map(saved ? saved.kv : []);
  const persist = () => sessionStorage.setItem("__fakeZapli", JSON.stringify({ records, kv: [...kv], next }));
  const watches = [];
  let next = saved ? saved.next : 1;
  const now = () => new Date().toISOString();
  const seed = window.__seedCards || [];
  if (!saved) for (const c of seed) records.card.push({ createdAt: now(), updatedAt: now(), ...c });
  const notify = (entity) => {
    persist();
    for (const w of watches) if (w.entity === entity) w.fn(records[entity].slice(0, w.limit || 200));
  };
  const fail = (code) => Promise.reject(Object.assign(new Error(code), { code }));
  const record = (entity, values) => ({ id: "r" + next++, createdAt: now(), updatedAt: now(), ...values });
  const zapli = {
    ready: Promise.resolve({}),
    supports: (name) =>
      ["data.entities", "scan.barcode", "media.pick", "camera.photo", "share", "haptics.impact"].includes(name),
    app: {
      locale: () => window.__locale || "en-GB",
      on: () => () => {},
      info: () => Promise.resolve({ version: "3.0.0" }),
    },
    data: {
      async query(entity, q = {}) {
        calls.push(["query", entity]);
        let items = records[entity].slice();
        if (q.sort && q.sort[0] === "-at") items.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
        return { items: items.slice(0, q.limit || 200) };
      },
      async add(entity, values) {
        calls.push(["add", entity, values]);
        if (entity === "card" && records.card.some((c) => c.store === values.store && c.number === values.number))
          return fail("INVALID_DATA");
        const r = record(entity, values);
        records[entity].push(r);
        setTimeout(() => notify(entity), 0);
        return r;
      },
      async update(entity, id, patch) {
        calls.push(["update", entity, id, patch]);
        const r = records[entity].find((x) => x.id === id);
        if (!r) return fail("NOT_FOUND");
        Object.assign(r, patch, { updatedAt: now() });
        for (const [k, v] of Object.entries(patch)) if (v === null) delete r[k];
        setTimeout(() => notify(entity), 0);
        return { ...r };
      },
      async remove(entity, id) {
        calls.push(["remove", entity, id]);
        records[entity] = records[entity].filter((x) => x.id !== id);
        setTimeout(() => notify(entity), 0);
      },
      watch(entity, q, fn) {
        const w = { entity, limit: q.limit, fn };
        watches.push(w);
        setTimeout(() => fn(records[entity].slice(0, q.limit || 200)), 0);
        return () => watches.splice(watches.indexOf(w), 1);
      },
      async runAction(action, args) {
        calls.push(["runAction", action, args]);
        if (action === "markUsed") {
          const r = records.card.find((x) => x.id === args.card);
          if (r) {
            r.uses = (r.uses || 0) + 1;
            r.lastUsed = now();
            setTimeout(() => notify("card"), 0);
          }
        }
        return {};
      },
      kv: {
        async get(key) {
          return kv.has(key) ? JSON.parse(kv.get(key)) : undefined;
        },
        async set(key, value) {
          calls.push(["kv.set", key]);
          kv.set(key, JSON.stringify(value));
          persist();
        },
        async delete(key) {
          kv.delete(key);
        },
        async keys(prefix = "") {
          return [...kv.keys()].filter((k) => k.startsWith(prefix));
        },
      },
    },
    scan: {
      async barcode() {
        calls.push(["scan"]);
        if (window.__scanFail) return fail(window.__scanFail);
        const answer = window.__scanAnswer;
        if (!answer) return fail("CANCELLED");
        return answer;
      },
    },
    // The picker answers what the check sets in window.__pickAnswer: names of pictures to make, each a small PNG whose
    // name the stand-in barcode reader below reads as its code ("2900123456785.ean_13.png").
    media: {
      async pick() {
        calls.push(["pick"]);
        const names = window.__pickAnswer || [];
        const files = [];
        for (const name of names) {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 200;
          const g = canvas.getContext("2d");
          g.fillStyle = "#2a803f";
          g.fillRect(0, 0, 320, 200);
          const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
          files.push(new File([blob], name, { type: "image/png" }));
        }
        return files;
      },
    },
    camera: { photo: async () => fail("CANCELLED") },
    share: async (data) => void calls.push(["share", data.title, data.files ? data.files.length : 0]),
    haptics: { impact: async (kind) => void calls.push(["haptic", kind]) },
    ui: { openSettings: async () => {} },
  };
  // The SDK brings BarcodeDetector for an app that declares scan.barcode; this one reads the code from the file's name.
  window.BarcodeDetector = class {
    async detect(file) {
      calls.push(["detect", file.name]);
      const [value, format] = String(file.name).split(".");
      return value === "none" ? [] : [{ rawValue: value, format }];
    }
  };
  window.__calls = calls;
  window.__records = records;
  window.zapli = zapli;
})();
