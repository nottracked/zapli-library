// The app's data. Inside Zapli the cards are the app's own declared records (zapli.data), so backups, the home-screen
// widget and expiry reminders see them while the app is closed; the page's settings and the photos of cards live in
// zapli.data.kv. In a plain browser (a preview) the same calls run on made-up cards kept in this browser's storage.

import { sampleCards } from "./sample.mjs";

const PREVIEW_KEY = "loyalty-cards-preview-v3";
const FIELDS = [
  "store",
  "number",
  "format",
  "holder",
  "group",
  "points",
  "expires",
  "note",
  "color",
  "pinned",
  "archived",
  "brand",
  "remind",
];

/** The fields a page may write, with empty values left out (a new record simply has none there). */
export function writable(values, { keepEmpty = false } = {}) {
  const out = {};
  for (const key of FIELDS) {
    if (!(key in values)) continue;
    const v = values[key];
    if (v === "" || v === undefined || (v === null && !keepEmpty)) continue;
    out[key] = v;
  }
  return out;
}

class Store {
  constructor() {
    this.live = false;
    this.zapli = null;
    this.cards = [];
    this.importLog = null;
    this.photos = { face: new Set(), back: new Set() };
    this.photoCache = new Map();
    this.ui = {};
    this.listeners = new Set();
    this.preview = null;
    this.scheduled = false;
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Tells the screens once per frame that something changed. */
  changed() {
    if (this.scheduled) return;
    this.scheduled = true;
    const run = () => {
      this.scheduled = false;
      for (const listener of this.listeners) listener();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  card(id) {
    return this.cards.find((c) => c.id === id) || null;
  }

  /** Starts the store: inside Zapli on the app's records, else on example cards in this browser. */
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
    await Promise.all([this.watchCards(), this.loadPhotoKeys()]);
    this.keepReminderChoice();
    this.zapli.data.watch("importLog", { sort: ["-at"], limit: 1 }, (items) => {
      this.importLog = items[0] || null;
      this.changed();
    });
    this.zapli.app.on("resume", () => this.changed());
  }

  /**
   * Cards kept from before reminders were per card have no reminder of their own: until they get one, the earlier
   * setting for all cards ("Remind me before a card expires") decides whether they remind. The declared action
   * keepReminderChoice writes that setting into each of them once, so a card's switch on the edit screen shows what
   * will happen. Cards added since start with the setting's value, so there is nothing to do for them.
   */
  async keepReminderChoice() {
    if (!this.cards.some((c) => c.remind === undefined || c.remind === null)) return;
    try {
      await this.zapli.data.runAction("keepReminderChoice", {});
    } catch {
      // The reminders follow the setting meanwhile; the switches catch up at the next start.
    }
  }

  watchCards() {
    return new Promise((resolve) => {
      let first = true;
      this.zapli.data.watch("card", { sort: ["store"], limit: 2000 }, (items) => {
        this.cards = items;
        this.changed();
        if (first) {
          first = false;
          resolve();
        }
      });
      // A watch that never answers must not hold the app back.
      setTimeout(resolve, 4000);
    });
  }

  async loadPhotoKeys() {
    try {
      const keys = await this.zapli.data.kv.keys("photo:");
      for (const key of keys) {
        const [, side, id] = key.split(":");
        if (this.photos[side]) this.photos[side].add(id);
      }
    } catch {
      // Without the keys the cards show their colours; photos load when a card is opened.
    }
  }

  // ---------------------------------------------------------------- writes

  async add(values) {
    if (!this.live) return this.previewAdd(values);
    const record = await this.zapli.data.add("card", writable(values));
    this.applyLocal(record);
    return record;
  }

  async update(id, patch) {
    if (!this.live) return this.previewUpdate(id, patch);
    const record = await this.zapli.data.update("card", id, patch);
    this.applyLocal(record);
    return record;
  }

  async remove(id) {
    if (!this.live) return this.previewRemove(id);
    await this.zapli.data.remove("card", id);
    this.cards = this.cards.filter((c) => c.id !== id);
    for (const side of ["face", "back"]) if (this.photos[side].has(id)) await this.deletePhoto(side, id);
    this.changed();
  }

  /** Shows a write at once; the watch confirms it a moment later. */
  applyLocal(record) {
    if (!record) return;
    this.cards = this.cards.filter((c) => c.id !== record.id).concat(record);
    this.changed();
  }

  /** Runs one of the app's declared actions (import, export, the code's brightness). Call it straight from a tap. */
  async run(action, args = {}) {
    if (!this.live) return this.previewAction(action, args);
    return this.zapli.data.runAction(action, args);
  }

  /** Counts a card as shown: how often and when, for the order of the wallet and the widget. */
  async markUsed(id) {
    if (!this.live) {
      const card = this.card(id);
      if (card) this.previewUpdate(id, { uses: (card.uses || 0) + 1, lastUsed: new Date().toISOString() });
      return;
    }
    try {
      await this.zapli.data.runAction("markUsed", { card: id });
    } catch {
      // Counting is a nicety; the card was shown anyway.
    }
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

  // ---------------------------------------------------------------- photos (kv "photo:<side>:<card id>")

  hasPhoto(side, id) {
    return this.photos[side].has(id);
  }

  /** A photo as {type, b64, w, h}, or null. */
  async photo(side, id) {
    const key = `photo:${side}:${id}`;
    if (this.photoCache.has(key)) return this.photoCache.get(key);
    let value = null;
    if (this.live) {
      try {
        value = (await this.zapli.data.kv.get(key)) || null;
      } catch {
        value = null;
      }
    } else value = (this.preview.photos || {})[key] || null;
    this.photoCache.set(key, value);
    return value;
  }

  async setPhoto(side, id, picture) {
    const key = `photo:${side}:${id}`;
    if (this.live) await this.zapli.data.kv.set(key, picture);
    else {
      this.preview.photos = { ...(this.preview.photos || {}), [key]: picture };
      this.persistPreview();
    }
    this.photoCache.set(key, picture);
    this.photos[side].add(id);
    this.changed();
  }

  async deletePhoto(side, id) {
    const key = `photo:${side}:${id}`;
    if (this.live) {
      try {
        await this.zapli.data.kv.delete(key);
      } catch {
        // Already gone.
      }
    } else if (this.preview.photos) {
      delete this.preview.photos[key];
      this.persistPreview();
    }
    this.photoCache.delete(key);
    this.photos[side].delete(id);
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
    this.preview = saved || { cards: sampleCards(), photos: {}, ui: {}, next: 100 };
    this.cards = this.preview.cards;
    this.ui = this.preview.ui || {};
    for (const key of Object.keys(this.preview.photos || {})) {
      const [, side, id] = key.split(":");
      if (this.photos[side]) this.photos[side].add(id);
    }
    this.changed();
  }

  persistPreview() {
    this.preview.cards = this.cards;
    this.preview.ui = this.ui;
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(this.preview));
    } catch {
      // A preview without storage forgets its changes on reload.
    }
  }

  previewAdd(values) {
    const now = new Date().toISOString();
    const record = { id: "p" + this.preview.next++, createdAt: now, updatedAt: now, uses: 0, ...writable(values) };
    if (this.cards.some((c) => c.store === record.store && c.number === record.number)) {
      throw Object.assign(new Error("duplicate"), { code: "INVALID_DATA" });
    }
    this.cards = this.cards.concat(record);
    this.persistPreview();
    this.changed();
    return record;
  }

  previewUpdate(id, patch) {
    let updated = null;
    this.cards = this.cards.map((c) => {
      if (c.id !== id) return c;
      updated = { ...c, ...patch, updatedAt: new Date().toISOString() };
      for (const [k, v] of Object.entries(patch)) if (v === null) delete updated[k];
      return updated;
    });
    this.persistPreview();
    this.changed();
    return updated;
  }

  previewRemove(id) {
    this.cards = this.cards.filter((c) => c.id !== id);
    for (const side of ["face", "back"]) {
      delete (this.preview.photos || {})[`photo:${side}:${id}`];
      this.photos[side].delete(id);
    }
    this.persistPreview();
    this.changed();
  }

  previewAction(action) {
    if (action === "screenOn" || action === "markUsed") return {};
    const error = new Error("preview");
    error.code = "UNSUPPORTED";
    throw error;
  }
}

export const store = new Store();
