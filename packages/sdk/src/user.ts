import type { ApplyResult } from '@overweave/core';

/*
 * The user's changes, as a component makes them: how a table is set out,
 * the tabs pinned, the look — each a patch of a definition the user may
 * configure (their contributor's, over every addon's), kept by the page
 * (between visits, wherever it keeps them). A component never patches the
 * registry as the user itself: it asks for the change here (useUser).
 */
export interface UserChanges {
  /** A change of a definition, merged into what the user said of it before (a map key by key; undefined taking one away). Rejected (not the user's to change): nothing changed. */
  patch(kind: string, name: string, change: Record<string, unknown>): ApplyResult;
  /** The user's changes of a kind's definitions taken back — a definition's (of a name), some of its fields (a path: a field, a map's key): what is under them shows again. All of the user's: the page's own to take back, not an addon's. */
  reset(kind: string, name?: string, ...path: string[]): void;
}
