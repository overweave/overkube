/*
 * A colour chosen: one of a few, or any (the browser's own picker, last);
 * the one chosen ringed.
 */

export function Swatches({ colors, value, label, onChange }: { colors: readonly string[]; value: string; label: string; onChange: (color: string) => void }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggles (ARIA), not a form's fieldset.
    <span class="uk-swatches" role="group" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          class="uk-swatch"
          style={{ background: c }}
          aria-pressed={c.toLowerCase() === value.toLowerCase()}
          aria-label={c}
          onClick={() => onChange(c)}
        />
      ))}
      <input type="color" value={value} aria-label={label} onInput={(e) => onChange((e.target as HTMLInputElement).value)} />
    </span>
  );
}
