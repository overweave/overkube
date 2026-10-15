import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { slideIn, slideOut } from './slide';

/*
 * A cell cut short slid along under the pointer (after a while), stopped at
 * its end, slid back once the pointer goes; one that fits not slid; what is
 * in it ending a transition of its own not taken for its slide's end.
 */

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** A cell (so wide) holding what is so wide, a chip in it. */
function cell(width: number, content: number) {
  const el = document.createElement('div');
  el.setAttribute('role', 'cell');
  const inner = document.createElement('span');
  const chip = document.createElement('i');
  inner.appendChild(chip);
  el.appendChild(inner);
  document.body.appendChild(el);
  Object.defineProperty(el, 'clientWidth', { value: width });
  Object.defineProperty(inner, 'offsetWidth', { value: content });
  return { el, inner, chip };
}

// What the handlers read of an event, as the page's would carry it.
const over = (target: Element) => slideIn({ target, relatedTarget: null, pointerType: 'mouse' } as unknown as PointerEvent);
const out = (target: Element) => slideOut({ target, relatedTarget: document.body } as unknown as PointerEvent);
const ended = (target: Element, propertyName: string, on: HTMLElement) => on.ontransitionend?.call(on, { target, propertyName } as unknown as TransitionEvent);

describe('a cell cut short', () => {
  it('slides along to its end after a while, stops there, and back once the pointer goes', () => {
    const { el, inner } = cell(100, 180);
    over(el);
    expect(el.dataset.slide).toBeUndefined();
    vi.advanceTimersByTime(400);
    expect([el.dataset.slide, inner.style.transform]).toEqual(['go', 'translateX(-80px)']);
    ended(inner, 'transform', inner);
    expect(el.dataset.slide).toBe('end');
    out(el);
    expect([el.dataset.slide, inner.style.transform]).toEqual(['back', '']);
    ended(inner, 'transform', inner);
    expect(el.dataset.slide).toBeUndefined();
  });

  it('does not take what is in it ending a transition of its own for its slide’s end', () => {
    const { el, inner, chip } = cell(100, 180);
    over(el);
    vi.advanceTimersByTime(400);
    ended(chip, 'background-color', inner);
    ended(inner, 'opacity', inner);
    expect(el.dataset.slide).toBe('go');
  });

  it('leaves one that fits, and one the pointer left before it began', () => {
    const fits = cell(100, 90);
    over(fits.el);
    vi.advanceTimersByTime(400);
    expect(fits.el.dataset.slide).toBeUndefined();
    const left = cell(100, 180);
    over(left.el);
    out(left.el);
    vi.advanceTimersByTime(400);
    expect(left.el.dataset.slide).toBeUndefined();
  });
});
