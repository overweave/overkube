import { column, kubeKinds, standingOf } from '@overkube/sdk';
import { createRegistry } from '@overweave/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localStore, merged, type SavedUser, UserService } from './user.ts';

/*
 * The user's changes: a contributor over every addon's, its patches merged
 * as they come and saved a while after; read back as the page starts (those
 * that no longer fit dropped, those waiting kept); taken back field by
 * field, by definition, all at once; exported and imported whole; kept in
 * localStorage — none of it thrown where the browser keeps nothing.
 */

afterEach(() => vi.useRealTimers());

const POD = 'v1/Pod';

/** A registry as the page has it: the core's table view of pods (a default that yields), an addon's column and its own view of them. */
function setup(kept?: unknown) {
  const registry = createRegistry({ kinds: kubeKinds });
  registry.contributor('core', standingOf('core')).add('TableView', POD, { sort: { column: 'core.name' } }, { fallback: true });
  const addon = registry.contributor('images', standingOf('addon'));
  addon.add('Column', 'images.size', column({ header: 'Size', sort: 'core.name' }));
  addon.patch('TableView', POD, { hidden: { 'images.size': true } });
  const saves: SavedUser[] = [];
  const store = { load: async () => kept, save: async (s: SavedUser) => void saves.push(s) };
  const logs: string[] = [];
  const user = new UserService({ registry, store, saveMs: 100, log: (m) => logs.push(m) });
  const view = () => registry.get('TableView', POD)?.spec as Record<string, unknown> | undefined;
  return { registry, user, saves, logs, view };
}

describe('the user’s changes', () => {
  it('are said over every addon’s, merged as they come (a map key by key, undefined taking one away), saved a while after the last', async () => {
    vi.useFakeTimers();
    const { user, saves, view } = setup();
    await user.start();
    user.patch('TableView', POD, { hidden: { 'images.size': false } });
    user.patch('TableView', POD, { hidden: { 'core.v1/Pod.restarts': true }, widths: { 'core.name': 240 } });
    expect(view()).toMatchObject({ hidden: { 'images.size': false, 'core.v1/Pod.restarts': true }, widths: { 'core.name': 240 }, sort: { column: 'core.name' } });
    expect(saves).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(saves).toEqual([
      { version: 1, patches: [{ kind: 'TableView', name: POD, fields: { hidden: { 'images.size': false, 'core.v1/Pod.restarts': true }, widths: { 'core.name': 240 } } }] },
    ]);
    // A key taken away: the addon's shows again.
    user.patch('TableView', POD, { hidden: { 'images.size': undefined } });
    expect((view()?.hidden as Record<string, boolean> | undefined)?.['images.size']).toBe(true);
  });

  it('may only configure: a behaviour of a definition (a column’s sort) refused, nothing changed, nothing saved', async () => {
    vi.useFakeTimers();
    const { user, saves, registry } = setup();
    await user.start();
    expect(user.patch('Column', 'images.size', { sort: 'core.namespace' }).status).toBe('rejected');
    expect(user.patch('Column', 'images.size', { header: 'Bytes' }).status).toBe('included');
    expect(registry.get('Column', 'images.size')?.spec).toMatchObject({ header: 'Bytes', sort: 'core.name' });
    await vi.advanceTimersByTimeAsync(100);
    expect(saves.at(-1)?.patches).toEqual([{ kind: 'Column', name: 'images.size', fields: { header: 'Bytes' } }]);
  });

  it('are read back as the page starts — under this visit’s own; one that no longer fits dropped (and saved without), one waiting for its definition kept', async () => {
    vi.useFakeTimers();
    const kept: SavedUser = {
      version: 1,
      patches: [
        { kind: 'TableView', name: POD, fields: { hidden: { 'images.size': false }, widths: { 'core.name': 200 } } },
        { kind: 'Column', name: 'images.size', fields: { sort: 'core.namespace' } },
        { kind: 'TableView', name: 'example.com/v1/Widget', fields: { hidden: { x: true } } },
      ],
    };
    const { user, saves, view, logs, registry } = setup(kept);
    // Said before what was kept is read: it wins.
    user.patch('TableView', POD, { widths: { 'core.name': 320 } });
    expect([user.ready.value, saves]).toEqual([false, []]);
    await user.start();
    expect([user.ready.value, view()?.widths, (view()?.hidden as Record<string, boolean> | undefined)?.['images.size']]).toEqual([true, { 'core.name': 320 }, false]);
    expect(logs.some((l) => l.includes('rejected Column/images.size'))).toBe(true);
    // A kind served later: its view comes, the user's patch of it waiting till then.
    registry.contributor('core2', standingOf('core')).add('TableView', 'example.com/v1/Widget', {}, { fallback: true });
    expect(registry.get('TableView', 'example.com/v1/Widget')?.spec).toEqual({ hidden: { x: true } });
    await vi.advanceTimersByTimeAsync(100);
    expect(saves.at(-1)?.patches.map((p) => `${p.kind}/${p.name}`)).toEqual(['TableView/v1/Pod', 'TableView/example.com/v1/Widget']);
  });

  it('read nothing from what is not the user’s changes (left as it is till saved over), nor from a store that fails', async () => {
    const odd = setup({ version: 7 });
    await odd.user.start();
    expect([odd.user.ready.value, odd.logs.some((l) => l.includes('not the user’s changes'))]).toEqual([true, true]);
    const registry = createRegistry({ kinds: kubeKinds });
    const logs: string[] = [];
    const failing = new UserService({ registry, store: { load: () => Promise.reject(new Error('offline')), save: async () => {} }, log: (m) => logs.push(m) });
    await failing.start();
    expect([failing.ready.value, logs]).toEqual([true, ['user: not read: offline']]);
  });

  it('are taken back: a map’s key, a field, a definition, all of them — what is under them shows again', async () => {
    const { user, view, registry } = setup();
    await user.start();
    user.patch('TableView', POD, { hidden: { 'images.size': false, a: true }, widths: { 'core.name': 240 }, sort: { column: 'core.age' } });
    user.patch('Column', 'images.size', { header: 'Bytes' });
    user.reset('TableView', POD, 'hidden', 'a');
    expect(view()?.hidden).toEqual({ 'images.size': false });
    user.reset('TableView', POD, 'sort');
    expect(view()?.sort).toEqual({ column: 'core.name' });
    user.reset('TableView', POD);
    expect(view()).toEqual({ sort: { column: 'core.name' }, hidden: { 'images.size': true } });
    expect(registry.get('Column', 'images.size')?.spec.header).toBe('Bytes');
    user.reset();
    expect([registry.get('Column', 'images.size')?.spec.header, user.saved().patches]).toEqual(['Size', []]);
  });

  it('are exported whole and imported in place of the user’s; what is not changes as kept, not taken', async () => {
    const { user, view } = setup();
    await user.start();
    user.patch('TableView', POD, { widths: { 'core.name': 240 } });
    const exported = user.saved();
    user.patch('TableView', POD, { widths: { 'core.name': 100 }, hidden: { x: true } });
    expect([user.replace({ nope: 1 }), user.replace(exported)]).toEqual([false, true]);
    expect([view()?.widths, view()?.hidden]).toEqual([{ 'core.name': 240 }, { 'images.size': true }]);
  });

  it('are saved and taken back from the registry when closed', async () => {
    vi.useFakeTimers();
    const { user, saves, view } = setup();
    await user.start();
    user.patch('TableView', POD, { widths: { 'core.name': 240 } });
    await user.close();
    expect([saves.length, view()?.widths]).toEqual([1, undefined]);
  });
});

describe('a patch merged', () => {
  it('goes key by key into objects, puts anything else in place, takes away what is undefined (an object left empty too)', () => {
    expect(merged({ a: { x: 1, y: 2 }, b: [1], c: 1 }, { a: { y: undefined, z: 3 }, b: [2], c: undefined, d: 'd' })).toEqual({ a: { x: 1, z: 3 }, b: [2], d: 'd' });
    expect(merged({ a: { x: 1 } }, { a: { x: undefined } })).toEqual({});
  });
});

describe('localStorage as the store', () => {
  /** A storage in memory; failing to write, as a full one does. */
  const storage = (full = false) => {
    const items = new Map<string, string>();
    return {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (full) throw new Error('QuotaExceededError');
        items.set(k, v);
      },
    } as unknown as Storage;
  };

  it('keeps what is saved under its key; reads back nothing where nothing is, where it is not JSON, where there is no storage', async () => {
    const memory = storage();
    const store = localStore('k', () => memory);
    const saved: SavedUser = { version: 1, patches: [{ kind: 'TableView', name: POD, fields: { widths: { a: 1 } } }] };
    expect(await store.load()).toBeUndefined();
    await store.save(saved);
    expect(await store.load()).toEqual(saved);
    memory.setItem('k', '{not json');
    expect(await store.load()).toBeUndefined();
    expect(await localStore('k', () => undefined).load()).toBeUndefined();
  });

  it('tells the service a write that fails, which says so and goes on', async () => {
    vi.useFakeTimers();
    const registry = createRegistry({ kinds: kubeKinds });
    registry.contributor('core', standingOf('core')).add('TableView', POD, {}, { fallback: true });
    const logs: string[] = [];
    const full = storage(true);
    const user = new UserService({ registry, store: localStore('k', () => full), saveMs: 10, log: (m) => logs.push(m) });
    await user.start();
    user.patch('TableView', POD, { widths: { a: 1 } });
    await vi.advanceTimersByTimeAsync(10);
    expect(logs).toEqual(['user: not saved: QuotaExceededError']);
  });
});
