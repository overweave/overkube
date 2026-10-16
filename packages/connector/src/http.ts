import type { PatchBody, StatusAnswer, StreamChange } from '@overkube/gateway/protocol';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { type ReadonlySignal, signal } from '@preact/signals';

/*
 * The page's way to the gateway (@overkube/gateway) over HTTP, under the
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

export interface HttpOptions {
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
   * The gateway's code (kube_down, bad_stream, …), a Status's reason
   * (NotFound, Forbidden, Expired, …), "network" (nothing, or half an
   * answer), "bad_json" (an answer that is not JSON), "unauthorized" (the
   * session is over).
   */
  readonly code: string;
  /** The Kubernetes Status, when the API server sent one. */
  readonly kubeStatus?: Status;
  /** For bad_stream: the subscription at fault (its id on the stream), when one is. */
  readonly subscription?: string;

  constructor(status: number, code: string, message: string, kubeStatus?: Status, subscription?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.kubeStatus = kubeStatus;
    if (subscription) this.subscription = subscription;
  }

  /** Whether it may pass by itself: nothing answering, the cluster down or busy, a timeout. */
  get passing(): boolean {
    return this.code !== 'unauthorized' && this.code !== 'bad_json' && (this.status === 0 || this.status === 429 || this.status >= 500);
  }
}

export type Session = 'ok' | 'expired';

export type Query = Record<string, string | undefined>;

interface Init {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  accept?: string;
}

export class Http {
  readonly base: string;
  private readonly fetcher: typeof fetch;
  private readonly headers: () => Record<string, string>;
  private readonly sessionSignal = signal<Session>('ok');
  private ended: ApiError | null = null;

  constructor(options: HttpOptions = {}) {
    this.base = options.base ?? BASE;
    this.fetcher = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.headers = options.headers ?? (() => ({}));
  }

  /** Whether the host lets the page ask; once expired, it stays so until the page is loaded again. */
  get session(): ReadonlySignal<Session> {
    return this.sessionSignal;
  }

  /** A request to the gateway; its JSON answer (none for a 204), or an ApiError. */
  async request<T>(method: string, path: string, init: Init = {}): Promise<T> {
    const res = await this.answer(method, path, init);
    if (res.status === 204) return undefined as T;
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

  get<T>(path: string, query?: Query, signal?: AbortSignal, accept?: string): Promise<T> {
    return this.request<T>('GET', path, { query, signal, accept });
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

  patch<T extends KubeObject>(change: PatchBody, signal?: AbortSignal): Promise<T> {
    return this.request<T>('POST', '/patch', { body: change, signal });
  }

  /** What /status says: the gateway's version, the cluster reachable or not. */
  status(signal?: AbortSignal): Promise<StatusAnswer> {
    return this.get<StatusAnswer>('/status', undefined, signal);
  }

  /** Open a /stream; its answer, to be read line by line (stream.ts). */
  openStream(signal: AbortSignal): Promise<Response> {
    return this.answer('GET', '/stream', { signal, accept: 'application/x-ndjson' });
  }

  /** Change a /stream's subscriptions. */
  changeStream(name: string, change: StreamChange, signal?: AbortSignal): Promise<void> {
    return this.request<void>('POST', `/stream/${name}`, { body: change, signal });
  }

  /** A 2xx answer, or an ApiError. */
  private async answer(method: string, path: string, init: Init): Promise<Response> {
    const res = await this.send(method, path, init);
    if (!res.ok) throw await this.failure(res);
    return res;
  }

  private async send(method: string, path: string, init: Init): Promise<Response> {
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
  const b = body as { error?: { code?: string; message?: string; f?: string }; kind?: string; reason?: string; message?: string } | undefined;
  if (b?.error?.code) return new ApiError(res.status, b.error.code, b.error.message ?? b.error.code, undefined, b.error.f);
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

/** What a list asks for when only its objects' metadata is wanted (the API server's PartialObjectMetadataList). */
export const METADATA_LIST = 'application/json;as=PartialObjectMetadataList;g=meta.k8s.io;v=v1,application/json';

/** A page of a list: its objects (their managedFields dropped), where the next begins, its version, how many past it (the API server's say: none, not said). */
export interface ListPage {
  items: KubeObject[];
  continue?: string;
  resourceVersion: string;
  remaining?: number;
}

/** A list's pages, read one after another (limit and continue, as asked); whoever reads them says when to stop, and what to do of a 410. */
export async function* pagesOf(http: Http, path: string, query: Query, how: { accept?: string; signal?: AbortSignal; limit: (read: number) => number }): AsyncGenerator<ListPage> {
  let next: string | undefined;
  let read = 0;
  do {
    const page = await http.get<{ items?: KubeObject[]; metadata?: { continue?: string; resourceVersion?: string; remainingItemCount?: number } }>(
      path,
      { ...query, limit: String(how.limit(read)), continue: next },
      how.signal,
      how.accept,
    );
    const items = page.items ?? [];
    for (const o of items) if (o.metadata?.managedFields) delete o.metadata.managedFields;
    read += items.length;
    next = page.metadata?.continue || undefined;
    yield {
      items,
      ...(next ? { continue: next } : {}),
      resourceVersion: page.metadata?.resourceVersion ?? '',
      ...(page.metadata?.remainingItemCount !== undefined ? { remaining: page.metadata.remainingItemCount } : {}),
    };
  } while (next);
}
