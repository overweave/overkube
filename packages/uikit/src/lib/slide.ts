/*
 * A cell cut short, under the pointer a while: what is in it slid along to
 * its end (by its length, at a reading pace), and stopped there; its edges
 * fading where more is hidden. The pointer gone: slid back, and cut short
 * again. Not on touch, nor when motion is to be reduced.
 */

import { still } from './layers';

const WAIT_MS = 350;
const PX_PER_S = 40;
const AT_LEAST_MS = 1200;
const BACK_MS = 600;

const waiting = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** Its own slide ended (not a transition of what is in it — a chip's colour — bubbling up). */
const own = (e: TransitionEvent, inner: HTMLElement) => e.target === inner && e.propertyName === 'transform';

/** The cell the pointer moved into or out of (not between what is in it), and what in it slides. */
function cellOf(e: PointerEvent): [HTMLElement, HTMLElement] | undefined {
  const cell = (e.target as Element).closest?.<HTMLElement>('[role=cell]:not([data-wrap])');
  const inner = cell?.firstElementChild as HTMLElement | null;
  if (!cell || !inner || cell.contains(e.relatedTarget as Node | null)) return undefined;
  return [cell, inner];
}

function slide(cell: HTMLElement, inner: HTMLElement) {
  if (still()) return;
  cell.dataset.slide = '';
  const by = inner.offsetWidth - cell.clientWidth;
  if (by <= 1) {
    delete cell.dataset.slide;
    return;
  }
  inner.style.transition = `transform ${Math.max(AT_LEAST_MS, (by / PX_PER_S) * 1000)}ms cubic-bezier(.37, 0, .63, 1)`;
  inner.style.transform = `translateX(${-by}px)`;
  cell.dataset.slide = 'go';
  inner.ontransitionend = (e) => {
    if (own(e, inner)) cell.dataset.slide = 'end';
  };
}

/** The pointer into a cell: slid, after a while, if cut short. */
export function slideIn(e: PointerEvent) {
  if (e.pointerType === 'touch') return;
  const at = cellOf(e);
  if (!at) return;
  clearTimeout(waiting.get(at[0]));
  waiting.set(
    at[0],
    setTimeout(() => slide(...at), WAIT_MS),
  );
}

/** The pointer out of it: slid back. */
export function slideOut(e: PointerEvent) {
  const at = cellOf(e);
  if (!at) return;
  const [cell, inner] = at;
  clearTimeout(waiting.get(cell));
  if (cell.dataset.slide === undefined) return;
  inner.style.transition = `transform ${BACK_MS}ms cubic-bezier(.33, 0, .2, 1)`;
  inner.style.transform = '';
  cell.dataset.slide = 'back';
  inner.ontransitionend = (e) => {
    if (!own(e, inner)) return;
    delete cell.dataset.slide;
    inner.style.transition = '';
    inner.ontransitionend = null;
  };
}
