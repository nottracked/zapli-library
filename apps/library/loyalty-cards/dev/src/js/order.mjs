// The order of the wallet: favourites always first, then most used, last used, A to Z, or the user's own order
// ("mine": the card ids in the order the user dragged or moved them, kept in the page's settings).

import { fold } from "./brands.mjs";

export const ORDERS = ["use", "recent", "name", "mine"];

const time = (c) => (c.lastUsed ? Date.parse(c.lastUsed) || 0 : 0);
const created = (c) => (c.createdAt ? Date.parse(c.createdAt) || 0 : 0);
const byName = (a, b) => fold(a.store).localeCompare(fold(b.store));

/**
 * The active cards in the wallet's order: favourites first, then by `order`. In the user's own order (`manual`, a
 * list of ids) a card the list does not have yet (added since) comes first, newest first.
 */
export function orderedCards(cards, order = "use", manual = []) {
  const place = new Map((manual || []).map((id, i) => [id, i]));
  const mine = (a, b) => {
    const pa = place.has(a.id) ? place.get(a.id) : -1;
    const pb = place.has(b.id) ? place.get(b.id) : -1;
    if (pa < 0 && pb < 0) return created(b) - created(a) || byName(a, b);
    return pa - pb;
  };
  const compare =
    {
      use: (a, b) => (b.uses || 0) - (a.uses || 0) || time(b) - time(a) || byName(a, b),
      recent: (a, b) => time(b) - time(a) || (b.uses || 0) - (a.uses || 0) || byName(a, b),
      name: byName,
      mine,
    }[order] || ((a, b) => (b.uses || 0) - (a.uses || 0) || byName(a, b));
  return cards.filter((c) => !c.archived).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || compare(a, b));
}

/**
 * The user's own order after moving card `id` by `delta` places among the cards of its group (favourites or the
 * others), starting from the order on show. Returns null when the card cannot move that way.
 */
export function moved(cards, order, manual, id, delta) {
  const shown = orderedCards(cards, order, manual);
  const card = shown.find((c) => c.id === id);
  if (!card) return null;
  const group = shown.filter((c) => Boolean(c.pinned) === Boolean(card.pinned));
  const at = group.indexOf(card);
  const to = at + delta;
  if (to < 0 || to >= group.length) return null;
  group.splice(at, 1);
  group.splice(to, 0, card);
  const favourites = card.pinned ? group : shown.filter((c) => c.pinned);
  const others = card.pinned ? shown.filter((c) => !c.pinned) : group;
  return [...favourites, ...others].map((c) => c.id);
}
