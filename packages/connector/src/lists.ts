import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { ApiError, collectionPath, type Http, METADATA_LIST, pagesOf } from './http.ts';

/*
 * A collection listed once — no watch, nothing kept: what a search over
 * every kind asks (a feed of each would hold the stream's watches). Its
 * pages read in turn (the API server's limit and continue), so many at
 * most (the rest not read: truncated); only their metadata if asked (the
 * server's PartialObjectMetadataList) — their managedFields dropped as they
 * come. A continue gone stale (410) begins it again, once. Or how many
 * there are, asked as cheaply as can be: a page of one, and how many past
 * it the API server estimates (remainingItemCount: about so many, as of
 * then; none said: at least these).
 */

export interface ListOnce {
  /** Of one namespace (none: every one). */
  namespace?: string;
  labelSelector?: string;
  /** Their metadata only. */
  projection?: 'metadata';
  /** How many a page asks for (default 500). */
  pageSize?: number;
  /** How many are read at most (default: all of them) — kept to here, whatever a server sends. */
  max?: number;
  signal?: AbortSignal;
}

export interface Listed {
  items: KubeObject[];
  /** More there than read (max reached). */
  truncated: boolean;
}

/** How many: counted (exact), about so many (a server's estimate), or at least so many (more past them, how many not said). */
export interface Counted {
  count: number;
  exact: boolean;
  atLeast?: true;
}

/** How many of a kind there are (of a namespace; none: every one): a page of one, and how many past it as the API server estimates it (an ApiError as it says). */
export async function countOnce(
  http: Http,
  kind: Pick<KindInfo, 'group' | 'version' | 'plural' | 'namespaced'>,
  options: Pick<ListOnce, 'namespace' | 'signal'> = {},
): Promise<Counted> {
  const path = collectionPath(kind, kind.namespaced ? options.namespace : undefined);
  for await (const page of pagesOf(http, path, {}, { accept: METADATA_LIST, ...(options.signal ? { signal: options.signal } : {}), limit: () => 1 })) {
    const here = page.items.length;
    // All of them on it: counted. Else the server's estimate of those past it (not to be relied on as exact) — none said: at least these.
    if (!page.continue) return { count: here, exact: true };
    return page.remaining === undefined ? { count: here, exact: false, atLeast: true } : { count: here + page.remaining, exact: false };
  }
  return { count: 0, exact: true };
}

/** A kind's objects listed once (an ApiError as the API server says: 403, 404…). */
export async function listOnce(http: Http, kind: Pick<KindInfo, 'group' | 'version' | 'plural' | 'namespaced'>, options: ListOnce = {}): Promise<Listed> {
  const { namespace, labelSelector, projection, pageSize = 500, signal } = options;
  const max = Math.max(0, Math.floor(options.max ?? Number.POSITIVE_INFINITY));
  if (max === 0) return { items: [], truncated: true };
  const path = collectionPath(kind, kind.namespaced ? namespace : undefined);
  const accept = projection === 'metadata' ? METADATA_LIST : undefined;
  for (let attempt = 1; ; attempt++) {
    const items: KubeObject[] = [];
    try {
      for await (const page of pagesOf(
        http,
        path,
        { labelSelector },
        { ...(accept ? { accept } : {}), ...(signal ? { signal } : {}), limit: (read) => Math.max(1, Math.min(pageSize, max - read)) },
      )) {
        // So many at most, whatever a server sends (one that does not keep to limit: those past them not kept).
        for (const o of page.items) {
          if (items.length >= max) return { items, truncated: true };
          items.push(o);
        }
        if (items.length >= max) return { items, truncated: page.continue !== undefined };
      }
      return { items, truncated: false };
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 410) || attempt >= 2) throw err;
    }
  }
}
