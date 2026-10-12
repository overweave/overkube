import type { JSX, Ref } from 'preact';
import { Icon } from '../display/Icon';

/** A button among tabs (a +): drawn as one, its icon only, named for those who cannot see it; its element given back (buttonRef: what a popover opens by). */
export function TabButton({
  icon,
  label,
  buttonRef,
  ...rest
}: { icon: string; label: string; buttonRef?: Ref<HTMLButtonElement> } & Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'icon' | 'label' | 'ref'>) {
  return (
    <button type="button" {...rest} ref={buttonRef} class="uk-tab" aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}
