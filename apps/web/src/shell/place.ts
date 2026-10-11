import { type ReadonlySignal, signal } from '@preact/signals';

/*
 * Where the page is: the kind shown, in the URL's hash — #/kind/<kind id>
 * (#/kind/apps/v1/Deployment) — so a reload or a link keeps it and Back
 * works. Nothing else yet: what leads from one kind to another is for
 * addons (a menu, tabs) to draw.
 */

export interface Place {
  /** The kind's id: v1/Pod, apps/v1/Deployment. */
  kind: string;
}

/** The kind shown when the hash names none. */
export const FIRST: Place = { kind: 'v1/Pod' };

/** The place a hash names: one that names none, or cannot be read (a broken %-escape), the first. */
export function parsePlace(hash: string): Place {
  const m = hash.replace(/^#/, '').match(/^\/kind\/(.+)$/);
  if (!m) return FIRST;
  try {
    return { kind: decodeURIComponent(m[1]) };
  } catch {
    return FIRST;
  }
}

/** A place's hash: its kind's id, each part escaped (its "/" kept). */
export function hashOf(place: Place): string {
  return `#/kind/${place.kind.split('/').map(encodeURIComponent).join('/')}`;
}

/** The place, following the window's hash (and going there). */
export function placeOf(win: Window = window): { place: ReadonlySignal<Place>; go(place: Place): void; close(): void } {
  const place = signal(parsePlace(win.location.hash));
  const follow = () => {
    place.value = parsePlace(win.location.hash);
  };
  win.addEventListener('hashchange', follow);
  return {
    place,
    go: (to) => {
      win.location.hash = hashOf(to);
    },
    close: () => win.removeEventListener('hashchange', follow),
  };
}
