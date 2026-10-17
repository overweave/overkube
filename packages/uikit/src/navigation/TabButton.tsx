import type { JSX, Ref } from 'preact';
import { Icon } from '../display/Icon';
import { Tip } from '../overlays/Tip';

/** A button among tabs (a +): drawn as one, its icon only — or its label too (words: in a side rail, as its tabs are) — named for those who cannot see it (and in its tip); its element given back (buttonRef: what a popover opens by). */
export function TabButton({
  icon,
  label,
  buttonRef,
  words = false,
  ...rest
}: { icon: string; label: string; buttonRef?: Ref<HTMLButtonElement>; words?: boolean } & Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'icon' | 'label' | 'ref'>) {
  return (
    <Tip content={() => label}>
      <button type="button" {...rest} ref={buttonRef} class="uk-tab" aria-label={label}>
        <Icon name={icon} />
        {words && <span class="uk-tab-label">{label}</span>}
      </button>
    </Tip>
  );
}
