import { type Right, standingOf, type UserChanges } from '@overkube/sdk';
import type { ApplyResult, Contributor, Registry } from '@overweave/core';
import { type ReadonlySignal, signal } from '@preact/signals';

/*
 * The user's changes: one contributor of the registry, `user` (its priority
 * over every addon's, its rights only to configure — how things look), and
 * what it says kept between visits. The page changes nothing itself: it
 * asks the service, which keeps the user's patches whole — each new one
 * merged into what it said of that definition before (a map's keys one by
 * one, undefined taking one away) — gives them to the registry, and saves
 * them a while after the last change. Read as the page starts: a saved
 * patch that no longer fits (an addon gone, a field no longer the user's)
 * is dropped, one waiting for its definition (a kind not served yet) kept.
 *
 * Where they are kept is a store's (this browser's localStorage now; a
 * server's later, for whoever is signed in; memory in a test or a story).
 * Who the user is, signing in, is to come: it chooses the store. What the
 * components see of it is UserChanges (the sdk's: patch, reset), given by
 * UserProvider.
 */

/** The user's changes as kept: each definition's patch, whole. */
export interface SavedUser {
  version: 1;
  patches: { kind: string; name: string; fields: Record<string, unknown> }[];
}

/** Where the user's changes are kept: read once as the page starts, written as they change. */
export interface UserStore {
  /** What was kept (anything: checked when read); none: nothing yet. */
  load(): Promise<unknown>;
  save(saved: SavedUser): Promise<void>;
}

/** This browser's localStorage, under a key; not to be had (private mode, a quota, no window): nothing kept, nothing thrown. */
export function localStore(key = 'overkube.user', storage: () => Storage | undefined = () => globalThis.localStorage): UserStore {
  return {
    async load() {
      try {
        const text = storage()?.getItem(key);
        return text ? JSON.parse(text) : undefined;
      } catch {
        return undefined;
      }
    },
    async save(saved) {
      storage()?.setItem(key, JSON.stringify(saved));
    },
  };
}

/** Kept in memory only (a test's, a story's): what is said, given back as long as it lives. */
export function memoryStore(kept?: SavedUser): UserStore & { kept: SavedUser | undefined } {
  return {
    kept,
    async load() {
      return this.kept;
    },
    async save(saved) {
      this.kept = saved;
    },
  };
}

// biome-ignore lint/suspicious/noExplicitAny: a registry of the dashboard's kinds, whatever their types.
type AnyRegistry = Registry<any>;
type Fields = Record<string, unknown>;

export interface UserOptions {
  registry: AnyRegistry;
  store: UserStore;
  /** How long after the last change it is saved. */
  saveMs?: number;
  log?: (message: string) => void;
}

const isObject = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A patch merged into one before: objects key by key (undefined taking a key away; one left empty, gone), anything else in place. */
export function merged(before: Fields, change: Fields): Fields {
  const out: Fields = { ...before };
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) delete out[key];
    else if (isObject(value) && isObject(out[key])) {
      const inner = merged(out[key] as Fields, value);
      if (Object.keys(inner).length) out[key] = inner;
      else delete out[key];
    } else out[key] = value;
  }
  return out;
}

/** What was kept, if it is the user's changes as saved; else none. */
function savedOf(v: unknown): SavedUser | undefined {
  if (!isObject(v) || v.version !== 1 || !Array.isArray(v.patches)) return undefined;
  const fine = v.patches.every((p) => isObject(p) && typeof p.kind === 'string' && typeof p.name === 'string' && isObject(p.fields));
  return fine ? (v as unknown as SavedUser) : undefined;
}

const keyOf = (kind: string, name: string) => JSON.stringify([kind, name]);

export class UserService implements UserChanges {
  // biome-ignore lint/suspicious/noExplicitAny: the dashboard's kinds, whatever their types.
  private readonly contributor: Contributor<any, Right>;
  /** Each definition's patch, whole, as given to the registry (counted or waiting). */
  private readonly own = new Map<string, { kind: string; name: string; fields: Fields }>();
  private readonly unsubscribe: () => void;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> = Promise.resolve();
  /** Changed before what was kept was read: to be saved once it is. */
  private early = false;
  private readonly loaded = signal(false);
  /** Whether what was kept has been read (until then, the user's changes of this visit only). */
  readonly ready: ReadonlySignal<boolean> = this.loaded;

  constructor(private readonly options: UserOptions) {
    this.contributor = options.registry.contributor('user', standingOf('user'));
    // A patch the registry takes away later (its definition changed under it): no longer the user's.
    this.unsubscribe = options.registry.subscribe((e) => {
      if (e.type !== 'dropped' || e.contributor !== 'user') return;
      this.own.delete(keyOf(e.kind, e.name));
      this.log(`dropped ${e.kind}/${e.name}: ${JSON.stringify(e.errors)}`);
      this.changed();
    });
  }

  /** What was kept, read and said — under what this visit said already (which wins). Those that no longer fit: dropped, and saved without. */
  async start(): Promise<void> {
    let kept: unknown;
    try {
      kept = await this.options.store.load();
    } catch (error) {
      this.log(`not read: ${error instanceof Error ? error.message : String(error)}`);
    }
    const saved = savedOf(kept);
    if (kept !== undefined && !saved) this.log('what was kept is not the user’s changes: left as it is until saved over');
    let dropped = false;
    this.options.registry.batch(() => {
      for (const p of saved?.patches ?? []) {
        const now = this.own.get(keyOf(p.kind, p.name));
        if (this.apply(p.kind, p.name, merged(p.fields, now?.fields ?? {})).status === 'rejected') dropped = true;
      }
    });
    this.loaded.value = true;
    if (dropped || this.early) this.changed();
  }

  /** A change of the user's to a definition: merged into what they said of it before (undefined taking a key away). Rejected: nothing changed. */
  patch(kind: string, name: string, change: Fields): ApplyResult {
    const result = this.apply(kind, name, merged(this.own.get(keyOf(kind, name))?.fields ?? {}, change));
    if (result.status !== 'rejected') this.changed();
    return result;
  }

  /** The user's changes taken back: all of them; a definition's; or some of its fields (a path: a field, a map's key). What is under them shows again. */
  reset(kind?: string, name?: string, ...path: string[]): void {
    this.options.registry.batch(() => {
      for (const p of [...this.own.values()]) {
        if ((kind !== undefined && p.kind !== kind) || (name !== undefined && p.name !== name)) continue;
        if (!path.length) this.apply(p.kind, p.name, {});
        else
          this.apply(
            p.kind,
            p.name,
            merged(
              p.fields,
              path.reduceRight<Fields>((inner, key, i) => ({ [key]: i === path.length - 1 ? undefined : inner }), {}),
            ),
          );
      }
    });
    this.changed();
  }

  /** The user's changes as they would be kept (to export; a template's form). */
  saved(): SavedUser {
    return { version: 1, patches: [...this.own.values()].map(({ kind, name, fields }) => ({ kind, name, fields })) };
  }

  /** Changes given whole (imported) in place of the user's: those that do not fit, dropped. Not changes as kept: none taken, false. */
  replace(changes: unknown): boolean {
    const saved = savedOf(changes);
    if (!saved) return false;
    this.options.registry.batch(() => {
      for (const p of [...this.own.values()]) this.apply(p.kind, p.name, {});
      for (const p of saved.patches) this.apply(p.kind, p.name, p.fields);
    });
    this.changed();
    return true;
  }

  /** Saved now, what is waiting to be. */
  flush(): Promise<void> {
    if (this.timer === undefined) return this.saving;
    clearTimeout(this.timer);
    this.timer = undefined;
    const saved = this.saved();
    this.saving = this.saving.then(() => this.options.store.save(saved)).catch((error) => this.log(`not saved: ${error instanceof Error ? error.message : String(error)}`));
    return this.saving;
  }

  /** Saved, and gone: everything the user said taken back from the registry. */
  async close(): Promise<void> {
    await this.flush();
    this.unsubscribe();
    this.contributor.dispose();
  }

  /** A definition's patch, whole, said to the registry and kept (none left: taken back); rejected, what was there stays. */
  private apply(kind: string, name: string, fields: Fields): ApplyResult {
    const key = keyOf(kind, name);
    const result = this.contributor.patch(kind, name, fields as never);
    if (result.status === 'rejected') this.log(`rejected ${kind}/${name}: ${JSON.stringify(result.errors)}`);
    else if (Object.keys(fields).length) this.own.set(key, { kind, name, fields });
    else this.own.delete(key);
    return result;
  }

  /** Saved a while after the last change; not before what was kept is read (it would be saved over). */
  private changed(): void {
    if (!this.loaded.value) {
      this.early = true;
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.options.saveMs ?? 300);
  }

  private log(message: string): void {
    (this.options.log ?? console.warn)(`user: ${message}`);
  }
}
