/*
 * Where something will be, while it is not yet: a line (text) or a block
 * (a panel, a section) — quiet, shimmering unless motion is reduced. Hidden
 * from those who cannot see it: what waits says so itself (its own words).
 */

export interface SkeletonProps {
  shape?: 'line' | 'block';
  /** Its width (a CSS length: '60%', '120px'); a line's default: all of it. */
  width?: string;
  /** Its height (a CSS length); a block's default: 64px. */
  height?: string;
}

export function Skeleton({ shape = 'line', width, height }: SkeletonProps) {
  return <span class="uk-skeleton" data-shape={shape} aria-hidden="true" style={{ ...(width ? { width } : {}), ...(height ? { height } : {}) }} />;
}
