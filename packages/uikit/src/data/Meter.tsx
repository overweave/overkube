/*
 * How much of something is taken (a node's CPU requested of what it has): a
 * field — its name over a bar filled as far, what that is in words under it.
 * Nearly all of it (over 85%): the bar a warning; more than all, an error.
 */
export function Meter({ label, value, of, children }: { label: string; value: number; of: number; children: string }) {
  const part = of > 0 ? value / of : 0;
  const level = part > 1 ? 'error' : part > 0.85 ? 'warn' : undefined;
  return (
    <div class="uk-field uk-meter">
      <dt>{label}</dt>
      <dd>
        {/* biome-ignore lint/a11y/useSemanticElements: a styled track; a native meter is not drawn alike in every engine */}
        <span class="uk-meter-track" data-level={level} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={of} aria-valuenow={value} aria-valuetext={children}>
          <i style={{ width: `${Math.min(100, Math.round(part * 100))}%` }} />
        </span>
        <span class="uk-meter-said">{children}</span>
      </dd>
    </div>
  );
}
