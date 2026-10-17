import { readFileSync, statSync } from 'node:fs';
import { createServer, type RequestListener, type Server } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createNetServer, type Server as NetServer, type Socket } from 'node:net';

/*
 * Where the server listens: plain HTTP; or, with a certificate, HTTPS and
 * plain HTTP on one port — each connection told apart by its first byte
 * (a TLS handshake's: 0x16), the plain one answered by its own listener
 * (sent to HTTPS, health aside). A connection that says nothing for
 * FIRST_BYTE_MS is cut (until it is handed over, no HTTP or TLS timeout
 * watches it); those not handed over yet are cut as idle on close, and
 * every one (a TLS handshake begun and left among them) once the grace is
 * over.
 * The certificate's files read again when they change (a renewed one taken
 * at the next connection).
 */

export interface Listening {
  /** What listens: its address, its close. */
  readonly server: NetServer;
  /** Connections with nothing under way, ended now; all of them. */
  closeIdle(): void;
  closeAll(): void;
}

/** Look at the certificate's files at most this often. */
const LOOK_MS = 5000;
/** How long a connection may say nothing before it is told apart. */
const FIRST_BYTE_MS = 10_000;

export function listening(secure: RequestListener, plain: RequestListener, tls?: { cert: string; key: string }): Listening {
  if (!tls) {
    const server = createServer(secure);
    return { server, closeIdle: () => server.closeIdleConnections(), closeAll: () => server.closeAllConnections() };
  }
  const read = () => ({ cert: readFileSync(tls.cert), key: readFileSync(tls.key) });
  const stamp = () => [tls.cert, tls.key].map((f) => statSync(f, { throwIfNoEntry: false })?.mtimeMs ?? 0).join();
  let seen = stamp();
  let looked = Date.now();
  const https = createHttpsServer(read(), secure);
  const http = createServer(plain);
  const servers: Server[] = [https, http];
  /** Connections not told apart yet: no server of the two has them. */
  const waiting = new Set<Socket>();
  /** Every connection, till it closes: one handed over whose TLS handshake never ends is not the servers' to close. */
  const sockets = new Set<Socket>();

  /** A renewed certificate taken; one half written (unreadable, unmatched): the last one kept until it is whole. */
  const renewed = () => {
    if (Date.now() - looked < LOOK_MS) return;
    looked = Date.now();
    const now = stamp();
    if (now === seen) return;
    try {
      https.setSecureContext(read());
      seen = now;
    } catch {}
  };

  const server = createNetServer((socket) => {
    waiting.add(socket);
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.once('close', () => {
      waiting.delete(socket);
      sockets.delete(socket);
    });
    socket.setTimeout(FIRST_BYTE_MS, () => socket.destroy());
    socket.once('data', (first) => {
      waiting.delete(socket);
      socket.setTimeout(0);
      if (first[0] === 0x16) renewed();
      socket.pause();
      socket.unshift(first);
      (first[0] === 0x16 ? https : http).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
  });
  return {
    server,
    closeIdle: () => {
      for (const s of waiting) s.destroy();
      for (const s of servers) s.closeIdleConnections();
    },
    closeAll: () => {
      for (const s of servers) s.closeAllConnections();
      for (const s of sockets) s.destroy();
    },
  };
}
