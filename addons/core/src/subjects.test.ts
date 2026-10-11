import { menuItem, menuOf } from '@overkube/sdk';
import type { Definition } from '@overweave/core';
import { expect, it } from 'vitest';

/* An addon's own subject of a context menu, said by merging into MenuSubjects: its items typed by it (the typecheck is the test). */

declare module '@overkube/sdk' {
  interface MenuSubjects {
    'test.thing': { size: number };
  }
}

it('types an addon’s own subject’s items by it', () => {
  const big = menuItem({ on: 'test.thing', title: 'Big', when: (thing) => thing.size > 1, run: (thing) => thing.size });
  const items = [{ kind: 'MenuItem', name: 'test.big', spec: big }] as unknown as Definition<typeof big>[];
  expect(menuOf(items, 'test.thing', { size: 2 }).map((g) => g.items.length)).toEqual([1]);
});
