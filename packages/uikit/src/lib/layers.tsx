import type { ComponentChildren, JSX, RefObject } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { activeElement, focusable, trapTab } from './focus';

/*
 * What is open over the page — a dialog, a popover, a menu — as layers of
 * one stack: drawn at the end of the page's root (.uk-layers, the kit's
 * styles there), each over those opened before it. The stack, not each of
 * them, says what Escape and a press outside close: the top layer only (a
 * press on what opened it is not outside); and while a modal one is open,
 * everything under it is inert, the page does not scroll, and Tab goes
 * round inside it. Focus goes into a layer as it opens, and back where it
 * was once it is gone. Nothing of the browser's own top layer (<dialog>,
 * popover): one order, one way to close, motion as the kit's CSS has it.
 *
 * Its host is placed at the page's origin and moves with it: a layer by
 * something on the page (placeAt) is placed in the page, not the window —
 * it goes with what opened it as the page scrolls (or bounces, at its ends).
 */

interface Entry {
  el: HTMLElement;
  modal: boolean;
  /** Drawn where it is (not at the root's end): its order there its own. */
  inPlace: boolean;
  dismiss?: () => void;
  anchor?: RefObject<HTMLElement>;
  /** Focus back where it was before it opened. */
  back: () => void;
  /** Pressed outside from now on (not by the press that opened it, still going as it opens). */
  armed: boolean;
}

const stack: Entry[] = [];

/** The page's roots layers were drawn in: made inert under a modal one — in a shadow root too, where the document's query does not reach. */
const roots = new Set<Element>();

/** The host of the layers of the root this is drawn in (made at its end, once). */
function hostOf(from: Element | null): HTMLElement {
  const root = from?.closest('.uk-root') ?? document.body;
  if (root !== document.body) roots.add(root);
  const found = [...root.children].find((c) => c.classList.contains('uk-layers'));
  if (found) return found as HTMLElement;
  const host = document.createElement('div');
  host.className = 'uk-layers';
  root.appendChild(host);
  return host;
}

/** Escape and Tab: the top layer's (one under it keeps its own keys: it stops them); Tab round inside it while a modal one is open (it, or one under it). */
function keys(e: KeyboardEvent) {
  const top = stack.at(-1);
  if (!top) return;
  if (e.key === 'Tab' && stack.some((l) => l.modal)) trapTab(top.el, e);
  if (e.key !== 'Escape' || e.defaultPrevented || !top.dismiss) return;
  e.preventDefault();
  e.stopPropagation();
  // Back where focus was, then closed (whoever closes it may put focus elsewhere). Where that is inert still (under a modal it is in),
  // this does nothing: its going (Layer's cleanup) puts focus back once it is not.
  top.back();
  top.dismiss();
}

/** A press outside the top layers: each it is outside closes, down to one it is in (or a modal one: what is under it is not to be pressed). One in a tip (a card's action) is in what the tip is over: nothing closes. */
function press(e: PointerEvent) {
  const path = e.composedPath();
  if (path.some((n) => n instanceof Element && n.classList.contains('uk-tip'))) return;
  for (let i = stack.length - 1; i >= 0; i--) {
    const layer = stack[i];
    if (path.includes(layer.el) || (layer.anchor?.current && path.includes(layer.anchor.current)) || layer.modal) return;
    if (layer.armed) layer.dismiss?.();
  }
}

/** Each layer drawn over those before it (in the stack's order: one opened later, over); while a modal layer is open, the page and the layers under it inert, the page not scrolled. */
function settle() {
  let modal = -1;
  for (const [i, l] of stack.entries()) if (l.modal) modal = i;
  for (const [i, l] of stack.entries()) {
    l.el.inert = i < modal;
    if (!l.inPlace) l.el.style.zIndex = String(i + 1);
  }
  for (const root of document.querySelectorAll('.uk-root')) roots.add(root);
  for (const root of roots) {
    if (!root.isConnected) {
      roots.delete(root);
      continue;
    }
    for (const child of root.children) if (!child.classList.contains('uk-layers')) (child as HTMLElement).inert = modal >= 0;
  }
  // Not scrolled: html.uk-locked — and on the element itself, for the kit's styles in a shadow root (from where html is not reached).
  const html = document.documentElement;
  const locked = modal >= 0;
  if (html.classList.contains('uk-locked') !== locked) {
    html.classList.toggle('uk-locked', locked);
    html.style.overflow = locked ? 'hidden' : '';
    html.style.overscrollBehavior = locked ? 'none' : '';
  }
}

function join(entry: Entry) {
  if (!stack.length) {
    document.addEventListener('keydown', keys);
    document.addEventListener('pointerdown', press, true);
  }
  stack.push(entry);
  settle();
}

function leave(entry: Entry) {
  const at = stack.indexOf(entry);
  if (at >= 0) stack.splice(at, 1);
  if (!stack.length) {
    document.removeEventListener('keydown', keys);
    document.removeEventListener('pointerdown', press, true);
  }
  settle();
}

export interface LayerProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'role' | 'label' | 'ref' | 'children'> {
  /** Over everything (a dialog): what is under it inert, the page not scrolled, Tab round inside it. */
  modal?: boolean;
  /** Escape, or a press outside it (it the top layer): its way to close. None: neither closes it. */
  onDismiss?: () => void;
  /** What opened it: a press on it is not outside (it closes it itself). */
  anchor?: RefObject<HTMLElement>;
  /** Focus as it opens: its first field, else its first control, else itself (first); its first field, else itself (field); itself; left where it is. */
  focus?: 'first' | 'field' | 'self' | 'none';
  /** Going (fading out, still drawn): out of the stack at once — no longer closed, focus back where it was. */
  closing?: boolean;
  /** Drawn where it is, not at the root's end (a side's flyout: placed by its side) — a layer as any other. */
  inPlace?: boolean;
  /** Its element's class and what it says, for those who cannot see it. */
  class?: string;
  role?: JSX.AriaRole;
  label?: string;
  labelledBy?: string;
  /** Its element, once it is there (drawn at the root's end: not at once) — for whoever places or measures it. */
  onLayer?: (el: HTMLDivElement) => void;
  children: ComponentChildren;
}

/** A layer of the stack: its element (the class given), drawn at the root's end (or where it is). */
export function Layer({
  modal = false,
  onDismiss,
  anchor,
  focus = 'first',
  closing = false,
  inPlace = false,
  class: className,
  role,
  label,
  labelledBy,
  onLayer,
  children,
  ...rest
}: LayerProps) {
  const marker = useRef<HTMLSpanElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useLayoutEffect(() => {
    if (!inPlace) setHost(hostOf(marker.current));
  }, []);
  const ready = inPlace || host !== null;
  useLayoutEffect(() => {
    if (ready && el.current) onLayer?.(el.current);
  }, [ready]);
  useEffect(() => {
    const node = el.current;
    if (!ready || !node || closing) return;
    const before = activeElement() as HTMLElement | null;
    const entry: Entry = {
      el: node,
      modal,
      inPlace,
      anchor,
      dismiss: onDismiss && (() => dismiss.current?.()),
      back: () => before?.focus?.({ preventScroll: true }),
      armed: false,
    };
    join(entry);
    const arm = setTimeout(() => {
      entry.armed = true;
    });
    if (focus !== 'none') {
      const controls = focusable(node);
      const field = controls.find((c) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(c.tagName));
      const first = focus === 'first' ? (field ?? controls[0]) : focus === 'field' ? field : undefined;
      (first ?? node).focus({ preventScroll: true });
    }
    return () => {
      clearTimeout(arm);
      leave(entry);
      // Back where it was — unless focus has gone elsewhere meanwhile (somewhere other than in it, or nowhere).
      const now = activeElement();
      if (!now || now === document.body || node.contains(now)) before?.focus?.({ preventScroll: true });
    };
  }, [ready, closing]);
  const layer = (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-modal with the role a modal layer is given (a dialog).
    <div
      tabIndex={-1}
      {...rest}
      class={`uk-layer ${className ?? ''}`}
      data-state={closing ? 'closing' : 'open'}
      ref={el}
      role={role}
      aria-modal={modal || undefined}
      aria-label={label}
      aria-labelledby={labelledBy}
    >
      {children}
    </div>
  );
  if (inPlace) return layer;
  return (
    <>
      <span ref={marker} hidden />
      {host && createPortal(layer, host)}
    </>
  );
}

/** Drawn at the root's end, over the layers, in no stack (what the user is told: never inert, never closed by a press). */
export function Above({ children, class: className }: { children: ComponentChildren; class?: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setHost(hostOf(marker.current)), []);
  return (
    <>
      <span ref={marker} hidden />
      {host && createPortal(<div class={`uk-above ${className ?? ''}`}>{children}</div>, host)}
    </>
  );
}

/** Where a box goes beside something (the window's coordinates: its rect, or a point), kept inside the window. */
export interface Placing {
  /** Its side's start (under it, at its left) or end (its right). */
  align?: 'start' | 'end';
  /** At least as wide as it. */
  matchWidth?: boolean;
  /** How far from it, and from the window's edges. */
  gap?: number;
  /** The window's room, not what shows the anchor (a tip: over everything, a scrolling table's body no edge of it). */
  inWindow?: boolean;
  /** Beside it (at its right; its left where it does not fit there), level with its top — not under or over it (a side's items, a list's). */
  beside?: boolean;
}

const EDGE = 8;

/**
 * A box placed by its anchor, in the page (its host's coordinates): under
 * it — above where it does not fit under and does above — its start or its
 * end, kept inside the window; placed again as the window changes, as what
 * holds the anchor scrolls (the page's own scroll moves both together), as
 * the box's size does. Given the box as it is there (attach: a layer's
 * onLayer), placed at once — before it is seen, before focus goes into it.
 */
export function usePlacedBy(
  anchor: RefObject<HTMLElement>,
  { align = 'start', matchWidth = false, gap = 6, inWindow = false, beside = false }: Placing = {},
): (el: HTMLElement) => void {
  const stop = useRef<() => void>();
  useEffect(() => () => stop.current?.(), []);
  return (el) => {
    stop.current?.();
    // Its side, chosen once its height is there to measure (it fits under, or there is more room over): placed again, it stays there —
    // never measured anew (what is in it would lose its scroll) — unless that side's room gets too small and the other's is more.
    let side: 'top' | 'bottom' | undefined;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const host = el.offsetParent?.getBoundingClientRect() ?? { top: 0, left: 0 };
      if (!a) return;
      if (matchWidth) el.style.minWidth = `${a.width}px`;
      if (beside) {
        el.style.setProperty('--uk-placed-room', `${Math.max(0, window.innerHeight - 2 * EDGE)}px`);
        const [w, h] = [el.offsetWidth, el.offsetHeight];
        const right = a.right + gap + w + EDGE <= window.innerWidth;
        el.style.left = `${(right ? a.right + gap : Math.max(EDGE, a.left - gap - w)) - host.left}px`;
        el.style.top = `${Math.max(EDGE, Math.min(a.top, window.innerHeight - h - EDGE)) - host.top}px`;
        el.dataset.side = right ? 'right' : 'left';
        el.style.visibility = 'visible';
        return;
      }
      // The room under it and over it, to the edge of what shows it (a modal's body over its foot, the page, the window), a margin kept.
      const room = inWindow ? { top: 0, bottom: window.innerHeight } : shownIn(anchor.current as HTMLElement);
      const below = room.bottom - a.bottom - gap - MARGIN;
      const above = a.top - room.top - gap - MARGIN;
      if (!side && el.offsetHeight > 0) side = el.offsetHeight > below && above > below ? 'top' : 'bottom';
      const there = side ?? (below < ROOM_AT_LEAST && above > below ? 'top' : 'bottom');
      // Its side's room too small (and it does not fit there), the other's more: the other side.
      const mine = there === 'top' ? above : below;
      if (side && mine < ROOM_AT_LEAST && el.offsetHeight > mine && (there === 'top' ? below : above) > mine) side = there === 'top' ? 'bottom' : 'top';
      const up = (side ?? there) === 'top';
      const w = el.offsetWidth;
      // At most the room on its side: what is in it scrolls inside, nothing around it does.
      el.style.setProperty('--uk-placed-room', `${Math.max(0, Math.floor(up ? above : below))}px`);
      const h = el.offsetHeight;
      const left = Math.max(EDGE, Math.min(align === 'end' ? a.right - w : a.left, window.innerWidth - w - EDGE));
      el.style.left = `${left - host.left}px`;
      el.style.top = `${(up ? a.top - gap - h : a.bottom + gap) - host.top}px`;
      el.dataset.side = up ? 'top' : 'bottom';
      el.style.visibility = 'visible';
    };
    place();
    // What holds it scrolled (not the page: it moves with it; not what is in it: it stays), the window resized, the box resized (its content came).
    const scrolled = (e: Event) => e.target !== document && !el.contains(e.target as Node) && place();
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : undefined;
    sized?.observe(el);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', scrolled, true);
    stop.current = () => {
      sized?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', scrolled, true);
    };
  };
}

/** Kept between a placed box and the edge of what shows it. */
const MARGIN = 5;
/** Room on a side too small to be of use: the other side taken, where it has more. */
const ROOM_AT_LEAST = 120;

/** What shows an element, in the window's coordinates: the window, cut by each of its ancestors that scrolls what is in it (a modal's body, ending over its foot; not a box that only cuts its text short). */
function shownIn(el: HTMLElement): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight;
  for (let at = el.parentElement; at; at = at.parentElement) {
    const y = getComputedStyle(at).overflowY;
    if (y !== 'auto' && y !== 'scroll') continue;
    const r = at.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  return { top, bottom };
}

/** A box placed at a point (the window's coordinates), in the page: to its left, or above it (above: from there), where it does not fit. */
export function placeAt(el: HTMLElement, at: { x: number; y: number; above?: number }): { x: number; y: number } {
  const host = el.offsetParent?.getBoundingClientRect() ?? { top: 0, left: 0 };
  const { offsetWidth: w, offsetHeight: h } = el;
  const left = at.x + w + EDGE > window.innerWidth ? at.x - w : at.x;
  const up = at.y + h + EDGE > window.innerHeight;
  const from = up ? (at.above ?? at.y) : at.y;
  const x = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE));
  const y = Math.max(EDGE, Math.min(up ? from - h : from, window.innerHeight - h - EDGE));
  Object.assign(el.style, { left: `${x - host.left}px`, top: `${y - host.top}px`, visibility: 'visible' });
  el.style.setProperty('--uk-menu-origin', `${at.x - x}px ${from - y}px`);
  return { x, y };
}

/** Whether the user asks for little motion. */
export const still = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Closing with motion: closing (still drawn, its state 'closing') for as long as it takes, then closed; a second ask, nothing. */
export function useLeave(onClose: () => void, ms: number): { closing: boolean; leave: () => void } {
  const [closing, setClosing] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  const asked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // Gone before it closed (its owner gone): not closed after (what took its place is not closed for it).
  useEffect(() => () => clearTimeout(timer.current), []);
  const leave = () => {
    if (asked.current) return;
    asked.current = true;
    if (still() || ms <= 0) return close.current();
    setClosing(true);
    timer.current = setTimeout(() => close.current(), ms);
  };
  return { closing, leave };
}
