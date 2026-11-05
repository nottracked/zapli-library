// Edit Home: a switch for each card of Home and arrows to change their order. Every change is kept at once in the
// page's settings; Back shows Home as it now is.

import { ctx, h, t, bar, button, iconButton } from "../ui.mjs";
import { HOME_CARDS, homeOrder, isShown, withShown, withMoved, isUsual, shownCount } from "../homecards.mjs";

// The screen draws its own changes, so a redraw after a write never takes the focus from the switch or arrow in use.
export const keep = true;

/** Each card's name in the list and a short line on what it shows. */
const NAMES = {
  safe: ["safeToday", "cardSafeHint"],
  month: ["period_month", "cardMonthHint"],
  balance: ["balance", "cardBalanceHint"],
  quick: ["quickAdd", "cardQuickHint"],
  due: ["comingUp", "cardDueHint"],
  budgets: ["budgets", "cardBudgetsHint"],
  subscriptions: ["subscriptions", "cardSubscriptionsHint"],
  recent: ["recent", "cardRecentHint"],
};

export function render() {
  const list = h("ul", { class: "list card-choices" });
  const resetRow = h("div", { class: "center-actions" });
  // `focus` names the card whose arrow was used; a switch redraws only the reset button, so it keeps the focus.
  const draw = ({ focus = null, whole = true } = {}) => {
    const saved = ctx.store.ui.home;
    if (whole) {
      const order = homeOrder(saved);
      list.textContent = "";
      order.forEach((id, i) => list.appendChild(choice(id, i, order.length, saved, draw)));
    }
    resetRow.textContent = "";
    if (!isUsual(saved))
      resetRow.appendChild(button(t("homeUsual"), () => reset(list, draw), "text", { icon: "undo" }));
    if (focus) {
      // The arrow just used keeps the focus; at either end the other arrow takes it.
      const item = list.querySelector(".card-" + focus.id);
      const wanted = item && item.querySelector(focus.step < 0 ? ".move-up" : ".move-down");
      const other = item && item.querySelector(focus.step < 0 ? ".move-down" : ".move-up");
      const target = wanted && wanted.getAttribute("disabled") === null ? wanted : other;
      if (target) target.focus();
    }
  };
  draw();
  return h(
    "div",
    { class: "screen" },
    bar(t("editHome"), { back: true }),
    h("section", { class: "card" }, h("p", { class: "help intro", text: t("editHomeIntro") }), list),
    resetRow,
  );
}

function save(home) {
  ctx.store.saveUi({ home }).catch(() => {});
}

/** Every card shown again, in the usual order; the focus goes to the first switch. */
function reset(list, draw) {
  save(null);
  draw();
  const first = list.querySelector(".switch");
  if (first) first.focus();
}

function choice(id, index, total, saved, draw) {
  const name = t(NAMES[id][0]);
  const inputId = "home-card-" + id;
  const input = h("input", {
    type: "checkbox",
    role: "switch",
    class: "switch",
    id: inputId,
    checked: isShown(saved, id),
    onChange: (e) => {
      save(withShown(ctx.store.ui.home, id, e.target.checked));
      draw({ whole: false });
    },
  });
  const move = (step) => {
    save(withMoved(ctx.store.ui.home, id, step));
    draw({ focus: { id, step } });
  };
  const arrow = (iconName, label, step, cls, off) =>
    iconButton(iconName, label, () => move(step), { class: cls, attrs: { disabled: off || null } });
  return h(
    "li",
    { class: "card-choice card-" + id },
    h(
      "label",
      { class: "card-choice-text", for: inputId },
      h("span", { class: "row-title", text: name }),
      h("span", { class: "row-sub", text: t(NAMES[id][1]) }),
    ),
    h(
      "span",
      { class: "card-choice-end" },
      arrow("chevronUp", t("moveUp", { name }), -1, "move-up", index === 0),
      arrow("chevronDown", t("moveDown", { name }), 1, "move-down", index === total - 1),
      input,
    ),
  );
}

/** "6 of 8 shown" (or "All shown"), for the row in Settings. */
export function shownText(saved) {
  const n = shownCount(saved);
  return n === HOME_CARDS.length ? t("homeCardsAll") : t("homeCardsShown", { n, total: HOME_CARDS.length });
}
