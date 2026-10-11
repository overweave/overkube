import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { createGateway, fromKubeconfig, inCluster, kubeState, type UpstreamSource } from '@overkube/gateway';
import { type Config, isLoopback } from './config.ts';

/*
 * overkube's own server: the gateway under its prefix, the page at / (its
 * built folder, any path not a file answered with index.html: the page
 * routes itself), and health for whoever runs it — /healthz (the process
 * answers), /readyz (the cluster does). No sign-in of its own yet: on any
 * address but this machine's it says so, loudly.
 */

export interface Running {
  /** Where it listens: http://127.0.0.1:8080. */
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
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      stream.destroy();
      res.end();
    } else pipeline(stream, res, () => {});
  });
  res.on('close', () => stream.destroy());
}

/** The name a request reached it by: its Host, port and brackets left out. */
function nameOf(req: IncomingMessage): string {
  const host = (req.headers.host ?? '').toLowerCase();
  return host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d+$/, '');
}

export function startServer(config: Config, options: { version?: string; log?: (message: string) => void } = {}): Promise<Running> {
  const log = options.log ?? ((m: string) => console.log(`[overkube] ${m}`));
  const upstream = upstreamOf(config);
  const gateway = createGateway({ upstream, prefix: config.prefix, readOnly: config.readOnly, version: options.version });
  // The folder where it really is: a request's file is checked against it, links resolved.
  const ui = config.ui ? realpathSync(config.ui) : undefined;

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    // Asked for by another name (a DNS rebinding: another site's name made to point here): refused — health is anyone's.
    if (config.hosts && path !== '/healthz' && path !== '/readyz' && !config.hosts.includes(nameOf(req))) {
      res.writeHead(421, { 'content-type': 'text/plain' }).end('overkube: not served by that name (OVERKUBE_HOSTS)');
      return;
    }
    if (path === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (path === '/readyz') {
      void kubeState(upstream, 2000).then((kube) => {
        res.writeHead(kube.reachable ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(kube));
      });
      return;
    }
    if (gateway.handle(req, res)) return;
    if (ui && (req.method === 'GET' || req.method === 'HEAD')) {
      page(ui, req, res);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end(ui ? 'not found' : `overkube: no page here (OVERKUBE_UI); the gateway is at ${config.prefix}`);
  });

  return new Promise((ready, failed) => {
    server.once('error', failed);
    server.listen(config.port, config.host, () => {
      const { port } = server.address() as AddressInfo;
      const host = config.host.includes(':') ? `[${config.host}]` : config.host;
      const url = `http://${host}:${port}`;
      const cluster = config.cluster.from === 'in-cluster' ? 'its ServiceAccount (in the cluster)' : `the kubeconfig ${config.cluster.path}`;
      log(`listening on ${url}; the gateway at ${config.prefix}, the cluster reached with ${cluster}${config.readOnly ? ', read only' : ''}`);
      if (!isLoopback(config.host) && !config.trustNetwork) {
        log(
          `WARNING: listening on ${config.host} with no sign-in: anyone who reaches it ${config.readOnly ? 'reads' : 'reads and changes'} the cluster with its credentials. Put it behind a proxy that signs people in, or set OVERKUBE_HOST=127.0.0.1 (OVERKUBE_TRUST_NETWORK=true where its network is trusted).`,
        );
      }
      ready({
        url,
        close: (graceMs = 5000) =>
          new Promise<void>((done) => {
            // Its watches told (CLOSE: shutdown) and ended first: what is still open after the grace is cut.
            gateway.close();
            const cut = setTimeout(() => server.closeAllConnections(), graceMs);
            server.close(() => {
              clearTimeout(cut);
              done();
            });
            server.closeIdleConnections();
          }),
      });
    });
  });
}
