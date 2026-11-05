// The app's data. Inside Zapli the notes, labels and the one preferences record are the app's declared records
// (zapli.data), so Zapli's backup, the home-screen widgets and the reminders see them even while the app is closed;
// the page's own settings and the photos live in zapli.data.kv. In a plain browser (a preview) the same calls run on
// made-up notes kept in this browser's storage.

import { fold, labelsOf, photoIds, plainBody, sameLabel, cleanLabel, isoLocal } from "./model.mjs";
import { sampleData } from "./sample.mjs";

const PAGE = 2000;
const PREVIEW_KEY = "notes-preview-v1";

/** Adds what the page reads often to a stored note: its labels and photos as lists, and its text folded for search. */
function normalize(note) {
  note.kind = note.kind === "list" ? "list" : "text";
  note.color = note.color || "none";
  note._labels = labelsOf(note.labels);
  note._photos = photoIds(note.photos);
  note._fold = fold([note.title || "", plainBody(note), note._labels.join(" ")].join("\n"));
  return note;
}

class Store {
  constructor() {
    this.live = false;
    this.zapli = null;
    this.notes = new Map();
    this.labelRecords = [];
    this.prefs = null;
    this.ui = {};
    this.listeners = new Set();
    this.loaded = false;
    this.scheduled = false;
    this.lastSeen = "";
    this.preview = null;
    this.thumbs = new Map();
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

  // ---------------------------------------------------------------- reading

  get all() {
    return [...this.notes.values()];
  }

  get(id) {
    return this.notes.get(id) || null;
  }

  /** Notes on the main screen: not archived and not in the trash. */
  get active() {
    return this.all.filter((n) => !n.trashedAt && !n.archived);
  }

  get archived() {
    return this.all.filter((n) => !n.trashedAt && n.archived);
  }

  get trashed() {
    return this.all.filter((n) => n.trashedAt);
  }

  /** Every label: the label records and any name a note carries that has no record yet, sorted by name. */
  get labels() {
    const names = [];
    const add = (name) => {
      const clean = cleanLabel(name);
      if (clean && !names.some((n) => sameLabel(n, clean))) names.push(clean);
    };
    for (const record of this.labelRecords) add(record.name);
    for (const note of this.notes.values()) if (!note.trashedAt) note._labels.forEach(add);
    const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    return names.sort((a, b) => collator.compare(a, b));
  }

  labelRecord(name) {
    return this.labelRecords.find((r) => sameLabel(r.name, name)) || null;
  }

  // ---------------------------------------------------------------- start

  /** Starts the store: inside Zapli on the app's records, else on example notes in this browser. */
  async open(lang) {
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
    if (!this.live) return this.openPreview(lang);
    try {
      this.ui = (await this.zapli.data.kv.get("ui")) || {};
    } catch {
      this.ui = {};
    }
    await Promise.all([this.loadNotes(), this.watchList("label", { sort: ["name"], limit: 2000 }), this.watchPrefs()]);
    this.watchNotes();
    this.loaded = true;
    this.changed();
  }

  /** Reads every note, a page at a time. */
  async loadNotes() {
    const all = new Map();
    let cursor;
    let newest = "";
    do {
      const page = await this.zapli.data.query("note", { sort: ["-updatedAt"], limit: PAGE, cursor });
      for (const item of page.items) {
        all.set(item.id, normalize(item));
        if (item.updatedAt > newest) newest = item.updatedAt;
      }
      cursor = page.cursor;
    } while (cursor);
    this.notes = all;
    this.lastSeen = newest;
    this.changed();
  }

  /** Notes written since the last look (by this page, a reminder or an import) are merged in. */
  async loadChanges() {
    if (!this.lastSeen) return this.loadNotes();
    let cursor;
    do {
      const page = await this.zapli.data.query("note", {
        where: { updatedAt: { gte: this.lastSeen } },
        sort: ["updatedAt"],
        limit: PAGE,
        cursor,
      });
      for (const item of page.items) {
        this.notes.set(item.id, normalize(item));
        if (item.updatedAt > this.lastSeen) this.lastSeen = item.updatedAt;
      }
      cursor = page.cursor;
    } while (cursor);
    this.changed();
  }

  /** The newest change to any note is the signal to read what changed; a return to the app reads everything. */
  watchNotes() {
    let first = true;
    try {
      this.zapli.data.watch("note", { sort: ["-updatedAt"], limit: 1 }, () => {
        if (first) {
          first = false;
          return;
        }
        this.loadChanges().catch(() => {});
      });
    } catch {
      // Without live updates the screens still follow every write the page makes.
    }
    try {
      this.zapli.app.on("resume", () => this.loadNotes().catch(() => {}));
    } catch {
      // Older Zapli: no resume event.
    }
  }

  watchList(entity, query) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      try {
        this.zapli.data.watch(entity, query, (items) => {
          if (entity === "label") this.labelRecords = items;
          this.changed();
          finish();
        });
      } catch {
        finish();
      }
      // A list that never answers must not hold the app back.
      setTimeout(finish, 4000);
    });
  }

  watchPrefs() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      try {
        this.zapli.data.watch("prefs", { limit: 1 }, (items) => {
          this.prefs = items[0] || null;
          this.changed();
          finish();
        });
      } catch {
        finish();
      }
      setTimeout(finish, 4000);
    });
  }

  // ---------------------------------------------------------------- writes

  /** Adds a note; values left empty are not sent. Resolves with the stored note. */
  async add(values) {
    const given = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== null && v !== undefined && v !== ""),
    );
    if (!this.live) return this.previewWrite("add", null, given);
    const record = await this.zapli.data.add("note", given);
    this.applyLocal(record);
    return this.notes.get(record.id);
  }

  /** Changes a note; a null value clears that field. */
  async update(id, patch) {
    if (!this.live) return this.previewWrite("update", id, patch);
    const record = await this.zapli.data.update("note", id, patch);
    this.applyLocal(record);
    return this.notes.get(record.id);
  }

  /** Deletes a note for good, and its photos. */
  async remove(id) {
    const note = this.notes.get(id);
    if (!this.live) this.previewWrite("remove", id);
    else {
      await this.zapli.data.remove("note", id);
      this.notes.delete(id);
      this.changed();
    }
    if (note) for (const photo of note._photos) await this.deletePhoto(photo);
  }

  applyLocal(record) {
    if (!record) return;
    this.notes.set(record.id, normalize(record));
    if (record.updatedAt > this.lastSeen) this.lastSeen = record.updatedAt;
    this.changed();
  }

  /** Makes a label record for every name that has none yet. */
  async ensureLabels(names) {
    for (const name of names) {
      const clean = cleanLabel(name);
      if (!clean || this.labelRecord(clean)) continue;
      try {
        if (!this.live) {
          this.previewLabel("add", null, clean);
          continue;
        }
        const record = await this.zapli.data.add("label", { name: clean });
        this.labelRecords = [...this.labelRecords, record];
      } catch {
        // A label of the same name arrived meanwhile: nothing to do.
      }
    }
    this.changed();
  }

  /** Renames a label everywhere: its record and every note that carries it. */
  async renameLabel(from, to) {
    const record = this.labelRecord(from);
    const target = this.labelRecord(to);
    if (!this.live) {
      for (const note of this.preview.note) {
        const list = labelsOf(note.labels).map((n) => (sameLabel(n, from) ? to : n));
        note.labels = labelsOf(list.join(",")).join(", ");
      }
      if (record && !target) record.name = to;
      else if (record) this.preview.label = this.preview.label.filter((r) => r !== record);
      this.persistPreview();
      this.syncPreview();
      return;
    }
    if (record && (!target || target === record)) await this.zapli.data.update("label", record.id, { name: to });
    else if (record) await this.zapli.data.remove("label", record.id);
    else if (!target) await this.zapli.data.add("label", { name: to });
    await this.zapli.data.runAction("renameLabel", { from: record ? record.name : from, to });
    await this.loadNotes();
    await this.relabelLeftovers(from, to);
  }

  /**
   * Notes that still carry a label after the bulk action (written in another case or with other separators, as
   * an import may leave them) are changed one by one.
   */
  async relabelLeftovers(from, to) {
    for (const note of this.all) {
      if (!note._labels.some((n) => sameLabel(n, from))) continue;
      const list = note._labels.map((n) => (sameLabel(n, from) ? to : n)).filter(Boolean);
      try {
        await this.update(note.id, { labels: labelsOf(list.join(",")).join(", ") || null });
      } catch {
        // Left as it is; the next rename or edit tidies it.
      }
    }
  }

  /** Deletes a label: its record goes, and the notes keep everything else. */
  async deleteLabel(name) {
    const record = this.labelRecord(name);
    if (!this.live) {
      for (const note of this.preview.note) {
        note.labels = labelsOf(note.labels)
          .filter((n) => !sameLabel(n, name))
          .join(", ");
      }
      this.preview.label = this.preview.label.filter((r) => !sameLabel(r.name, name));
      this.persistPreview();
      this.syncPreview();
      return;
    }
    if (record) await this.zapli.data.remove("label", record.id);
    await this.zapli.data.runAction("renameLabel", { from: record ? record.name : name, to: "" });
    await this.loadNotes();
    await this.relabelLeftovers(name, "");
  }

  async setPrivateReminders(on) {
    if (!this.live) {
      this.preview.prefs = [{ id: "prefs", privateReminders: on }];
      this.persistPreview();
      this.syncPreview();
      return;
    }
    this.prefs = this.prefs
      ? await this.zapli.data.update("prefs", this.prefs.id, { privateReminders: on })
      : await this.zapli.data.add("prefs", { privateReminders: on });
    this.changed();
  }

  /** Runs one of the app's declared actions (import, emptying the trash). Call it straight from a tap. */
  async run(action, args = {}) {
    if (!this.live) return this.previewAction(action, args);
    const result = await this.zapli.data.runAction(action, args);
    await this.loadNotes();
    return result;
  }

  /** Saves the page's own settings (view, order, language and the like). */
  async saveUi(patch) {
    this.ui = { ...this.ui, ...patch };
    this.changed();
    if (this.live) {
      try {
        await this.zapli.data.kv.set("ui", this.ui);
      } catch {
        // Kept for this session.
      }
    } else this.persistPreview();
  }

  // ---------------------------------------------------------------- photos

  async kvGet(key) {
    if (!this.live) return (this.preview.kv || {})[key] || null;
    try {
      return (await this.zapli.data.kv.get(key)) || null;
    } catch {
      return null;
    }
  }

  async kvSet(key, value) {
    if (!this.live) {
      this.preview.kv = { ...(this.preview.kv || {}), [key]: value };
      this.persistPreview();
      return;
    }
    await this.zapli.data.kv.set(key, value);
  }

  async kvDelete(key) {
    if (!this.live) {
      if (this.preview.kv) delete this.preview.kv[key];
      this.persistPreview();
      return;
    }
    try {
      await this.zapli.data.kv.delete(key);
    } catch {
      // Gone already.
    }
  }

  photo(id) {
    return this.kvGet("photo:" + id);
  }

  /** A photo's small picture as a data: URL (kept in memory once read), or null. */
  async thumbUrl(id) {
    if (this.thumbs.has(id)) return this.thumbs.get(id);
    const value = (await this.kvGet("thumb:" + id)) || (await this.kvGet("photo:" + id));
    const url = value && value.b64 ? "data:" + (value.type || "image/jpeg") + ";base64," + value.b64 : null;
    if (url) this.thumbs.set(id, url);
    return url;
  }

  async putPhoto(id, full, thumb) {
    await this.kvSet("photo:" + id, full);
    await this.kvSet("thumb:" + id, thumb);
    this.thumbs.set(id, "data:" + thumb.type + ";base64," + thumb.b64);
  }

  async deletePhoto(id) {
    this.thumbs.delete(id);
    await this.kvDelete("photo:" + id);
    await this.kvDelete("thumb:" + id);
  }

  /** Deletes the photos no note holds any more (a note the trash deleted by itself leaves its photos behind). */
  async sweepPhotos() {
    if (!this.live) return;
    try {
      const keys = await this.zapli.data.kv.keys("photo:");
      const held = new Set();
      for (const note of this.notes.values()) note._photos.forEach((p) => held.add(p));
      for (const key of keys) {
        const id = key.slice(6);
        if (!held.has(id)) await this.deletePhoto(id);
      }
    } catch {
      // Tried again at the next start.
    }
  }

  // ---------------------------------------------------------------- the browser preview

  openPreview(lang) {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(PREVIEW_KEY) || "null");
    } catch {
      saved = null;
    }
    this.preview = saved || sampleData(new Date(), lang);
    this.ui = this.preview.ui || {};
    this.syncPreview();
    this.loaded = true;
    this.changed();
  }

  syncPreview() {
    this.notes = new Map(this.preview.note.map((n) => [n.id, normalize({ ...n })]));
    this.labelRecords = [...(this.preview.label || [])];
    this.prefs = (this.preview.prefs || [])[0] || null;
    this.changed();
  }

  persistPreview() {
    this.preview.ui = this.ui;
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(this.preview));
    } catch {
      // Storage blocked or full: the preview keeps working in memory.
    }
  }

  previewWrite(kind, id, values) {
    const list = this.preview.note;
    const now = isoLocal(new Date());
    let record = null;
    if (kind === "add") {
      record = {
        id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        createdAt: now,
        updatedAt: now,
      };
      record.kind = "text";
      record.color = "none";
      record.pinned = false;
      record.archived = false;
      for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined) record[k] = v;
      list.push(record);
    } else if (kind === "update") {
      const index = list.findIndex((r) => r.id === id);
      if (index < 0) throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
      record = { ...list[index], updatedAt: now };
      for (const [k, v] of Object.entries(values)) {
        if (v === null || v === undefined) delete record[k];
        else record[k] = v;
      }
      list[index] = record;
    } else {
      this.preview.note = list.filter((r) => r.id !== id);
    }
    this.persistPreview();
    this.syncPreview();
    return record ? this.notes.get(record.id) : null;
  }

  previewLabel(kind, id, name) {
    this.preview.label = this.preview.label || [];
    if (kind === "add")
      this.preview.label.push({ id: "l" + Date.now().toString(36) + this.preview.label.length, name });
    this.persistPreview();
    this.syncPreview();
  }

  previewAction(action) {
    if (action === "emptyTrash") {
      const gone = this.preview.note.filter((n) => n.trashedAt);
      this.preview.note = this.preview.note.filter((n) => !n.trashedAt);
      this.persistPreview();
      this.syncPreview();
      return { removed: gone.length };
    }
    throw Object.assign(new Error("Only in the app"), { code: "UNSUPPORTED" });
  }

  /** Starts the preview again from the made-up notes. */
  resetPreview(lang) {
    this.preview = sampleData(new Date(), lang);
    this.ui = {};
    this.persistPreview();
    this.syncPreview();
  }
}

export const store = new Store();
