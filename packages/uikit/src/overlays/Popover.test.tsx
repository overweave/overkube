import { cleanup, fireEvent, render } from '@testing-library/preact';
import { useRef } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Popover } from './Popover';

/*
 * Something open beside what opened it: placed under its anchor (at its
 * start or end, kept inside the window), focus in it and back, Escape and a
 * click outside closing it. happy-dom lays nothing out: the anchor is taken
 * to be where a test says, the popover 200px wide.
 */

let anchorBox = { left: 100, right: 180, top: 20, bottom: 50, width: 80, height: 30 };

beforeEach(() => {
  anchorBox = { left: 100, right: 180, top: 20, bottom: 50, width: 80, height: 30 };
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const b = this.hasAttribute('data-anchor') ? anchorBox : { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    return { ...b, x: b.left, y: b.top, toJSON: () => ({}) } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('uk-popover') ? 200 : 0;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(props: Partial<Parameters<typeof Popover>[0]> = {}, inside = <button type="button">inside</button>) {
  const told: string[] = [];
  function Holder() {
    const anchor = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button type="button" ref={anchor} data-anchor>
          open
        </button>
        <Popover anchor={anchor} onClose={() => told.push('close')} label="Namespaces" {...props}>
          {inside}
        </Popover>
      </>
    );
  }
  const view = render(<Holder />);
  return { ...view, told, popover: () => view.container.querySelector('.uk-popover') as HTMLElement };
}

describe('Popover: where it is', () => {
  it('is a dialog named as it is given, under its anchor at its start, shown once placed', () => {
    const { popover, getByRole } = mount();
    expect(getByRole('dialog', { name: 'Namespaces' })).toBe(popover());
    expect(popover().style.top).toBe('56px');
    expect(popover().style.left).toBe('100px');
    expect(popover().style.visibility).toBe('visible');
  });

  it('lines up with its anchor’s end, aligned so', () => {
    anchorBox = { left: 420, right: 500, top: 20, bottom: 50, width: 80, height: 30 };
    expect(mount({ align: 'end' }).popover().style.left).toBe(`${500 - 200}px`);
  });

  it('is kept inside the window, 8px from either edge', () => {
    anchorBox = { left: 2, right: 40, top: 0, bottom: 30, width: 38, height: 30 };
    expect(mount().popover().style.left).toBe('8px');
    cleanup();
    anchorBox = { left: window.innerWidth - 20, right: window.innerWidth, top: 0, bottom: 30, width: 20, height: 30 };
    expect(mount().popover().style.left).toBe(`${window.innerWidth - 200 - 8}px`);
  });

  it('is as wide as its anchor at least, asked to be', () => {
    expect(mount({ matchWidth: true }).popover().style.minWidth).toBe('80px');
    cleanup();
    expect(mount().popover().style.minWidth).toBe('');
  });

  it('says whether it is closing, and takes a class', () => {
    const { popover } = mount({ state: 'closing', class: 'uk-ms-popup' });
    expect(popover().getAttribute('data-state')).toBe('closing');
    expect(popover().classList.contains('uk-ms-popup')).toBe(true);
  });
});

describe('Popover: focus', () => {
  it('gives focus to its first field, else its first button', () => {
    const fields = mount(
      {},
      <>
        <button type="button">a button</button>
        <input aria-label="a field" />
      </>,
    );
    expect(document.activeElement).toBe(fields.getByLabelText('a field'));
    cleanup();
    const buttons = mount();
    expect(document.activeElement).toBe(buttons.getByText('inside'));
  });

  it('gives focus back to what had it, and closes, on Escape (its own: none above it)', () => {
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const { getByText, told } = mount();
    expect(document.activeElement).toBe(getByText('inside'));
    fireEvent.keyDown(getByText('inside'), { key: 'Escape' });
    expect(told).toEqual(['close']);
    expect(document.activeElement).toBe(before);
    expect(outer).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outer);
    before.remove();
  });
});

describe('Popover: a click outside', () => {
  it('closes it, after the click that opened it — not a click inside', async () => {
    const { getByText, told } = mount();
    // At once: the click that opened it, still going.
    fireEvent.pointerDown(document.body);
    expect(told).toEqual([]);
    await new Promise((r) => setTimeout(r, 5));
    fireEvent.pointerDown(getByText('inside'));
    expect(told).toEqual([]);
    fireEvent.pointerDown(document.body);
    expect(told).toEqual(['close']);
  });

  it('takes a click on its anchor as outside (known: it closes, the anchor’s click opens it again)', async () => {
    const { getByText, told } = mount();
    await new Promise((r) => setTimeout(r, 5));
    fireEvent.pointerDown(getByText('open'));
    expect(told).toEqual(['close']);
  });
});
