// Which cards Home shows, and in which order. The choice is one of the page's settings (store.ui.home, kept in the
// app's own store with the language and the drafts) as {order: [ids], hidden: [ids]}; no choice at all means every
// card in its usual place. A card a later version adds joins at its usual place, shown, and an id this version does
// not know is ignored, so an older or newer choice never breaks Home.

/** Every card Home can show, in its usual order. */
export const HOME_CARDS = ["safe", "month", "balance", "quick", "due", "budgets", "subscriptions", "recent"];

/** The cards in the order the user chose: known ids once each, missing ones at their usual place. */
export function homeOrder(saved) {
  const order = [];
  for (const id of saved && Array.isArray(saved.order) ? saved.order : []) {
    if (HOME_CARDS.includes(id) && !order.includes(id)) order.push(id);
  }
  HOME_CARDS.forEach((id, usual) => {
    if (order.includes(id)) return;
    // After the nearest card that comes before it in the usual order, else first.
    const before = HOME_CARDS.slice(0, usual)
      .reverse()
      .find((other) => order.includes(other));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  return order;
}

/** Whether a card is switched on (every card is, until the user hides it). */
export function isShown(saved, id) {
  return !(saved && Array.isArray(saved.hidden) && saved.hidden.includes(id));
}

/** The choice with one card shown or hidden. */
export function withShown(saved, id, on) {
  const hidden = HOME_CARDS.filter((card) => card !== id && !isShown(saved, card));
  if (!on) hidden.push(id);
  return { order: homeOrder(saved), hidden: HOME_CARDS.filter((card) => hidden.includes(card)) };
}

/** The choice with one card moved `step` places (−1 up, +1 down); at either end it stays. */
export function withMoved(saved, id, step) {
  const order = homeOrder(saved);
  const from = order.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= order.length) return { order, hidden: hiddenOf(saved) };
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { order, hidden: hiddenOf(saved) };
}

/** How many cards are switched on. */
export function shownCount(saved) {
  return HOME_CARDS.filter((id) => isShown(saved, id)).length;
}

/** Whether the choice is the usual one: every card shown, in the usual order. */
export function isUsual(saved) {
  return shownCount(saved) === HOME_CARDS.length && homeOrder(saved).every((id, i) => id === HOME_CARDS[i]);
}

function hiddenOf(saved) {
  return HOME_CARDS.filter((id) => !isShown(saved, id));
}
