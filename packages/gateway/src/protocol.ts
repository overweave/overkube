/*
 * What the page and the gateway say to each other, as types only: nothing
 * here runs, nothing is of Node — the client (in the browser) and the
 * gateway (in a server) both take it from '@overkube/gateway/protocol'.
 * Under the gateway's prefix:
 *
 *   /api/**, /apis/**, /version, /openapi/v3/**   the API server's, passed on (never PATCH)
 *   GET  /stream                                   StreamLine per line (NDJSON), HELLO first
 *   POST /stream/<stream>                          StreamChange → 204 (read only or not: it changes no cluster)
 *   POST /patch                                    PatchBody → the API server's answer
 *   GET  /status                                   StatusAnswer
 *
 * Anything but a read carries the gateway's header (x-overkube: any value),
 * and no request comes from another site's page (Sec-Fetch-Site: cross-site,
 * an Origin not the gateway's): 403 cross_site. A /patch is
 * application/json, as is a /stream change. A path holds no "%" and no "."
 * segment.
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
  | 'bad_stream'
  | 'no_stream'
  /** The gateway's budget of streams and watches spent (a followed log counts as a watch): try again later. */
  | 'too_many_watches'
  | 'too_large'
  | 'read_only'
  | 'cross_site'
  | 'kube_down'
  | 'kube_timeout'
  | 'kube_error';

export interface ErrorAnswer {
  /** f: for bad_stream, the subscription at fault, when one is. */
  error: { code: ErrorCode; message: string; f?: string };
}

/** What a /stream takes: at most this many subscriptions in one stream; an id at most so long, a selector too. */
export const STREAM = {
  subscriptions: 200,
  idLength: 100,
  selectorLength: 4096,
} as const;

/** One watch in a /stream: its lines are told by f (its id). */
export interface Subscription {
  /** The client's name for it: letters, digits and . / - _ (a new one for each time it subscribes again: lines before REMOVED are the old one's). */
  id: string;
  /** A collection, without a query: /api/v1/pods, /apis/apps/v1/namespaces/media/deployments. */
  path: string;
  labelSelector?: string;
  fieldSelector?: string;
  /** Only the objects' metadata (PartialObjectMetadata). */
  projection?: 'metadata';
  /** Where it starts; none: from now (the objects there are as ADDED). */
  resourceVersion?: string;
}

/** What a POST /stream/<stream> changes: the removed first, then the added — all of it or, refused, none. */
export interface StreamChange {
  add?: Subscription[];
  /** Ids; one not there is no error. */
  remove?: string[];
}

/** One line of a /stream: a subscription's watch's (its state, the API server's events), or the stream's own. */
export type StreamLine =
  /** First: the stream's name, to change it by. */
  | { type: 'HELLO'; stream: string }
  | { f: string; type: 'OPEN' }
  | { f: string; type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK'; object: unknown }
  | { f: string; type: 'RETRY'; error: { code: ErrorCode; message: string } }
  /** A Status: that watch is over (410: list again); the subscription stays until removed. */
  | { f: string; type: 'ERROR'; object: unknown }
  /** The subscription is removed: nothing more of it comes after this (the 204 may come before it). */
  | { f: string; type: 'REMOVED' }
  | { type: 'PING' }
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
