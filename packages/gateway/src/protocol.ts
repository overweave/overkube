/*
 * What the page and the gateway say to each other, as types only: nothing
 * here runs, nothing is of Node — the client (in the browser) and the
 * gateway (in a server) both take it from '@overkube/gateway/protocol'.
 * Under the gateway's prefix:
 *
 *   /api/**, /apis/**, /version, /openapi/v3/**   the API server's, passed on (never PATCH)
 *   GET  /watch?w=<id>:<resourceVersion>:<path>    WatchLine per line (NDJSON)
 *   POST /patch                                    PatchBody → the API server's answer
 *   GET  /status                                   StatusAnswer
 *
 * Anything but a read carries the gateway's header (x-overkube: any value),
 * and no request comes from another site's page (Sec-Fetch-Site: cross-site,
 * an Origin not the gateway's): 403 cross_site. A /patch is
 * application/json. A path holds no "%" and no "." segment; w values are
 * URL-encoded (a selector's "&" and "=" too).
 *
 * The gateway's own failures answer ErrorAnswer; the API server's (a Status)
 * come back as it sent them.
 */

/** Why the gateway itself said no, or could not reach the cluster. */
export type ErrorCode =
  | 'bad_method'
  | 'bad_path'
  | 'bad_patch'
  | 'bad_body'
  | 'bad_watch'
  | 'too_many_watches'
  | 'too_large'
  | 'read_only'
  | 'cross_site'
  | 'kube_down'
  | 'kube_timeout'
  | 'kube_error';

export interface ErrorAnswer {
  /** w: for bad_watch, the watch at fault (its id), when one is. */
  error: { code: ErrorCode; message: string; w?: string };
}

/**
 * What a /watch takes — the client checks its watches by the same rules
 * before it asks: at most watchesPerStream watches; each
 * <id>:<resourceVersion>:<path>, its id letters, digits and . / - _ (at most
 * idLength), its resourceVersion opaque (anything but ":" and spaces, empty:
 * from now).
 */
export const WATCH = {
  watchesPerStream: 50,
  idLength: 100,
  spec: /^([\w./-]{1,100}):([^:\s]*):(\/.*)$/,
} as const;

/** One line of a /watch stream: a watch's event, its state, or the stream's own. */
export type WatchLine =
  /** The watch is (again) open. */
  | { w: string; type: 'OPEN' }
  /** The API server's event, metadata.managedFields left out. */
  | { w: string; type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK'; object: unknown }
  /** The cluster went away for it, or erred: tried again by the gateway itself. */
  | { w: string; type: 'RETRY'; error: { code: ErrorCode; message: string } }
  /** A Status: that watch is over (410: list again; 403, 404). */
  | { w: string; type: 'ERROR'; object: unknown }
  /** Now and then, so the client knows the stream is alive. */
  | { type: 'PING' }
  /** The stream ends: the client read too slowly, or the gateway is stopping — open it again (after a while). */
  | { type: 'CLOSE'; reason: 'slow_client' | 'shutdown' };

/** A change to one object (or its subresource), the one way the page makes changes. */
export interface PatchBody {
  /** The object's API path, without a query: /apis/apps/v1/namespaces/web/deployments/shop. */
  path: string;
  type: 'merge' | 'json' | 'strategic' | 'apply';
  patch: unknown;
  /** Who made the change, as the API server records it (default: the gateway's). */
  fieldManager?: string;
  /** Only for an apply: take over fields others manage. */
  force?: boolean;
  dryRun?: boolean;
}

export interface KubeState {
  reachable: boolean;
  version?: string;
  error?: { code: ErrorCode; message: string };
}

export interface StatusAnswer {
  /** The gateway's version, as its host gave it. */
  version: string;
  kube: KubeState;
}
