import type { ComponentChildren, JSX } from 'preact';
import { tipped, useTip } from '../overlays/Tip';

/*
 * An on/off switch (role switch): a click, Space or Enter turns it. Its
 * label says what it turns (the same either way: the switch says on or
 * off). Disabled, it does not turn. Its title, its tip. What else it is
 * given (an id, aria-describedby) is the button's.
 */

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ComponentChildren;
} & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'onClick' | 'role' | 'label' | 'checked'>;

export function Switch({ checked, onChange, label, disabled, title, ...rest }: SwitchProps) {
  const tip = useTip(typeof title === 'string' && title ? () => title : undefined);
  return (
    <>
      <button {...tipped(rest, tip.on)} type="button" class="uk-switch" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>
        <span class="uk-switch-track" aria-hidden="true">
          <span class="uk-switch-thumb" />
        </span>
        <span class="uk-switch-label">{label}</span>
      </button>
      {tip.box}
    </>
  );
}
