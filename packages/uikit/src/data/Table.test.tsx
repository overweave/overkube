import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Table, type TableColumn, type TableProps, type TableSort } from './Table';

/*
 * The table as a user has it: the mouse and the keyboard (user-event), what
 * is read back is what the page shows and says (roles, names, ARIA states,
 * the grid's tracks). happy-dom lays nothing out: each header is taken to
 * be 100px wide, 24px from the next (the CSS's gap), and the body 1000×600.
 */

interface Row {
  name: string;
  n?: number;
  note: string;
}

const COLUMNS: TableColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: (r) => r.name, sortable: true },
  { id: 'n', header: 'N', width: '100px', cell: (r) => String(r.n ?? '—'), sortable: true },
  { id: 'note', header: 'Note', cell: (r) => r.note },
];
const many = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ name: `pod-${i}`, n: i, note: `note ${i}` }));
const FEW: Row[] = [
  { name: 'a', n: 9, note: 'y' },
  { name: 'b', n: 10, note: 'x' },
  { name: 'c', note: 'z' },
];

const HEADER = 100;
const GAP = 24;
const PAD = 16;
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('uk-table-th')) {
      const i = [...(this.parentElement?.children ?? [])].indexOf(this);
      return rect(PAD + i * (HEADER + GAP), 0, HEADER, 32);
    }
    return rect(0, 0, 1000, 600);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(props: Partial<TableProps<Row>> = {}) {
  const view = render(<Table rows={FEW} columns={COLUMNS} rowKey={(r) => r.name} {...props} />);
  const c = view.container;
  const user = userEvent.setup();
  return {
    ...view,
    user,
    body: () => c.querySelector('.uk-table-body') as HTMLElement,
    rows: () => [...c.querySelectorAll<HTMLElement>('.uk-table-row')],
    /** The first cell of each row drawn. */
    firsts: () => [...c.querySelectorAll('.uk-table-row')].map((r) => r.querySelector('[role=cell]:not(.uk-table-pick)')?.textContent),
    /** The headers' names, in order. */
    headers: () => [...c.querySelectorAll('.uk-table-th:not(.uk-table-pick)')].map((h) => h.textContent),
    header: (name: string) => view.getByRole('columnheader', { name }),
    button: (name: string) => view.getByRole('button', { name }),
    template: () => (c.querySelector('.uk-table-head') as HTMLElement).style.gridTemplateColumns,
    group: () => c.querySelector('[role=rowgroup]') as HTMLElement,
  };
}

describe('Table: drawing', () => {
  it('draws only the rows in view, however many there are', () => {
    const { rows } = mount({ rows: many(5000) });
    expect(rows().length).toBeGreaterThan(10);
    expect(rows().length).toBeLessThan(40);
  });

  it('draws the rows scrolled to', () => {
    const { body, container } = mount({ rows: many(5000) });
    body().scrollTop = 34 * 3000;
    fireEvent.scroll(body());
    expect(container.textContent).toContain('pod-3000');
    expect(container.textContent).not.toContain('pod-10note');
  });

  it('says how many rows there are, and which each is', () => {
    const { body, getByRole, rows } = mount({ rows: many(5000) });
    expect(getByRole('table').getAttribute('aria-rowcount')).toBe('5001');
    body().scrollTop = 34 * 3000;
    fireEvent.scroll(body());
    const row = rows().find((r) => r.textContent?.startsWith('pod-3000'));
    expect(row?.getAttribute('aria-rowindex')).toBe('3002');
  });

  it('draws as many rows as its body, measured, holds', () => {
    const drawn = mount({ rows: many(5000) }).rows().length;
    cleanup();
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('uk-table-body') ? 200 : 0;
    });
    expect(mount({ rows: many(5000) }).rows().length).toBeLessThan(drawn);
  });

  it('draws rows given after it was drawn with none', () => {
    const { rerender, body, container } = mount({ rows: [] });
    rerender(<Table rows={many(5000)} columns={COLUMNS} rowKey={(r) => r.name} />);
    body().scrollTop = 34 * 3000;
    fireEvent.scroll(body());
    expect(container.textContent).toContain('pod-3000');
  });

  it('takes rows as high as they are measured, the others as rowHeight', async () => {
    // A ResizeObserver a test calls; rows measured 68px high (two lines).
    const observers: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        els = new Set<Element>();
        constructor(cb: ResizeObserverCallback) {
          observers.push(() =>
            cb(
              [...this.els].map((target) => ({ target }) as ResizeObserverEntry),
              this as unknown as ResizeObserver,
            ),
          );
        }
        observe(el: Element) {
          this.els.add(el);
        }
        unobserve(el: Element) {
          this.els.delete(el);
        }
        disconnect() {}
      },
    );
    const { rows, group } = mount({ rows: many(100) });
    // 600px of 34px rows: 18 in view, and 8 more.
    expect(rows()).toHaveLength(26);
    expect(group().style.paddingBottom).toBe(`${(100 - 26) * 34}px`);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('uk-table-row') ? 68 : 0;
    });
    // The first observer made is the rows' (the body's is made as it is drawn, after).
    observers[0]();
    // 600px of 68px rows: 9 in view, and 8 more. Below: the 9 measured and no longer drawn, then those never drawn, still 34px.
    await waitFor(() => expect(rows()).toHaveLength(17));
    expect(group().style.paddingBottom).toBe(`${(26 - 17) * 68 + (100 - 26) * 34}px`);
  });

  it('marks the cells of a column that wraps', () => {
    const { rows } = mount({ columns: COLUMNS.map((c) => (c.id === 'note' ? { ...c, wrap: true } : c)) });
    const cells = [...rows()[0].querySelectorAll('[role=cell]')];
    expect(cells.map((c) => c.hasAttribute('data-wrap'))).toEqual([false, false, true]);
  });

  it('is as wide at least as its columns: those of pixels as they are, the others a little', () => {
    const { container } = mount();
    // 100px, two flexible (96px each), two gaps, the padding.
    expect((container.querySelector('.uk-table-inner') as HTMLElement).style.minWidth).toBe(`${100 + 96 * 2 + GAP * 2 + PAD * 2}px`);
  });

  it('takes a minmax column’s least as its least (not a flexible one’s)', () => {
    const { container } = mount({ columns: COLUMNS.map((c, i) => ({ ...c, width: i === 0 ? 'minmax(40px, 1fr)' : i === 1 ? 'minmax(52.5px, 80px)' : '2fr' })) });
    expect((container.querySelector('.uk-table-inner') as HTMLElement).style.minWidth).toBe(`${40 + 52.5 + 96 + GAP * 2 + PAD * 2}px`);
  });
});

describe('Table: sorting', () => {
  it('sorts nothing itself: its rows as given; a sortable header clicked asks for a sort, the sort said back shown', async () => {
    const asked: TableSort[] = [];
    const t = mount({ onSort: (sort) => asked.push(sort) });
    const given = [FEW[1], FEW[0], FEW[2]];
    t.rerender(<Table rows={given} columns={COLUMNS} rowKey={(r) => r.name} onSort={(sort) => asked.push(sort)} />);
    expect(t.firsts()).toEqual(['b', 'a', 'c']);
    expect(t.header('N').getAttribute('aria-sort')).toBe('none');
    await t.user.click(t.button('N'));
    expect([asked, t.firsts()]).toEqual([[{ id: 'n' }], ['b', 'a', 'c']]);
    t.rerender(<Table rows={FEW} columns={COLUMNS} rowKey={(r) => r.name} sort={{ id: 'n' }} onSort={(sort) => asked.push(sort)} />);
    expect(t.header('N').getAttribute('aria-sort')).toBe('ascending');
    expect(t.header('N').querySelector('.uk-table-sort')?.getAttribute('data-dir')).toBe('asc');
    await t.user.click(t.button('N'));
    expect(asked.at(-1)).toEqual({ id: 'n', desc: true });
    t.rerender(<Table rows={FEW} columns={COLUMNS} rowKey={(r) => r.name} sort={{ id: 'n', desc: true }} />);
    expect(t.header('N').getAttribute('aria-sort')).toBe('descending');
  });

  it('asks nothing of a column not sortable', async () => {
    const asked: TableSort[] = [];
    const t = mount({ onSort: (sort) => asked.push(sort) });
    await t.user.click(t.button('Note'));
    expect([asked, t.header('Note').hasAttribute('aria-sort')]).toEqual([[], false]);
  });
});

describe('Table: a window of rows', () => {
  it('draws the rows given where they are among all of them, placeholders where none are given yet; says which are in view', () => {
    const ranges: [number, number][] = [];
    const all = many(1000);
    const t = mount({ rows: all.slice(0, 20), total: 1000, onRange: (first, last) => ranges.push([first, last]) });
    expect(t.container.querySelector('[role=table]')?.getAttribute('aria-rowcount')).toBe('1001');
    expect(ranges.at(-1)).toEqual([0, 26]);
    expect(t.firsts().slice(18, 21)).toEqual(['pod-18', 'pod-19', undefined]);
    expect(t.container.querySelectorAll('.uk-table-row[data-skeleton]').length).toBe(6);
    fireEvent.scroll(t.body(), { target: { scrollTop: 34 * 500 + 32 } });
    expect(ranges.at(-1)).toEqual([492, 526]);
    t.rerender(<Table rows={all.slice(490, 530)} offset={490} total={1000} columns={COLUMNS} rowKey={(r) => r.name} />);
    expect(t.firsts()[0]).toBe('pod-492');
    expect(t.rows()[0].getAttribute('aria-rowindex')).toBe('494');
  });
});

describe('Table: rows', () => {
  it('says what it is given with no rows, and nothing of its own', () => {
    expect(mount({ rows: [], empty: 'No pods' }).container.querySelector('.uk-table-empty')?.textContent).toBe('No pods');
    cleanup();
    expect(mount({ rows: [] }).container.querySelector('.uk-table-empty')?.textContent).toBe('');
  });

  it('passes a click or Enter on a row on, not Enter on something in it', async () => {
    const clicked: string[] = [];
    const columns: TableColumn<Row>[] = [...COLUMNS, { id: 'go', header: 'Go', cell: (r) => <button type="button">{`open ${r.name}`}</button> }];
    const { user, getByText, rows, button } = mount({ columns, onRowClick: (r) => clicked.push(r.name) });
    await user.click(getByText('a'));
    rows()[1].focus();
    await user.keyboard('{Enter}');
    expect(clicked).toEqual(['a', 'b']);
    // Enter on a button in it is the button's.
    fireEvent.keyDown(button('open a'), { key: 'Enter' });
    expect(clicked).toEqual(['a', 'b']);
    expect(rows()[1].getAttribute('tabindex')).toBe('0');
  });

  it('makes rows no stop when they do nothing', () => {
    expect(mount().rows()[0].hasAttribute('tabindex')).toBe(false);
  });

  it('names a column whose header says nothing', () => {
    const { header } = mount({ columns: [...COLUMNS, { id: 'health', header: '', label: 'Health', cell: () => '●' }] });
    expect(header('Health')).toBeTruthy();
  });
});

describe('Table: column widths', () => {
  it('has an edge to drag between columns, named by the column it widens', () => {
    const { getAllByRole } = mount();
    const edges = getAllByRole('separator');
    expect(edges.map((e) => e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby') as string)?.textContent)).toEqual(['Name', 'N']);
    expect(edges[0].getAttribute('aria-orientation')).toBe('vertical');
    cleanup();
    expect(mount({ resizable: false }).queryAllByRole('separator')).toEqual([]);
  });

  it('drags a column wider, telling the width once let go, sorting nothing', async () => {
    const resized: [string, string | undefined][] = [];
    const { user, getAllByRole, template, getByRole, firsts } = mount({ onResize: (id, w) => resized.push([id, w]) });
    const edge = getAllByRole('separator')[0];
    await user.pointer({ keys: '[MouseLeft>]', target: edge, coords: { clientX: 116 } });
    await user.pointer({ coords: { clientX: 196 } });
    expect(template()).toBe('180px 100px minmax(0, 1fr)');
    expect(getByRole('table').hasAttribute('data-resizing')).toBe(true);
    expect(resized).toEqual([]);
    await user.pointer({ keys: '[/MouseLeft]' });
    expect(resized).toEqual([['name', '180px']]);
    expect(edge.getAttribute('aria-valuenow')).toBe('180');
    expect(getByRole('table').hasAttribute('data-resizing')).toBe(false);
    expect(firsts()).toEqual(['a', 'b', 'c']);
  });

  it('keeps a column 48px wide at least', async () => {
    const resized: [string, string | undefined][] = [];
    const { user, getAllByRole } = mount({ onResize: (id, w) => resized.push([id, w]) });
    await user.pointer({ keys: '[MouseLeft>]', target: getAllByRole('separator')[1], coords: { clientX: 240 } });
    await user.pointer({ coords: { clientX: 0 } });
    await user.pointer({ keys: '[/MouseLeft]' });
    expect(resized).toEqual([['n', '48px']]);
  });

  it('moves an edge by the arrows', async () => {
    const resized: [string, string | undefined][] = [];
    const { user, getAllByRole, template } = mount({ onResize: (id, w) => resized.push([id, w]) });
    getAllByRole('separator')[0].focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowLeft}{ArrowUp}');
    expect(resized).toEqual([
      ['name', '116px'],
      ['name', '132px'],
      ['name', '116px'],
    ]);
    expect(template().startsWith('116px ')).toBe(true);
  });

  it('gives a column its own width back on a double click', async () => {
    const resized: [string, string | undefined][] = [];
    const { user, getAllByRole, template } = mount({ onResize: (id, w) => resized.push([id, w]) });
    getAllByRole('separator')[0].focus();
    await user.keyboard('{ArrowRight}');
    await user.dblClick(getAllByRole('separator')[0]);
    expect(resized.at(-1)).toEqual(['name', undefined]);
    expect(template()).toBe('minmax(0, 1fr) 100px minmax(0, 1fr)');
  });
});

describe('Table: column order', () => {
  /** Drags a header from its middle by so far, and lets go. */
  async function drag(t: ReturnType<typeof mount>, name: string, by: number) {
    const i = t.headers().indexOf(name);
    const from = PAD + i * (HEADER + GAP) + HEADER / 2;
    await t.user.pointer({ keys: '[MouseLeft>]', target: t.button(name), coords: { clientX: from } });
    await t.user.pointer({ coords: { clientX: from + by } });
    await t.user.pointer({ keys: '[/MouseLeft]' });
  }

  it('moves a column dragged by its header (header and cells), sorting nothing', async () => {
    const orders: string[][] = [];
    const t = mount({ onReorder: (ids) => orders.push(ids) });
    await drag(t, 'Name', 150);
    await waitFor(() => expect(orders).toEqual([['n', 'name', 'note']]));
    expect(t.headers()).toEqual(['N', 'Name', 'Note']);
    expect([...t.rows()[0].querySelectorAll('[role=cell]')].map((c) => c.textContent)).toEqual(['9', 'a', 'y']);
    expect(t.firsts()).toEqual(['9', '10', '—']);
    expect(t.header('Name').hasAttribute('aria-sort')).toBe(true);
    expect(t.header('Name').getAttribute('aria-sort')).toBe('none');
  });

  it('keeps the widths dragged with their columns', async () => {
    const t = mount();
    t.getAllByRole('separator')[0].focus();
    await t.user.keyboard('{ArrowRight}');
    await drag(t, 'Name', 150);
    await waitFor(() => expect(t.headers()).toEqual(['N', 'Name', 'Note']));
    expect(t.template()).toBe('100px 116px minmax(0, 1fr)');
  });

  it('moves a column a place by Alt and an arrow on its header', async () => {
    const orders: string[][] = [];
    const t = mount({ onReorder: (ids) => orders.push(ids) });
    t.button('N').focus();
    await t.user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await waitFor(() => expect(orders).toEqual([['name', 'note', 'n']]));
    expect(t.headers()).toEqual(['Name', 'Note', 'N']);
  });

  it('takes the order it is given anew over the one dragged', async () => {
    const t = mount();
    await drag(t, 'Name', 150);
    await waitFor(() => expect(t.headers()).toEqual(['N', 'Name', 'Note']));
    t.rerender(<Table rows={FEW} columns={[...COLUMNS].reverse()} rowKey={(r) => r.name} />);
    expect(t.headers()).toEqual(['Note', 'N', 'Name']);
  });

  it('moves nothing when it may not', async () => {
    const orders: string[][] = [];
    const t = mount({ reorderable: false, onReorder: (ids) => orders.push(ids) });
    expect(t.button('Name').hasAttribute('data-sort-handle')).toBe(false);
    expect(t.button('Note').hasAttribute('disabled')).toBe(true);
    await drag(t, 'Name', 150);
    await new Promise((r) => setTimeout(r, 250));
    expect(orders).toEqual([]);
    expect(t.headers()).toEqual(['Name', 'N', 'Note']);
  });
});

describe('Table: what the data changes', () => {
  const pods = (names: string[]) => names.map((name, i) => ({ name, n: i, note: '' }));
  // Rows stand where their place among their siblings says (34px each); a slide is an animation asked of a row.
  let slid: string[] = [];
  beforeEach(() => {
    slid = [];
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return [...(this.parentElement?.children ?? [])].indexOf(this) * 34;
    });
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (this: HTMLElement) {
      slid.push(this.dataset.key ?? '');
      return { cancel() {} };
    };
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    vi.unstubAllGlobals();
  });

  function live(names: string[], props: Partial<TableProps<Row>> = {}) {
    const view = render(<Table rows={pods(names)} columns={COLUMNS} rowKey={(r) => r.name} {...props} />);
    return {
      ...view,
      set: (next: string[]) => view.rerender(<Table rows={pods(next)} columns={COLUMNS} rowKey={(r) => r.name} {...props} />),
      drawn: () =>
        [...view.container.querySelectorAll<HTMLElement>('.uk-table-row')].map((r) => (r.hasAttribute('data-leaving') ? `-${r.textContent?.slice(0, 1)}` : (r.dataset.key ?? ''))),
      entering: () => [...view.container.querySelectorAll<HTMLElement>('.uk-table-row[data-enter]')].map((r) => r.dataset.key),
    };
  }

  it('draws a first list at once: nothing comes in, nothing slides', () => {
    const t = live(['a', 'b', 'c']);
    expect(t.entering()).toEqual([]);
    expect(slid).toEqual([]);
  });

  it('keeps a row gone a moment where it was (folding, hidden from a reader), then lets it go', async () => {
    const t = live(['a', 'b', 'c', 'd']);
    t.set(['a', 'c', 'd']);
    expect(t.drawn()).toEqual(['a', '-b', 'c', 'd']);
    const leaving = t.container.querySelector('.uk-table-row[data-leaving]') as HTMLElement;
    expect(leaving.getAttribute('aria-hidden')).toBe('true');
    expect(leaving.hasAttribute('role')).toBe(false);
    expect(leaving.style.getPropertyValue('--uk-row-h')).toMatch(/px$/);
    await waitFor(() => expect(t.drawn()).toEqual(['a', 'c', 'd']), { timeout: 1000 });
  });

  it('keeps the last row gone at the end', () => {
    const t = live(['a', 'b', 'c']);
    t.set(['a', 'b']);
    expect(t.drawn()).toEqual(['a', 'b', '-c']);
  });

  it('fades in a row new to the list', () => {
    const t = live(['a', 'c']);
    t.set(['a', 'b', 'c']);
    expect(t.entering()).toEqual(['b']);
  });

  it('slides the rows a few changes moved, not those that stayed', () => {
    const t = live(['b', 'c', 'd', 'e']);
    // a comes first: b, c, d and e step down.
    t.set(['a', 'b', 'c', 'd', 'e']);
    expect(slid.sort()).toEqual(['b', 'c', 'd', 'e']);
    slid = [];
    t.set(['a', 'b', 'c', 'd', 'e']);
    expect(slid).toEqual([]);
  });

  it('draws many changes at once (a filter, another namespace): nothing kept, nothing comes in', () => {
    const t = live(['a', 'b', 'c', 'd', 'e']);
    t.set(['v', 'w', 'x', 'y', 'z', 'a']);
    expect(t.drawn()).toEqual(['v', 'w', 'x', 'y', 'z', 'a']);
    expect(t.entering()).toEqual([]);
  });

  it('draws a new sort at once', () => {
    const t = live(['a', 'b', 'c']);
    t.rerender(<Table rows={pods(['c', 'b', 'a'])} columns={COLUMNS} rowKey={(r) => r.name} sort={{ id: 'name', desc: true }} />);
    expect(t.drawn()).toEqual(['c', 'b', 'a']);
    expect(slid).toEqual([]);
  });

  it('draws everything at once under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    const t = live(['a', 'b', 'c']);
    t.set(['a', 'c', 'n']);
    expect(t.drawn()).toEqual(['a', 'c', 'n']);
    expect(t.entering()).toEqual([]);
    expect(slid).toEqual([]);
  });
});
