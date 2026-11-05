// Checks that an update from Expenses 3 keeps everything it stored: every stored field, setting and home-screen
// widget of version 3.4.3 is still declared with the same type (or a wider one), no migration step removes one, and
// setUp turns the settings into the preferences (prefs) and the ways of paying into accounts.
// Run from the repository root: node apps/library/expenses/dev/check-carry-over.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, "../package/manifest.json"), "utf8"));

// What version 3.4.3 stored: entity → field → type (computed and inverse fields are not stored).
const STORED_IN_3 = {
  category: { name: "text", icon: "choice", color: "color", budget: "decimal" },
  expense: {
    amount: "decimal",
    category: "ref",
    note: "text",
    date: "date",
    payment: "choice",
    receipt: "image",
    recurring: "ref",
  },
  recurring: {
    name: "text",
    amount: "decimal",
    category: "ref",
    schedule: "recurrence",
    nextDue: "date",
    mode: "choice",
    payment: "choice",
    active: "boolean",
    note: "text",
  },
};
const SETTINGS_IN_3 = {
  currency: "choice",
  monthlyBudget: "decimal",
  budgetAlerts: "boolean",
  warnAt: "integer",
  addedNotice: "boolean",
  remindDaily: "boolean",
  remindAt: "time",
  defaultPayment: "choice",
};
const CHOICES_IN_3 = {
  "expense.payment": ["cash", "card", "transfer", "mobile", "other"],
  "recurring.payment": ["cash", "card", "transfer", "mobile", "other"],
  "recurring.mode": ["auto", "ask"],
  "settings.defaultPayment": ["cash", "card", "transfer", "mobile", "other"],
  "settings.currency": [
    "EUR",
    "USD",
    "GBP",
    "CHF",
    "CZK",
    "PLN",
    "HUF",
    "RON",
    "SEK",
    "NOK",
    "DKK",
    "UAH",
    "TRY",
  ].concat(["CAD", "AUD", "NZD", "JPY", "CNY", "INR", "BRL", "MXN", "ZAR"]),
};
const WIDGETS_IN_3 = { monthWidget: "stat", addWidget: "button" };

const options = (node) => (node.options || []).map((o) => (typeof o === "string" ? o : o.value));
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error("FAIL " + name);
    throw error;
  }
}

test("every stored field of version 3 is still declared with its type", () => {
  for (const [entity, fields] of Object.entries(STORED_IN_3)) {
    for (const [id, type] of Object.entries(fields)) {
      const field = manifest.entities[entity]?.fields?.[id];
      assert.ok(field, `${entity}.${id} is declared`);
      assert.equal(field.type, type, `${entity}.${id} keeps its type`);
      assert.equal(field.compute, undefined, `${entity}.${id} is stored, not computed`);
    }
  }
});

test("every setting of version 3 is still declared with its type", () => {
  for (const [id, type] of Object.entries(SETTINGS_IN_3)) {
    assert.equal(manifest.settings?.[id]?.type, type, `settings.${id} keeps its type`);
  }
});

test("no choice of version 3 lost an option", () => {
  for (const [path, values] of Object.entries(CHOICES_IN_3)) {
    const [owner, id] = path.split(".");
    const node = owner === "settings" ? manifest.settings[id] : manifest.entities[owner].fields[id];
    for (const value of values) assert.ok(options(node).includes(value), `${path} still offers ${value}`);
  }
});

test("no migration step removes a field of version 3", () => {
  for (const entry of manifest.migrations || []) {
    for (const step of entry.steps) {
      if (step.op !== "deleteField") continue;
      assert.ok(!STORED_IN_3[step.entity]?.[step.field], `${step.entity}.${step.field} is not deleted`);
    }
  }
});

test("the widgets people placed with version 3 are still there", () => {
  for (const [id, template] of Object.entries(WIDGETS_IN_3)) {
    assert.equal(manifest.widgets?.[id]?.template, template, `widget ${id} keeps its template`);
  }
});

test("setUp makes the preferences from the settings and runs on install and on update", () => {
  const steps = manifest.actions.setUp.steps;
  const makes = steps.find((s) => s.type === "createRecord" && s.entity === "prefs");
  const prefsFields = Object.keys(manifest.entities.prefs.fields);
  for (const id of Object.keys(SETTINGS_IN_3).filter((id) => prefsFields.includes(id))) {
    assert.equal(makes.values[id], "=settings." + id, `a new prefs record takes settings.${id}`);
  }
  assert.match(makes.values.defaultAccount, /settings\.defaultPayment == 'cash'/);
  const ons = Object.values(manifest.triggers)
    .filter((t) => t.type === "app" && t.do === "setUp")
    .map((t) => t.on);
  assert.deepEqual(ons.sort(), ["firstRun", "updated"]);
});

test("setUp gives entries and recurring entries of version 3 an account by how they were paid", () => {
  const steps = manifest.actions.setUp.steps;
  const runs = (action) => steps.filter((s) => s.type === "forEach" && s.do === action);
  assert.ok(runs("placePayment").length >= 1);
  assert.ok(runs("placeRulePayment").length >= 1);
  assert.ok(runs("markReceipt").length >= 1);
  assert.equal(
    manifest.actions.placePayment.steps[0].set.account,
    "=args.entry.payment == 'cash' ? coalesce(args.cash, args.bank) : args.bank",
  );
  assert.equal(manifest.queries.paidBefore.where.includes("item.account == null"), true);
});

console.log("ok: " + passed + " groups of checks passed");
