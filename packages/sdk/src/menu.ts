import type { Definition } from '@overweave/core';
import { type AccessSubject, accessOf, type MenuItemSpec } from './kinds.ts';

/*
 * A context menu, as its items make it: those on its subject, not hidden,
 * not denied the one signed in, whose when says so — in groups: open, state, copy, then each of the
 * addons' own (by their first item's order), the dangerous last whatever
 * they say; in a group, by order, then name. A group none is in is not
 * there (nor a line for it). The same for whoever draws it.
 */

/** The groups everyone knows, in their order; the dangerous ones' after all. */
export const MENU_GROUPS = ['open', 'state', 'copy'] as const;
export const DANGER = 'danger';
/** Where an item that says no group is: its own, after the known ones. */
const OTHER = 'other';

export interface MenuGroupOf {
  group: string;
  items: Definition<MenuItemSpec>[];
}

/** The menu of a subject (on) about this one: its groups, in order; empty: no menu. A when that throws: not shown, told (failed). */
export function menuOf(
  items: readonly Definition<MenuItemSpec>[],
  on: string,
  subject: unknown,
  failed?: (definition: Definition<MenuItemSpec>, error: unknown) => void,
): MenuGroupOf[] {
  const shown = items.filter((d) => {
    // Not for the one signed in (the access layer's word): not there.
    if (d.spec.on !== on || d.spec.hidden || accessOf(d, subject as AccessSubject) === 'denied') return false;
    try {
      return d.spec.when?.(subject) ?? true;
    } catch (error) {
      failed?.(d, error);
      return false;
    }
  });
  const byOrder = (a: Definition<MenuItemSpec>, b: Definition<MenuItemSpec>) => (a.spec.order ?? 500) - (b.spec.order ?? 500) || a.name.localeCompare(b.name);
  const groups = new Map<string, Definition<MenuItemSpec>[]>();
  for (const d of [...shown].sort(byOrder)) {
    const group = d.spec.danger ? DANGER : (d.spec.group ?? OTHER);
    groups.set(group, [...(groups.get(group) ?? []), d]);
  }
  const rank = (group: string) => (group === DANGER ? 2 : (MENU_GROUPS as readonly string[]).includes(group) ? 0 : 1);
  return [...groups]
    .sort(([a, ia], [b, ib]) => rank(a) - rank(b) || (rank(a) === 0 ? MENU_GROUPS.indexOf(a as never) - MENU_GROUPS.indexOf(b as never) : byOrder(ia[0], ib[0])))
    .map(([group, items]) => ({ group, items }));
}
