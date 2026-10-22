import { cleanup, fireEvent, render } from '@testing-library/preact';
import { useRef, useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Popover } from '../overlays/Popover';
import { Tip } from '../overlays/Tip';
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

  it('makes inert, in a root within a root (a story’s page in the stories’ own), what is beside its layers — not the root holding them', () => {
    const view = render(
      <div class="uk-root">
        <aside>beside</aside>
        <Page told={[]} />
      </div>,
    );
    fireEvent.click(view.getByText('open'));
    const inner = view.container.querySelectorAll('.uk-root')[1] as HTMLElement;
    const main = inner.querySelector('main') as HTMLElement;
    expect([inner.inert, main.inert, (view.container.querySelector('aside') as HTMLElement).inert]).toEqual([false, true, true]);
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

describe('a box placed by its anchor', () => {
  const box = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  /** A button in a body that scrolls (a modal's, over its foot), opening a popover under it. */
  function Placed({ bodyBottom }: { bodyBottom: number }) {
    const anchor = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    return (
      <div class="uk-root">
        <div class="body" style={{ overflowY: 'auto' }} data-bottom={bodyBottom}>
          <button type="button" ref={anchor} onClick={() => setOpen(true)}>
            open
          </button>
        </div>
        {open && (
          <Popover anchor={anchor} onClose={() => setOpen(false)}>
            <p>in it</p>
          </Popover>
        )}
      </div>
    );
  }

  it('is held to the room on its side, to the edge of what scrolls it (a modal’s body over its foot), a margin kept; over it where it does not fit under and there is more; its side kept as it scrolls, till that side’s room is too small', () => {
    let anchorTop = 400;
    let height = 0;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.tagName === 'BUTTON') return box(anchorTop, 20);
      if (this.classList.contains('body')) return box(0, Number((this as HTMLElement).dataset.bottom));
      return box(0, 0);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('uk-popover') ? height : 0;
    });
    vi.stubGlobal('innerHeight', 800);
    const pop = () => document.querySelector('.uk-popover') as HTMLElement;
    const placed = () => [pop().style.getPropertyValue('--uk-placed-room'), pop().dataset.side];
    // Small: under it — the body ends at 600, it at 420: 6 apart, 5 kept.
    height = 100;
    const view = render(<Placed bodyBottom={600} />);
    fireEvent.click(view.getByText('open'));
    expect(placed()).toEqual(['169px', 'bottom']);
    cleanup();
    // Taller than the room under it, more over it: over it (400 - 6 - 5).
    height = 300;
    const tall = render(<Placed bodyBottom={600} />);
    fireEvent.click(tall.getByText('open'));
    expect(placed()).toEqual(['389px', 'top']);
    // Scrolled a little (the anchor lower): kept over it; scrolled to the top (no room over it), under it.
    anchorTop = 450;
    fireEvent.scroll(tall.container.querySelector('.body') as HTMLElement);
    expect(placed()).toEqual(['439px', 'top']);
    anchorTop = 60;
    fireEvent.scroll(tall.container.querySelector('.body') as HTMLElement);
    expect(placed()).toEqual(['509px', 'bottom']);
    cleanup();
    // Its height not there to measure yet, little room under it, more over it: over it for now.
    height = 0;
    anchorTop = 100;
    const low = render(<Placed bodyBottom={200} />);
    fireEvent.click(low.getByText('open'));
    expect(placed()).toEqual(['89px', 'top']);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe('a tip placed by its anchor', () => {
  const rect = (left: number, top: number, w: number, h: number) =>
    ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  function placed(anchor: DOMRect, beside: boolean) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.classList.contains('uk-tip-at') ? anchor : rect(0, 0, 0, 0);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('uk-tip') ? 20 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('uk-tip') ? 150 : 0;
    });
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('innerWidth', 1000);
    render(
      <div class="uk-root">
        <Tip open beside={beside} content={() => 'said'}>
          <span>it</span>
        </Tip>
      </div>,
    );
    const tip = document.querySelector('.uk-tip') as HTMLElement;
    const at = [tip.style.left, tip.style.top, tip.dataset.side];
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    return at;
  }

  it('under it where it fits, little room though there is (not over it); beside it at its right, its left where the right has no room', () => {
    // 100px from the window's foot: under it (it fits), not over it.
    expect(placed(rect(100, 680, 40, 20), false)).toEqual(['100px', '704px', 'bottom']);
    expect(placed(rect(100, 300, 40, 20), true)).toEqual(['144px', '300px', 'right']);
    expect(placed(rect(900, 300, 40, 20), true)).toEqual(['746px', '300px', 'left']);
  });
});
