import type { PageProps, PageSpec } from '@overkube/sdk';
import type { Definition } from '@overweave/core';
import { inOrder } from '@overweave/ui';

/*
 * Which Page takes a path: the most specific, part by part — a fixed part
 * over a :parameter over a * — and between equals, the one whose path is
 * said by the stronger layer (an addon's over the core's, the user's over
 * all), then by order, then name. Its parameters read back (decoded); a
 * part that cannot be decoded takes nothing.
 */

export interface Matched {
  page: Definition<PageSpec>;
  /** Its props, but the kind (the page finds it). */
  props: Omit<PageProps, 'kind'>;
}

interface Pattern {
  parts: string[];
  rest: boolean;
}

function patternOf(path: string): Pattern {
  const parts = path.split('/').filter(Boolean);
  const rest = parts.at(-1) === '*';
  return { parts: rest ? parts.slice(0, -1) : parts, rest };
}

/** How specific a pattern is, part by part: fixed 3, :parameter 2, none after 0, * -1 (a path that ends there is the exact one's, not the rest's). */
function specificity(p: Pattern): number[] {
  return [...p.parts.map((x) => (x.startsWith(':') ? 2 : 3)), ...(p.rest ? [-1] : [])];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (b[i] ?? 0) - (a[i] ?? 0);
  return 0;
}

/** The priority of whoever says a page's path. */
const layerOf = (page: Definition<PageSpec>) => page.provenanceOf(['path'])?.priority ?? 0;

function decode(part: string): string | undefined {
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
}

/** A path's parameters by a pattern, or undefined: it does not take it. */
export function matchPath(pattern: string, path: string): Omit<PageProps, 'path' | 'kind'> | undefined {
  const p = patternOf(pattern);
  const parts = path.split('?')[0].split('/').filter(Boolean);
  if (parts.length < p.parts.length || (!p.rest && parts.length !== p.parts.length)) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.parts.length; i++) {
    const want = p.parts[i];
    const got = decode(parts[i]);
    if (got === undefined) return undefined;
    if (want.startsWith(':')) params[want.slice(1)] = got;
    else if (want !== got) return undefined;
  }
  return { params, rest: p.rest ? `/${parts.slice(p.parts.length).join('/')}` : '' };
}

/** The Page that takes a path, of these. */
export function matchPage(pages: readonly Definition<PageSpec>[], path: string): Matched | undefined {
  const ranked = inOrder(pages).sort((a, b) => compare(specificity(patternOf(a.spec.path)), specificity(patternOf(b.spec.path))) || layerOf(b) - layerOf(a));
  for (const page of ranked) {
    const got = matchPath(page.spec.path, path);
    if (got) return { page, props: { ...got, path } };
  }
  return undefined;
}
