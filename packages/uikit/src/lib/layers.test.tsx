import { cleanup, fireEvent, render } from '@testing-library/preact';
import { useRef, useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Layer, useLeave } from './layers';

/*
 * The stack of layers: drawn at the root's end, each over those before it;
 * Escape and a press outside the top one's (a press on its anchor not
 * outside); under a modal one, the page and the layers below inert, the page
 * not scrolled; focus in and back.
 */

afterEach(cleanup);

/** A page (its root), a button opening a modal layer, and in it one opening a layer over it. */
function Page({ told }: { told: string[] }) {
  const [modal, setModal] = useState(false);
  const [over, setOver] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <div class="uk-root">
      <main>
        <button type="button" onClick={() => setModal(true)}>
          open
        </button>
      </main>
      {modal && (
        <Layer
          modal
          class="modal"
          onDismiss={() => {
            told.push('modal');
            setModal(false);
          }}
        >
          <input aria-label="field" />
          <button type="button" ref={anchor} onClick={() => setOver(!over)}>
            more
          </button>
          {over && (
            <Layer
              class="over"
              anchor={anchor}
              onDismiss={() => {
                told.push('over');
                setOver(false);
              }}
            >
              <button type="button">in over</button>
            </Layer>
          )}
        </Layer>
      )}
    </div>
  );
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('layers', () => {
  it('draws them at the root’s end, each over the one before; focus in, and back once gone', async () => {
    const told: string[] = [];
    const view = render(<Page told={told} />);
    const open = view.getByText('open');
    open.focus();
    fireEvent.click(open);
    const host = view.container.querySelector('.uk-root > .uk-layers') as HTMLElement;
    expect([host.querySelector('.modal') !== null, document.activeElement]).toEqual([true, view.getByLabelText('field')]);
    fireEvent.click(view.getByText('more'));
    expect([...host.children].map((c) => c.classList[1])).toEqual(['modal', 'over']);
    expect(document.activeElement).toBe(view.getByText('in over'));
    await tick();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect([told, document.activeElement]).toEqual([['over', 'modal'], open]);
  });

  it('closes the top one by Escape, the one under it by the next', async () => {
    const told: string[] = [];
    const view = render(<Page told={told} />);
    fireEvent.click(view.getByText('open'));
    fireEvent.click(view.getByText('more'));
    fireEvent.keyDown(view.getByText('in over'), { key: 'Escape' });
    expect([told, view.container.querySelector('.modal') !== null]).toEqual([['over'], true]);
  });

  it('closes those a press is outside of (not the press that opened it, not one on its anchor), not one under it', async () => {
    const told: string[] = [];
    const view = render(<Page told={told} />);
    fireEvent.click(view.getByText('open'));
    fireEvent.click(view.getByText('more'));
    // The press that opened it, still going.
    fireEvent.pointerDown(view.getByLabelText('field'));
    expect(told).toEqual([]);
    await tick();
    fireEvent.pointerDown(view.getByText('in over'));
    fireEvent.pointerDown(view.getByText('more'));
    expect(told).toEqual([]);
    // In the modal one, outside the one over it: that one closed, the modal one not (under it: not outside it).
    fireEvent.pointerDown(view.getByLabelText('field'));
    expect([told, view.container.querySelector('.modal') !== null]).toEqual([['over'], true]);
  });

  it('makes the page inert under a modal one, and not scrolled — till it is gone', () => {
    const view = render(<Page told={[]} />);
    const main = view.container.querySelector('main') as HTMLElement;
    fireEvent.click(view.getByText('open'));
    expect([main.inert, document.documentElement.classList.contains('uk-locked')]).toEqual([true, true]);
    fireEvent.keyDown(view.getByLabelText('field'), { key: 'Escape' });
    expect([main.inert, document.documentElement.classList.contains('uk-locked')]).toEqual([false, false]);
  });

  it('keeps Tab inside a modal one', () => {
    const view = render(<Page told={[]} />);
    fireEvent.click(view.getByText('open'));
    const more = view.getByText('more');
    more.focus();
    fireEvent.keyDown(more, { key: 'Tab' });
    expect(document.activeElement).toBe(view.getByLabelText('field'));
  });

  it('draws each over those before it by its place in the stack (one opened later over), not by its sort', () => {
    const view = render(<Page told={[]} />);
    fireEvent.click(view.getByText('open'));
    fireEvent.click(view.getByText('more'));
    const host = view.container.querySelector('.uk-root > .uk-layers') as HTMLElement;
    expect([...host.children].map((c) => (c as HTMLElement).style.zIndex)).toEqual(['1', '2']);
  });

  it('keeps Tab inside the top one while a modal one is open under it (a popover over a dialog)', () => {
    const view = render(<Page told={[]} />);
    fireEvent.click(view.getByText('open'));
    fireEvent.click(view.getByText('more'));
    const inOver = view.getByText('in over');
    inOver.focus();
    fireEvent.keyDown(inOver, { key: 'Tab' });
    expect(document.activeElement).toBe(inOver);
  });
});

describe('useLeave', () => {
  it('closes after its motion — not once its owner is gone meanwhile', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const closed: string[] = [];
    const leaves: (() => void)[] = [];
    function Owner({ name }: { name: string }) {
      const { leave } = useLeave(() => closed.push(name), 100);
      leaves.push(leave);
      return null;
    }
    const kept = render(<Owner name="kept" />);
    leaves.at(-1)?.();
    vi.advanceTimersByTime(100);
    const gone = render(<Owner name="gone" />);
    leaves.at(-1)?.();
    gone.unmount();
    vi.advanceTimersByTime(100);
    expect(closed).toEqual(['kept']);
    kept.unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
