import { createReadStream, realpathSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { createGateway, fromKubeconfig, inCluster, kubeState, type UpstreamSource } from '@overkube/gateway';
import { nameOf, signIn } from './auth.ts';
import type { Config } from './config.ts';
import { listening } from './listen.ts';

/*
 * overkube's own server: the gateway under its prefix, signing in at /auth
 * (auth.ts: who the gateway acts as), the page at / (its built folder, any
 * path not a file answered with index.html: the page routes itself), and
 * health for whoever runs it — /healthz (the process answers), /readyz
 * (the cluster does: yes or no, nothing more). Over HTTPS when it has a
 * certificate (plain HTTP on its port sent there: listen.ts). The page
 * reaches nothing but its own origin (its CSP: no script, style, image,
 * font or request from elsewhere, none inline; framed by none but itself).
 */

export interface Running {
  /** Where it listens: http://127.0.0.1:8080, https://… with a certificate. */
  url: string;
  /** Stop taking requests, end those open (watches go on forever) after a grace. */
  close(graceMs?: number): Promise<void>;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** Over the page and its files: its own origin only (styles the kit sets in code — a constructed sheet, an element's style — are not inline markup), never sniffed, no referrer, not framed by another site, isolated from other windows. */
export const PAGE_HEADERS = {
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
} as const;

export function upstreamOf(config: Config): UpstreamSource {
  return config.cluster.from === 'in-cluster' ? inCluster() : fromKubeconfig(config.cluster.path);
}

/** Whether a path is the folder or in it. */
const inside = (dir: string, file: string) => file === dir || file.startsWith(dir.endsWith(sep) ? dir : dir + sep);

/**
 * A file of the page's folder, or its index.html for a path that is none
 * (the page's own routes). Nothing outside the folder (a link inside it
 * pointing out of it either), no hidden file; a file that cannot be read
 * answers 404 or 500 — never a server brought down.
 */
function page(dir: string, req: IncomingMessage, res: ServerResponse): void {
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://page').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = normalize(join(dir, path));
  if (!inside(dir, file) || path.split('/').some((part) => part.startsWith('.'))) {
    res.writeHead(404).end();
    return;
  }
  const index = join(dir, 'index.html');
  let target = index;
  try {
    const real = realpathSync(file);
    if (inside(dir, real) && statSync(real).isFile()) target = real;
    else if (!inside(dir, real)) {
      res.writeHead(404).end();
      return;
    }
  } catch {
    // not a file: the page's own route
  }
  const stream = createReadStream(target);
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (res.headersSent) res.destroy();
    else res.writeHead(err.code === 'ENOENT' ? 404 : 500).end();
  });
  stream.on('open', () => {
    res.writeHead(200, {
      'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
      // The index is asked for again each time (it names the assets of this build); the assets may be kept.
      'cache-control': target === index ? 'no-cache' : 'public, max-age=3600',
      ...PAGE_HEADERS,
    });
    if (req.method === 'HEAD') {
      stream.destroy();
      res.end();
    } else pipeline(stream, res, () => {});
  });
  res.on('close', () => stream.destroy());
}

export function startServer(config: Config, options: { version?: string; log?: (message: string) => void } = {}): Promise<Running> {
  const log = options.log ?? ((m: string) => console.log(`[overkube] ${m}`));
  const upstream = upstreamOf(config);
  // Signing in (its sessions ending their streams: gateway.close(who)), then the gateway acting as whoever is signed in.
  const auth = signIn(config, upstream, (who) => gateway.close(who), log);
  const gateway = createGateway({ upstream, prefix: config.prefix, readOnly: config.readOnly, version: options.version, ...(auth.identify ? { identify: auth.identify } : {}) });
  // The folder where it really is: a request's file is checked against it, links resolved.
  const ui = config.ui ? realpathSync(config.ui) : undefined;

  /** Health: anyone's to ask, by any name, over plain HTTP too. */
  const health = (path: string, res: ServerResponse) => {
    if (path === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return true;
    }
    if (path !== '/readyz') return false;
    // Whether the cluster answers, not what it says (its version, its errors).
    void kubeState(upstream, 2000).then((kube) => {
      res.writeHead(kube.reachable ? 200 : 503, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end(kube.reachable ? 'ok' : 'not ready');
    });
    return true;
  };
  /** Asked for by another name (a DNS rebinding: another site's name made to point here): refused. */
  const named = (req: IncomingMessage, res: ServerResponse) => {
    if (config.hosts.includes(nameOf(req))) return true;
    res.writeHead(421, { 'content-type': 'text/plain' }).end('overkube: not served by that name (OVERKUBE_HOSTS)');
    return false;
  };

  const listener = listening(
    (req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      // Its own certificate: browsers told to come back over HTTPS only (one with an untrusted certificate ignores it).
      if (typeof config.tls === 'object') res.setHeader('strict-transport-security', 'max-age=31536000');
      if (health(path, res) || !named(req, res) || auth.handle(req, res) || gateway.handle(req, res)) return;
      if (ui && (req.method === 'GET' || req.method === 'HEAD')) return page(ui, req, res);
      res.writeHead(404, { 'content-type': 'text/plain' }).end(ui ? 'not found' : `overkube: no page here (OVERKUBE_UI); the gateway is at ${config.prefix}`);
    },
    // Plain HTTP beside HTTPS: health, else sent to HTTPS (by a name of its own only).
    (req, res) => {
      if (health((req.url ?? '/').split('?')[0], res) || !named(req, res)) return;
      res.writeHead(308, { location: `https://${req.headers.host}${req.url ?? '/'}` }).end();
    },
    typeof config.tls === 'object' ? config.tls : undefined,
  );
  const { server } = listener;

  return new Promise((ready, failed) => {
    server.once('error', failed);
    server.listen(config.port, config.host, () => {
      const { port } = server.address() as AddressInfo;
      const host = config.host.includes(':') ? `[${config.host}]` : config.host;
      const url = `${typeof config.tls === 'object' ? 'https' : 'http'}://${host}:${port}`;
      const cluster = config.cluster.from === 'in-cluster' ? 'its ServiceAccount (in the cluster)' : `the kubeconfig ${config.cluster.path}`;
      const who = config.auth.mode === 'loopback' ? 'no one signs in (this machine only)' : `one signs in with ${config.auth.mode}`;
      log(`listening on ${url}; the gateway at ${config.prefix}, the cluster reached with ${cluster}${config.readOnly ? ', read only' : ''}; ${who}`);
      ready({
        url,
        close: (graceMs = 5000) =>
          new Promise<void>((done) => {
            // Its watches told (CLOSE: shutdown) and ended first: what is still open after the grace is cut.
            gateway.close();
            auth.close();
            const cut = setTimeout(() => listener.closeAll(), graceMs);
            server.close(() => {
              clearTimeout(cut);
              done();
            });
            listener.closeIdle();
          }),
      });
    });
  });
}
