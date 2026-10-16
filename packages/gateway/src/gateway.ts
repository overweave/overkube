import type { IncomingMessage, ServerResponse } from 'node:http';
import { patch } from './patch.ts';
import { proxy } from './proxy.ts';
import { status } from './status.ts';
import { change, type Streams, stream } from './stream.ts';
import { fail, type UpstreamSource } from './upstream.ts';
import type { WatchOptions } from './watch.ts';

/*
 * The gateway: the page's way to a Kubernetes cluster, as one handler over
 * Node's own request and response — so any host takes it as it is: a plain
 * node:http server, a framework's route (Fastify's req.raw and reply.raw,
 * Express's req and res), a platform's plugin. Under its prefix:
 *
 *   GET  /stream   several watches over one stream, changed while it is open; POST /stream/<name> changes it (stream.ts)
 *   GET  /status   its version and whether the cluster answers (status.ts)
 *   POST /patch    changes, as JSON (patch.ts)
 *   /**            the API server's /api, /apis, /version, /openapi/v3, passed on (proxy.ts) — never a watch (/stream is)
 *
 * Who may use it is the host's to decide before it hands a request over
 * (a session, an API key, a proxy in front). What the gateway itself holds
 * to: the paths it never passes on (paths.ts); read only, nothing that
 * changes the cluster; and no page of another site using it through its
 * visitor's browser — a request another site's page sends (Sec-Fetch-Site:
 * cross-site, an Origin not its own) is refused, and anything but a read
 * must carry the gateway's header (x-overkube), which a page of another
 * origin cannot set without the gateway agreeing to it (it never does).
 */

export interface GatewayOptions {
  /** How the cluster is reached: fromKubeconfig(path), inCluster(), or the host's own. */
  upstream: UpstreamSource;
  /** The path it is served under: '' (the root), '/kube', a platform's own. */
  prefix?: string;
  /** Nothing that changes the cluster: only GET and HEAD (and asking what one may do: self subject reviews), no /patch (403 read_only). */
  readOnly?: boolean;
  /** Its version, as /status tells it. */
  version?: string;
  /** Who changes are made as, unless a /patch says (default: overkube). */
  fieldManager?: string;
  /** The largest request body taken (default 10 MiB; 413 too_large), the host's too. */
  maxBodyBytes?: number;
  /**
   * The header anything but a read must carry (default x-overkube; its value
   * any). false: none — only for a host that keeps other sites' pages out
   * itself (a platform's own CSRF token).
   */
  header?: string | false;
  /** The watches' (a /stream's) limits and timings. */
  stream?: Omit<WatchOptions, 'upstream' | 'streams'>;
}

/** What a host hands a request it has already read the body of (a framework that parses it). */
export interface Given {
  /** The body as the host has it: text or bytes (passed on as they are), or a parsed JSON value. */
  body?: unknown;
}

export interface Gateway {
  /**
   * Answer a request under the prefix, and say so: false — it is not the
   * gateway's (the host's own page, its assets), and nothing was written.
   * A host that reads bodies itself gives the body ({ body }); one that does
   * not leaves the request unread.
   */
  handle(req: IncomingMessage, res: ServerResponse, given?: Given): boolean;
  /** Its streams told CLOSE (shutdown) and ended: the host is stopping. */
  close(): void;
}

const READING = new Set(['GET', 'HEAD']);

/** What a user may do, asked (a POST that changes nothing): read only or not. */
const REVIEWS = /^\/apis\/authorization\.k8s\.io\/v1\/selfsubject(access|rules)reviews$/;
const STREAM_CHANGE = /^\/stream\/([^/]+)$/;

/** A body's size in bytes, as it would be passed on. */
function sizeOf(body: unknown): number {
  if (body === undefined || body === null) return 0;
  if (typeof body === 'string') return Buffer.byteLength(body);
  if (Buffer.isBuffer(body)) return body.length;
  return Buffer.byteLength(JSON.stringify(body) ?? '');
}

export function createGateway(options: GatewayOptions): Gateway {
  const prefix = `/${(options.prefix ?? '').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
  const maxBodyBytes = options.maxBodyBytes ?? 10 * 1024 * 1024;
  const header = options.header === undefined ? 'x-overkube' : options.header;
  const { upstream } = options;
  const streams = new Set<{ shutdown(): void }>();
  const changing: Streams = new Map();

  /** Whether another site's page sent it, through its visitor's browser. */
  const crossSite = (req: IncomingMessage) => {
    if (req.headers['sec-fetch-site'] === 'cross-site') return true;
    const origin = req.headers.origin;
    if (!origin || origin === 'null') return origin === 'null';
    try {
      return new URL(origin).host !== req.headers.host;
    } catch {
      return true;
    }
  };

  /** The body: the one the host gives (checked as one read), or read off the request (at most maxBodyBytes). */
  const bodyOf = (req: IncomingMessage, res: ServerResponse, given: Given | undefined, then: (body: unknown) => void) => {
    if (given && 'body' in given) {
      if (sizeOf(given.body) > maxBodyBytes) return fail(res, 413, 'too_large', `a body of more than ${maxBodyBytes} bytes`);
      return then(given.body);
    }
    if (Number(req.headers['content-length']) > maxBodyBytes) return fail(res, 413, 'too_large', `a body of more than ${maxBodyBytes} bytes`);
    // Read already, and not given: what was in it is gone — said, rather than waited for forever.
    if (req.readableEnded) return fail(res, 500, 'bad_body', 'the host read the body already: give it to the gateway ({ body })');
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk: Buffer) => {
      if (over) return;
      size += chunk.length;
      if (size > maxBodyBytes) {
        over = true;
        fail(res, 413, 'too_large', `a body of more than ${maxBodyBytes} bytes`);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', () => res.destroy());
    req.on('end', () => {
      if (!over) then(Buffer.concat(chunks));
    });
  };

  /** The body as JSON: application/json (or parsed by the host), else refused. */
  const jsonOf = (req: IncomingMessage, res: ServerResponse, given: Given | undefined, route: string, then: (body: unknown) => void) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '') && !(given && 'body' in given && typeof given.body === 'object' && !Buffer.isBuffer(given.body))) {
      fail(res, 415, 'bad_body', `a ${route} is sent as application/json`);
      return;
    }
    bodyOf(req, res, given, (body) => {
      if (typeof body !== 'string' && !Buffer.isBuffer(body)) return then(body);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.toString());
      } catch {
        fail(res, 400, 'bad_body', 'the body is not JSON');
        return;
      }
      then(parsed);
    });
  };

  return {
    handle(req, res, given) {
      const url = req.url ?? '/';
      if (prefix && url !== prefix && !url.startsWith(`${prefix}/`) && !url.startsWith(`${prefix}?`)) return false;
      // Its client gone already (while its host decided): nothing to answer, nothing to open.
      if (res.destroyed || res.writableEnded) return true;
      const rest = url.slice(prefix.length) || '/';
      const route = rest.split('?')[0];
      const method = (req.method ?? 'GET').toUpperCase();
      const reading = READING.has(method);

      if (crossSite(req)) {
        fail(res, 403, 'cross_site', 'a page of another site may not use the gateway');
        return true;
      }
      if (!reading && header && req.headers[header] === undefined) {
        fail(res, 403, 'cross_site', `a request that is not a read carries the ${header} header`);
        return true;
      }
      if (route === '/status' || route === '/stream') {
        if (method !== 'GET') {
          fail(res, 405, 'bad_method', `${route} is asked with GET`);
          return true;
        }
        if (route === '/stream') stream(res, { ...options.stream, upstream, streams }, changing);
        else void status(res, { upstream, version: options.version });
        return true;
      }
      const changed = STREAM_CHANGE.exec(route);
      if (changed) {
        if (method !== 'POST') {
          fail(res, 405, 'bad_method', '/stream/<name> is asked with POST');
          return true;
        }
        jsonOf(req, res, given, '/stream change', (body) => change(changed[1], body, res, changing));
        return true;
      }
      if (options.readOnly && !reading && !(method === 'POST' && REVIEWS.test(route))) {
        fail(res, 403, 'read_only', 'the gateway is read only: nothing that changes the cluster');
        return true;
      }
      if (route === '/patch') {
        if (method !== 'POST') {
          fail(res, 405, 'bad_method', '/patch is asked with POST');
          return true;
        }
        jsonOf(req, res, given, '/patch', (body) => patch({ body }, res, { upstream, fieldManager: options.fieldManager }));
        return true;
      }
      const pass = (body?: unknown) => proxy({ method, url: rest, headers: req.headers, body }, res, { upstream });
      if (reading) pass();
      else bodyOf(req, res, given, pass);
      return true;
    },
    close() {
      for (const s of [...streams]) s.shutdown();
    },
  };
}
