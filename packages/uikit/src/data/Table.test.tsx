import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Table, type TableColumn, type TableProps } from './Table';

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
  { id: 'name', header: 'Name', cell: (r) => r.name, sort: (r) => r.name },
  { id: 'n', header: 'N', width: '100px', cell: (r) => String(r.n ?? '—'), sort: (r) => r.n },
  { id: 'note', header: 'Note', cell: (r) => r.note },
];
const many = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ name: `pod-${i}`, n: i, note: `note ${i}` }));
const FEW: Row[] = [
  { name: 'b', n: 10, note: 'x' },
  { name: 'a', n: 9, note: 'y' },
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
});

describe('Table: sorting', () => {
  it('sorts by a header clicked, then the other way, numbers as numbers', async () => {
    const { user, firsts, button, header } = mount();
    // Sorted by nothing: by their keys (they came b, a, c).
    expect(firsts()).toEqual(['a', 'b', 'c']);
    expect(header('N').getAttribute('aria-sort')).toBe('none');
    await user.click(button('N'));
    expect(firsts()).toEqual(['a', 'b', 'c']);
    expect(header('N').getAttribute('aria-sort')).toBe('ascending');
    expect(header('N').querySelector('.uk-table-sort')?.getAttribute('data-dir')).toBe('asc');
    await user.click(button('N'));
    // Those with nothing to sort by go last, either way.
    expect(firsts()).toEqual(['b', 'a', 'c']);
    expect(header('N').getAttribute('aria-sort')).toBe('descending');
    await user.click(button('Name'));
    expect(firsts()).toEqual(['a', 'b', 'c']);
    expect(header('N').getAttribute('aria-sort')).toBe('none');
    expect(header('N').querySelector('.uk-table-sort')).toBeNull();
  });

  it('does not sort by a column with nothing to sort by', async () => {
    const { user, firsts, button, header } = mount();
    await user.click(button('Note'));
    expect(firsts()).toEqual(['a', 'b', 'c']);
    expect(header('Note').hasAttribute('aria-sort')).toBe(false);
  });

  it('sorts those of the same value by their keys — one order, the same either way, however the rows came', () => {
    const same: Row[] = [
      { name: 'c', n: 1, note: '' },
      { name: 'a', n: 1, note: '' },
      { name: 'd', n: 2, note: '' },
      { name: 'b', n: 1, note: '' },
      { name: 'e', note: '' },
    ];
    const t = mount({ rows: same, initialSort: { id: 'n' } });
    expect(t.firsts()).toEqual(['a', 'b', 'c', 'd', 'e']);
    t.rerender(<Table rows={[...same].reverse()} columns={COLUMNS} rowKey={(r) => r.name} initialSort={{ id: 'n', desc: true }} />);
    expect(t.firsts()).toEqual(['d', 'a', 'b', 'c', 'e']);
  });

  it('sorts as it is told at first, and again when told otherwise', () => {
    const { firsts, rerender } = mount({ initialSort: { id: 'name', desc: true } });
    expect(firsts()).toEqual(['c', 'b', 'a']);
    rerender(<Table rows={FEW} columns={COLUMNS} rowKey={(r) => r.name} initialSort={{ id: 'n' }} />);
    expect(firsts()).toEqual(['a', 'b', 'c']);
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

describe('Table: picking rows', () => {
  function picking(initial: string[] = []) {
    const changes: string[][] = [];
    const clicked: string[] = [];
    function Picker() {
      const [selected, setSelected] = useState<Set<string>>(new Set(initial));
      return (
        <Table
          rows={FEW}
          columns={COLUMNS}
          rowKey={(r) => r.name}
          onRowClick={(r) => clicked.push(r.name)}
          selection={{
            selected,
            label: 'All rows',
            onChange: (next) => {
              changes.push([...next].sort());
              setSelected(next);
            },
          }}
        />
      );
    }
    const view = render(<Picker />);
    const all = () => view.getByRole('checkbox', { name: 'All rows' }) as HTMLInputElement;
    const box = (key: string) => view.getByRole('checkbox', { name: key }) as HTMLInputElement;
    const selectedRows = () =>
      view
        .getAllByRole('row')
        .filter((r) => r.getAttribute('aria-selected') === 'true')
        .map((r) => r.getAttribute('data-key'));
    return { ...view, user: userEvent.setup(), changes, clicked, all, box, selectedRows };
  }

  it('picks a row by its check, not opening it', async () => {
    const { user, box, changes, clicked, selectedRows } = picking();
    await user.click(box('a'));
    expect(changes).toEqual([['a']]);
    expect(clicked).toEqual([]);
    expect(selectedRows()).toEqual(['a']);
    expect(box('a').checked).toBe(true);
    await user.click(box('a'));
    expect(changes.at(-1)).toEqual([]);
  });

  it('picks a run with Shift, from the last one picked', async () => {
    const { user, box, changes } = picking();
    await user.click(box('b'));
    await user.keyboard('{Shift>}');
    await user.click(box('c'));
    await user.keyboard('{/Shift}');
    // As they are shown (by their keys: a, b, c): from b to c.
    expect(changes.at(-1)).toEqual(['b', 'c']);
  });

  it('picks all of them by the head’s check, and none again; says when some are', async () => {
    const { user, all, changes } = picking(['a']);
    expect(all().checked).toBe(false);
    expect(all().indeterminate).toBe(true);
    await user.click(all());
    expect(changes.at(-1)).toEqual(['a', 'b', 'c']);
    expect(all().checked).toBe(true);
    expect(all().indeterminate).toBe(false);
    await user.click(all());
    expect(changes.at(-1)).toEqual([]);
  });

  it('has a column for the checks, not dragged nor resized', () => {
    const { container, getAllByRole } = picking();
    expect((container.querySelector('.uk-table-head') as HTMLElement).style.gridTemplateColumns.startsWith('20px ')).toBe(true);
    expect(getAllByRole('separator')).toHaveLength(2);
    expect(container.querySelector('.uk-table-pick[data-sort-id]')).toBeNull();
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
    // a comes first (by its key): b, c, d and e step down.
    t.set(['b', 'c', 'd', 'e', 'a']);
    expect(slid.sort()).toEqual(['b', 'c', 'd', 'e']);
    slid = [];
    t.set(['b', 'c', 'd', 'e', 'a']);
    expect(slid).toEqual([]);
  });

  it('draws many changes at once (a filter, another namespace): nothing kept, nothing comes in', () => {
    const t = live(['a', 'b', 'c', 'd', 'e']);
    t.set(['v', 'w', 'x', 'y', 'z', 'a']);
    expect(t.drawn()).toEqual(['a', 'v', 'w', 'x', 'y', 'z']);
    expect(t.entering()).toEqual([]);
  });

  it('draws a new sort at once', async () => {
    const t = live(['a', 'b', 'c']);
    const user = userEvent.setup();
    await user.click(t.getByRole('button', { name: 'Name' }));
    await user.click(t.getByRole('button', { name: 'Name' }));
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
