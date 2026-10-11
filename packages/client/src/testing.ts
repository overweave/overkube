import { WATCH } from '@overkube/gateway/protocol';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { BASE, collectionPath } from './api.ts';

/*
 * A gateway for the client's tests, as fetch, behaving as the real one
 * does where the client depends on it:
 * - lists in pages, every page of one snapshot; a snapshot's continue
 *   expires (expireLists) with 410, as the API server's does;
 * - /watch streams, taken by the gateway's own rules (WATCH: at most 50
 *   watches, their ids and versions; a request breaking them is 400
 *   bad_watch, naming the watch at fault): each watch OPENs, then gets the
 *   current objects (from no version) or the events after the version it
 *   was opened from (the history kept: compact() drops it, and a watch from
 *   before then gets ERROR 410), then every change — a collection's
 *   selectors are ignored, its path matched; PING and CLOSE when told;
 * - anything but a read without the gateway's header refused (403 cross_site);
 * - the aggregated discovery of the kinds it serves, /status;
 * - answers of the test's own instead of the real one (answer), held ones
 *   (hold), streams broken after their headers (fail), lines cut anywhere
 *   (writeRaw).
 */

interface OpenStream {
  watches: { id: string; resourceVersion: string; path: string }[];
  /** When it was asked for. */
  at: number;
  closed: boolean;
  /** Lines; several at once come as one chunk, as a busy API server's events do. */
  write(...lines: object[]): void;
  /** Bytes as they are: a line, or a character, cut anywhere. */
  writeRaw(bytes: Uint8Array): void;
  /** The gateway ends the stream (a dropped connection, to the page). */
  end(): void;
  /** The connection breaks in the middle of the answer. */
  fail(): void;
  ping(): void;
  /** The gateway lets the stream go: CLOSE, then the end. */
  closeWith(reason: 'slow_client' | 'shutdown'): void;
}

/** A collection's path without its selectors. */
const bare = (path: string) => path.split('?')[0];

type Answer = { status: number; body: unknown; raw?: boolean } | 'network';

/** A request held back: released by the test, or given up by the page. */
interface Held {
  release(): void;
  readonly aborted: boolean;
}

interface Logged {
  version: number;
  event: { type: string; object: KubeObject };
}

export class FakeGateway {
  /** Every request, as "METHOD path?query". */
  readonly requests: string[] = [];
  readonly streams: OpenStream[] = [];
  /** The kinds discovery says are served. */
  served: KindInfo[];
  /** Whether a watch opens at once (OPEN) when its stream does. */
  openWatches = true;
  pageSize = Number.POSITIVE_INFINITY;
  private readonly answers = new Map<string, Answer[]>();
  private readonly holds = new Map<string, (Held & { gate: Promise<void>; aborted: boolean })[]>();
  private readonly objects = new Map<string, Map<string, KubeObject>>();
  private readonly history = new Map<string, Logged[]>();
  private readonly snapshots = new Map<string, { items: KubeObject[]; version: string; expired: boolean }>();
  private version = 100;
  /** Events at or before this version are gone from the history. */
  private compacted = 0;

  constructor(served: KindInfo[] = []) {
    this.served = served;
  }

  /** The next answers to "METHOD path", one per request, instead of the real one. */
  answer(request: string, ...answers: Answer[]): void {
    this.answers.set(request, [...(this.answers.get(request) ?? []), ...answers]);
  }

  /** Hold the next request to "METHOD path" until released (or aborted by the page). */
  hold(request: string): Held {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const held = { aborted: false, release, gate };
    this.holds.set(request, [...(this.holds.get(request) ?? []), held]);
    return held;
  }

  add(kind: KindInfo, object: KubeObject): KubeObject {
    return this.put(kind, object, 'ADDED');
  }

  change(kind: KindInfo, object: KubeObject): KubeObject {
    return this.put(kind, object, 'MODIFIED');
  }

  remove(kind: KindInfo, name: string, namespace?: string): void {
    const objects = this.collection(kind);
    const key = namespace ? `${namespace}/${name}` : name;
    const object = objects.get(key);
    if (!object) return;
    objects.delete(key);
    this.emit(kind, { type: 'DELETED', object: { ...object, metadata: { ...object.metadata, resourceVersion: String(++this.version) } } });
  }

  /** Forget the history so far: a watch from an older version is too far behind (410). */
  compact(): void {
    this.compacted = this.version;
    this.history.clear();
  }

  /** Every list snapshot handed out expires: its next page is 410. */
  expireLists(): void {
    for (const s of this.snapshots.values()) s.expired = true;
  }

  /** The open streams watching a collection. */
  watching(kind: KindInfo): OpenStream[] {
    return this.streams.filter((s) => !s.closed && s.watches.some((w) => bare(w.path) === collectionPath(kind)));
  }

  get open(): OpenStream[] {
    return this.streams.filter((s) => !s.closed);
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input), 'http://gateway');
    const method = init?.method ?? 'GET';
    const path = url.pathname.slice(BASE.length);
    const signal = init?.signal ?? undefined;
    this.requests.push(`${method} ${path}${url.search}`);

    const held = this.holds.get(`${method} ${path}`)?.shift();
    if (held) {
      await new Promise<void>((resolve, reject) => {
        void held.gate.then(resolve);
        signal?.addEventListener('abort', () => {
          held.aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }
    const answer = this.answers.get(`${method} ${path}`)?.shift();
    if (answer === 'network') throw new TypeError('Failed to fetch');
    if (answer) return answer.raw ? new Response(String(answer.body), { status: answer.status }) : json(answer.status, answer.body);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (method !== 'GET' && method !== 'HEAD' && headers['x-overkube'] === undefined) {
      return json(403, { error: { code: 'cross_site', message: 'a request that is not a read carries the x-overkube header' } });
    }

    if (path === '/watch') return this.watch(url.searchParams.getAll('w'), signal);
    if (path === '/status') return json(200, { version: 'test', kube: { reachable: true, version: 'v1.35.7' } });
    if (path === '/api' || path === '/apis') return json(200, this.discovery(path === '/api'));
    const kind = this.served.find((k) => collectionPath(k) === path);
    if (method === 'GET' && kind) return this.list(kind, url.searchParams.get('continue'));
    return json(404, { kind: 'Status', code: 404, reason: 'NotFound', message: `${path} not found` });
  };

  private collection(kind: KindInfo): Map<string, KubeObject> {
    if (!this.objects.has(kind.id)) this.objects.set(kind.id, new Map());
    return this.objects.get(kind.id) as Map<string, KubeObject>;
  }

  private put(kind: KindInfo, object: KubeObject, type: 'ADDED' | 'MODIFIED'): KubeObject {
    const stored = { ...object, metadata: { ...object.metadata, resourceVersion: String(++this.version) } };
    const { name = '', namespace } = stored.metadata;
    this.collection(kind).set(namespace ? `${namespace}/${name}` : name, stored);
    this.emit(kind, { type, object: stored });
    return stored;
  }

  private emit(kind: KindInfo, event: { type: string; object: KubeObject }): void {
    const log = this.history.get(kind.id) ?? [];
    log.push({ version: this.version, event });
    this.history.set(kind.id, log);
    for (const s of this.watching(kind)) {
      const w = s.watches.find((x) => bare(x.path) === collectionPath(kind));
      if (w) s.write({ w: w.id, ...event });
    }
  }

  /** A page of a snapshot: the first page takes it, the next ones go on in it. */
  private list(kind: KindInfo, from: string | null): Response {
    let token: string;
    let start: number;
    if (from) {
      token = from.split('-')[0];
      start = Number(from.split('-')[1]);
    } else {
      token = `s${this.snapshots.size + 1}`;
      start = 0;
      this.snapshots.set(token, { items: [...this.collection(kind).values()], version: String(this.version), expired: false });
    }
    const snapshot = this.snapshots.get(token);
    if (!snapshot || snapshot.expired) {
      return json(410, { kind: 'Status', code: 410, reason: 'Expired', message: 'the provided continue parameter is too old', metadata: { continue: from } });
    }
    const items = snapshot.items.slice(start, start + this.pageSize);
    const next = start + items.length < snapshot.items.length ? `${token}-${start + items.length}` : undefined;
    return json(200, { kind: `${kind.kind}List`, metadata: { resourceVersion: snapshot.version, ...(next ? { continue: next } : {}) }, items });
  }

  private discovery(core: boolean) {
    const groups = new Map<string, Map<string, KindInfo[]>>();
    for (const k of this.served.filter((k) => (k.group === '') === core)) {
      if (!groups.has(k.group)) groups.set(k.group, new Map());
      const versions = groups.get(k.group) as Map<string, KindInfo[]>;
      versions.set(k.version, [...(versions.get(k.version) ?? []), k]);
    }
    return {
      kind: 'APIGroupDiscoveryList',
      apiVersion: 'apidiscovery.k8s.io/v2',
      items: [...groups].map(([group, versions]) => ({
        metadata: core ? {} : { name: group },
        versions: [...versions].map(([version, list]) => ({
          version,
          resources: list.map((k) => ({
            resource: k.plural,
            responseKind: { group: '', version: '', kind: k.kind },
            scope: k.namespaced ? 'Namespaced' : 'Cluster',
            singularResource: k.singular,
            verbs: [...k.verbs],
          })),
        })),
      })),
    };
  }

  private watch(specs: string[], signal?: AbortSignal): Response {
    const refuse = (message: string, w?: string) => json(400, { error: { code: 'bad_watch', message, ...(w ? { w } : {}) } });
    if (specs.length === 0) return refuse('no watch asked for');
    if (specs.length > WATCH.watchesPerStream) return refuse(`at most ${WATCH.watchesPerStream} watches in one stream`);
    const bad = specs.find((spec) => !WATCH.spec.test(spec));
    if (bad) return refuse(`${bad}: not <id>:<resourceVersion>:<path>`, bad.split(':')[0]);
    const watches = specs.map((spec) => {
      const [, id, resourceVersion, path] = spec.match(WATCH.spec) ?? [];
      return { id, resourceVersion, path };
    });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    const stream: OpenStream = {
      watches,
      at: Date.now(),
      closed: false,
      write: (...lines) => {
        if (!stream.closed) controller.enqueue(encoder.encode(lines.map((l) => `${JSON.stringify(l)}\n`).join('')));
      },
      writeRaw: (bytes) => {
        if (!stream.closed) controller.enqueue(bytes);
      },
      end: () => {
        if (stream.closed) return;
        stream.closed = true;
        controller.close();
      },
      fail: () => {
        if (stream.closed) return;
        stream.closed = true;
        controller.error(new TypeError('network error'));
      },
      ping: () => stream.write({ type: 'PING' }),
      closeWith: (reason) => {
        stream.write({ type: 'CLOSE', reason });
        stream.end();
      },
    };
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
      },
      cancel: () => {
        stream.closed = true;
      },
    });
    signal?.addEventListener('abort', () => {
      if (stream.closed) return;
      stream.closed = true;
      controller.error(new DOMException('aborted', 'AbortError'));
    });
    this.streams.push(stream);
    if (this.openWatches) {
      for (const w of watches) {
        stream.write({ w: w.id, type: 'OPEN' });
        const kind = this.served.find((k) => collectionPath(k) === bare(w.path));
        // From no version: what there is now, each as ADDED (as the API server does).
        if (!w.resourceVersion) {
          for (const object of kind ? this.collection(kind).values() : []) stream.write({ w: w.id, type: 'ADDED', object });
          continue;
        }
        // From a version: what happened since, or 410 when that is no longer known.
        const from = Number(w.resourceVersion);
        if (from < this.compacted) {
          stream.write({ w: w.id, type: 'ERROR', object: { kind: 'Status', code: 410, reason: 'Expired', message: `too old resource version: ${from}` } });
          continue;
        }
        for (const l of (kind && this.history.get(kind.id)) || []) if (l.version > from) stream.write({ w: w.id, ...l.event });
      }
    }
    return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A kind for tests, as the kinds table writes one. */
export function kindOf(group: string, version: string, kind: string, plural: string, namespaced = true): KindInfo {
  return { id: `${group ? `${group}/` : ''}${version}/${kind}`, group, version, kind, plural, singular: kind.toLowerCase(), namespaced, verbs: ['get', 'list', 'watch'] };
}
