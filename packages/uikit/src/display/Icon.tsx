import { type IconData, TABLER } from './icons.generated';

/*
 * Icons by name: the kit's own set (Tabler's, by scripts/icons.mjs — only
 * those it names reach the plugin), and those an extension registers. A
 * name no icon has draws a cube, and says so once (a typo is seen). Drawn
 * in the colour of the text around them, hidden from a reader unless given
 * a title.
 */

export type { IconData } from './icons.generated';

/** Kubernetes' wheel: not one of Tabler's (it has no logos of this kind). */
const KUBE: IconData = { d: ['M12 3l7 3.5 1.8 7.6-4.8 6H8l-4.8-6L5 6.5zM12 8v8M8.5 10l7 4M15.5 10l-7 4'] };

const registry = new Map<string, IconData>(Object.entries({ ...TABLER, kube: KUBE }));

/** The kit's own icons' names. */
export const ICONS: readonly string[] = [...registry.keys()];

/** Icons of an extension's, by name: paths on a 24×24 grid (one path: a string), stroked unless filled. A name given again is the later one's. */
export function registerIcons(icons: Record<string, IconData | string>): void {
  for (const [name, icon] of Object.entries(icons)) registry.set(name, typeof icon === 'string' ? { d: [icon] } : icon);
}

const warned = new Set<string>();

export function Icon({ name, title }: { name: string; title?: string }) {
  let icon = registry.get(name);
  if (!icon) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`uikit: no icon "${name}" — a cube is drawn instead`);
    }
    icon = registry.get('cube') as IconData;
  }
  const paths = icon.d.map((d) => <path key={d} d={d} />);
  return title ? (
    <svg class="uk-icon" viewBox="0 0 24 24" role="img" data-filled={icon.filled ? '' : undefined}>
      <title>{title}</title>
      {paths}
    </svg>
  ) : (
    <svg class="uk-icon" viewBox="0 0 24 24" aria-hidden="true" data-filled={icon.filled ? '' : undefined}>
      {paths}
    </svg>
  );
}
