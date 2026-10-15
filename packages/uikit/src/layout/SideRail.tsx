import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { Tip } from '../overlays/Tip';

/*
 * A page's side, always there, in three states: collapsed (narrow: icons
 * only), peeking (wide over the page, the page as it was: the pointer
 * resting on it a moment, or focus coming into it by the keyboard; gone as
 * they leave, by Escape, or as a link in it is followed — then not again
 * till the pointer has left; kept while what it opened is open: a dialog in
 * it, a drag, what the caller holds it for), pinned (wide, the page beside
 * it). With no pointer that rests (a touch), only its toggle widens it. Pinned or not is
 * the caller's (a toggle at its head); peeking is its own. What is in it is
 * told whether it is wide (expanded) — and its CSS reads data-state.
 */

export type SideRailState = 'collapsed' | 'peek' | 'pinned';

export interface SideRailLabels {
  /** Its toggle's name (pressed: kept open). */
  pin: string;
}

export const SIDE_RAIL_LABELS: SideRailLabels = { pin: 'Keep open' };

export interface SideRailProps {
  /** What it is, for those who cannot see it ("Navigation"). */
  label: string;
  pinned: boolean;
  /** Its toggle pressed: pinned, or collapsed again. */
  onPin: (pinned: boolean) => void;
  labels?: SideRailLabels;
  /** Kept as it is, peeking, while something it opened is open (a menu over the page, outside it): collapsing once it is not, if the pointer is gone. */
  hold?: boolean;
  /** Beside it, its whole height, while given (what it opened from its side: a picker) — it kept wide meanwhile. */
  flyout?: ComponentChildren;
  /** What is in it: as is, or told whether it is wide now. */
  children?: ComponentChildren | ((expanded: boolean) => ComponentChildren);
}

/** How long the pointer rests on it before it peeks, and how long after it leaves before it collapses (ms). */
export const PEEK_MS = 150;
export const LEAVE_MS = 250;

export function SideRail({ label, pinned, onPin, labels = SIDE_RAIL_LABELS, hold: asked = false, flyout, children }: SideRailProps) {
  // Held while asked to, and while what it opened is beside it.
  const hold = asked || !!flyout;
  const [peek, setPeek] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  /** The last way in was the pointer (a click's focus is no reason to peek, nor to stay). */
  const pointed = useRef(false);
  /** Closed by a link followed: no peeking again till the pointer leaves (it is still on it). */
  const done = useRef(false);
  /** The pointer is on it. */
  const over = useRef(false);
  const held = useRef(hold);
  held.current = hold;
  const later = (run: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(run, ms);
  };
  // How the user last went about the page: a key, or the pointer.
  useEffect(() => {
    const key = () => {
      pointed.current = false;
    };
    const point = () => {
      pointed.current = true;
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', point, true);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', point, true);
    };
  }, []);

  const state: SideRailState = pinned ? 'pinned' : peek ? 'peek' : 'collapsed';
  // Gone as the pointer leaves — not while what it opened is open (held, a dialog in it, a drag: then once that is done), nor while the keyboard is in it.
  const leave = () =>
    later(function check() {
      const el = panel.current;
      if (held.current || el?.querySelector('[data-sorting], [role="dialog"]')) return later(check, LEAVE_MS);
      if (!pointed.current && el?.contains(document.activeElement)) return;
      setPeek(false);
    }, LEAVE_MS);
  // Let go (a menu closed) with the pointer gone: gone as it would have.
  useEffect(() => {
    if (!hold && peek && !over.current) leave();
  }, [hold]);
  // What it opened beside it (from its narrow state too): it wide with it.
  useEffect(() => {
    if (flyout && !pinned) {
      clearTimeout(timer.current);
      setPeek(true);
    }
  }, [!!flyout]);
  // Pinned (by the toggle, or by whoever keeps it): peeking no more — unpinned later, it is collapsed.
  useEffect(() => {
    if (!pinned) return;
    clearTimeout(timer.current);
    setPeek(false);
  }, [pinned]);

  return (
    <aside class="uk-rail" data-state={state} aria-label={label}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: it only follows where the pointer and focus are, and the links followed in it (a link's Enter is a click); what is in it is what is used. */}
      <div
        class="uk-rail-panel"
        ref={panel}
        onPointerEnter={() => {
          over.current = true;
          if (!pinned && !done.current) later(() => setPeek(true), PEEK_MS);
        }}
        onPointerLeave={() => {
          over.current = false;
          done.current = false;
          if (!pinned) leave();
        }}
        onClick={(e) => {
          // A link followed (a click, Enter): what it opens is shown — not a tool's click (its own), nor a drag's (swallowed); not peeking
          // as it was about to; not again till the pointer leaves, if it is on it.
          if (pinned || !(e.target as Element).closest('a[href]')) return;
          clearTimeout(timer.current);
          done.current = over.current;
          setPeek(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && peek) {
            clearTimeout(timer.current);
            setPeek(false);
          }
        }}
        onFocusIn={() => {
          if (!pinned && !pointed.current) {
            clearTimeout(timer.current);
            setPeek(true);
          }
        }}
        onFocusOut={(e) => {
          const to = e.relatedTarget as Node | null;
          if (!pinned && !held.current && !panel.current?.contains(to) && !over.current) {
            clearTimeout(timer.current);
            setPeek(false);
          }
        }}
      >
        <Tip content={() => labels.pin} beside>
          <button type="button" class="uk-rail-pin" aria-pressed={pinned} aria-label={labels.pin} onClick={() => onPin(!pinned)}>
            <Icon name={pinned ? 'pin-filled' : 'pin'} />
          </button>
        </Tip>
        <div class="uk-rail-body">{typeof children === 'function' ? children(state !== 'collapsed') : children}</div>
      </div>
      {flyout}
    </aside>
  );
}
