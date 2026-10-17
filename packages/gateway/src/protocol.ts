import { logTimeKey } from '@overkube/query';

/*
 * What the page and the gateway say to each other — types, and the little
 * both read the same way (a log's lines, where a reader got to in one);
 * nothing of Node — the client
 * (in the browser) and the gateway (in a server) both take it from
 * '@overkube/gateway/protocol'.
 * Under the gateway's prefix:
 *
 *   /api/**, /apis/**, /version, /openapi/v3/**   the API server's, passed on (never PATCH)
 *   GET  /stream                                   StreamLine per line (NDJSON), HELLO first: watches, logs
 *   POST /stream/<stream>                          StreamChange → 204 (read only or not: it changes no cluster)
 *   POST /patch                                    PatchBody → the API server's answer
 *   GET  /status                                   StatusAnswer
 *   GET  /me                                       MeAnswer: whom the cluster takes the page for
 *
 * Anything but a read carries the gateway's header (x-overkube: any value),
 * and no request comes from another site's page (Sec-Fetch-Site: cross-site,
 * an Origin not the gateway's): 403 cross_site. A gateway whose host signs
 * people in answers one it has not signed in 401 unauthorized. A /patch is
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
  /** The gateway's budget of streams and watches spent (a log in a stream counts as a watch): try again later. */
  | 'too_many_watches'
  | 'too_large'
  | 'read_only'
  | 'cross_site'
  /** Not signed in (its host's sign-in): sign in again. */
  | 'unauthorized'
  /** Signing in tried too often from one place: wait a minute. */
  | 'too_many_tries'
  /** Signing in over plain HTTP off this machine: refused (what is sent could be read on the way). */
  | 'insecure'
  | 'not_found'
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

/**
 * One container's log in a /stream: its lines are told by f, each with the
 * time it was written (as the API server gives them: timestamps, always).
 * Followed, it is kept open — broken off, it goes on from its last line,
 * none told twice — until this run of the container ends (it stopped, or
 * restarted: the next run is another log): END. Not followed: what is
 * there, then END. Removed like any. A window of a log, read once, is a
 * plain GET (…/log?timestamps=true&sinceTime=…&limitBytes=…).
 */
export interface LogSubscription {
  id: string;
  /** A pod's log: /api/v1/namespaces/<namespace>/pods/<name>/log. */
  path: string;
  log: LogQuery;
}

/** Which of a container's lines, as kubectl logs asks for them. */
export interface LogQuery {
  /** Its name (none: the pod's only one). */
  container?: string;
  /** Its last run's (a container that restarted). */
  previous?: boolean;
  /** Kept open, its lines told as they are written. */
  follow?: boolean;
  /** Written at or after (RFC 3339). */
  sinceTime?: string;
  /** Its last lines only. */
  tailLines?: number;
}

// ── A log's lines ─────────────────────────────────────────────────────────

/** A log line's time, as the API server writes it before the line: RFC 3339, to the nanosecond. */
export const LOG_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,9})?(Z|[+-]\d\d:\d\d)$/;

/** A line as the API server gives it with timestamps: its time and its text; with none (a piece of a line too long): its text. */
export function splitLogLine(line: string): { time?: string; text: string } {
  const at = line.indexOf(' ');
  const time = at > 0 ? line.slice(0, at) : '';
  return LOG_TIME.test(time) ? { time, text: line.slice(at + 1) } : { text: line };
}

/** Log lines' times in order (as their keys sort: logTimeKey). */
export function compareLogTimes(a: string, b: string): number {
  const [ka, kb] = [logTimeKey(a), logTimeKey(b)];
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Where a reader of a log got to: its latest line's time, and how many of
 * that time it took. Asked again from that time (the API server gives
 * sinceTime to the second: from the start of that second), the lines
 * before it and those of that time it took already are left out — until
 * the first it had not. A line with no time (a piece of a long line) goes
 * as the line it is of went.
 * Lines of the container's two streams (stdout, stderr) written out of
 * order across a break may be left out: rare, and said here.
 */
export class LogCursor {
  private latest: { time: string; count: number } | null = null;
  private skip: { time: string; count: number } | null = null;
  /** Whether the line before was taken: its pieces go with it. */
  private took = true;

  /** Where to ask again from; none: it has nothing yet. */
  get since(): string | undefined {
    return this.latest?.time;
  }

  /** Asked again from since: what it took is left out once more. */
  again(): void {
    this.skip = this.latest && { ...this.latest };
  }

  /** Whether a line (its time) is new: taken, it moves the cursor on. */
  take(time: string | undefined): boolean {
    if (time === undefined) return this.took;
    this.took = false;
    if (this.skip) {
      const order = compareLogTimes(time, this.skip.time);
      if (order < 0) return false;
      if (order === 0 && this.skip.count > 0) {
        this.skip.count--;
        return false;
      }
      this.skip = null;
    }
    this.took = true;
    const order = this.latest ? compareLogTimes(time, this.latest.time) : 1;
    if (order > 0) this.latest = { time, count: 1 };
    else if (order === 0 && this.latest) this.latest.count++;
    return true;
  }
}

/** What a POST /stream/<stream> changes: the removed first, then the added — all of it or, refused, none. */
export interface StreamChange {
  add?: (Subscription | LogSubscription)[];
  /** Ids; one not there is no error. */
  remove?: string[];
}

/** One line of a /stream: a subscription's watch's (its state, the API server's events), or the stream's own. */
export type StreamLine =
  /** First: the stream's name, to change it by. */
  | { type: 'HELLO'; stream: string }
  | { f: string; type: 'OPEN' }
  | { f: string; type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK'; object: unknown }
  /** A log's lines, as they were written: "<RFC 3339 time> <text>" each; one with no time goes on the line before it (a line too long, told in pieces). */
  | { f: string; type: 'LOG'; lines: string[] }
  /** A log is over: all of it told (not followed), or this run of its container ended; the subscription stays until removed. */
  | { f: string; type: 'END' }
  | { f: string; type: 'RETRY'; error: { code: ErrorCode; message: string } }
  /** A Status: that watch or log is over (a watch's 410: list again; a log's container not there, or not started); the subscription stays until removed. */
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

/** Whom the cluster takes the page for (its SelfSubjectReview): what RBAC grants it by. */
export interface MeAnswer {
  user: string;
  groups: string[];
  /** How its host signed it in (its own word: token, a platform's); none: the gateway's own credentials, no one signed in. */
  via?: string;
}

/** How the page signs in (overkube's server, GET /auth): no one does (loopback), with a token, with OIDC (its provider) — and who it is signed in as, if it is. */
export interface AuthAnswer {
  mode: 'loopback' | 'token' | 'oidc';
  /** The provider's issuer, to say whom one signs in with. */
  provider?: string;
  user?: string;
  groups?: string[];
  via?: string;
}

export interface StatusAnswer {
  /** The gateway's version, as its host gave it. */
  version: string;
  kube: KubeState;
}
