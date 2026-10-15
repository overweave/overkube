import type { ComponentChildren } from 'preact';
import { Layer, usePlacedBy } from '../lib/layers';

/**
 * Something open over the page beside what opened it (its anchor): a layer
 * (lib/layers) — under it, or above where it does not fit, at its start or
 * end; or where its CSS puts it (placed: false — a side's flyout, drawn in
 * place). In the page, it goes with its anchor as the page scrolls. Escape
 * or a press outside closes it (the top one), and focus goes back to what
 * opened it; its first field (or button) takes focus as it opens.
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
  /** Placed by its anchor (the default); false: where its CSS puts it, drawn in place (a side's flyout) — closed, focused as ever. */
  placed?: boolean;
  /** At least as wide as the anchor (a select's list). */
  matchWidth?: boolean;
  label?: string;
  /** closing: fading out (usePresence). */
  state?: 'open' | 'closing';
  class?: string;
  children: ComponentChildren;
}) {
  const attach = usePlacedBy(anchor, { align, matchWidth });
  return (
    <Layer
      onLayer={placed ? attach : undefined}
      class={`uk-popover ${className ?? ''}`}
      role="dialog"
      label={label}
      anchor={anchor}
      onDismiss={onClose}
      closing={state === 'closing'}
      inPlace={!placed}
    >
      {children}
    </Layer>
  );
}
