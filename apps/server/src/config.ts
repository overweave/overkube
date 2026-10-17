import { existsSync, realpathSync } from 'node:fs';
import { isIP } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

/*
 * The server as its environment configures it — the one way, in a container
 * as in a cluster:
 *
 *   OVERKUBE_HOST        where it listens (127.0.0.1: only this machine; 0.0.0.0: any)
 *   OVERKUBE_PORT        its port (8080)
 *   OVERKUBE_READ_ONLY   true: nothing that changes the cluster (true or false, nothing else)
 *   OVERKUBE_UI          the built page's folder (none: no page, the gateway alone)
 *   OVERKUBE_HOSTS       the names it is reached by (localhost,dash.example.org): any other Host is
 *                        refused (a DNS rebinding). Listening on this machine only: its own names, by
 *                        default; beyond it, to be said (no default: any name would be taken)
 *   OVERKUBE_LOCAL_NETWORK  true: the network it listens on reaches only this machine (a container's,
 *                        published on 127.0.0.1): as if it listened on this machine only
 *   KUBECONFIG           the kubeconfig to reach the cluster with (its first file)
 *
 * Who uses the cluster (OVERKUBE_AUTH):
 *
 *   loopback   no one signs in: whoever reaches it uses the cluster as its credentials — so only
 *              this machine may reach it (the default)
 *   token      one signs in with a token the cluster takes (kubectl create token …), and uses the
 *              cluster as it: the server's own credentials reach nothing but where the cluster is
 *   oidc       one signs in with an OpenID Connect provider (until its ID token ends), and is impersonated (its claims, prefixed):
 *              the server's credentials need no more than to impersonate
 *     OVERKUBE_OIDC_ISSUER         the provider (https://id.example.org/realms/main)
 *     OVERKUBE_OIDC_CLIENT_ID      its client, whose redirect URI is https://<a name of it>/auth/oidc/callback
 *     OVERKUBE_OIDC_CLIENT_SECRET  its secret (none: a public client — PKCE alone)
 *     OVERKUBE_OIDC_SCOPES         asked for (openid profile email)
 *     OVERKUBE_OIDC_USER_CLAIM     the claim that names the user (email)
 *     OVERKUBE_OIDC_GROUPS_CLAIM   the claim that lists their groups (groups)
 *     OVERKUBE_OIDC_PREFIX         put before the user and each group (oidc:): never the cluster's own names
 *   OVERKUBE_SESSION_HOURS  how long one stays signed in at most (8; a token's or an ID token's own end, sooner)
 *
 * HTTPS, which signing in needs off this machine:
 *
 *   OVERKUBE_TLS_CERT, OVERKUBE_TLS_KEY   its certificate and key (PEM files, read again as they
 *                        change): HTTPS, plain HTTP on the same port sent there (health aside)
 *   OVERKUBE_TLS=off     a proxy in front ends TLS: its X-Forwarded-Proto taken
 *
 * The cluster: KUBECONFIG's first file; else, in a pod, its ServiceAccount;
 * else ~/.kube/config. The gateway is at /kube, beside the page at / and
 * signing in at /auth — where the page looks for them.
 */

/** Where the gateway is: the page asks it there. */
export const GATEWAY_PATH = '/kube';

export type ClusterFrom = { from: 'kubeconfig'; path: string } | { from: 'in-cluster' };

export interface Oidc {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  scopes: string;
  userClaim: string;
  groupsClaim: string;
  prefix: string;
}

/** Who uses the cluster: whoever reaches it, as the credentials; or one signed in, with a token or OIDC — for so many hours at most. */
export type Auth = { mode: 'loopback' } | { mode: 'token'; hours: number } | { mode: 'oidc'; hours: number; oidc: Oidc };

/** Its TLS: its own certificate's files, or a proxy's in front (off). None: plain HTTP. */
export type Tls = { cert: string; key: string } | 'off';

export interface Config {
  host: string;
  port: number;
  prefix: string;
  readOnly: boolean;
  ui?: string;
  cluster: ClusterFrom;
  /** The names it is reached by. */
  hosts: readonly string[];
  /** Only this machine reaches it: it listens on its loopback, or its network reaches only it. */
  local: boolean;
  auth: Auth;
  tls?: Tls;
}

/** A flag, strictly: a value that is neither yes nor no is a mistake, not a no — a safety switch never fails open. */
function flag(name: string, value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  if (v === undefined || v === '' || ['0', 'false', 'no', 'off'].includes(v)) return false;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  throw new Error(`${name}: "${value}" is neither true nor false`);
}

/** This machine's own names: what a server listening here only is reached by. */
export const LOOPBACK_NAMES = ['localhost', '127.0.0.1', '::1'];

/** A value said, trimmed; none: empty. */
const said = (env: NodeJS.ProcessEnv, name: string) => env[name]?.trim() || undefined;

/** The configuration of an environment, or why it is not one. */
export function configOf(env: NodeJS.ProcessEnv = process.env, home = homedir()): Config {
  const port = Number(said(env, 'OVERKUBE_PORT') ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`OVERKUBE_PORT: ${env.OVERKUBE_PORT} is not a port`);
  const kubeconfig = env.KUBECONFIG?.split(':')[0];
  let cluster: ClusterFrom;
  if (kubeconfig) cluster = { from: 'kubeconfig', path: kubeconfig };
  else if (env.KUBERNETES_SERVICE_HOST && env.KUBERNETES_SERVICE_PORT) cluster = { from: 'in-cluster' };
  else cluster = { from: 'kubeconfig', path: join(home, '.kube', 'config') };
  let ui = env.OVERKUBE_UI || undefined;
  if (ui) {
    if (!existsSync(join(ui, 'index.html'))) throw new Error(`OVERKUBE_UI: no index.html in ${ui}`);
    // Where it really is: what a request's file must stay in (a link inside pointing out of it is not).
    ui = realpathSync(ui);
  }
  const host = said(env, 'OVERKUBE_HOST') ?? '127.0.0.1';
  const named = env.OVERKUBE_HOSTS?.split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  // Beyond this machine its names are to be said: a request by any name taken would let another site's name (a DNS rebinding) be this page's origin.
  if (!named?.length && !isLoopback(host)) throw new Error(`OVERKUBE_HOSTS: it listens on ${host}: say the names it is reached by (dash.example.org,localhost)`);
  const localNetwork = flag('OVERKUBE_LOCAL_NETWORK', env.OVERKUBE_LOCAL_NETWORK);
  const local = isLoopback(host) || localNetwork;
  const tls = tlsOf(env);
  const auth = authOf(env);
  if (auth.mode === 'loopback' && !local)
    throw new Error(
      `OVERKUBE_AUTH=loopback: it listens on ${host}, and anyone who reaches it would use the cluster as its credentials: sign people in (OVERKUBE_AUTH=token or oidc), or listen on 127.0.0.1`,
    );
  if (auth.mode !== 'loopback' && !local && !tls)
    throw new Error(
      `OVERKUBE_AUTH=${auth.mode}: signing in off this machine needs HTTPS: OVERKUBE_TLS_CERT and OVERKUBE_TLS_KEY, or OVERKUBE_TLS=off behind a proxy that ends TLS`,
    );
  return {
    host,
    port,
    prefix: GATEWAY_PATH,
    readOnly: flag('OVERKUBE_READ_ONLY', env.OVERKUBE_READ_ONLY),
    ui,
    cluster,
    hosts: named?.length ? named : LOOPBACK_NAMES,
    local,
    auth,
    ...(tls ? { tls } : {}),
  };
}

function tlsOf(env: NodeJS.ProcessEnv): Tls | undefined {
  const [cert, key, mode] = [said(env, 'OVERKUBE_TLS_CERT'), said(env, 'OVERKUBE_TLS_KEY'), said(env, 'OVERKUBE_TLS')];
  if (mode !== undefined && mode !== 'off') throw new Error(`OVERKUBE_TLS: "${mode}" is not off (a certificate is given by OVERKUBE_TLS_CERT and OVERKUBE_TLS_KEY)`);
  if (mode === 'off') {
    if (cert || key) throw new Error('OVERKUBE_TLS=off: a proxy ends TLS, yet a certificate is given');
    return 'off';
  }
  if (!cert && !key) return undefined;
  if (!cert || !key) throw new Error('OVERKUBE_TLS_CERT and OVERKUBE_TLS_KEY: both, or neither');
  for (const [name, file] of [
    ['OVERKUBE_TLS_CERT', cert],
    ['OVERKUBE_TLS_KEY', key],
  ])
    if (!existsSync(file)) throw new Error(`${name}: no file ${file}`);
  return { cert, key };
}

function authOf(env: NodeJS.ProcessEnv): Auth {
  const mode = said(env, 'OVERKUBE_AUTH') ?? 'loopback';
  if (mode === 'loopback') return { mode };
  if (mode !== 'token' && mode !== 'oidc') throw new Error(`OVERKUBE_AUTH: "${mode}" is none of loopback, token, oidc`);
  const hours = Number(said(env, 'OVERKUBE_SESSION_HOURS') ?? 8);
  if (!(hours > 0 && hours <= 720)) throw new Error(`OVERKUBE_SESSION_HOURS: ${env.OVERKUBE_SESSION_HOURS} is not a number of hours (up to 720)`);
  if (mode === 'token') return { mode, hours };
  const issuer = said(env, 'OVERKUBE_OIDC_ISSUER');
  const clientId = said(env, 'OVERKUBE_OIDC_CLIENT_ID');
  if (!issuer || !clientId) throw new Error('OVERKUBE_AUTH=oidc: say the provider (OVERKUBE_OIDC_ISSUER) and its client (OVERKUBE_OIDC_CLIENT_ID)');
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new Error(`OVERKUBE_OIDC_ISSUER: ${issuer} is not a URL`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && onThisMachine(url.hostname)))
    throw new Error(`OVERKUBE_OIDC_ISSUER: ${issuer} is not https (only one on this machine may be http)`);
  const prefix = said(env, 'OVERKUBE_OIDC_PREFIX') ?? 'oidc:';
  if (prefix.startsWith('system:')) throw new Error('OVERKUBE_OIDC_PREFIX: never the cluster’s own names (system:)');
  const secret = said(env, 'OVERKUBE_OIDC_CLIENT_SECRET');
  return {
    mode,
    hours,
    oidc: {
      issuer,
      clientId,
      ...(secret ? { clientSecret: secret } : {}),
      scopes: said(env, 'OVERKUBE_OIDC_SCOPES') ?? 'openid profile email',
      userClaim: said(env, 'OVERKUBE_OIDC_USER_CLAIM') ?? 'email',
      groupsClaim: said(env, 'OVERKUBE_OIDC_GROUPS_CLAIM') ?? 'groups',
      prefix,
    },
  };
}

/**
 * Whether a provider's name is this machine's (http allowed): a loopback
 * address, or one under .localhost — which browsers take for this machine
 * (RFC 6761); a container may be answered otherwise (the dev stand's Dex,
 * by its network's alias): never what decides where the server listens.
 */
export const onThisMachine = (host: string) => isLoopback(host) || /\.localhost\.?$/i.test(host);

/** Whether only this machine can reach an address: localhost, or a loopback IP — never a name that only looks like one (127.example.org). */
export function isLoopback(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost') return true;
  if (isIP(h) === 4) return h.startsWith('127.');
  return isIP(h) === 6 && (h === '::1' || /^::ffff:127\./.test(h));
}
