import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { Button } from '../actions/Button';
import { uid } from '../lib/focus';
import { Layer, useLeave } from '../lib/layers';

/*
 * A dialog over the page (a modal layer: over everything, the page behind
 * it inert, not scrolled): in the middle, high up; or a panel from the left
 * or the right edge, all its height; a sheet from the bottom; or all the
 * window. Its place changed while open, it is drawn there at once. It comes
 * in from where it is, and goes back there before it is gone. Closed by
 * Escape (the top one only, of layers one over another), a click beside it
 * (one begun beside it: not a press inside let go outside), or its button.
 * Focus goes into it (its first field, else itself), stays in it (Tab goes
 * round), and goes back where it was as it goes. Its title cut short (a
 * long name): the whole of it in its tip.
 */

export type ModalPlacement = 'center' | 'left' | 'right' | 'bottom' | 'full';

export interface ModalProps {
  title: ComponentChildren;
  /** Beside its title (a little, quiet: a tool). What is done to what it shows goes in its footer. */
  actions?: ComponentChildren;
  /** Under its header, staying while it scrolls: what it shows chosen (a TabBar). */
  tabs?: ComponentChildren;
  /** Under all of it, staying while it scrolls: what can be done (buttons, at its end) — given how to close it as it goes (its way out, then onClose). */
  footer?: ComponentChildren | ((close: () => void) => ComponentChildren);
  onClose: () => void;
  /** Its close button's name, for those who cannot see it. */
  closeLabel?: string;
  /** Where it comes from: the middle (default), the left or the right edge, the bottom; or all the window. */
  placement?: ModalPlacement;
  children: ComponentChildren;
}

/** How long it takes to go (the CSS's). */
export const MODAL_OUT_MS = 180;

export function Modal({ title, actions, tabs, footer, onClose, closeLabel = 'Close', placement = 'center', children }: ModalProps) {
  const titleId = useMemo(() => uid('uk-modal-title'), []);
  const { closing, leave } = useLeave(onClose, MODAL_OUT_MS);
  // A click beside it closes it only if it began there (a press inside let go outside is no click beside it).
  const pressedBeside = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // Its tip said as it is cut: drawn anew, or its width changed (the window's, the panel's place).
  useLayoutEffect(() => {
    const h = heading.current;
    if (!h) return;
    const tip = () => (h.scrollWidth > h.clientWidth ? h.setAttribute('title', h.textContent ?? '') : h.removeAttribute('title'));
    tip();
    const watch = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(tip);
    watch?.observe(h);
    return () => watch?.disconnect();
  });
  return (
    <Layer modal focus="field" class="uk-modal" role="dialog" labelledBy={titleId} onDismiss={leave} closing={closing}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: a click beside the panel closes it; Escape does from the keyboard (the stack's). */}
      <div
        class="uk-modal-frame"
        data-placement={placement}
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
            <h2 id={titleId} ref={heading}>
              {title}
            </h2>
            {actions}
            <Button variant="ghost" icon="x" aria-label={closeLabel} onClick={leave} />
          </header>
          {tabs}
          <div class="uk-modal-body">{children}</div>
          {footer !== undefined && footer !== null && footer !== false && <footer class="uk-modal-footer">{typeof footer === 'function' ? footer(leave) : footer}</footer>}
        </div>
      </div>
    </Layer>
  );
}
