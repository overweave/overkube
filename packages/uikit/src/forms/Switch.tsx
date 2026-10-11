import type { ComponentChildren, JSX } from 'preact';

/*
 * An on/off switch (role switch): a click, Space or Enter turns it. Its
 * label says what it turns (the same either way: the switch says on or
 * off). Disabled, it does not turn. What else it is given (an id, a title,
 * aria-describedby) is the button's.
 */

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ComponentChildren;
} & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'onClick' | 'role' | 'label' | 'checked'>;

export function Switch({ checked, onChange, label, disabled, ...rest }: SwitchProps) {
  return (
    <button {...rest} type="button" class="uk-switch" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>
      <span class="uk-switch-track" aria-hidden="true">
        <span class="uk-switch-thumb" />
      </span>
      <span class="uk-switch-label">{label}</span>
    </button>
  );
}
