import type { KubeObject } from '@overkube/kube-types';
import type { KindRef } from '@overkube/query';
import { signal } from '@preact/signals';

/*
 * What kinds own what kinds, learned from the objects read: each object's
 * owners (ownerReferences: apiVersion and kind) — an owner's kind, by its
 * group and kind (apps/Deployment: whatever version its owners say), owns
 * the object's kind. Kept for the page's
 * life (a kind once seen owned stays known), each kind's objects looked
 * through again only as they change, and not more often than a while (one
 * changed sooner: looked through once the while is over — those reading
 * it told then, due).
 */

/** How long a kind's objects, changed, wait before they are looked through again. */
export const OWNED_EVERY_MS = 5_000;

export class OwnedKinds {
  /** By an owner's group and kind: the refs of the kinds it was seen owning. */
  private readonly owns = new Map<string, Set<KindRef>>();
  /** By the kind (and what of it) looked through: its revision then, and when. */
  private readonly looked = new Map<string, { revision: unknown; at: number }>();
  /** Moves when those changed too soon may be looked through: read by whoever learns (asked again then). */
  readonly due = signal(0);
  private waiting: { timer: ReturnType<typeof setTimeout>; at: number } | undefined;

  /** Those objects of a kind looked through (as of a revision: the same one, not again; one changed lately: once the while is over). */
  learn(key: string, kind: KindRef, revision: unknown, objects: () => Iterable<KubeObject>): void {
    this.due.value;
    const had = this.looked.get(key);
    if (had?.revision === revision) return;
    const wait = had ? had.at + OWNED_EVERY_MS - Date.now() : 0;
    if (wait > 0) {
      // One wait at a time: the soonest.
      const at = Date.now() + wait;
      if (this.waiting && this.waiting.at <= at) return;
      if (this.waiting) clearTimeout(this.waiting.timer);
      this.waiting = {
        at,
        timer: setTimeout(() => {
          this.waiting = undefined;
          this.due.value++;
        }, wait),
      };
      return;
    }
    this.looked.set(key, { revision, at: Date.now() });
    for (const o of objects())
      for (const r of o.metadata?.ownerReferences ?? []) {
        const of = ownerKey(r.apiVersion, r.kind);
        const kinds = this.owns.get(of) ?? new Set<KindRef>();
        kinds.add(kind);
        this.owns.set(of, kinds);
      }
  }

  /** The kinds an owner's kind (its group and kind) was seen owning, by ref. */
  of(group: string, kind: string): readonly KindRef[] {
    return [...(this.owns.get(`${group}/${kind}`) ?? [])].sort();
  }
}

/** An owner's kind as learned: its group (an apiVersion's, none: the core's) and kind. */
const ownerKey = (apiVersion: string | undefined, kind: string | undefined) => {
  const v = apiVersion ?? '';
  return `${v.includes('/') ? v.slice(0, v.indexOf('/')) : ''}/${kind ?? ''}`;
};
