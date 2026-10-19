import { describe, expect, it } from 'vitest';
import { layout } from './layout';
import type { MapGraph } from './types';

const KINDS = { network: { label: 'network', tint: 'violet' }, runs: { label: 'runs on it', tint: 'slate' }, volume: { label: 'volume', tint: 'amber' } } as const;
const card = (id: string, layer: number, ports: string[]) => ({
  id,
  layer,
  title: id,
  ports: ports.map((p) => ({ id: p, side: (p.startsWith('in') ? 'in' : 'out') as 'in' | 'out' })),
});
const sizes = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { width: 160, height: 60, ports: { in: 30, out: 30, in2: 45 } }]));

describe('layout', () => {
  it('keeps the columns straight and the links uncrossed', async () => {
    // Two networks, two services, linked crosswise as they came: a top to b bottom, and back.
    const g: MapGraph = {
      kinds: KINDS,
      cards: [card('netA', 2, ['out']), card('netB', 2, ['out']), card('svcB', 3, ['in']), card('svcA', 3, ['in']), card('port', 0, ['out'])],
      links: [
        { id: 'a', kind: 'network', from: { card: 'netA', port: 'out' }, to: { card: 'svcA', port: 'in' } },
        { id: 'b', kind: 'network', from: { card: 'netB', port: 'out' }, to: { card: 'svcB', port: 'in' } },
      ],
    };
    const l = await layout(g, sizes(['netA', 'netB', 'svcA', 'svcB', 'port']));
    expect(new Set([l.cards.netA.x, l.cards.netB.x]).size).toBe(1); // one column
    expect(new Set([l.cards.svcA.x, l.cards.svcB.x]).size).toBe(1);
    expect(l.cards.port.x).toBeLessThan(l.cards.netA.x);
    // Uncrossed: whichever network is higher, its service is higher too.
    expect(Math.sign(l.cards.netA.y - l.cards.netB.y)).toBe(Math.sign(l.cards.svcA.y - l.cards.svcB.y));
    // Nothing overlaps in a column.
    expect(Math.abs(l.cards.svcA.y - l.cards.svcB.y)).toBeGreaterThanOrEqual(60);
  });

  it('wraps a long layer into columns, those linked on in the last one', async () => {
    // A node, fourteen services on it, one keeping a volume.
    const svcs = Array.from({ length: 14 }, (_, i) => card(`s${i}`, 3, i === 0 ? ['in', 'out'] : ['in']));
    const g: MapGraph = {
      kinds: KINDS,
      cards: [card('node', 2, ['out']), ...svcs, card('vol', 4, ['in'])],
      links: [
        ...svcs.map((s) => ({ id: `r${s.id}`, kind: 'runs', from: { card: 'node', port: 'out' }, to: { card: s.id, port: 'in' } })),
        { id: 'v', kind: 'volume', from: { card: 's0', port: 'out' }, to: { card: 'vol', port: 'in' } },
      ],
      wrap: [3],
    };
    const l = await layout(g, sizes(['node', 'vol', ...svcs.map((s) => s.id)]));
    const xs = [...new Set(svcs.map((s) => l.cards[s.id].x))].sort((a, b) => a - b);
    expect(xs.length).toBe(3); // fourteen in rows of six: three columns
    expect(l.cards.s0.x).toBe(xs[2]); // the one linked on: the last column
    expect(l.cards.vol.x).toBeGreaterThan(xs[2]);
    expect(l.cards.node.x).toBeLessThan(xs[0]);
    // Nothing overlaps.
    const all = Object.entries(l.cards);
    for (const [a, p] of all) for (const [b, q] of all) if (a < b) expect(Math.abs(p.x - q.x) >= 160 || Math.abs(p.y - q.y) >= 60).toBe(true);
  });

  it('wraps a long layer in each group’s band of its own', async () => {
    // Two appliers (each its frame), what each applied: ten, eight.
    const items = Array.from({ length: 18 }, (_, i) => ({ ...card(`p${i}`, 1, ['in']), group: i < 10 ? 'a' : 'b' }));
    const g: MapGraph = {
      kinds: KINDS,
      cards: [{ ...card('A', 0, ['out']), group: 'a' }, { ...card('B', 0, ['out']), group: 'b' }, ...items],
      links: items.map((p) => ({ id: `r${p.id}`, kind: 'runs', from: { card: p.group === 'a' ? 'A' : 'B', port: 'out' }, to: { card: p.id, port: 'in' } })),
      groups: [
        { id: 'a', title: 'a' },
        { id: 'b', title: 'b' },
      ],
      wrap: [1],
    };
    const l = await layout(g, sizes(['A', 'B', ...items.map((p) => p.id)]));
    const ys = (group: string) => items.filter((p) => p.group === group).map((p) => l.cards[p.id].y);
    expect(new Set(items.map((p) => l.cards[p.id].x)).size).toBe(2); // rows of six: two columns
    expect(Math.min(...ys('b'))).toBeGreaterThan(Math.max(...ys('a'))); // b's band below a's
    const all = Object.entries(l.cards);
    for (const [a, p] of all) for (const [b, q] of all) if (a < b) expect(Math.abs(p.x - q.x) >= 160 || Math.abs(p.y - q.y) >= 60).toBe(true);
  });

  it('lays a wrapped layer’s own groups (no other column has them) whole, side by side', async () => {
    // A node, what runs on it in six namespaces of four each.
    const pods = Array.from({ length: 24 }, (_, i) => ({ ...card(`p${i}`, 1, ['in']), group: `n${Math.floor(i / 4)}` }));
    const g: MapGraph = {
      kinds: KINDS,
      cards: [card('node', 0, ['out']), ...pods],
      links: pods.map((p) => ({ id: `r${p.id}`, kind: 'runs', from: { card: 'node', port: 'out' }, to: { card: p.id, port: 'in' } })),
      groups: Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, title: `n${i}` })),
      wrap: [1],
    };
    const l = await layout(g, sizes(['node', ...pods.map((p) => p.id)]));
    // Each namespace whole in one column; not one long column.
    for (let n = 0; n < 6; n++) expect(new Set(pods.filter((p) => p.group === `n${n}`).map((p) => l.cards[p.id].x)).size).toBe(1);
    expect(new Set(pods.map((p) => l.cards[p.id].x)).size).toBeGreaterThan(1);
    const all = Object.entries(l.cards);
    for (const [a, p] of all) for (const [b, q] of all) if (a < b) expect(Math.abs(p.x - q.x) >= 160 || Math.abs(p.y - q.y) >= 60).toBe(true);
  });

  it('draws a link of a card not there as none (the map laid, not thrown)', async () => {
    const g: MapGraph = {
      kinds: KINDS,
      cards: [card('a', 0, ['out']), card('b', 1, ['in'])],
      links: [
        { id: '1', kind: 'network', from: { card: 'a', port: 'out' }, to: { card: 'b', port: 'in' } },
        { id: '2', kind: 'network', from: { card: 'a', port: 'out' }, to: { card: 'gone', port: 'in' } },
      ],
    };
    const l = await layout(g, sizes(['a', 'b']));
    expect(l.cards.b.x).toBeGreaterThan(l.cards.a.x);
    expect(Object.keys(l.links)).toEqual(['1']);
  });

  it('leaves no empty band across the map', async () => {
    // Two parts with nothing between them: they come together.
    const g: MapGraph = {
      kinds: KINDS,
      cards: [card('a1', 0, ['out']), card('b1', 1, ['in']), card('a2', 0, ['out']), card('b2', 1, ['in', 'in2']), card('c', 1, ['in'])],
      links: [
        { id: '1', kind: 'network', from: { card: 'a1', port: 'out' }, to: { card: 'b1', port: 'in' } },
        { id: '2', kind: 'network', from: { card: 'a2', port: 'out' }, to: { card: 'b2', port: 'in2' } },
      ],
    };
    const l = await layout(g, sizes(['a1', 'b1', 'a2', 'b2', 'c']));
    const ys = Object.values(l.cards)
      .map((p) => p.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeLessThanOrEqual(60 + 44); // a card, and at most a double gap
  });
});
