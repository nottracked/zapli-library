// The app's data. Inside Zapli everything lives in the app's own declared records (zapli.data), so backups, the
// home-screen widget, reminders and budget warnings see it even while the app is closed; small page settings and
// receipt pictures live in zapli.data.kv. A receipt photo from an earlier version stays in its entry's record, which
// the page cannot read pictures from; such an entry carries `oldReceipt`. In a plain browser (a preview) the same calls
// run on example data kept in this browser's storage.

import { toCents, toMicros } from "./money.mjs";
import { sampleData } from "./sample.mjs";

const PAGE = 2000;
const PREVIEW_KEY = "expenses-preview-v4";

/** Adds the page's working numbers to a stored entry: cents in its own currency, in the main one, and received. */
function normalize(entry) {
  const cents = toCents(entry.amount) ?? 0;
  entry.cents = cents;
  entry.base = toCents(entry.baseAmount) ?? cents;
  entry.toCents = entry.toAmount ? toCents(entry.toAmount) : null;
  return entry;
}

function byPosition(a, b) {
  return (a.position || 0) - (b.position || 0) || String(a.name).localeCompare(String(b.name));
}

class Store {
  constructor() {
    this.live = false;
    this.zapli = null;
    this.lists = { prefs: [], account: [], category: [], recurring: [], rate: [], importLog: [] };
    this.entries = new Map();
    this.receipts = new Set();
    this.ui = {};
    this.listeners = new Set();
    this.loaded = false;
    this.error = null;
    this.lastSeen = "";
    this.scheduled = false;
    this.preview = null;
    this.cached = null;
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Tells the screens once per frame that something changed. */
  changed() {
    this.cached = null;
    if (this.scheduled) return;
    this.scheduled = true;
    const run = () => {
      this.scheduled = false;
      for (const listener of this.listeners) listener();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  get prefs() {
    return this.lists.prefs[0] || null;
  }

  get main() {
    return (this.prefs && this.prefs.currency) || "EUR";
  }

  get categories() {
    return this.lists.category;
  }

  get accounts() {
    return this.lists.account;
  }

  get rules() {
    return this.lists.recurring;
  }

  get rates() {
    return this.lists.rate;
  }

  get importLogs() {
    return this.lists.importLog;
  }

  /** The model the ledger functions read (see ledger.mjs), made again after each change. */
  get model() {
    if (!this.cached) this.cached = this.makeModel();
    return this.cached;
  }

  makeModel() {
    const accounts = this.accounts.map((a) => ({ ...a, openingCents: toCents(a.opening) ?? 0 }));
    const categories = new Map(this.categories.map((c) => [c.id, { ...c, budgetCents: toCents(c.budget) }]));
    const rates = new Map();
    for (const r of this.rates) {
      const micros = toMicros(r.perMain);
      if (micros) rates.set(r.currency, micros);
    }
    const prefs = this.prefs || {};
    const visible = accounts.filter((a) => !a.archived);
    const defaultAccount =
      (prefs.defaultAccount && accounts.some((a) => a.id === prefs.defaultAccount) && prefs.defaultAccount) ||
      (visible[0] && visible[0].id) ||
      (accounts[0] && accounts[0].id) ||
      null;
    return {
      main: this.main,
      defaultAccount,
      entries: [...this.entries.values()],
      categories,
      accounts,
      rates,
      monthlyBudget: toCents(prefs.monthlyBudget),
      warnAt: prefs.warnAt || 80,
    };
  }

  /** Starts the store: inside Zapli on the app's records, else on example data in this browser. */
  async open() {
    const zapli = typeof window !== "undefined" ? window.zapli : undefined;
    if (zapli && zapli.data) {
      this.zapli = zapli;
      try {
        await zapli.ready;
        this.live = zapli.supports("data.entities");
      } catch {
        this.live = false;
      }
    }
    if (!this.live) return this.openPreview();
    try {
      this.ui = (await this.zapli.data.kv.get("ui")) || {};
    } catch {
      this.ui = {};
    }
    await Promise.all([this.watchLists(), this.loadEntries(), this.loadReceipts()]);
    this.watchEntries();
    this.loaded = true;
    this.changed();
  }

  async watchLists() {
    const queries = {
      prefs: { limit: 1 },
      account: { sort: ["position", "name"], limit: 500 },
      category: { sort: ["name"], limit: 1000 },
      recurring: { sort: ["nextDue"], limit: 1000 },
      rate: { sort: ["currency"], limit: 200 },
      importLog: { sort: ["-at"], limit: 5 },
    };
    await Promise.all(
      Object.entries(queries).map(
        ([entity, query]) =>
          new Promise((resolve) => {
            let first = true;
            try {
              this.zapli.data.watch(entity, query, (items) => {
                this.lists[entity] = entity === "account" ? [...items].sort(byPosition) : items;
                this.changed();
                if (first) {
                  first = false;
                  resolve();
                }
              });
            } catch (error) {
              this.error = error;
              resolve();
            }
            // A list that never answers must not hold the app back.
            setTimeout(resolve, 4000);
          }),
      ),
    );
  }

  /** Reads every entry, a page at a time. */
  async loadEntries() {
    const all = new Map();
    let cursor;
    let newest = "";
    do {
      const page = await this.zapli.data.query("expense", { sort: ["-date", "-createdAt"], limit: PAGE, cursor });
      for (const item of page.items) {
        all.set(item.id, normalize(item));
        if (item.updatedAt > newest) newest = item.updatedAt;
      }
      cursor = page.cursor;
    } while (cursor);
    this.entries = all;
    this.lastSeen = newest;
    this.changed();
  }

  /** Entries written since the last look (by this page, a background job or an import) are merged in. */
  async loadChanges() {
    if (!this.lastSeen) return this.loadEntries();
    let cursor;
    do {
      const page = await this.zapli.data.query("expense", {
        where: { updatedAt: { gte: this.lastSeen } },
        sort: ["updatedAt"],
        limit: PAGE,
        cursor,
      });
      for (const item of page.items) {
        this.entries.set(item.id, normalize(item));
        if (item.updatedAt > this.lastSeen) this.lastSeen = item.updatedAt;
      }
      cursor = page.cursor;
    } while (cursor);
    this.changed();
  }

  /** The newest change to any entry: a signal to read what changed. */
  watchEntries() {
    let first = true;
    try {
      this.zapli.data.watch("expense", { sort: ["-updatedAt"], limit: 1 }, () => {
        if (first) {
          first = false;
          return;
        }
        this.loadChanges().catch(() => {});
      });
    } catch {
      // Without live updates the screens still refresh on every write the page makes.
    }
    this.zapli.app.on("resume", () => this.loadEntries().catch(() => {}));
  }

  async loadReceipts() {
    try {
      const keys = await this.zapli.data.kv.keys("receipt:");
      this.receipts = new Set(keys.map((k) => k.slice(8)));
    } catch {
      this.receipts = new Set();
    }
  }

  // ---------------------------------------------------------------- writes

  async add(entity, values) {
    if (!this.live) return this.previewWrite("add", entity, null, values);
    // A new record simply has no value where the form left one empty.
    const given = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== undefined));
    const record = await this.zapli.data.add(entity, given);
    this.applyLocal(entity, record);
    return record;
  }

  async update(entity, id, patch) {
    if (!this.live) return this.previewWrite("update", entity, id, patch);
    const record = await this.zapli.data.update(entity, id, patch);
    this.applyLocal(entity, record);
    return record;
  }

  async remove(entity, id) {
    if (!this.live) return this.previewWrite("remove", entity, id);
    await this.zapli.data.remove(entity, id);
    this.applyLocal(entity, null, id);
  }

  /** Shows a write at once; the watches confirm it a moment later. */
  applyLocal(entity, record, removedId) {
    if (entity === "expense") {
      if (record) {
        this.entries.set(record.id, normalize(record));
        if (record.updatedAt > this.lastSeen) this.lastSeen = record.updatedAt;
      } else this.entries.delete(removedId);
    } else {
      const list = this.lists[entity].filter((r) => r.id !== (record ? record.id : removedId));
      if (record) list.push(record);
      this.lists[entity] = entity === "account" ? list.sort(byPosition) : list;
    }
    this.changed();
  }

  async updatePrefs(patch) {
    if (this.prefs) return this.update("prefs", this.prefs.id, patch);
    return this.add("prefs", patch);
  }

  /** Runs one of the app's declared actions (import, export, bulk moves). Call it straight from a tap. */
  async run(action, args = {}) {
    if (!this.live) return this.previewAction(action, args);
    const result = await this.zapli.data.runAction(action, args);
    return result;
  }

  async saveUi(patch) {
    this.ui = { ...this.ui, ...patch };
    if (this.live) {
      try {
        await this.zapli.data.kv.set("ui", this.ui);
      } catch {
        // Kept for this session.
      }
    } else this.persistPreview();
    this.changed();
  }

  // ---------------------------------------------------------------- receipts

  async receipt(entryId) {
    if (!this.live) return (this.preview.receipts || {})[entryId] || null;
    try {
      return (await this.zapli.data.kv.get("receipt:" + entryId)) || null;
    } catch {
      return null;
    }
  }

  async setReceipt(entryId, picture) {
    if (this.live) await this.zapli.data.kv.set("receipt:" + entryId, picture);
    else {
      this.preview.receipts = { ...(this.preview.receipts || {}), [entryId]: picture };
      this.persistPreview();
    }
    this.receipts.add(entryId);
    this.changed();
  }

  async deleteReceipt(entryId) {
    if (this.live) await this.zapli.data.kv.delete("receipt:" + entryId);
    else if (this.preview.receipts) {
      delete this.preview.receipts[entryId];
      this.persistPreview();
    }
    this.receipts.delete(entryId);
    this.changed();
  }

  // ---------------------------------------------------------------- the browser preview

  openPreview() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(PREVIEW_KEY) || "null");
    } catch {
      saved = null;
    }
    this.preview = saved || { ...sampleData(new Date()), receipts: {} };
    this.ui = this.preview.ui || {};
    this.syncPreview();
    this.loaded = true;
    this.changed();
  }

  syncPreview() {
    for (const entity of Object.keys(this.lists)) this.lists[entity] = [...(this.preview[entity] || [])];
    this.lists.account.sort(byPosition);
    this.entries = new Map((this.preview.expense || []).map((e) => [e.id, normalize({ ...e })]));
    this.receipts = new Set(Object.keys(this.preview.receipts || {}));
  }

  persistPreview() {
    this.preview.ui = this.ui;
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(this.preview));
    } catch {
      // Storage blocked: the preview keeps working in memory.
    }
  }

  previewWrite(kind, entity, id, values) {
    const list = this.preview[entity] || (this.preview[entity] = []);
    const now = new Date().toISOString();
    let record = null;
    if (kind === "add") {
      record = {
        id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        createdAt: now,
        updatedAt: now,
        _version: 1,
      };
      for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined) record[k] = v;
      list.push(record);
    } else if (kind === "update") {
      const index = list.findIndex((r) => r.id === id);
      if (index < 0) throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
      record = { ...list[index], updatedAt: now, _version: (list[index]._version || 1) + 1 };
      for (const [k, v] of Object.entries(values)) {
        if (v === null || v === undefined) delete record[k];
        else record[k] = v;
      }
      list[index] = record;
    } else {
      this.preview[entity] = list.filter((r) => r.id !== id);
    }
    this.persistPreview();
    this.syncPreview();
    this.changed();
    return record;
  }

  previewAction(action, args) {
    if (action === "undoImport" || action === "importCsv" || action === "applyRate") {
      throw Object.assign(new Error("Only in the app"), { code: "UNSUPPORTED" });
    }
    if (action === "moveCategory" || action === "moveAccount") {
      const field = action === "moveCategory" ? ["category"] : ["account", "toAccount"];
      for (const e of this.preview.expense) for (const f of field) if (e[f] === args.from) e[f] = args.to;
      for (const r of this.preview.recurring) for (const f of field) if (r[f] === args.from) r[f] = args.to;
      this.persistPreview();
      this.syncPreview();
      this.changed();
    }
    return {};
  }

  /** Starts the preview again from the example data. */
  resetPreview() {
    this.preview = { ...sampleData(new Date()), receipts: {} };
    this.persistPreview();
    this.syncPreview();
    this.changed();
  }
}

export const store = new Store();
