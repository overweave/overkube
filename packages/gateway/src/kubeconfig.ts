import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';

/** Where the API server is and how to prove who we are to it. */
export interface Upstream {
  server: string;
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
  token?: string;
  /** insecure-skip-tls-verify: the API server's certificate is not checked. */
  insecure?: boolean;
  /** tls-server-name: the name its certificate is checked against, when not the server's address. */
  serverName?: string;
  /** Who it acts as (Impersonate-User, Impersonate-Group): someone signed in, the credentials' own rights aside. */
  impersonate?: { user: string; groups: readonly string[] };
}

interface Named<T> {
  name?: unknown;
  cluster?: T;
  context?: T;
  user?: T;
}

/** The parts of a kubeconfig the gateway uses. */
interface Kubeconfig {
  'current-context'?: unknown;
  clusters?: unknown;
  contexts?: unknown;
  users?: unknown;
}

/** A file as it was when read: when it changes, it is read again. */
interface Seen {
  path: string;
  mtimeMs: number;
  size: number;
}

/**
 * The last kubeconfig read, kept until it or a file it names (a tokenFile,
 * a certificate, a key) changes: it is asked for on every request, and those
 * files are rotated without the kubeconfig changing.
 */
let cached: { file: string; seen: Seen[]; upstream: Upstream } | null = null;

function seen(path: string): Seen | null {
  try {
    const { mtimeMs, size } = statSync(path);
    return { path, mtimeMs, size };
  } catch {
    return null;
  }
}

function unchanged(files: Seen[]): boolean {
  return files.every((f) => {
    const now = seen(f.path);
    return now !== null && now.mtimeMs === f.mtimeMs && now.size === f.size;
  });
}

/**
 * The cluster and user of a kubeconfig's current context, as kubectl takes
 * them: a current-context that names no context is an error (not the first
 * context instead: with several clusters that could be another one); with
 * no current-context, the first context. A context's cluster and user are
 * its own: one that names no cluster is an error, one that names no user
 * has no credentials (never another user's). Only with no contexts at all,
 * the first cluster and user. Read again whenever the file or one it names
 * changes, so a regenerated one (new certificates, a new address) or a
 * rotated token is taken at once.
 */
export function readKubeconfig(file: string): Upstream {
  if (cached?.file === file && unchanged(cached.seen)) return cached.upstream;
  const { mtimeMs, size } = statSync(file); // throws: no such file
  const read: Seen[] = [{ path: file, mtimeMs, size }];
  const upstream = interpret(file, readFileSync(file, 'utf8'), (path) => {
    const s = seen(path);
    if (s) read.push(s);
    return readFileSync(path);
  });
  cached = { file, seen: read, upstream };
  return upstream;
}

function interpret(file: string, text: string, readFile: (path: string) => Buffer): Upstream {
  let config: Kubeconfig;
  try {
    config = parse(text) ?? {};
  } catch (err) {
    throw new Error(`not YAML: ${(err as Error).message.split('\n')[0]}`);
  }
  if (typeof config !== 'object' || Array.isArray(config)) throw new Error('not a kubeconfig');
  const clusters = list<Record<string, unknown>>(config.clusters);
  const contexts = list<{ cluster?: unknown; user?: unknown }>(config.contexts);
  const users = list<Record<string, unknown>>(config.users);

  // Which cluster, with which credentials, is never guessed among several: a context named, or the only one there is.
  const wanted = config['current-context'];
  let context: Named<{ cluster?: unknown; user?: unknown }> | undefined;
  if (wanted !== undefined && wanted !== null && wanted !== '') {
    context = contexts.find((c) => c.name === wanted);
    if (!context) throw new Error(`its current-context "${wanted}" is not one of its contexts`);
  } else if (contexts.length > 1) {
    throw new Error(`it has ${contexts.length} contexts and no current-context: name the one to use`);
  } else {
    context = contexts[0];
  }

  let cluster: Named<Record<string, unknown>> | undefined;
  let user: Named<Record<string, unknown>> | undefined;
  if (context) {
    const clusterName = context.context?.cluster;
    if (clusterName === undefined || clusterName === null || clusterName === '') throw new Error(`its context "${context.name}" names no cluster`);
    cluster = clusters.find((c) => c.name === clusterName);
    if (!cluster) throw new Error(`its context "${context.name}" names a cluster "${clusterName}" it does not have`);
    const userName = context.context?.user;
    if (userName !== undefined && userName !== null && userName !== '') {
      user = users.find((u) => u.name === userName);
      if (!user) throw new Error(`its context "${context.name}" names a user "${userName}" it does not have`);
    }
  } else {
    if (clusters.length > 1) throw new Error(`it has ${clusters.length} clusters and no context: name the one to use`);
    if (users.length > 1) throw new Error(`it has ${users.length} users and no context: name the one to use`);
    cluster = clusters[0];
    user = users[0];
  }

  const c = cluster?.cluster ?? {};
  const u = user?.user ?? {};
  if (typeof c.server !== 'string' || !c.server) throw new Error('no server in it');
  if (c['proxy-url']) throw new Error('its cluster goes through a proxy (proxy-url), which the gateway does not support');
  // Credentials the gateway cannot use are said so, not dropped (the requests would go out anonymous: a 401 with no reason).
  const has = (k: string) => u[k] !== undefined && u[k] !== null && u[k] !== '';
  const own = has('token') || has('tokenFile') || has('client-certificate') || has('client-certificate-data');
  if (!own) {
    const other = has('exec')
      ? 'exec credentials (a plugin: EKS, GKE, AKS, OIDC)'
      : has('auth-provider')
        ? 'an auth-provider'
        : has('username')
          ? 'a username and password'
          : undefined;
    if (other)
      throw new Error(`its user "${user?.name}" signs in with ${other}, which the gateway does not support: give it a token or a client certificate, or run it in the cluster`);
  }

  // Each credential is either inline (…-data, base64) or a file next to the kubeconfig.
  const material = (fields: Record<string, unknown>, key: string) => {
    const data = fields[`${key}-data`];
    if (typeof data === 'string' && data) return Buffer.from(data, 'base64');
    const path = fields[key];
    return typeof path === 'string' && path ? readFile(resolve(dirname(file), path)) : undefined;
  };
  const tokenFile =
    typeof u.tokenFile === 'string' && u.tokenFile
      ? readFile(resolve(dirname(file), u.tokenFile))
          .toString('utf8')
          .trim()
      : undefined;
  const ca = material(c, 'certificate-authority');
  const insecure = c['insecure-skip-tls-verify'] === true;
  // As kubectl: either the server's certificate is checked against a CA, or it is not checked.
  if (insecure && ca) throw new Error('it gives a certificate authority and insecure-skip-tls-verify both');
  return {
    server: c.server,
    ca,
    cert: material(u, 'client-certificate'),
    key: material(u, 'client-key'),
    token: typeof u.token === 'string' && u.token ? u.token : tokenFile,
    ...(insecure ? { insecure } : {}),
    ...(typeof c['tls-server-name'] === 'string' && c['tls-server-name'] ? { serverName: c['tls-server-name'] } : {}),
  };
}

function list<T>(value: unknown): Named<T>[] {
  return Array.isArray(value) ? value.filter((v): v is Named<T> => !!v && typeof v === 'object') : [];
}
