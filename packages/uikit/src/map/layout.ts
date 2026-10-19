import type { MapGraph } from './types';

/*
 * Where every card of a map goes: ELK's layered layout (Eclipse Layout
 * Kernel, loaded the first time a map is laid out: it is big — its own
 * chunk, never in the page's bundle). The pattern's layers are kept
 * (partitions); within them ELK orders the cards so as few links cross as
 * it can, by their real sizes and their ports' real places; then the
 * columns are put straight, each card level with what it is linked to.
 */

/** A card's size and its ports' places, as drawn (measured). */
export interface Measured {
  width: number;
  height: number;
  /** A port's place on its side: from the card's top. */
  ports: Record<string, number>;
}

export interface Point {
  x: number;
  y: number;
}

export interface Laid {
  cards: Record<string, Point>;
  /** Each link's way: a start, then cubic Bézier control points in threes. */
  links: Record<string, Point[]>;
  width: number;
  height: number;
}

const OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  // The scope's columns come in order; ELK may still spread a column over
  // layers of its own: the columns are put straight afterwards (see layout).
  'elk.partitioning.activate': 'true',
  // Links are drawn by the engine (soft curves port to port); ELK keeps room for them as straight ones.
  'elk.edgeRouting': 'POLYLINE',
  'elk.layered.spacing.nodeNodeBetweenLayers': '90',
  'elk.spacing.nodeNode': '22',
  'elk.spacing.edgeNode': '18',
  'elk.spacing.edgeEdge': '10',
  'elk.layered.spacing.edgeNodeBetweenLayers': '18',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  // The same graph, the same picture: the order cards and links come in is kept where it can be.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.padding': '[top=20,left=20,bottom=20,right=20]',
};

type Elk = { layout: (g: unknown) => Promise<ElkGraph> };
interface ElkGraph {
  width?: number;
  height?: number;
  children?: { id: string; x?: number; y?: number }[];
  edges?: { id: string; sections?: { startPoint: Point; endPoint: Point; bendPoints?: Point[] }[] }[];
}

let elk: Promise<Elk> | undefined;

/** ELK, loaded the first time a graph is laid out (it is big). */
function load(): Promise<Elk> {
  // A CommonJS module: its class its default, or its default's (as a bundler wraps it, or does not).
  elk ??= import('elkjs/lib/elk.bundled.js').then((m) => {
    const ELK = ((m.default as { default?: unknown }).default ?? m.default) as new () => Elk;
    return new ELK();
  });
  return elk;
}

const portId = (card: string, port: string) => `${card}|${port}`;

export async function layout(g: MapGraph, sizes: Record<string, Measured>): Promise<Laid> {
  const engine = await load();
  const byId = new Map(g.cards.map((c) => [c.id, c]));
  const linked = g.links.filter((l) => byId.has(l.from.card) && byId.has(l.to.card));
  const end = (card: string, port: string) => (byId.get(card)?.ports.some((p) => p.id === port) ? portId(card, port) : card);
  const input = {
    id: 'root',
    layoutOptions: OPTIONS,
    children: g.cards.map((c) => {
      const m = sizes[c.id] ?? { width: 180, height: 60, ports: {} };
      return {
        id: c.id,
        width: m.width,
        height: m.height,
        layoutOptions: { 'elk.partitioning.partition': String(c.layer), 'elk.portConstraints': 'FIXED_POS' },
        ports: c.ports.map((p) => ({
          id: portId(c.id, p.id),
          x: p.side === 'in' ? 0 : m.width,
          y: m.ports[p.id] ?? m.height / 2,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': p.side === 'in' ? 'WEST' : 'EAST' },
        })),
      };
    }),
    // A link of a card not there: none (here and in the placing after); to a port its card has not: to the card itself (a pattern's slip draws, not breaks, the map).
    edges: linked.map((l) => ({ id: l.id, sources: [end(l.from.card, l.from.port)], targets: [end(l.to.card, l.to.port)] })),
  };
  const out = await engine.layout(input);
  const elkAt = new Map((out.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  const cards = straighten({ ...g, links: linked }, sizes, elkAt);
  const links: Record<string, Point[]> = {};
  for (const e of out.edges ?? []) {
    const s = e.sections?.[0];
    if (s) links[e.id] = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint];
  }
  let width = 0;
  let height = 0;
  for (const c of g.cards) {
    const m = sizes[c.id] ?? { width: 180, height: 60 };
    width = Math.max(width, cards[c.id].x + m.width + PAD);
    height = Math.max(height, cards[c.id].y + m.height + PAD);
  }
  return { cards, links, width, height };
}

const PAD = 20;
const COLUMN_GAP = 90;
const ROW_GAP = 22;
/** Between two groups' cards: room for a frame's edge and the next one's title. */
const GROUP_GAP = 44;
/** Between the columns a wrapped layer is laid in. */
const WRAP_GAP = 36;
/** A wrapped layer has at least this many rows. */
const WRAP_ROWS = 6;

/**
 * The scope's columns, straight: each column starts where the one before ends
 * (its widest card, and a gap). In each, the cards start in ELK's order; then,
 * sweeping right and left a few times, each is put level with the ports it is
 * linked to (the mean of their heights) and its column sorted by that, pushed
 * down only where two would overlap. The placing with the fewest crossings is kept.
 */
function straighten(g: MapGraph, sizes: Record<string, Measured>, elkAt: Map<string, Point>): Record<string, Point> {
  const size = (id: string) => sizes[id] ?? { width: 180, height: 60, ports: {} as Record<string, number> };
  const columns = [...new Set(g.cards.map((c) => c.layer))].sort((a, b) => a - b);
  const colOf = new Map(g.cards.map((c) => [c.id, columns.indexOf(c.layer)]));
  const cols: string[][] = columns.map((col) => g.cards.filter((c) => c.layer === col).map((c) => c.id));
  // Its groups (a namespace…): in each column a block of their own, in their order; those of none after them.
  const groups = g.groups ?? [];
  const groupOf = new Map(g.cards.map((c) => [c.id, c.group ?? '']));
  const rank = (id: string) => {
    const i = groups.findIndex((x) => x.id === groupOf.get(id));
    return i < 0 ? groups.length : i;
  };
  for (const ids of cols) ids.sort((a, b) => rank(a) - rank(b) || (elkAt.get(a)?.y ?? 0) - (elkAt.get(b)?.y ?? 0) || (elkAt.get(a)?.x ?? 0) - (elkAt.get(b)?.x ?? 0));

  const at: Record<string, Point> = {};
  let x = PAD;
  cols.forEach((ids) => {
    for (const id of ids) at[id] = { x, y: elkAt.get(id)?.y ?? 0 };
    x += Math.max(...ids.map((id) => size(id).width)) + COLUMN_GAP;
  });
  const portY = (id: string, port: string) => at[id].y + (size(id).ports[port] ?? size(id).height / 2);
  const offset = (id: string, port: string) => size(id).ports[port] ?? size(id).height / 2;

  // Stack a column in the given order, each card at its wish or below the one above.
  const stack = (ids: string[], wish: Map<string, number>) => {
    let bottom = -Infinity;
    let group: string | undefined;
    for (const id of ids) {
      // Another group's: below the one before by a group's gap (room for its frame's title).
      const gap = group !== undefined && groupOf.get(id) !== group ? GROUP_GAP : ROW_GAP;
      const y = Math.max(wish.get(id) ?? at[id].y, bottom + gap);
      at[id].y = y;
      bottom = y + size(id).height;
      group = groupOf.get(id);
    }
  };
  for (const ids of cols) stack(ids, new Map());

  // Where a card would be level with what it is linked to on one side.
  const wishOf = (id: string, side: 'left' | 'right'): number | undefined => {
    const ys: number[] = [];
    for (const l of g.links) {
      if (side === 'left' && l.to.card === id && colOf.get(l.from.card)! < colOf.get(id)!) ys.push(portY(l.from.card, l.from.port) - offset(id, l.to.port));
      if (side === 'right' && l.from.card === id && colOf.get(l.to.card)! > colOf.get(id)!) ys.push(portY(l.to.card, l.to.port) - offset(id, l.from.port));
    }
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : undefined;
  };
  const sweep = (order: number[], side: 'left' | 'right') => {
    for (const i of order) {
      const wish = new Map<string, number>();
      for (const id of cols[i]) {
        const w = wishOf(id, side) ?? wishOf(id, side === 'left' ? 'right' : 'left');
        if (w !== undefined) wish.set(id, w);
      }
      const key = (id: string) => wish.get(id) ?? at[id].y;
      cols[i].sort((a, b) => rank(a) - rank(b) || key(a) - key(b));
      stack(cols[i], wish);
    }
  };

  // Links that cross: two between the same columns whose ends swap their order.
  const crossings = () => {
    const ends = g.links.map((l) => ({ a: colOf.get(l.from.card)!, b: colOf.get(l.to.card)!, ya: portY(l.from.card, l.from.port), yb: portY(l.to.card, l.to.port) }));
    let n = 0;
    for (let i = 0; i < ends.length; i++)
      for (let j = i + 1; j < ends.length; j++) {
        const e = ends[i];
        const f = ends[j];
        if (e.a === f.a && e.b === f.b && (e.ya - f.ya) * (e.yb - f.yb) < 0) n++;
      }
    return n;
  };
  const copy = () => Object.fromEntries(Object.entries(at).map(([k, p]) => [k, { ...p }]));
  let best = copy();
  let fewest = crossings();
  const right = cols.map((_, i) => i).slice(1);
  const left = cols
    .map((_, i) => i)
    .reverse()
    .slice(1);
  for (let round = 0; round < 4; round++) {
    sweep(right, 'left');
    sweep(left, 'right');
    const n = crossings();
    if (n <= fewest) {
      fewest = n;
      best = copy();
    }
  }
  Object.assign(at, best);

  // Layers that wrap: in a few columns of about as many rows (more columns
  // than rows never), those linked to the right in the last one, nearest to
  // what they link to. What comes after moves right; the other columns are
  // put level with them again.
  const wrapped = (g.wrap ?? [])
    .map((layer) => columns.indexOf(layer))
    .filter((i) => i >= 0 && cols[i].length > WRAP_ROWS)
    .sort((a, b) => a - b);
  // Groups only a wrapped column has (a node's pods' namespaces): not bands across the map, laid in that column's own columns.
  const free = new Set(
    groups
      .map((_, r) => r)
      .filter((r) => {
        const has = cols.map((ids, i) => (ids.some((id) => rank(id) === r) ? i : -1)).filter((i) => i >= 0);
        return has.length === 1 && wrapped.includes(has[0]);
      }),
  );
  // Free only where its column's groups all are (one of them banded, or cards of none there: all wrapped in place, banded).
  for (const w of wrapped) {
    const ranks = [...new Set(cols[w].map(rank))];
    if (!ranks.every((r) => free.has(r))) for (const r of ranks) free.delete(r);
  }
  for (const w of wrapped) {
    const rows = Math.max(WRAP_ROWS, Math.ceil(Math.sqrt(cols[w].length * 2)));
    const linksRight = (id: string) => g.links.some((l) => l.from.card === id && colOf.get(l.to.card)! > w);
    const x0 = at[cols[w][0]].x;
    const before = Math.max(...cols[w].map((id) => size(id).width));
    let reach = x0;
    // A block's cards in columns of `rows` from (x, top): filled from the last back (the last ones full, the first the rest); its width and height.
    const lay = (block: string[], x: number, top: number) => {
      const order = [...block.filter((id) => !linksRight(id)), ...block.filter(linksRight)];
      const chunks: string[][] = [];
      for (let end = order.length; end > 0; end -= rows) chunks.unshift(order.slice(Math.max(0, end - rows), end));
      let cx = x;
      let bottom = top;
      for (const chunk of chunks) {
        let y = top;
        for (const id of chunk) {
          at[id] = { x: cx, y };
          bottom = Math.max(bottom, y + size(id).height);
          y += size(id).height + ROW_GAP;
        }
        cx += Math.max(...chunk.map((id) => size(id).width)) + WRAP_GAP;
      }
      return { width: cx - WRAP_GAP - x, height: bottom - top };
    };
    const ranks = [...new Set(cols[w].map(rank))];
    if (ranks.every((r) => free.has(r))) {
      // Its groups its own (a node's pods' namespaces): each block whole, the blocks in columns of about `rows` cards' height.
      const tall = rows * (Math.max(...cols[w].map((id) => size(id).height)) + ROW_GAP);
      const top = Math.min(...cols[w].map((id) => at[id].y));
      let x = x0;
      let y = top;
      let wide = 0;
      for (const r of ranks) {
        const block = cols[w].filter((id) => rank(id) === r);
        const height = block.length * (size(block[0]).height + ROW_GAP);
        if (y > top && y + height > top + tall) {
          x += wide + WRAP_GAP;
          y = top;
          wide = 0;
        }
        const laid = lay(block, x, y);
        wide = Math.max(wide, laid.width);
        y += laid.height + GROUP_GAP;
      }
      reach = x + wide;
    }
    // Each group's block of it wrapped on its own, where it starts (the bands put after): one of none, the column.
    else
      for (const r of ranks) {
        const block = cols[w].filter((id) => rank(id) === r);
        const laid = lay(block, x0, Math.min(...block.map((id) => at[id].y)));
        reach = Math.max(reach, x0 + laid.width);
      }
    const grew = reach - x0 - before;
    for (let i = w + 1; i < cols.length; i++) for (const id of cols[i]) at[id].x += grew;
  }
  if (wrapped.length) {
    const free = cols.map((_, i) => i).filter((i) => !wrapped.includes(i));
    sweep(
      free.filter((i) => i > wrapped[0]),
      'left',
    );
    sweep(free.filter((i) => i < wrapped.at(-1)!).reverse(), 'right');
    // Each wrapped block, whole, level with what it is linked to.
    for (const w of wrapped) {
      const shifts = cols[w].flatMap((id) => {
        const wish = wishOf(id, 'left') ?? wishOf(id, 'right');
        return wish === undefined ? [] : [wish - at[id].y];
      });
      if (!shifts.length) continue;
      const by = shifts.reduce((a, b) => a + b, 0) / shifts.length;
      for (const id of cols[w]) at[id].y += by;
    }
  }

  // Each group a band across the columns, below the one before (its frame drawn round it, overlapping none): a column's
  // block of it moved down to its band's top, what is below it in that column with it.
  if (groups.length) {
    let top = -Infinity;
    for (const [r] of [...groups, null].entries()) {
      if (free.has(r)) continue;
      const of = (ids: string[]) => ids.filter((id) => rank(id) === r);
      let bottom = -Infinity;
      for (const ids of cols) {
        const mine = of(ids);
        if (!mine.length) continue;
        // A column of no group's cards: left where it is (put level with its links after).
        if (r === groups.length && ids.every((id) => rank(id) === r)) continue;
        const by = Math.max(0, top - Math.min(...mine.map((id) => at[id].y)));
        for (const id of ids) if (rank(id) >= r) at[id].y += by;
        bottom = Math.max(bottom, ...mine.map((id) => at[id].y + size(id).height));
      }
      if (bottom > -Infinity) top = bottom + GROUP_GAP;
    }
    // A column of no group's cards (the nodes pods run on): not below the bands, level with what its cards are linked to.
    for (const [i, ids] of cols.entries())
      if (ids.every((id) => rank(id) === groups.length)) {
        const wish = new Map<string, number>();
        for (const id of ids) {
          const w = wishOf(id, 'right') ?? wishOf(id, 'left');
          if (w !== undefined) wish.set(id, w);
        }
        cols[i] = [...ids].sort((a, b) => (wish.get(a) ?? at[a].y) - (wish.get(b) ?? at[b].y));
        stack(cols[i], wish);
      }
  }

  // No empty bands: where no card of any column is, the space closes to a
  // gap (all below moves up together, so what was level stays level).
  const spans = Object.keys(at)
    .map((id) => [at[id].y, at[id].y + size(id).height] as const)
    .sort((a, b) => a[0] - b[0]);
  let reach = spans.length ? spans[0][1] : 0;
  const cuts: { at: number; by: number }[] = [];
  for (const [top, bottom] of spans.slice(1)) {
    if (top - reach > ROW_GAP * 2) cuts.push({ at: top, by: top - reach - ROW_GAP * 2 });
    reach = Math.max(reach, bottom);
  }
  for (const p of Object.values(at)) p.y -= cuts.filter((c) => p.y >= c.at).reduce((n, c) => n + c.by, 0);

  // From the top: the highest card at the padding.
  const top = Math.min(...Object.values(at).map((p) => p.y));
  for (const p of Object.values(at)) p.y += PAD - top;
  return at;
}
