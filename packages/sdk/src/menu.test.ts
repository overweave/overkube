import type { Definition } from '@overweave/core';
import { describe, expect, it } from 'vitest';
import type { MenuItemSpec } from './kinds.ts';
import { menuOf } from './menu.ts';

/* A context menu as its items make it: on its subject, shown where when says, in its groups in their order, the dangerous last. */

const item = (name: string, spec: Partial<MenuItemSpec> = {}): Definition<MenuItemSpec> =>
  ({ kind: 'MenuItem', name, spec: { on: 'nav.tabs.tab.context', title: name, run: () => {}, ...spec } }) as Definition<MenuItemSpec>;
const shape = (groups: ReturnType<typeof menuOf>) => groups.map((g) => `${g.group}: ${g.items.map((d) => d.name).join(' ')}`);

describe('menuOf', () => {
  it('groups open, state, copy in that order; an addon’s own after them (by its first item’s order); the dangerous last, whatever they say', () => {
    const items = [
      item('delete', { group: 'state', danger: true }),
      item('logs', { group: 'logs', order: 10 }),
      item('copy', { group: 'copy' }),
      item('pin', { group: 'state' }),
      item('open', { group: 'open' }),
      item('lone'),
      item('metrics', { group: 'metrics', order: 5 }),
    ];
    expect(shape(menuOf(items, 'nav.tabs.tab.context', {}))).toEqual(['open: open', 'state: pin', 'copy: copy', 'metrics: metrics', 'logs: logs', 'other: lone', 'danger: delete']);
  });

  it('in a group, by order, then name', () => {
    const items = [item('b', { group: 'state' }), item('a', { group: 'state' }), item('z', { group: 'state', order: 1 })];
    expect(shape(menuOf(items, 'nav.tabs.tab.context', {}))).toEqual(['state: z a b']);
  });

  it('only its subject’s, not hidden, where when says; a group none is in, not there', () => {
    const items = [
      item('pin', { group: 'state', when: (t: { pinned: boolean }) => !t.pinned }),
      item('unpin', { group: 'state', when: (t: { pinned: boolean }) => t.pinned }),
      item('copy', { group: 'copy', hidden: true }),
      item('row', { on: 'table.row' }),
    ];
    expect(shape(menuOf(items, 'nav.tabs.tab.context', { pinned: true }))).toEqual(['state: unpin']);
    expect(menuOf(items, 'nothing', {})).toEqual([]);
  });

  it('leaves out one whose when throws, telling it', () => {
    const failed: string[] = [];
    const items = [
      item('broken', {
        when: () => {
          throw new Error('no');
        },
      }),
      item('fine'),
    ];
    expect(shape(menuOf(items, 'nav.tabs.tab.context', {}, (d) => failed.push(d.name)))).toEqual(['other: fine']);
    expect(failed).toEqual(['broken']);
  });
});
