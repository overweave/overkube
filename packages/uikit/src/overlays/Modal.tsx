import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button } from '../actions/Button';
import { activeElement, focusable, trapTab, uid } from '../lib/focus';

/*
 * A dialog over the page (a native one: on top of everything, the page
 * behind it inert): in the middle, high up; or a panel from the left or the
 * right edge, all its height; or a sheet from the bottom. Closed by Escape (the top one
 * only, of dialogs one over another), a click beside it (one begun beside
 * it: not a press inside let go outside), or its button; it slides or
 * fades out, then goes. Focus goes into it (its first field, else itself),
 * stays in it (Tab goes round), and goes back where it was once it is gone.
 */

export type ModalPlacement = 'center' | 'left' | 'right' | 'bottom';

export interface ModalProps {
  title: ComponentChildren;
  /** Beside its title (a little, quiet: a tool). What is done to what it shows goes in its footer. */
  actions?: ComponentChildren;
  /** Under all of it, staying while it scrolls: what can be done (buttons, at its end). */
  footer?: ComponentChildren;
  onClose: () => void;
  /** Its close button's name, for those who cannot see it. */
  closeLabel?: string;
  /** Where it comes from: the middle (default), the left or the right edge, the bottom. */
  placement?: ModalPlacement;
  children: ComponentChildren;
}

/** How long it takes to go (the CSS's). */
export const MODAL_OUT_MS = 180;

export function Modal({ title, actions, footer, onClose, closeLabel = 'Close', placement = 'center', children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useMemo(() => uid('uk-modal-title'), []);
  const close = useRef(onClose);
  close.current = onClose;
  const [closing, setClosing] = useState(false);
  const leaving = useRef(false);
  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    setClosing(true);
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => close.current(), still ? 0 : MODAL_OUT_MS);
  };
  // A click beside it closes it only if it began there (a press inside let go outside is no click beside it).
  const pressedBeside = useRef(false);

  useLayoutEffect(() => {
    const before = activeElement() as HTMLElement | null;
    const el = dialog.current;
    if (el && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    // Its first field, else the dialog itself (not its close button).
    const first = el && (focusable(el).find((f) => f.tagName === 'INPUT' || f.tagName === 'TEXTAREA' || f.tagName === 'SELECT') ?? el);
    first?.focus();
    return () => before?.focus?.();
  }, []);

  return (
    <dialog
      class="uk-modal"
      ref={dialog}
      aria-labelledby={titleId}
      data-placement={placement}
      data-state={closing ? 'closing' : 'open'}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        leave();
      }}
      onKeyDown={(e) => {
        const root = e.currentTarget as HTMLElement;
        if (e.key === 'Escape') {
          // This one only (the top one: focus is in it), not those under it.
          e.preventDefault();
          e.stopPropagation();
          leave();
        } else trapTab(root, e);
      }}
      onPointerDown={(e) => {
        pressedBeside.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBeside.current) leave();
        pressedBeside.current = false;
      }}
    >
      <div class="uk-modal-panel">
        {placement === 'bottom' && <span class="uk-modal-grip" aria-hidden="true" />}
        <header>
          <h2 id={titleId}>{title}</h2>
          {actions}
          <Button variant="ghost" icon="x" aria-label={closeLabel} onClick={leave} />
        </header>
        <div class="uk-modal-body">{children}</div>
        {footer !== undefined && footer !== null && footer !== false && <footer class="uk-modal-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
