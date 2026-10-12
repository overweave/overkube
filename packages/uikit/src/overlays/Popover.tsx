import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { activeElement, focusable } from '../lib/focus';

/**
 * Something open over the page beside what opened it (its anchor): under it
 * — or where its place puts it (placed: false, its CSS's) — fixed to the window, so no container of the host page cuts it; kept inside the window.
 * Escape or a click outside closes it, and focus goes back to what opened
 * it. The first field (or button) in it takes focus when it opens.
 */
export function Popover({
  onClose,
  anchor,
  align = 'start',
  placed = true,
  matchWidth = false,
  label,
  state = 'open',
  class: className,
  children,
}: {
  onClose: () => void;
  anchor: { current: HTMLElement | null };
  align?: 'start' | 'end';
  /** Placed under its anchor (the default); false: where its CSS puts it (a side's flyout), focus, Escape and a click outside as ever. */
  placed?: boolean;
  /** At least as wide as the anchor (a select's list). */
  matchWidth?: boolean;
  label?: string;
  /** closing: fading out (usePresence). */
  state?: 'open' | 'closing';
  class?: string;
  children: ComponentChildren;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Placed on the element itself, before it is shown and before focus goes into it (a hidden element takes no focus).
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = box.current;
      if (!el) return;
      if (!placed || !a) {
        el.style.visibility = placed ? 'hidden' : 'visible';
        return;
      }
      if (matchWidth) el.style.minWidth = `${a.width}px`;
      const width = el.offsetWidth;
      const left = align === 'end' ? a.right - width : a.left;
      el.style.top = `${a.bottom + 6}px`;
      el.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
      el.style.visibility = 'visible';
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, align, placed, matchWidth]);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = activeElement() as HTMLElement | null;
    const root = box.current;
    if (root) (focusable(root).find((el) => el.tagName === 'INPUT') ?? focusable(root)[0])?.focus();
    let armed = false;
    // Not the click that opened it.
    const arm = setTimeout(() => {
      armed = true;
    });
    // Not a press on what opened it either (it closes it itself: no closing, then opening again).
    const outside = (e: Event) => armed && root && !e.composedPath().some((t) => t === root || t === anchor.current) && close.current();
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      // Back where focus was, then closed (whoever closes it may put focus elsewhere).
      before?.focus?.();
      close.current();
    };
    document.addEventListener('pointerdown', outside);
    root?.addEventListener('keydown', key);
    return () => {
      clearTimeout(arm);
      document.removeEventListener('pointerdown', outside);
      root?.removeEventListener('keydown', key);
    };
  }, []);
  return (
    <div class={`uk-popover ${className ?? ''}`} role="dialog" aria-label={label} data-state={state} ref={box} style={{ visibility: 'hidden' }}>
      {children}
    </div>
  );
}
