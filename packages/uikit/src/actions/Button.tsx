import type { JSX, Ref } from 'preact';
import { Icon } from '../display/Icon';
import { tipped, useTip } from '../overlays/Tip';

/*
 * A button: plain, primary (filled), dangerous, ghost (no frame), or a
 * field's look (it opens something to type in). With an icon and no words
 * it is square. Busy: a spinner where its icon is, and not to be pressed
 * meanwhile. Its element given back (buttonRef): what a popover opens by.
 * Its title, its tip — with no words (an icon only) and no name given, its
 * name too (those who cannot see it hear it).
 */
export function Button({
  variant,
  size,
  icon,
  busy = false,
  children,
  disabled,
  buttonRef,
  ...rest
}: {
  variant?: 'primary' | 'danger' | 'ghost' | 'field';
  size?: 'sm';
  icon?: string;
  /** Doing what it was pressed for. */
  busy?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
} & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'ref'>) {
  const words = children !== undefined && children !== null && children !== false && children !== '';
  const { title, ...own } = rest;
  // An icon only, no name given: its title its name.
  const named = !words && typeof title === 'string' && title && own['aria-label'] === undefined ? { 'aria-label': title } : {};
  const tip = useTip(typeof title === 'string' && title ? () => title : undefined);
  return (
    <>
      <button
        type="button"
        class="uk-button"
        data-variant={variant}
        data-size={size}
        data-square={!words && (icon || busy) ? '' : undefined}
        data-busy={busy ? '' : undefined}
        aria-busy={busy || undefined}
        disabled={disabled || busy}
        {...tipped({ ...own, ...named, ref: buttonRef }, tip.on)}
      >
        {busy ? <span class="uk-spinner" aria-hidden="true" /> : icon && <Icon name={icon} />}
        {children}
      </button>
      {tip.box}
    </>
  );
}
