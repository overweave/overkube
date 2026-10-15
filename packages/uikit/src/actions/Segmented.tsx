import { Icon } from '../display/Icon';
import { Tip } from '../overlays/Tip';

/*
 * One of a few ways, side by side (a view's layout): each a button, the one
 * chosen pressed; icons alone (each named, for those who cannot see it, and
 * under the pointer), or words. Small and quiet, for a header.
 */

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
  icon?: string;
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggles (ARIA), not a form's fieldset.
    <div class="uk-segmented" role="group" aria-label={label}>
      {options.map((o) => {
        const option = (
          <button
            key={o.value}
            type="button"
            class="uk-segmented-option"
            aria-pressed={o.value === value}
            aria-label={o.icon ? o.label : undefined}
            onClick={() => o.value !== value && onChange(o.value)}
          >
            {o.icon ? <Icon name={o.icon} /> : o.label}
          </button>
        );
        // An icon's name in its tip too.
        return o.icon ? (
          <Tip key={o.value} content={() => o.label}>
            {option}
          </Tip>
        ) : (
          option
        );
      })}
    </div>
  );
}
