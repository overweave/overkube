/*
 * What the tabs are, as two lists of keys — pinned, open — and how they
 * change: the rules of the strip, apart from drawing it, for whoever keeps
 * the lists (a page's state, a story's). Each takes the lists and gives new
 * ones; none changes what it is given.
 *
 * - Pinned: a tab is pinned at the end of the pinned (no longer open).
 * - Unpinned: it goes, unless it is the one shown: then it is the first
 *   of the open (it stays open).
 * - Moved: into a section at a place among its tabs (into the pinned:
 *   pinned; into the open: unpinned, open).
 * - Opened: one in neither is open, last.
 * - Closed: an open one goes; the one shown next is its right neighbour,
 *   else its left.
 * - Dragged over a section: looks as it will there (lookIn).
 */

export interface TabLists {
  pinned: string[];
  open: string[];
}

const without = (keys: readonly string[], key: string) => keys.filter((k) => k !== key);

/** Pinned (last of the pinned) or unpinned (gone; the one shown, first of the open). */
export function pinTab(tabs: TabLists, key: string, pin: boolean, shown?: string): TabLists {
  if (pin) return { pinned: [...without(tabs.pinned, key), key], open: without(tabs.open, key) };
  const open = without(tabs.open, key);
  return { pinned: without(tabs.pinned, key), open: key === shown ? [key, ...open] : open };
}

/** Moved into a section ("pinned", else open) at a place among its tabs. */
export function moveTab(tabs: TabLists, key: string, section: string, index: number): TabLists {
  const next = { pinned: without(tabs.pinned, key), open: without(tabs.open, key) };
  (section === 'pinned' ? next.pinned : next.open).splice(index, 0, key);
  return next;
}

/** Open, last — unless it is a tab already. */
export function openTab(tabs: TabLists, key: string): TabLists {
  return tabs.pinned.includes(key) || tabs.open.includes(key) ? tabs : { ...tabs, open: [...tabs.open, key] };
}

/** An open one closed (a pinned one stays). */
export function closeTab(tabs: TabLists, key: string): TabLists {
  return { ...tabs, open: without(tabs.open, key) };
}

/** The tab shown when one closes: its right neighbour among all of them, else its left. */
export function nextTab(tabs: TabLists, key: string): string | undefined {
  const all = [...tabs.pinned, ...tabs.open];
  const at = all.indexOf(key);
  if (at < 0) return undefined;
  return all[at + 1] ?? all[at - 1];
}

/** A tab as it will be in the section it is dragged over: the pinned (its pin), or the open (its ×). */
export function lookIn<T extends { pinned?: boolean; closable?: boolean; transient?: boolean }>(tab: T, section: string): T {
  const pinned = section === 'pinned';
  return { ...tab, pinned, closable: !pinned, transient: !pinned };
}
