import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Identity } from '@overkube/gateway';

/*
 * Who is signed in: sessions kept in memory only (a restart signs everyone
 * out; a token given is never written anywhere), each one's id in a cookie
 * the page's scripts cannot read (HttpOnly), sent only over HTTPS (Secure;
 * this machine's http://localhost too) and only by the page itself
 * (SameSite=Strict: no other site's page or link carries it). A session
 * ends when it is due (its token's end, or so many hours on), when signed
 * out, when the same browser signs in again (its session before, told by
 * its cookie — an OIDC sign-in's, at its start), or when there are too many
 * (of one, of all: the oldest first) — then it is told (ended): its
 * streams are ended too.
 */

/** The session's cookie: __Host- — set by this origin alone, for its every path, over HTTPS. */
export const COOKIE = '__Host-overkube';
/** So many sessions of one at most (their browsers, their tabs' sign-ins): the oldest ends. */
const PER_ONE = 10;
/** So many sessions in all at most: the oldest ends. */
const IN_ALL = 10_000;

interface Session {
  who: Identity;
  /** When it ends (ms). */
  until: number;
}

/** A request's cookie by name, if it has one (the first, if several). */
export function cookieOf(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

/** A cookie set, as this page's alone: HttpOnly, Secure, for every path; SameSite as said; for so many seconds (0: taken away). */
export function setCookie(name: string, value: string, seconds: number, sameSite: 'Strict' | 'Lax' = 'Strict'): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${Math.max(0, Math.floor(seconds))}`;
}

export class Sessions {
  /** By id, the oldest first. */
  private readonly all = new Map<string, Session>();
  private readonly sweeping: ReturnType<typeof setInterval>;
  private readonly ended: (who: Identity) => void;

  /** ended: a session is over (due, signed out, put aside) — what was opened in its name is to be ended. */
  constructor(ended: (who: Identity) => void) {
    this.ended = ended;
    // Those due, ended even when no request asks for them (their streams are still open).
    this.sweeping = setInterval(() => {
      for (const [id, s] of this.all) if (s.until <= Date.now()) this.end(id);
    }, 30_000);
    this.sweeping.unref();
  }

  /** The id of a request's session, as its cookie says (one there, or not). */
  idOf(req: IncomingMessage): string | undefined {
    return cookieOf(req, COOKIE);
  }

  /** A session opened, the one it replaces (the same browser's before) ended: the cookie that carries it. */
  open(who: Identity, until: number, replaces?: string): string {
    if (replaces) this.end(replaces);
    const mine = [...this.all].filter(([, s]) => s.who.user === who.user);
    for (const [id] of mine.slice(0, Math.max(0, mine.length - PER_ONE + 1))) this.end(id);
    for (const id of [...this.all.keys()].slice(0, Math.max(0, this.all.size - IN_ALL + 1))) this.end(id);
    const id = randomBytes(32).toString('base64url');
    this.all.set(id, { who: { ...who, session: id }, until });
    return setCookie(COOKIE, id, (until - Date.now()) / 1000);
  }

  /** Who a request is signed in as (its cookie's session, not due); none: no one. */
  of(req: IncomingMessage): Identity | null {
    const id = cookieOf(req, COOKIE);
    const session = id === undefined ? undefined : this.all.get(id);
    if (!id || !session) return null;
    if (session.until > Date.now()) return session.who;
    this.end(id);
    return null;
  }

  /** A request's session ended (signed out): the cookie that takes it away. */
  signOut(req: IncomingMessage): string {
    const id = cookieOf(req, COOKIE);
    if (id) this.end(id);
    return setCookie(COOKIE, '', 0);
  }

  /** No more sessions: every one forgotten (the server stops: its streams end with it). */
  close(): void {
    clearInterval(this.sweeping);
    this.all.clear();
  }

  private end(id: string): void {
    const session = this.all.get(id);
    if (!session) return;
    this.all.delete(id);
    this.ended(session.who);
  }
}
