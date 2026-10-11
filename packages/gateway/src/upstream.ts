import { readFileSync, statSync } from 'node:fs';
import { type ClientRequest, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';
import { readKubeconfig, type Upstream } from './kubeconfig.ts';
import type { ErrorCode } from './protocol.ts';

/**
 * Where the API server is and how to prove who we are to it, asked for on
 * every request (so a rotated token or certificate is taken at once): from
 * a kubeconfig, from the pod's own ServiceAccount, or from whatever the host
 * makes it of. Throws when there is none (no cluster yet).
 */
export type UpstreamSource = () => Upstream;

/** The API server and credentials of a kubeconfig's current context, read again when it (or a file it names) changes. */
export function fromKubeconfig(file: string): UpstreamSource {
  return () => readKubeconfig(file);
}

/** Where a pod's ServiceAccount is mounted. */
const SERVICE_ACCOUNT = '/var/run/secrets/kubernetes.io/serviceaccount';

/**
 * The API server and credentials a pod has of its ServiceAccount, as
 * client-go's in-cluster config: the KUBERNETES_SERVICE_HOST and _PORT the
 * kubelet sets, the mounted CA and token — the token read again when it is
 * rotated (projected tokens are, hourly).
 */
export function inCluster(options: { dir?: string; host?: string; port?: string } = {}): UpstreamSource {
  const dir = options.dir ?? SERVICE_ACCOUNT;
  let kept: { seen: string; upstream: Upstream } | null = null;
  return () => {
    const host = options.host ?? process.env.KUBERNETES_SERVICE_HOST;
    const port = options.port ?? process.env.KUBERNETES_SERVICE_PORT;
    if (!host || !port) throw new Error('not in a cluster: KUBERNETES_SERVICE_HOST and KUBERNETES_SERVICE_PORT are not set');
    const tokenFile = join(dir, 'token');
    const caFile = join(dir, 'ca.crt');
    // Both read again when either is rotated (throws: no ServiceAccount mounted).
    const seen = [tokenFile, caFile]
      .map((f) => {
        const s = statSync(f);
        return `${s.mtimeMs}:${s.size}`;
      })
      .join('|');
    if (kept?.seen === seen) return kept.upstream;
    const server = `https://${host.includes(':') ? `[${host}]` : host}:${port}`;
    const upstream: Upstream = { server, ca: readFileSync(caFile), token: readFileSync(tokenFile, 'utf8').trim() };
    kept = { seen, upstream };
    return upstream;
  };
}

export interface UpstreamRequest {
  method: string;
  /** The API server's path and query: /api/v1/pods?watch=1. */
  path: string;
  headers?: Record<string, string>;
  /** Text, or bytes passed on as they are (a protobuf body). */
  body?: string | Buffer;
  /** Given up when the API server has not been reached in this long. */
  connectTimeoutMs?: number;
  /** Given up when nothing has come for this long once connected; none for a stream (a watch, a followed log). */
  idleTimeoutMs?: number;
}

/**
 * Start a request to the API server with the source's address and
 * credentials. Throws when there is none (no cluster yet); errors on the
 * way, timeouts included (code ETIMEDOUT), come as the request's "error"
 * event.
 */
export function openUpstream(req: UpstreamRequest, source: UpstreamSource, onResponse: (answer: IncomingMessage) => void): ClientRequest {
  const upstream = source();
  const headers = { ...req.headers };
  if (upstream.token) headers.authorization = `Bearer ${upstream.token}`;
  if (req.body !== undefined) {
    headers['content-type'] ??= 'application/json';
    headers['content-length'] = String(Buffer.byteLength(req.body));
  }
  const server = new URL(upstream.server);
  const request = server.protocol === 'http:' ? httpRequest : httpsRequest;
  const out = request(
    {
      // An IPv6 address without its brackets: with them, Node looks it up as a name.
      host: server.hostname.replace(/^\[|\]$/g, ''),
      port: server.port || (server.protocol === 'http:' ? 80 : 443),
      method: req.method,
      path: server.pathname.replace(/\/$/, '') + req.path,
      headers,
      ca: upstream.ca,
      cert: upstream.cert,
      key: upstream.key,
      // The kubeconfig's tls-server-name: the name the API server's certificate is checked against.
      ...(upstream.serverName ? { servername: upstream.serverName } : {}),
      // The kubeconfig's insecure-skip-tls-verify, as kubectl takes it.
      ...(upstream.insecure ? { rejectUnauthorized: false } : {}),
    },
    (answer) => {
      clearTimeout(connecting);
      onResponse(answer);
    },
  );
  const timedOut = (what: string) => {
    const err: NodeJS.ErrnoException = new Error(`the API server ${what}`);
    err.code = 'ETIMEDOUT';
    out.destroy(err);
  };
  const connecting = setTimeout(() => timedOut('could not be reached in time'), req.connectTimeoutMs ?? 10_000);
  out.on('close', () => clearTimeout(connecting));
  if (req.idleTimeoutMs) out.setTimeout(req.idleTimeoutMs, () => timedOut('stopped answering'));
  if (req.body !== undefined) out.write(req.body);
  out.end();
  return out;
}

/** Whether a request error means the API server is not there (rather than something odder). */
export function isDown(err: NodeJS.ErrnoException): boolean {
  return err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
}

/** The gateway's own error answer: { error: { code, message } }. */
export function fail(res: ServerResponse, status: number, code: ErrorCode, message: string, more: { w?: string } = {}): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { code, message, ...more } }));
}
