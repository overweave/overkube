import type { JSX, Ref } from 'preact';
import { Icon } from '../display/Icon';
import { Tip } from '../overlays/Tip';

/** A button among tabs (a +): drawn as one, its icon only, named for those who cannot see it (and in its tip); its element given back (buttonRef: what a popover opens by). */
export function TabButton({
  icon,
  label,
  buttonRef,
  ...rest
}: { icon: string; label: string; buttonRef?: Ref<HTMLButtonElement> } & Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'icon' | 'label' | 'ref'>) {
  return (
    <Tip content={() => label}>
      <button type="button" {...rest} ref={buttonRef} class="uk-tab" aria-label={label}>
        <Icon name={icon} />
      </button>
    </Tip>
  );
}
