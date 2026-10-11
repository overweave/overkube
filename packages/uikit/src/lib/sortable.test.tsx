import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import type { Ref } from 'preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSortable } from './sortable';

/*
 * The hook as a list using it has it: a row of items dragged by the mouse
 * (user-event) or moved by the keyboard. happy-dom lays nothing out: each
 * item is taken to stand where its place in the row says (100px wide, 10px
 * apart), and the scroller where a test says.
 */

const SIZE = 100;
const GAP = 10;

/** An item's box: its place among its siblings along the axis. */
function box(el: Element, axis: 'x' | 'y') {
  const i = [...(el.parentElement?.children ?? [])].indexOf(el);
  const start = i * (SIZE + GAP);
  const r = axis === 'x' ? { left: start, top: 0, width: SIZE, height: 30 } : { left: 0, top: start, width: 200, height: SIZE };
  return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r } as DOMRect;
}

let scrollerBox: DOMRect;
beforeEach(() => {
  scrollerBox = { left: 0, top: 0, width: 2000, height: 2000, x: 0, y: 0, right: 2000, bottom: 2000, toJSON: () => ({}) } as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-scroller')) return scrollerBox;
    const axis = this.closest('[data-axis]')?.getAttribute('data-axis') as 'x' | 'y';
    return this.hasAttribute('data-sort-id') ? box(this, axis) : scrollerBox;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A row of items a, b, c, d, each its own handle; every order it told, and every click on an item. */
function mount({ axis = 'x' as 'x' | 'y', duration = 0, disabled = false, swap = undefined as 'center' | 'edge' | undefined, tilt = false } = {}) {
  const moves: string[][] = [];
  const clicks: string[] = [];
  const scroller = { current: null as HTMLElement | null };
  let api: ReturnType<typeof useSortable> | undefined;
  function List() {
    const [ids, setIds] = useState(['a', 'b', 'c', 'd']);
    const s = useSortable({
      ids,
      axis,
      duration,
      disabled,
      scroller,
      swap,
      tilt,
      onMove: (next) => {
        moves.push(next);
        setIds(next);
      },
    });
    api = s;
    return (
      <div
        data-scroller
        ref={(el) => {
          scroller.current = el;
        }}
      >
        <div class="row" data-axis={axis} ref={s.root as Ref<HTMLDivElement>}>
          {ids.map((id) => (
            <button key={id} type="button" {...s.item(id)} {...s.handle(id)} onClick={() => clicks.push(id)}>
              {id}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const view = render(<List />);
  const root = view.container.querySelector('.row') as HTMLElement;
  const user = userEvent.setup();
  const item = (id: string) => view.getByRole('button', { name: id });
  const at = (n: number) => (axis === 'x' ? { clientX: n, clientY: 15 } : { clientX: 50, clientY: n });
  return {
    ...view,
    user,
    moves,
    clicks,
    root,
    item,
    api: () => api as ReturnType<typeof useSortable>,
    /** The items as they are drawn, in order. */
    order: () => [...root.querySelectorAll('[data-sort-id]')].map((b) => b.textContent),
    /** How far an item (by its place) is moved now. */
    shift: (i: number) => root.style.getPropertyValue(`--uk-sort-${i}`),
    /** Takes hold of an item at a point of it. */
    press: (id: string, from: number) => user.pointer({ keys: '[MouseLeft>]', target: item(id), coords: at(from) }),
    /** Moves the pointer held. */
    move: (to: number) => user.pointer({ coords: at(to) }),
    release: () => user.pointer({ keys: '[/MouseLeft]' }),
  };
}

describe('useSortable: a press', () => {
  it('that does not move is a click, and nothing else', async () => {
    const { press, release, clicks, moves, root } = mount();
    await press('a', 50);
    await release();
    expect(clicks).toEqual(['a']);
    expect(moves).toEqual([]);
    expect(root.hasAttribute('data-sorting')).toBe(false);
  });

  it('that moves less than the threshold is a click still', async () => {
    const { press, move, release, clicks, moves, root } = mount();
    await press('a', 50);
    await move(53);
    expect(root.hasAttribute('data-sorting')).toBe(false);
    await release();
    expect(clicks).toEqual(['a']);
    expect(moves).toEqual([]);
  });
});

describe('useSortable: dragging', () => {
  it('sets the dragging on the root, the one dragged under the pointer, the others aside', async () => {
    const { press, move, root, item, shift, api } = mount();
    await press('a', 50);
    await move(220);
    expect(root.getAttribute('data-sorting')).toBe('x');
    expect(api().active).toBe('a');
    expect(item('a').hasAttribute('data-sort-active')).toBe(true);
    expect(item('b').hasAttribute('data-sort-active')).toBe(false);
    // a went 170px: past b's middle (160), not c's (270); b steps back by a's width and the gap.
    expect(shift(0)).toBe('170px');
    expect(shift(1)).toBe('-110px');
    expect(shift(2)).toBe('0px');
  });

  it('moves the others back as it is dragged back', async () => {
    const { press, move, shift } = mount();
    await press('a', 50);
    await move(380);
    expect([shift(1), shift(2), shift(3)]).toEqual(['-110px', '-110px', '0px']);
    await move(120);
    expect([shift(1), shift(2), shift(3)]).toEqual(['0px', '0px', '0px']);
  });

  it('gives the new order once dropped; the click it ends with is not a click', async () => {
    const { press, move, release, moves, clicks, order, root } = mount();
    await press('a', 50);
    await move(300);
    await release();
    await waitFor(() => expect(moves).toEqual([['b', 'c', 'a', 'd']]));
    expect(order()).toEqual(['b', 'c', 'a', 'd']);
    expect(clicks).toEqual([]);
    expect(root.hasAttribute('data-sorting')).toBe(false);
    expect(root.style.getPropertyValue('--uk-sort-0')).toBe('');
  });

  it('drags one back to the front', async () => {
    const { press, move, release, moves, shift } = mount();
    await press('d', 380);
    await move(40);
    expect([shift(0), shift(1), shift(2), shift(3)]).toEqual(['110px', '110px', '110px', '-340px']);
    await release();
    await waitFor(() => expect(moves).toEqual([['d', 'a', 'b', 'c']]));
  });

  it('lands where it is to go, moving there, before the order is given', async () => {
    const { press, move, release, moves, root, shift } = mount({ duration: 200 });
    await press('a', 50);
    await move(250);
    await release();
    // It goes the rest of the way to b's place (its width and the gap), then is put there.
    expect(root.hasAttribute('data-sort-drop')).toBe(true);
    expect(root.style.getPropertyValue('--uk-sort-ms')).toBe('200ms');
    expect(shift(0)).toBe('110px');
    expect(moves).toEqual([]);
    await waitFor(() => expect(moves).toEqual([['b', 'a', 'c', 'd']]));
    expect(root.hasAttribute('data-sort-drop')).toBe(false);
  });

  it('dropped where it was, gives no order', async () => {
    const { press, move, release, moves, root } = mount();
    await press('b', 160);
    await move(200);
    await release();
    await waitFor(() => expect(root.hasAttribute('data-sorting')).toBe(false));
    expect(moves).toEqual([]);
  });

  it('Escape puts it back', async () => {
    const { press, move, user, moves, root, release, clicks } = mount();
    await press('a', 50);
    await move(300);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(root.hasAttribute('data-sorting')).toBe(false));
    await release();
    expect(moves).toEqual([]);
    expect(clicks).toEqual([]);
  });

  it('a cancelled pointer puts it back', async () => {
    const { press, move, moves, root } = mount();
    await press('a', 50);
    await move(300);
    fireEvent.pointerCancel(window);
    await waitFor(() => expect(root.hasAttribute('data-sorting')).toBe(false));
    expect(moves).toEqual([]);
  });

  it('swallows no click after a cancelled pointer (none comes of it): the next press is a click', async () => {
    const { press, move, clicks, item, root } = mount();
    await press('a', 50);
    await move(300);
    fireEvent.pointerCancel(window);
    await waitFor(() => expect(root.hasAttribute('data-sorting')).toBe(false));
    // The next press: its button let go, its click at once.
    fireEvent.pointerUp(item('b'));
    fireEvent.click(item('b'));
    expect(clicks).toEqual(['b']);
  });

  it('works down a column the same', async () => {
    const { press, move, release, moves, root, shift } = mount({ axis: 'y' });
    await press('a', 50);
    await move(220);
    expect(root.getAttribute('data-sorting')).toBe('y');
    expect(shift(1)).toBe('-110px');
    await release();
    await waitFor(() => expect(moves).toEqual([['b', 'a', 'c', 'd']]));
  });

  it('does nothing disabled', async () => {
    const { press, move, release, moves, root, clicks } = mount({ disabled: true });
    await press('a', 50);
    await move(300);
    expect(root.hasAttribute('data-sorting')).toBe(false);
    await release();
    expect(moves).toEqual([]);
    expect(clicks).toEqual(['a']);
  });

  it('lets go of the window once unmounted mid-drag', async () => {
    const { press, move, unmount } = mount();
    await press('a', 50);
    await move(300);
    unmount();
    expect(() => fireEvent.pointerMove(window, { clientX: 400 })).not.toThrow();
  });
});

describe('useSortable: scrolling', () => {
  /** A scroller 300px wide over so much, scrolled where a test sets it. */
  function scrolling(t: ReturnType<typeof mount>, content: number) {
    const scroller = t.container.querySelector('[data-scroller]') as HTMLElement;
    const at = { left: 0 };
    Object.defineProperty(scroller, 'scrollLeft', { get: () => at.left, set: (v: number) => (at.left = v), configurable: true });
    Object.defineProperty(scroller, 'clientWidth', { get: () => 300, configurable: true });
    Object.defineProperty(scroller, 'scrollWidth', { get: () => content, configurable: true });
    scrollerBox = { ...scrollerBox, width: 300, right: 300 };
    return at;
  }

  it('scrolls the scroller near its edge, and keeps the dragged one under the pointer', async () => {
    const t = mount();
    const at = scrolling(t, 2000);
    await t.press('a', 50);
    await t.move(280);
    expect(at.left).toBeGreaterThan(0);
    // Under the pointer: as far as it moved, and as far as the row scrolled.
    expect(Number.parseFloat(t.shift(0))).toBe(230 + at.left);
    // Away from the edge: it stops.
    await t.move(150);
    const scrolled = at.left;
    await new Promise((r) => setTimeout(r, 50));
    expect(at.left).toBe(scrolled);
    await t.release();
  });

  it('scrolls no further than it could when the drag began (what is dragged, moved, widens what it holds)', async () => {
    const t = mount();
    const at = scrolling(t, 330);
    await t.press('a', 50);
    await t.move(290);
    await new Promise((r) => setTimeout(r, 200));
    expect(at.left).toBe(30);
    await t.release();
  });

  it('does not scroll what all fits (nothing to scroll to)', async () => {
    const t = mount();
    const at = scrolling(t, 300);
    await t.press('a', 50);
    await t.move(290);
    await new Promise((r) => setTimeout(r, 100));
    expect(at.left).toBe(0);
    await t.release();
  });
});

describe('useSortable: the keyboard', () => {
  it('Alt and an arrow move the focused one a place, as a drop would', async () => {
    const { item, user, moves, order } = mount();
    item('b').focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await waitFor(() => expect(moves).toEqual([['a', 'c', 'b', 'd']]));
    expect(document.activeElement).toBe(item('b'));
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    await waitFor(() => expect(order()).toEqual(['a', 'b', 'c', 'd']));
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    await waitFor(() => expect(order()).toEqual(['b', 'a', 'c', 'd']));
  });

  it('moves nothing past the ends, nor without Alt, nor on the other axis', async () => {
    const { item, user, moves } = mount();
    item('a').focus();
    await user.keyboard('{Alt>}{ArrowLeft}{ArrowUp}{/Alt}{ArrowRight}');
    item('d').focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await new Promise((r) => setTimeout(r, 10));
    expect(moves).toEqual([]);
  });

  it('takes Up and Down down a column', async () => {
    const { item, user, moves } = mount({ axis: 'y' });
    item('a').focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await waitFor(() => expect(moves).toEqual([['b', 'a', 'c', 'd']]));
  });

  it('starts nothing while one is still moving', async () => {
    const { item, user, moves } = mount({ duration: 100 });
    item('b').focus();
    await user.keyboard('{Alt>}{ArrowRight}{ArrowRight}{/Alt}');
    await waitFor(() => expect(moves).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 150));
    expect(moves).toEqual([['a', 'c', 'b', 'd']]);
  });

  it('says its keys', () => {
    expect(mount().item('a').getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowLeft Alt+ArrowRight');
    cleanup();
    expect(mount({ axis: 'y' }).item('a').getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowUp Alt+ArrowDown');
  });
});

describe('useSortable: items', () => {
  it('moves each element of an item by its place in the order', () => {
    const { api, item } = mount();
    expect(api().item('c').style).toEqual({ '--uk-sort-shift': 'var(--uk-sort-2, 0px)' });
    expect(item('c').style.getPropertyValue('--uk-sort-shift')).toBe('var(--uk-sort-2, 0px)');
  });

  it('moves nothing under prefers-reduced-motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    const { press, move, root, release } = mount({ duration: 200 });
    await press('a', 50);
    await move(300);
    expect(root.style.getPropertyValue('--uk-sort-ms')).toBe('0ms');
    await release();
  });
});

describe('useSortable: groups', () => {
  /** a, b | c, d: the divider an item with no handle; a kept in its group (a, b). */
  function grouped() {
    const moves: [string[], string][] = [];
    function List() {
      const [ids, setIds] = useState(['a', 'b', '|', 'c', 'd']);
      const s = useSortable({
        ids,
        duration: 0,
        bounds: (id) => (id === 'a' ? [0, ids.indexOf('|') - 1] : undefined),
        onMove: (next, moved) => {
          moves.push([next, moved]);
          setIds(next);
        },
      });
      return (
        <div data-axis="x" ref={s.root as Ref<HTMLDivElement>}>
          {ids.map((id) =>
            id === '|' ? (
              <span key={id} class="divider" {...s.item(id)} />
            ) : (
              <button key={id} type="button" {...s.item(id)} {...s.handle(id)}>
                {id}
              </button>
            ),
          )}
        </div>
      );
    }
    const view = render(<List />);
    const user = userEvent.setup();
    const drag = async (id: string, from: number, to: number) => {
      await user.pointer({ keys: '[MouseLeft>]', target: view.getByRole('button', { name: id }), coords: { clientX: from, clientY: 15 } });
      await user.pointer({ coords: { clientX: to, clientY: 15 } });
      await user.pointer({ keys: '[/MouseLeft]' });
    };
    return { ...view, user, moves, drag, divider: () => view.container.querySelector('.divider') as HTMLElement };
  }

  it('gives which one moved with the order', async () => {
    const { drag, moves } = grouped();
    await drag('b', 160, 50);
    await waitFor(() => expect(moves).toEqual([[['b', 'a', '|', 'c', 'd'], 'b']]));
  });

  it('moves an item with no handle aside, but never takes hold of it', async () => {
    const { drag, moves, divider } = grouped();
    expect(divider().hasAttribute('data-sort-handle')).toBe(false);
    // b past the divider's middle (270), not c's (380): into the second group.
    await drag('b', 160, 300);
    await waitFor(() => expect(moves).toEqual([[['a', '|', 'b', 'c', 'd'], 'b']]));
    expect(divider().getAttribute('style')).toContain('var(--uk-sort-1, 0px)');
  });

  it('keeps one in its bounds, however far it is dragged', async () => {
    const { drag, moves } = grouped();
    await drag('a', 50, 500);
    await waitFor(() => expect(moves).toEqual([[['b', 'a', '|', 'c', 'd'], 'a']]));
  });

  it('moves one by the keyboard within its bounds only', async () => {
    const { getByRole, user, moves } = grouped();
    getByRole('button', { name: 'a' }).focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await waitFor(() => expect(moves).toHaveLength(1));
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await new Promise((r) => setTimeout(r, 20));
    expect(moves.map(([ids]) => ids)).toEqual([['b', 'a', '|', 'c', 'd']]);
  });
});

describe('useSortable: lifted (swap edge, tilt)', () => {
  it('moves one aside as soon as the dragged one’s edge is a little into it, not its middle', async () => {
    const center = mount();
    await center.press('a', 50);
    await center.move(85);
    expect(center.shift(1)).toBe('0px');
    cleanup();
    const { press, move, shift } = mount({ swap: 'edge' });
    await press('a', 50);
    // a's end at 135: 25px into b (from 110).
    await move(85);
    expect(shift(1)).toBe('-110px');
    await move(80);
    expect(shift(1)).toBe('0px');
  });

  it('the same dragged back: its start into the one before', async () => {
    const { press, move, shift } = mount({ swap: 'edge' });
    await press('d', 380);
    // d's start at 295: 25px into c (ending at 320).
    await move(345);
    expect([shift(2), shift(1)]).toEqual(['110px', '0px']);
  });

  it('says where it would land (--uk-sort-land), and lands there', async () => {
    const { press, move, release, root, moves } = mount({ swap: 'edge' });
    await press('a', 50);
    await move(85);
    expect(root.style.getPropertyValue('--uk-sort-land')).toBe('110px');
    await release();
    await waitFor(() => expect(moves).toEqual([['b', 'a', 'c', 'd']]));
    expect(root.style.getPropertyValue('--uk-sort-land')).toBe('');
  });

  it('leans as it moves, a degree at most, and none once dropped', async () => {
    const { press, move, release, root } = mount({ swap: 'edge', tilt: true, duration: 50 });
    await press('a', 50);
    for (const x of [60, 200, 400]) await move(x);
    const tilt = Number.parseFloat(root.style.getPropertyValue('--uk-sort-tilt'));
    expect(Math.abs(tilt)).toBeLessThanOrEqual(1);
    await release();
    await waitFor(() => expect(root.style.getPropertyValue('--uk-sort-tilt')).toBe(''));
  });

  it('does not lean with no motion (prefers-reduced-motion, a duration of none)', async () => {
    const { press, move, root } = mount({ swap: 'edge', tilt: true, duration: 0 });
    await press('a', 50);
    for (const x of [60, 200, 400]) await move(x);
    expect(root.style.getPropertyValue('--uk-sort-tilt')).toBe('');
  });

  it('put back (Escape), is drawn where it goes back to, not where it was over', async () => {
    const { press, move, user, api } = mount({ swap: 'edge', duration: 50 });
    await press('a', 50);
    await move(85);
    expect(api().over).toBe(1);
    await user.keyboard('{Escape}');
    expect(api().over).toBe(0);
  });

  it('keeps the browser’s own drag (a link’s) from taking the pointer away', () => {
    const { item } = mount();
    const start = new Event('dragstart', { bubbles: true, cancelable: true });
    item('a').dispatchEvent(start);
    expect(start.defaultPrevented).toBe(true);
  });

  it('marks the one held, before it is a drag', async () => {
    const { press, release, item } = mount();
    await press('b', 150);
    expect(item('b').hasAttribute('data-sort-pressing')).toBe(true);
    await release();
    expect(item('b').hasAttribute('data-sort-pressing')).toBe(false);
  });
});
