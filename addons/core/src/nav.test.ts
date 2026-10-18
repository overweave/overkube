import { describe, expect, it } from 'vitest';
import { navOf } from './nav.ts';

/* The navigation as data: a page in its category's group, else among the pages. */

const def = <S>(name: string, spec: S) => ({ name, spec }) as never;

describe('the navigation', () => {
  it('puts a page in its category’s group; one of none, among the pages', () => {
    const { groups } = navOf(
      [],
      [],
      [def('delivery', { title: 'Delivery', icon: 'rocket', order: 45 })],
      [def('helm.releases', { path: '/helm', title: 'Helm', category: 'delivery' }), def('trivy.images', { path: '/images', title: 'Images' })],
      (l) => (typeof l === 'string' ? l : String((l as { en?: unknown }).en)),
    );
    expect(groups.map((g) => [g.title, g.icon, g.entries.map((e) => e.title)])).toEqual([
      ['Pages', undefined, ['Images']],
      ['Delivery', 'rocket', ['Helm']],
    ]);
  });
});
