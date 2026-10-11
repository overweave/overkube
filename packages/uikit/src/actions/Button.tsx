import type { JSX } from 'preact';
import { Icon } from '../display/Icon';

/*
 * A button: plain, primary (filled), dangerous, ghost (no frame), or a
 * field's look (it opens something to type in). With an icon and no words
 * it is square. Busy: a spinner where its icon is, and not to be pressed
 * meanwhile.
 */
export function Button({
  variant,
  size,
  icon,
  busy = false,
  children,
  disabled,
  ...rest
}: {
  variant?: 'primary' | 'danger' | 'ghost' | 'field';
  size?: 'sm';
  icon?: string;
  /** Doing what it was pressed for. */
  busy?: boolean;
} & JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const words = children !== undefined && children !== null && children !== false && children !== '';
  return (
    <button
      type="button"
      class="uk-button"
      data-variant={variant}
      data-size={size}
      data-square={!words && (icon || busy) ? '' : undefined}
      data-busy={busy ? '' : undefined}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      {...rest}
    >
      {busy ? <span class="uk-spinner" aria-hidden="true" /> : icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
