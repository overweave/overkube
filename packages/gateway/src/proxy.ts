import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { classify, splitQuery } from './paths.ts';
import { fail, isDown, openUpstream, type UpstreamRequest, type UpstreamSource } from './upstream.ts';
import { reserveChannel } from './watch.ts';

/** PATCH has a place of its own (patch.ts): the page sends JSON only. HEAD is answered as GET without the body. */
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE']);

/** Request headers passed to the API server; everything else (cookies, tokens) stays here. */
const PASS_REQUEST = ['content-type', 'accept'];

/** Response headers passed back to the client: what the answer is, how long to wait (429), what is deprecated. */
const PASS_RESPONSE = ['content-type', 'cache-control', 'content-length', 'retry-after', 'warning', 'audit-id'];

/**
 * Over every answer passed back: never taken for something it does not say
 * it is, nothing in it run as a page of the dashboard's origin (an
 * aggregated API answering HTML), and kept by no cache unless the API server
 * says it may be (Secrets are among what passes).
 */
const HARDENING = { 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox' };

/** An answer with nothing coming for this long is given up (not a stream's: a watch, a followed log). */
const IDLE_TIMEOUT_MS = 60_000;

export interface ProxyRequest {
  method: string;
  /** The API server's path and query, as the client asked for it (the gateway's prefix taken off): /api/v1/…?… */
  url: string;
  headers: IncomingHttpHeaders;
  /** The body: raw text or bytes (passed on as they are), an already parsed JSON value, or nothing. */
  body?: unknown;
}

export interface ProxyOptions {
  upstream: UpstreamSource;
  /** The budget of watches a followed log counts in (watch.ts's). */
  maxChannels?: number;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
}

/**
 * Forward one request to the Kubernetes API server and stream its answer
 * back unchanged — status, headers, body; a watch or a followed log simply
 * goes on.
 */
export function proxy(req: ProxyRequest, res: ServerResponse, options: ProxyOptions): void {
  const method = req.method.toUpperCase();
  const path = req.url;
  const [pathname, query] = splitQuery(path);
  if (!METHODS.has(method)) {
    fail(res, 405, 'bad_method', method === 'PATCH' ? 'PATCH goes through /patch, as JSON' : `method ${req.method} is not allowed`);
    return;
  }
  if (!classify(pathname)) {
    fail(res, 400, 'bad_path', `path ${pathname} is not a Kubernetes API path the gateway passes on`);
    return;
  }

  const headers: Record<string, string> = {};
  for (const name of PASS_REQUEST) {
    const v = req.headers[name];
    if (typeof v === 'string') headers[name] = v;
  }
  const params = new URLSearchParams(query);
  // A watch goes through /stream (its limits, its slow-client rules), never as it is.
  if (truthy(params.get('watch'))) {
    fail(res, 400, 'bad_stream', 'a watch goes through /stream');
    return;
  }
  // A followed log streams for as long as it is read: one place in the budget of watches while it does.
  const streaming = truthy(params.get('follow'));
  let release: (() => void) | null = null;
  if (streaming) {
    release = reserveChannel(options.maxChannels);
    if (!release) {
      fail(res, 503, 'too_many_watches', 'too many streams are open');
      return;
    }
    res.on('close', release);
  }
  relay(
    {
      method: method === 'HEAD' ? 'GET' : method,
      path,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : encodeBody(req.body),
      connectTimeoutMs: options.connectTimeoutMs,
      idleTimeoutMs: streaming ? undefined : (options.idleTimeoutMs ?? IDLE_TIMEOUT_MS),
    },
    res,
    { upstream: options.upstream, head: method === 'HEAD', streaming },
  );
}

/** A query flag as the API server reads it (Go's ParseBool): 1, t, T, true, TRUE, True. */
function truthy(value: string | null): boolean {
  return value !== null && ['1', 't', 'T', 'true', 'TRUE', 'True'].includes(value);
}

/**
 * Send a request to the API server and its answer back to the client as it
 * comes: status, the headers worth passing, the body (none for HEAD). When
 * the client goes away the upstream request is dropped too; when the API
 * server breaks off, so is the client's answer, rather than hang half-done.
 */
export function relay(request: UpstreamRequest, res: ServerResponse, options: { upstream: UpstreamSource; head?: boolean; streaming?: boolean }): void {
  let out: ReturnType<typeof openUpstream>;
  try {
    out = openUpstream(request, options.upstream, (answer: IncomingMessage) => {
      const back: Record<string, string> = {};
      for (const name of PASS_RESPONSE) {
        const v = answer.headers[name];
        if (typeof v === 'string') back[name] = v;
      }
      // A stream (a followed log): an nginx in front passes each piece on at once.
      if (options.streaming) back['x-accel-buffering'] = 'no';
      res.writeHead(answer.statusCode ?? 502, { ...HARDENING, 'cache-control': 'no-store', ...back });
      if (options.head) {
        answer.resume();
        res.end();
        return;
      }
      answer.on('close', () => {
        if (!answer.complete) res.destroy();
      });
      answer.pipe(res);
    });
  } catch (err) {
    // Node's own refusal of what was asked (a character a path may not hold) is the request's fault, not the cluster's.
    const code = (err as NodeJS.ErrnoException).code;
    if (code?.startsWith('ERR_')) fail(res, 400, 'bad_path', `the request cannot be passed on: ${(err as Error).message}`);
    else fail(res, 503, 'kube_down', `no cluster to reach: ${(err as Error).message}`);
    return;
  }
  out.on('error', (err: NodeJS.ErrnoException) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (err.code === 'ETIMEDOUT') fail(res, 504, 'kube_timeout', err.message);
    else if (isDown(err)) fail(res, 503, 'kube_down', 'the Kubernetes API server is not answering');
    else fail(res, 502, 'kube_error', err.message);
  });
  res.on('close', () => out.destroy());
}

function encodeBody(body: unknown): string | Buffer | undefined {
  if (body === undefined || body === null || body === '') return undefined;
  if (typeof body === 'string') return body;
  // Bytes as they are: a protobuf body is not text.
  if (Buffer.isBuffer(body)) return body.length ? body : undefined;
  return JSON.stringify(body);
}
