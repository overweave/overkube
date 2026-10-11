import type { PatchBody, StatusAnswer } from '@overkube/gateway/protocol';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { type ReadonlySignal, signal } from '@preact/signals';

/*
 * The page's way to the cluster: the gateway (@overkube/gateway), under the
 * path its host serves it at, with whatever the host signs the page in with
 * (a cookie the browser sends, headers given here). Every answer is JSON;
 * whatever went wrong — the gateway's own error, a Kubernetes Status,
 * nothing answering, an answer that is not JSON — is an ApiError.
 *
 * A request the host turns away (401, or 403 without a Kubernetes Status:
 * the page is signed out, or may not use the cluster) ends the session for
 * the page: it is said once (session: expired), and nothing more is asked
 * until the page is loaded again, after the user signs in.
 */

/** Where overkube's own server serves the gateway. */
export const BASE = '/kube';

export interface ApiOptions {
  /** Where the gateway is: BASE with overkube's own server, the host's path elsewhere. */
  base?: string;
  fetch?: typeof fetch;
  /** Headers every request carries (a host's CSRF token, say). */
  headers?: () => Record<string, string>;
}

/** A Kubernetes Status: what the API server says went wrong (or right, for a delete). */
export interface Status {
  kind: 'Status';
  code?: number;
  reason?: string;
  message?: string;
  details?: { retryAfterSeconds?: number; [key: string]: unknown };
}

/** Why a request failed: its HTTP status, a code (the gateway's, or the Status's reason), what was said. */
export class ApiError extends Error {
  /** HTTP status; 0 when nothing (whole) answered. */
  readonly status: number;
  /**
   * The gateway's code (kube_down, bad_path, …), a Status's reason
   * (NotFound, Forbidden, …), "network" (nothing, or half an answer),
   * "bad_json" (an answer that is not JSON), "unauthorized" (the session is over).
   */
  readonly code: string;
  /** The Kubernetes Status, when the API server sent one. */
  readonly kubeStatus?: Status;
  /** For bad_watch: the watch at fault (its id on the stream), when one is. */
  readonly watch?: string;

  constructor(status: number, code: string, message: string, kubeStatus?: Status, watch?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.kubeStatus = kubeStatus;
    if (watch) this.watch = watch;
  }

  /** Whether it may pass by itself: nothing answering, the cluster down or busy, a timeout. */
  get passing(): boolean {
    return this.code !== 'unauthorized' && this.code !== 'bad_json' && (this.status === 0 || this.status === 429 || this.status >= 500);
  }
}

/** A change through /patch (the gateway sends it as the PATCH it is). */
export type PatchRequest = PatchBody;

/** One watch of a /watch stream: its id, where it starts, its collection (with selectors). */
export interface WatchSpec {
  id: string;
  resourceVersion: string;
  path: string;
}

export interface ListQuery {
  labelSelector?: string;
  fieldSelector?: string;
}

/** The objects of a collection, all its pages, and the resourceVersion to watch it from. */
export interface List<T> {
  items: T[];
  resourceVersion: string;
}

export type Session = 'ok' | 'expired';

/** A page's size when listing: big enough for few round trips, small enough for the API server. */
const PAGE = 500;
/** How many times a list is begun again when its pages expire (410) on the way. */
const LIST_ATTEMPTS = 3;

type RequestInit2 = { query?: Record<string, string | undefined>; body?: unknown; signal?: AbortSignal; accept?: string };

export class Api {
  readonly base: string;
  private readonly fetcher: typeof fetch;
  private readonly headers: () => Record<string, string>;
  private readonly sessionSignal = signal<Session>('ok');
  private ended: ApiError | null = null;

  constructor(options: ApiOptions = {}) {
    this.base = options.base ?? BASE;
    this.fetcher = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.headers = options.headers ?? (() => ({}));
  }

  /** Whether the host lets the page ask; once expired, it stays so until the page is loaded again. */
  get session(): ReadonlySignal<Session> {
    return this.sessionSignal;
  }

  /** A request to the gateway; its JSON answer, or an ApiError. */
  async request<T>(method: string, path: string, init: RequestInit2 = {}): Promise<T> {
    const res = await this.send(method, path, init);
    if (!res.ok) throw await this.failure(res);
    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      if (init.signal?.aborted) throw err;
      throw new ApiError(0, 'network', `the answer broke off: ${(err as Error).message}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(res.status, 'bad_json', `the answer is not JSON: ${text.slice(0, 100)}`);
    }
  }

  get<T>(path: string, query?: Record<string, string | undefined>, signal?: AbortSignal): Promise<T> {
    return this.request<T>('GET', path, { query, signal });
  }

  /**
   * Every object of a collection, page by page, all of one snapshot; the
   * resourceVersion is the list's, to watch from. When the snapshot expires
   * on the way (410 on a later page), the list is begun again: pages of two
   * snapshots are never put together.
   */
  async list<T extends KubeObject>(path: string, query: ListQuery = {}, signal?: AbortSignal): Promise<List<T>> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.pages<T>(path, query, signal);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 410) || attempt >= LIST_ATTEMPTS) throw err;
      }
    }
  }

  /**
   * Delete an object; what the API server says (the object being deleted, or
   * a Status). With a uid, only that object: one made anew under the same
   * name meanwhile is left alone (409).
   */
  remove(
    path: string,
    options: { uid?: string; propagationPolicy?: 'Foreground' | 'Background' | 'Orphan'; gracePeriodSeconds?: number } = {},
    signal?: AbortSignal,
  ): Promise<KubeObject | Status> {
    const { uid, gracePeriodSeconds, ...rest } = options;
    const query = { ...rest, ...(gracePeriodSeconds === undefined ? {} : { gracePeriodSeconds: String(gracePeriodSeconds) }) };
    const body = uid ? { apiVersion: 'v1', kind: 'DeleteOptions', preconditions: { uid } } : undefined;
    return this.request('DELETE', path, { query, body, signal });
  }

  patch<T extends KubeObject>(change: PatchRequest, signal?: AbortSignal): Promise<T> {
    return this.request<T>('POST', '/patch', { body: change, signal });
  }

  /** What /status says: the gateway's version, the cluster reachable or not. */
  status(signal?: AbortSignal): Promise<StatusAnswer> {
    return this.get<StatusAnswer>('/status', undefined, signal);
  }

  /** Open a /watch stream; its answer, to be read line by line (stream.ts). */
  async watch(watches: WatchSpec[], signal: AbortSignal): Promise<Response> {
    const query = new URLSearchParams();
    for (const w of watches) query.append('w', `${w.id}:${w.resourceVersion}:${w.path}`);
    const res = await this.send('GET', `/watch?${query}`, { signal });
    if (!res.ok) throw await this.failure(res);
    return res;
  }

  private async pages<T extends KubeObject>(path: string, query: ListQuery, signal?: AbortSignal): Promise<List<T>> {
    const items: T[] = [];
    let next: string | undefined;
    for (;;) {
      const page = await this.get<{ items?: T[]; metadata?: { resourceVersion?: string; continue?: string } }>(path, { ...query, limit: String(PAGE), continue: next }, signal);
      items.push(...(page.items ?? []));
      next = page.metadata?.continue || undefined;
      if (!next) return { items, resourceVersion: page.metadata?.resourceVersion ?? '' };
    }
  }

  private async send(method: string, path: string, init: RequestInit2): Promise<Response> {
    if (this.ended) throw this.ended;
    let url = `${this.base}${path}`;
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== '') query.set(k, v);
    if ([...query].length) url += `${path.includes('?') ? '&' : '?'}${query}`;
    // x-overkube: the gateway's own header, which a page of another site cannot send (it takes no change without it).
    const headers: Record<string, string> = { accept: init.accept ?? 'application/json', 'x-overkube': '1', ...this.headers() };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    try {
      return await this.fetcher(url, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: init.signal });
    } catch (err) {
      if (init.signal?.aborted) throw err;
      throw new ApiError(0, 'network', `the gateway did not answer: ${(err as Error).message}`);
    }
  }

  /** An answer other than 2xx as an ApiError; one that says the session is over ends it. */
  private async failure(res: Response): Promise<ApiError> {
    const error = await failure(res);
    if (error.code === 'unauthorized') {
      this.ended = error;
      this.sessionSignal.value = 'expired';
    }
    return error;
  }
}

/** An answer other than 2xx as an ApiError: the gateway's { error }, a Status, or whatever came. */
async function failure(res: Response): Promise<ApiError> {
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    // An answer broken off is the network's: never taken for a host's refusal (a 403 with no Status left in it).
    throw new ApiError(0, 'network', `the answer (${res.status}) broke off: ${(err as Error).message}`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  const b = body as { error?: { code?: string; message?: string; w?: string }; kind?: string; reason?: string; message?: string } | undefined;
  if (b?.error?.code) return new ApiError(res.status, b.error.code, b.error.message ?? b.error.code, undefined, b.error.w);
  if (b?.kind === 'Status') return new ApiError(res.status, b.reason ?? `http_${res.status}`, b.message ?? `answered ${res.status}`, body as Status);
  // Not the gateway's, not the API server's: the host's own (its sign-in).
  if (res.status === 401 || res.status === 403)
    return new ApiError(res.status, 'unauthorized', 'the page was turned away: signed out (sign in again), or not allowed to use the cluster');
  return new ApiError(res.status, `http_${res.status}`, text.slice(0, 500) || res.statusText || `answered ${res.status}`);
}

/*
 * Names go into paths as they are: the API's names are path-safe already
 * (some hold a ":", system:node), and the gateway refuses %-encoding.
 */

/** Where a kind's objects are: /api/v1/pods, /apis/apps/v1/namespaces/media/deployments. */
export function collectionPath(kind: Pick<KindInfo, 'group' | 'version' | 'plural'>, namespace?: string): string {
  const root = kind.group ? `/apis/${kind.group}/${kind.version}` : `/api/${kind.version}`;
  return namespace ? `${root}/namespaces/${namespace}/${kind.plural}` : `${root}/${kind.plural}`;
}

/** Where one object is: /apis/apps/v1/namespaces/media/deployments/jellyfin. */
export function objectPath(kind: Pick<KindInfo, 'group' | 'version' | 'plural'>, name: string, namespace?: string): string {
  return `${collectionPath(kind, namespace)}/${name}`;
}
