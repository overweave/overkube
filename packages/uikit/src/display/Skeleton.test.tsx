import { act, cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Table } from '../data/Table';
import { Skeleton } from './Skeleton';

/*
 * Placeholders: hidden from those who cannot see them. A table whose rows
 * are on their way: its head as it is; placeholders only if the rows are
 * slow (200 ms), then kept a while (400 ms) — no flash either way; the rows
 * in their place as they are, the placeholders below them folding away;
 * a row added later still comes in as new.
 */

const columns = [{ id: 'a', header: 'A', cell: (r: string) => r }];
const table = (rows: string[], loading: boolean, more: { placeholdersAfter?: number; empty?: string } = {}) => (
  <Table rows={rows} rowKey={(r) => r} loading={loading} columns={columns} {...more} />
);
const skeletons = (el: Element) => el.querySelectorAll('[data-skeleton]:not([data-leaving])').length;
const folding = (el: Element) => el.querySelectorAll('[data-skeleton][data-leaving]').length;
const rows = (el: Element) => [...el.querySelectorAll('[role="row"][data-key]')] as HTMLElement[];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a table on its way', () => {
  it('shows no placeholders for rows that come soon, and draws them as they are', () => {
    const view = render(table([], true));
    expect([view.container.querySelector('[role="table"]')?.getAttribute('aria-busy'), skeletons(view.container)]).toEqual(['true', 0]);
    act(() => void vi.advanceTimersByTime(150));
    view.rerender(table(['x', 'y'], false));
    act(() => void vi.advanceTimersByTime(1000));
    expect([skeletons(view.container), folding(view.container), rows(view.container).map((r) => r.hasAttribute('data-enter'))]).toEqual([0, 0, [false, false]]);
  });

  it('shows placeholders for slow rows, keeps them a while, then the rows in their place — the rest folding away', () => {
    const view = render(table([], true));
    act(() => void vi.advanceTimersByTime(200));
    expect(skeletons(view.container)).toBe(5);
    act(() => void vi.advanceTimersByTime(50));
    view.rerender(table(['x', 'y'], false));
    expect([skeletons(view.container), rows(view.container).length]).toEqual([5, 0]);
    act(() => void vi.advanceTimersByTime(350));
    expect([skeletons(view.container), folding(view.container)]).toEqual([0, 3]);
    expect(rows(view.container).map((r) => [r.textContent, r.hasAttribute('data-enter')])).toEqual([
      ['x', false],
      ['y', false],
    ]);
    act(() => void vi.advanceTimersByTime(300));
    view.rerender(table(['x', 'y'], false));
    expect(folding(view.container)).toBe(0);
    view.rerender(table(['x', 'y', 'z'], false));
    expect(
      rows(view.container)
        .find((r) => r.textContent === 'z')
        ?.hasAttribute('data-enter'),
    ).toBe(true);
  });

  it('shows placeholders at once when told not to wait', () => {
    expect(skeletons(render(table([], true, { placeholdersAfter: 0 })).container)).toBe(5);
  });

  it('folds them all away when there are none, the empty table’s words in', () => {
    const view = render(table([], true, { empty: 'Nothing' }));
    act(() => void vi.advanceTimersByTime(600));
    view.rerender(table([], false, { empty: 'Nothing' }));
    // Kept their while already: gone at once.
    act(() => void vi.advanceTimersByTime(1));
    expect([folding(view.container), view.container.querySelector('.uk-table-empty')?.textContent]).toEqual([5, 'Nothing']);
  });

  it('sorts again by a value that changed on its own', () => {
    const cpu: Record<string, number | undefined> = { x: 2, y: undefined };
    const sorted = (rows: string[]) => (
      <Table rows={rows} rowKey={(r) => r} initialSort={{ id: 'cpu' }} columns={[{ id: 'cpu', header: 'CPU', cell: (r) => String(cpu[r] ?? ''), sort: (r) => cpu[r] }]} />
    );
    const list = ['x', 'y'];
    const view = render(sorted(list));
    expect(rows(view.container).map((r) => r.dataset.key)).toEqual(['x', 'y']);
    cpu.y = 1;
    view.rerender(sorted(list));
    expect(rows(view.container).map((r) => r.dataset.key)).toEqual(['y', 'x']);
  });
});

describe('Skeleton', () => {
  it('is a shape of a size, hidden from assistive tech', () => {
    const { container } = render(<Skeleton shape="block" width="50%" height="20px" />);
    const el = container.querySelector('.uk-skeleton') as HTMLElement;
    expect([el.dataset.shape, el.getAttribute('aria-hidden'), el.style.width, el.style.height]).toEqual(['block', 'true', '50%', '20px']);
  });
});
