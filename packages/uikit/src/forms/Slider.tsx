import { useId } from 'preact/hooks';

/*
 * A number chosen by dragging (a knob): its track in the accent (a hue's:
 * the colours round), what it is now beside it, its unit after.
 */

export function Slider({
  value,
  min,
  max,
  step = 1,
  unit = '',
  hue = false,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** A hue's (0–360): the track the colours round. */
  hue?: boolean;
  label: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <span class="uk-slider" data-hue={hue ? '' : undefined}>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-label={label} onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))} />
      <output for={id}>
        {value}
        {unit}
      </output>
    </span>
  );
}
