import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { logTimeKey } from '@overkube/query';

/*
 * A fake Kubernetes API server for overkube's tests, behaving as the real
 * one does where the connector depends on it (the gateway in front of it):
 * - discovery (aggregated) of the kinds it serves;
 * - an object by its name; lists of a kind, in every namespace or one, by name
 *   (metadata.name=) and labels (a=b,c=d), in pages (limit, continue) of
 *   one snapshot; a continue expired (expire()) answers 410;
 * - watches from a resourceVersion: the events after it (its history; one
 *   from before compact() gets ERROR 410), from none: the objects there are
 *   as ADDED; then every change;
 * - only metadata, asked as PartialObjectMetadata(List);
 * - how many past a page (remainingItemCount), of a list not selected;
 * - 403 for the paths forbidden (a collection in every namespace, or one namespace's);
 * - a container's log (written by the test: writeLog), as the kubelet gives
 *   it: from a time (to the second, as the API server passes it on), its
 *   last lines, so many bytes, each line's time before
 *   it; followed, each line as it is written until the container stops
 *   (endLog) or the connection breaks (breakLogs); its last run's
 *   (previous); one never written: 400, waiting to start; asked as a type
 *   the API server does not serve (text/plain): 406.
 */

export function kindOf(group: string, version: string, kind: string, plural: string, namespaced = true, verbs = ['get', 'list', 'watch']): KindInfo {
  return { id: `${group ? `${group}/` : ''}${version}/${kind}`, group, version, kind, plural, singular: kind.toLowerCase(), namespaced, verbs };
}

interface Logged {
  version: number;
  type: 'ADDED' | 'MODIFIED' | 'DELETED';
  object: KubeObject;
}

interface LogLine {
  time: string;
  text: string;
}

interface Follow {
  key: string;
  timestamps: boolean;
  res: ServerResponse;
}

interface Watch {
  root: string;
  namespace?: string;
  name?: string;
  labels: [string, string][];
  meta: boolean;
  res: ServerResponse;
}

export class FakeKube {
  /** Every request, as "METHOD path?query". */
  readonly requests: string[] = [];
  readonly server: Server;
  readonly served: KindInfo[];
  /** Collection paths the user may not list or watch (/api/v1/pods, /api/v1/namespaces/a/pods). */
  readonly forbidden = new Set<string>();
  private readonly objects = new Map<string, Map<string, KubeObject>>();
  private readonly history = new Map<string, Logged[]>();
  private readonly watches = new Set<Watch>();
  private readonly snapshots = new Map<string, KubeObject[]>();
  private version = 100;
  private compacted = 0;
  /** Containers' logs, by namespace/pod/container (and :previous). */
  private readonly logs = new Map<string, LogLine[]>();
  private readonly follows = new Set<Follow>();
  /** Lines written with no time given: a second apart from here. */
  private clock = Date.parse('2026-10-17T09:00:00Z');

  constructor(served: KindInfo[]) {
    this.served = served;
    this.server = createServer((req, res) => this.handle(req, res));
  }

  /** Listening; a kubeconfig of it, for the gateway. */
  async listen(): Promise<string> {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    const file = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig');
    const port = (this.server.address() as AddressInfo).port;
    writeFileSync(
      file,
      `clusters:\n- cluster:\n    server: http://127.0.0.1:${port}\n  name: c\nusers:\n- name: u\n  user:\n    token: t\ncontexts:\n- context:\n    cluster: c\n    user: u\n  name: x\ncurrent-context: x\n`,
    );
    return file;
  }

  async close(): Promise<void> {
    for (const w of this.watches) w.res.destroy();
    this.server.closeAllConnections();
    await new Promise((r) => this.server.close(r));
  }

  /** How many watches are open on it. */
  get watching(): number {
    return this.watches.size;
  }

  put(kind: KindInfo, object: KubeObject): KubeObject {
    const root = rootOf(kind);
    const all = this.objects.get(root) ?? new Map<string, KubeObject>();
    this.objects.set(root, all);
    const key = keyOf(object);
    const stored = { ...object, metadata: { ...object.metadata, resourceVersion: String(++this.version) } } as KubeObject;
    const type = all.has(key) ? 'MODIFIED' : 'ADDED';
    all.set(key, stored);
    this.log(root, type, stored);
    return stored;
  }

  delete(kind: KindInfo, namespace: string | undefined, name: string): void {
    const root = rootOf(kind);
    const key = namespace ? `${namespace}/${name}` : name;
    const old = this.objects.get(root)?.get(key);
    if (!old) return;
    this.objects.get(root)?.delete(key);
    this.log(root, 'DELETED', { ...old, metadata: { ...old.metadata, resourceVersion: String(++this.version) } } as KubeObject);
  }

  /** Every list's continue from before now: 410. */
  expire(): void {
    this.snapshots.clear();
  }

  /** The history up to now gone: a watch from before now gets 410. */
  compact(): void {
    this.compacted = this.version;
  }

  /** A line written to a container's log (its time: as given, else a second after the last); told to those following it. */
  writeLog(namespace: string, pod: string, container: string, text: string, options: { time?: string; previous?: boolean } = {}): void {
    const key = `${namespace}/${pod}/${container}${options.previous ? ':previous' : ''}`;
    if (!options.time) this.clock += 1000;
    const line = { time: options.time ?? new Date(this.clock).toISOString(), text };
    this.logs.set(key, [...(this.logs.get(key) ?? []), line]);
    for (const f of this.follows) if (f.key === key) f.res.write(`${f.timestamps ? `${line.time} ` : ''}${text}\n`);
  }

  /** A container stops writing: those following its log are done. */
  endLog(namespace: string, pod: string, container: string): void {
    for (const f of this.follows)
      if (f.key === `${namespace}/${pod}/${container}`) {
        this.follows.delete(f);
        f.res.end();
      }
  }

  /** Every followed log's connection breaks (the kubelet, the network). */
  breakLogs(): void {
    for (const f of this.follows) f.res.destroy();
    this.follows.clear();
  }

  /** Every watch open ends (as the API server ends them now and then). */
  endWatches(): void {
    for (const w of this.watches) w.res.end();
    this.watches.clear();
  }

  private log(root: string, type: Logged['type'], object: KubeObject): void {
    const logged = { version: this.version, type, object };
    this.history.set(root, [...(this.history.get(root) ?? []), logged]);
    for (const w of this.watches) if (w.root === root && matches(w, object)) send(w, type, object);
  }

  private handle(req: IncomingMessage, res: ServerResponse) {
    this.requests.push(`${req.method} ${req.url}`);
    const url = new URL(req.url ?? '', 'http://kube');
    if (url.pathname === '/api' || url.pathname === '/apis') return json(res, 200, this.discovery(url.pathname === '/api'));
    const log = /^\/api\/v1\/namespaces\/([^/]+)\/pods\/([^/]+)\/log$/.exec(url.pathname);
    if (log) return this.answerLog(log[1], log[2], url.searchParams, req.headers.accept ?? '', res);
    const at = this.locate(url.pathname);
    if (!at) {
      // One object, by its name (its collection's path and its name).
      const cut = url.pathname.lastIndexOf('/');
      const of = this.locate(url.pathname.slice(0, cut));
      const name = url.pathname.slice(cut + 1);
      const object = of && this.objects.get(of.root)?.get(of.namespace ? `${of.namespace}/${name}` : name);
      return object ? json(res, 200, object) : json(res, 404, { kind: 'Status', code: 404, reason: 'NotFound' });
    }
    if (this.forbidden.has(url.pathname)) return json(res, 403, { kind: 'Status', code: 403, reason: 'Forbidden', message: `${url.pathname} is forbidden` });
    const labels = (url.searchParams.get('labelSelector') ?? '')
      .split(',')
      .filter(Boolean)
      .map((l) => l.split('=') as [string, string]);
    const name = url.searchParams.get('fieldSelector')?.replace(/^metadata\.name=/, '');
    const watch: Watch = { root: at.root, namespace: at.namespace, name, labels, meta: /PartialObjectMetadata/.test(req.headers.accept ?? ''), res };
    if (url.searchParams.get('watch') === '1') return this.watch(watch, url.searchParams.get('resourceVersion') ?? '');
    this.list(watch, url.searchParams);
  }

  /** A container's log, as the kubelet gives it. */
  private answerLog(namespace: string, pod: string, query: URLSearchParams, accept: string, res: ServerResponse): void {
    // As the API server: an Accept it does not serve (text/plain among them) refused.
    if (accept && !/\*\/\*|application\/(json|yaml|vnd\.kubernetes\.protobuf)/.test(accept)) {
      json(res, 406, {
        kind: 'Status',
        code: 406,
        reason: 'NotAcceptable',
        message: 'only the following media types are accepted: application/json, application/yaml, application/vnd.kubernetes.protobuf',
      });
      return;
    }
    const container = query.get('container') ?? '';
    const key = `${namespace}/${pod}/${container}${query.get('previous') === 'true' ? ':previous' : ''}`;
    const all = this.logs.get(key);
    if (!all) {
      json(res, 400, { kind: 'Status', code: 400, reason: 'BadRequest', message: `container "${container}" in pod "${pod}" is waiting to start: ContainerCreating` });
      return;
    }
    const since = query.get('sinceTime');
    // From the start of its second: the API server passes sinceTime on to the kubelet to the second.
    const from = since && logTimeKey(since.replace(/\.\d+/, ''));
    let lines = from ? all.filter((l) => logTimeKey(l.time) >= from) : all;
    const tail = query.get('tailLines');
    if (tail !== null) lines = lines.slice(Math.max(0, lines.length - Number(tail)));
    const timestamps = query.get('timestamps') === 'true';
    let text = lines.map((l) => `${timestamps ? `${l.time} ` : ''}${l.text}\n`).join('');
    const limit = query.get('limitBytes');
    if (limit !== null) text = Buffer.from(text).subarray(0, Number(limit)).toString();
    res.writeHead(200, { 'content-type': 'text/plain' });
    if (query.get('follow') !== 'true' || limit !== null) return void res.end(text);
    res.write(text);
    const follow = { key, timestamps, res };
    this.follows.add(follow);
    res.on('close', () => this.follows.delete(follow));
  }

  private locate(path: string): { root: string; namespace?: string } | undefined {
    for (const kind of this.served) {
      const root = rootOf(kind);
      if (path === root) return { root };
      const m = path.match(/^(.*)\/namespaces\/([^/]+)\/([^/]+)$/);
      if (m && `${m[1]}/${m[3]}` === root) return { root, namespace: m[2] };
    }
    return undefined;
  }

  private list(w: Watch, query: URLSearchParams) {
    const limit = Number(query.get('limit') ?? 0) || Number.POSITIVE_INFINITY;
    const token = query.get('continue');
    let snapshot: KubeObject[];
    let offset = 0;
    let id: string;
    if (token) {
      [id, offset] = [token.split(':')[0], Number(token.split(':')[1])];
      const kept = this.snapshots.get(id);
      if (!kept) return json(w.res, 410, { kind: 'Status', code: 410, reason: 'Expired', message: 'the continue is too old' });
      snapshot = kept;
    } else {
      snapshot = [...(this.objects.get(w.root)?.values() ?? [])].filter((o) => matches(w, o));
      id = `${this.version}-${Math.random()}`;
      this.snapshots.set(id, snapshot);
    }
    const page = snapshot.slice(offset, offset + limit);
    const more = offset + limit < snapshot.length;
    const version = id.split('-')[0];
    json(w.res, 200, {
      kind: w.meta ? 'PartialObjectMetadataList' : 'List',
      // How many past this page, as the API server says it — not of a selected list (labels, fields).
      metadata: {
        resourceVersion: version,
        ...(more ? { continue: `${id}:${offset + limit}` } : {}),
        ...(more && !w.name && !w.labels.length ? { remainingItemCount: snapshot.length - offset - limit } : {}),
      },
      items: page.map((o) => (w.meta ? metaOf(o) : o)),
    });
  }

  private watch(w: Watch, from: string): void {
    // Headers at once, as the API server sends them: a watch with nothing to say yet is open all the same.
    w.res.writeHead(200, { 'content-type': 'application/json' }).flushHeaders();
    if (from && Number(from) < this.compacted) {
      w.res.end(`${JSON.stringify({ type: 'ERROR', object: { kind: 'Status', code: 410, reason: 'Expired', message: 'too old resource version' } })}\n`);
      return;
    }
    if (from) for (const e of this.history.get(w.root) ?? []) if (e.version > Number(from) && matches(w, e.object)) send(w, e.type, e.object);
    if (!from) for (const o of this.objects.get(w.root)?.values() ?? []) if (matches(w, o)) send(w, 'ADDED', o);
    this.watches.add(w);
    w.res.on('close', () => this.watches.delete(w));
  }

  private discovery(core: boolean) {
    return {
      kind: 'APIGroupDiscoveryList',
      items: this.served
        .filter((k) => (k.group === '') === core)
        .map((k) => ({
          metadata: core ? {} : { name: k.group },
          versions: [{ version: k.version, resources: [{ resource: k.plural, responseKind: { kind: k.kind }, scope: k.namespaced ? 'Namespaced' : 'Cluster', verbs: k.verbs }] }],
        })),
    };
  }
}

const rootOf = (k: KindInfo) => (k.group ? `/apis/${k.group}/${k.version}/${k.plural}` : `/api/${k.version}/${k.plural}`);
const keyOf = (o: KubeObject) => (o.metadata?.namespace ? `${o.metadata.namespace}/${o.metadata.name}` : (o.metadata?.name ?? ''));
const metaOf = (o: KubeObject) => ({ kind: 'PartialObjectMetadata', apiVersion: 'meta.k8s.io/v1', metadata: o.metadata });

function matches(w: Watch, o: KubeObject): boolean {
  if (w.namespace && o.metadata?.namespace !== w.namespace) return false;
  if (w.name && o.metadata?.name !== w.name) return false;
  return w.labels.every(([k, v]) => o.metadata?.labels?.[k] === v);
}

function send(w: Watch, type: string, object: KubeObject): void {
  w.res.write(`${JSON.stringify({ type, object: w.meta ? metaOf(object) : object })}\n`);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
