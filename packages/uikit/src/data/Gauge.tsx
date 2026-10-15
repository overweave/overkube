/*
 * How much of something is taken, on a line of its own (a cluster's CPU
 * requested of what is allocatable): its name and how much in words on
 * one line, its bar under them. Nearly all of it (over 85%): the bar a
 * warning; more than all, an error (its value, to those who cannot see it,
 * held to its range; how much in fact, in its words).
 */
export function Gauge({ label, value, of, said }: { label: string; value: number; of: number; said: string }) {
  const part = of > 0 ? value / of : 0;
  const level = part > 1 ? 'error' : part > 0.85 ? 'warn' : undefined;
  return (
    <div class="uk-gauge">
      <span>{label}</span>
      <span>{said}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: a styled track; a native meter is not drawn alike in every engine */}
      <span
        class="uk-meter-track"
        data-level={level}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={of}
        aria-valuenow={Math.min(Math.max(value, 0), of)}
        aria-valuetext={said}
      >
        <i style={{ width: `${Math.min(100, Math.round(part * 100))}%` }} />
      </span>
    </div>
  );
}
