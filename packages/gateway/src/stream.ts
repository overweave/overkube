import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { LogFeed } from './log.ts';
import { classify } from './paths.ts';
import { LOG_TIME, STREAM, type StreamChange, type Subscription } from './protocol.ts';
import { fail } from './upstream.ts';
import { Channel, type Feed, overBudget, type Settings, type Spec, Stream, settingsOf, tooManyStreams, type WatchOptions } from './watch.ts';

/*
 * The changing stream: one response for the page's watches, changed while
 * it is open rather than opened again — so a kind wanted or let go does not
 * tear down the others' watches.
 *
 *   GET  /stream               {"type":"HELLO","stream":"<name>"}, then StreamLine per line
 *   POST /stream/<name>        { add: [Subscription], remove: [id] } → 204
 *
 * A subscription is one watch: a collection (in a namespace or in every
 * one), only metadata if asked — or one container's log (log.ts), as
 * kubectl logs asks for it. Its lines carry f (its id); one removed is
 * told REMOVED, after which nothing of it comes — that line, not the 204
 * (another connection), is where it ends. A 410 ends it (ERROR): the client
 * lists again, removes it and subscribes anew. The stream's name is its
 * key: whoever has it may change it — it never leaves the page that opened
 * it — if it is theirs (the one signed in who opened it: to anyone else it
 * is not there).
 */

/** The streams of one gateway, by name. */
export type Streams = Map<string, Changing>;

const ID = /^[\w./-]+$/;
const VERSION = /^\S{0,64}$/;
const KEYS = new Set(['id', 'path', 'labelSelector', 'fieldSelector', 'projection', 'resourceVersion']);
const LOG_KEYS = new Set(['container', 'previous', 'follow', 'sinceTime', 'tailLines']);
/** A container's name: a DNS label. */
const CONTAINER = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const METADATA = 'application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1,application/json';

/** Serve one changing stream until the client leaves. */
export function stream(res: ServerResponse, options: WatchOptions, streams: Streams, owner = ''): void {
  if (res.destroyed || res.writableEnded) return;
  const settings = settingsOf(options);
  const full = tooManyStreams(settings);
  if (full) fail(res, 503, 'too_many_watches', full);
  else new Changing(res, settings, streams, owner);
}

const gone = (name: string): Wrong => ({ status: 404, code: 'no_stream', message: `no stream ${name.slice(0, STREAM.idLength)}: it ended, or never was` });

/** A change to a stream (its body parsed), answered. */
export function change(name: string, body: unknown, res: ServerResponse, streams: Streams, owner = ''): void {
  const found = streams.get(name);
  const s = found?.owner === owner ? found : undefined;
  const wrong = s ? s.change(body) : gone(name);
  if (wrong) fail(res, wrong.status, wrong.code, wrong.message, { f: wrong.f });
  else res.writeHead(204).end();
}

type Wrong = { status: number; code: 'bad_stream' | 'too_many_watches' | 'no_stream'; message: string; f?: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Why something given as a subscription is none, or nothing. */
function check(sub: unknown): string | undefined {
  if (!isRecord(sub)) return 'a subscription is { id, path, labelSelector?, fieldSelector?, projection?, resourceVersion? } or { id, path, log }';
  if ('log' in sub) return checkLog(sub);
  const extra = Object.keys(sub).find((k) => !KEYS.has(k));
  if (extra !== undefined) return `a subscription has no ${extra.slice(0, 64)}`;
  const { id, path, labelSelector, fieldSelector, projection, resourceVersion } = sub;
  if (!isId(id)) return `an id is letters, digits and . / - _, at most ${STREAM.idLength}`;
  if (typeof path !== 'string' || classify(path)?.type !== 'collection') return 'a path is a collection of the API, without a query (/api/v1/pods)';
  for (const s of [labelSelector, fieldSelector])
    if (s !== undefined && !(typeof s === 'string' && s.length <= STREAM.selectorLength)) return `a selector is a string of at most ${STREAM.selectorLength}`;
  if (projection !== undefined && projection !== 'metadata') return 'a projection is metadata, or none';
  if (resourceVersion !== undefined && !(typeof resourceVersion === 'string' && VERSION.test(resourceVersion))) return 'a resourceVersion is at most 64, no spaces';
  return undefined;
}

const isId = (id: unknown): id is string => typeof id === 'string' && id.length <= STREAM.idLength && ID.test(id);
const isCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Why a log subscription is none. */
function checkLog(sub: Record<string, unknown>): string | undefined {
  const extra = Object.keys(sub).find((k) => k !== 'id' && k !== 'path' && k !== 'log');
  if (extra !== undefined) return `a log subscription has no ${extra.slice(0, 64)}`;
  const { id, path, log } = sub;
  if (!isId(id)) return `an id is letters, digits and . / - _, at most ${STREAM.idLength}`;
  const at = typeof path === 'string' ? classify(path) : null;
  if (at?.type !== 'subresource' || at.plural !== 'pods' || at.subresource !== 'log' || at.namespace === undefined || !path?.toString().startsWith('/api/v1/'))
    return "a log's path is a pod's log, without a query (/api/v1/namespaces/<namespace>/pods/<name>/log)";
  if (!isRecord(log)) return 'a log is { container?, previous?, follow?, sinceTime?, tailLines? }';
  const wrong = Object.keys(log).find((k) => !LOG_KEYS.has(k));
  if (wrong !== undefined) return `a log has no ${wrong.slice(0, 64)}`;
  const { container, previous, follow, sinceTime, tailLines } = log;
  if (container !== undefined && !(typeof container === 'string' && CONTAINER.test(container))) return "a container's name is a DNS label";
  if ((previous !== undefined && typeof previous !== 'boolean') || (follow !== undefined && typeof follow !== 'boolean')) return 'previous and follow are true or false';
  if (sinceTime !== undefined && !(typeof sinceTime === 'string' && LOG_TIME.test(sinceTime))) return 'a sinceTime is RFC 3339 (2026-10-17T09:30:00Z)';
  if (tailLines !== undefined && !isCount(tailLines)) return 'tailLines is a whole number, 0 or more';
  return undefined;
}

/** A stream changed while it is open: subscriptions added and removed. */
export class Changing extends Stream {
  readonly name = randomUUID();
  private readonly subscriptions = new Map<string, Feed>();
  private readonly streams: Streams;
  /** Whose it is: the one signed in who opened it ('': no one is). */
  readonly owner: string;

  constructor(res: ServerResponse, settings: Settings, streams: Streams, owner: string) {
    super(res, settings);
    this.streams = streams;
    this.owner = owner;
    streams.set(this.name, this);
    this.send({ type: 'HELLO', stream: this.name });
  }

  protected override close(): void {
    super.close();
    this.streams.delete(this.name);
  }

  /** The removed, then the added — all or, why not, none. */
  change(body: unknown): Wrong | undefined {
    const bad = (message: string, f?: string): Wrong => ({ status: 400, code: 'bad_stream', message, f });
    if (!isRecord(body) || Object.keys(body).some((k) => k !== 'add' && k !== 'remove')) return bad('a change is { add?, remove? }');
    const { add = [], remove = [] } = body as StreamChange;
    if (!Array.isArray(remove) || !remove.every((id) => typeof id === 'string')) return bad('remove is ids');
    if (!Array.isArray(add) || add.length > STREAM.subscriptions) return bad(`add is at most ${STREAM.subscriptions} subscriptions`);
    const removed = new Set(remove);
    const added = new Set<string>();
    for (const sub of add) {
      const wrong = check(sub);
      if (wrong) return bad(wrong, isRecord(sub) && typeof sub.id === 'string' ? sub.id.slice(0, STREAM.idLength) : undefined);
      if (added.has(sub.id) || (this.subscriptions.has(sub.id) && !removed.has(sub.id))) return bad(`${sub.id} is subscribed already`, sub.id);
      added.add(sub.id);
    }
    const going = [...removed].filter((id) => this.subscriptions.has(id));
    if (this.subscriptions.size - going.length + add.length > STREAM.subscriptions) return bad(`at most ${STREAM.subscriptions} subscriptions in one stream`);
    // What the removed hold counts for nothing: they go first.
    const freed = going.filter((id) => !this.subscriptions.get(id)?.stopped).length;
    const full = overBudget(this.settings, add.length - freed);
    if (full) return { status: 503, code: 'too_many_watches', message: full };

    for (const id of going) {
      const c = this.subscriptions.get(id) as Feed;
      this.subscriptions.delete(id);
      c.stop();
      this.channels.delete(c);
      this.send({ f: id, type: 'REMOVED' });
    }
    // Its client let go while being told (too slow): nothing more is opened.
    if (!this.open) return gone(this.name);
    const made = add.map(
      (sub): Feed =>
        'log' in sub
          ? new LogFeed({ id: sub.id, path: sub.path, query: sub.log }, { f: sub.id }, this, this.settings)
          : new Channel(this.spec(sub), { f: sub.id }, this, this.settings),
    );
    for (const c of made) this.subscriptions.set(c.id, c);
    this.begin(made);
    return undefined;
  }

  /** A subscription's watch. */
  private spec(sub: Subscription): Spec {
    const selectors = new URLSearchParams();
    if (sub.labelSelector) selectors.set('labelSelector', sub.labelSelector);
    if (sub.fieldSelector) selectors.set('fieldSelector', sub.fieldSelector);
    return { id: sub.id, path: sub.path, selectors, resourceVersion: sub.resourceVersion ?? '', ...(sub.projection === 'metadata' ? { accept: METADATA } : {}) };
  }
}
