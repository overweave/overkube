import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEAVE_MS, PEEK_MS, SideRail } from './SideRail';

/* A page's side as a user has it: collapsed, peeking as the pointer rests on it or the keyboard comes in, pinned by its toggle. */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(pinned = false) {
  const told: boolean[] = [];
  const seen: boolean[] = [];
  const view = render(
    <SideRail label="Navigation" pinned={pinned} onPin={(p) => told.push(p)}>
      {(expanded) => {
        seen.push(expanded);
        return <a href="#pods">Pods</a>;
      }}
    </SideRail>,
  );
  const rail = view.getByRole('complementary', { name: 'Navigation' });
  const panel = rail.querySelector('.uk-rail-panel') as HTMLElement;
  return { ...view, rail, panel, told, seen, state: () => rail.dataset.state };
}

describe('SideRail', () => {
  it('peeks as the pointer rests on it a moment — not as it passes — and collapses once it leaves; what is in it told it is wide', () => {
    vi.useFakeTimers();
    const { panel, state, seen } = mount();
    expect(state()).toBe('collapsed');
    fireEvent.pointerEnter(panel);
    fireEvent.pointerLeave(panel);
    act(() => void vi.advanceTimersByTime(PEEK_MS + LEAVE_MS));
    expect(state()).toBe('collapsed');
    fireEvent.pointerEnter(panel);
    act(() => void vi.advanceTimersByTime(PEEK_MS));
    expect([state(), seen.at(-1)]).toEqual(['peek', true]);
    fireEvent.pointerLeave(panel);
    act(() => void vi.advanceTimersByTime(LEAVE_MS));
    expect([state(), seen.at(-1)]).toEqual(['collapsed', false]);
  });

  it('collapses as a link in it is followed (what it opens shown), peeking again only once the pointer has left and come back; a tool’s click keeps it', () => {
    vi.useFakeTimers();
    const view = render(
      <SideRail label="Navigation" pinned={false} onPin={() => {}}>
        <a href="#pods">Pods</a>
        <button type="button">Close Pods</button>
      </SideRail>,
    );
    const rail = view.getByRole('complementary');
    const panel = rail.querySelector('.uk-rail-panel') as HTMLElement;
    const peek = () => {
      fireEvent.pointerEnter(panel);
      act(() => void vi.advanceTimersByTime(PEEK_MS));
    };
    peek();
    fireEvent.click(view.getByRole('button', { name: 'Close Pods' }));
    expect(rail.dataset.state).toBe('peek');
    fireEvent.click(view.getByRole('link', { name: 'Pods' }));
    expect(rail.dataset.state).toBe('collapsed');
    peek();
    expect(rail.dataset.state).toBe('collapsed');
    fireEvent.pointerLeave(panel);
    act(() => void vi.advanceTimersByTime(LEAVE_MS));
    peek();
    expect(rail.dataset.state).toBe('peek');
  });

  it('stays while one in it is dragged, collapsing once that is done', () => {
    vi.useFakeTimers();
    const { panel, state } = mount();
    fireEvent.pointerEnter(panel);
    act(() => void vi.advanceTimersByTime(PEEK_MS));
    panel.querySelector('a')?.setAttribute('data-sorting', 'y');
    fireEvent.pointerLeave(panel);
    act(() => void vi.advanceTimersByTime(LEAVE_MS * 3));
    expect(state()).toBe('peek');
    panel.querySelector('a')?.removeAttribute('data-sorting');
    act(() => void vi.advanceTimersByTime(LEAVE_MS));
    expect(state()).toBe('collapsed');
  });

  it('peeks as the keyboard comes in (not a click’s focus), collapses by Escape or as focus leaves', () => {
    const { panel, state } = mount();
    const link = panel.querySelector('a') as HTMLElement;
    fireEvent.pointerDown(window);
    act(() => link.focus());
    expect(state()).toBe('collapsed');
    act(() => link.blur());
    fireEvent.keyDown(window, { key: 'Tab' });
    act(() => link.focus());
    expect(state()).toBe('peek');
    fireEvent.keyDown(link, { key: 'Escape' });
    expect(state()).toBe('collapsed');
    act(() => link.blur());
    act(() => link.focus());
    expect(state()).toBe('peek');
    act(() => link.blur());
    expect(state()).toBe('collapsed');
  });

  it('is pinned by its toggle (named once, pressed or not) — the caller’s to keep — and wide beside the page then, peeking no more', () => {
    const collapsed = mount();
    const pin = collapsed.getByRole('button', { name: 'Keep open' });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pin);
    expect(collapsed.told).toEqual([true]);
    cleanup();
    const pinned = mount(true);
    const toggle = pinned.getByRole('button', { name: 'Keep open' });
    expect([pinned.state(), pinned.seen.at(-1), toggle.getAttribute('aria-pressed')]).toEqual(['pinned', true, 'true']);
    fireEvent.pointerEnter(pinned.panel);
    fireEvent.pointerLeave(pinned.panel);
    expect(pinned.state()).toBe('pinned');
    fireEvent.click(toggle);
    expect(pinned.told).toEqual([false]);
  });

  it('stays while a dialog it opened is open, or while held, collapsing once that is done — with the pointer gone', () => {
    vi.useFakeTimers();
    const view = render(<Held hold={false} />);
    const rail = view.getByRole('complementary');
    const panel = rail.querySelector('.uk-rail-panel') as HTMLElement;
    fireEvent.pointerEnter(panel);
    act(() => void vi.advanceTimersByTime(PEEK_MS));
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    panel.append(dialog);
    fireEvent.pointerLeave(panel);
    act(() => void vi.advanceTimersByTime(LEAVE_MS * 3));
    expect(rail.dataset.state).toBe('peek');
    dialog.remove();
    act(() => void vi.advanceTimersByTime(LEAVE_MS));
    expect(rail.dataset.state).toBe('collapsed');
    // Held (a menu over the page): kept; let go with the pointer gone, collapsed.
    fireEvent.pointerEnter(panel);
    act(() => void vi.advanceTimersByTime(PEEK_MS));
    view.rerender(<Held hold />);
    fireEvent.pointerLeave(panel);
    act(() => void vi.advanceTimersByTime(LEAVE_MS * 3));
    expect(rail.dataset.state).toBe('peek');
    view.rerender(<Held hold={false} />);
    act(() => void vi.advanceTimersByTime(LEAVE_MS));
    expect(rail.dataset.state).toBe('collapsed');
  });

  it('takes a link followed by the keyboard as followed — the pointer coming later peeks; a click before it peeks stops it peeking', () => {
    vi.useFakeTimers();
    const { panel, state } = mount();
    const link = panel.querySelector('a') as HTMLElement;
    fireEvent.keyDown(window, { key: 'Tab' });
    act(() => link.focus());
    expect(state()).toBe('peek');
    fireEvent.click(link);
    expect(state()).toBe('collapsed');
    act(() => link.blur());
    fireEvent.pointerEnter(panel);
    act(() => void vi.advanceTimersByTime(PEEK_MS));
    expect(state()).toBe('peek');
    fireEvent.pointerLeave(panel);
    act(() => void vi.advanceTimersByTime(LEAVE_MS));
    fireEvent.pointerEnter(panel);
    fireEvent.click(link);
    act(() => void vi.advanceTimersByTime(PEEK_MS * 2));
    expect(state()).toBe('collapsed');
  });

  it('opens wide with what it opened beside it (its flyout, from its narrow state too), kept so till it is gone', () => {
    vi.useFakeTimers();
    const view = render(<Held hold={false} />);
    const rail = view.getByRole('complementary');
    view.rerender(<Held hold={false} flyout />);
    expect([rail.dataset.state, rail.querySelector(':scope > .beside')?.textContent]).toEqual(['peek', 'beside']);
    fireEvent.pointerLeave(rail.querySelector('.uk-rail-panel') as HTMLElement);
    act(() => void vi.advanceTimersByTime(LEAVE_MS * 3));
    expect(rail.dataset.state).toBe('peek');
    view.rerender(<Held hold={false} />);
    act(() => void vi.advanceTimersByTime(LEAVE_MS));
    expect(rail.dataset.state).toBe('collapsed');
  });

  it('peeks no more once pinned by whoever keeps it: unpinned later, it is collapsed', () => {
    vi.useFakeTimers();
    const view = render(<Held hold={false} />);
    const rail = view.getByRole('complementary');
    fireEvent.pointerEnter(rail.querySelector('.uk-rail-panel') as HTMLElement);
    act(() => void vi.advanceTimersByTime(PEEK_MS));
    view.rerender(<Held hold={false} pinned />);
    view.rerender(<Held hold={false} />);
    expect(rail.dataset.state).toBe('collapsed');
  });
});

function Held({ hold, pinned = false, flyout = false }: { hold: boolean; pinned?: boolean; flyout?: boolean }) {
  return (
    <SideRail label="Navigation" pinned={pinned} onPin={() => {}} hold={hold} flyout={flyout && <div class="beside">beside</div>}>
      <a href="#pods">Pods</a>
    </SideRail>
  );
}
