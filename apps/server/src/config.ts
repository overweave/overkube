import { existsSync, realpathSync } from 'node:fs';
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
 *                        refused (a DNS rebinding). Listening on this machine only: its own names, by default
 *   OVERKUBE_TRUST_NETWORK  true: the network it listens on is trusted (a container's, published on this
 *                        machine only): no warning that it has no sign-in
 *   KUBECONFIG           the kubeconfig to reach the cluster with (its first file)
 *
 * The cluster: KUBECONFIG's first file; else, in a pod, its ServiceAccount;
 * else ~/.kube/config. The gateway is at /kube, beside the page at / — where
 * the page looks for it (a host that serves the gateway elsewhere has its
 * own page).
 */

/** Where the gateway is: the page asks it there. */
export const GATEWAY_PATH = '/kube';

export type ClusterFrom = { from: 'kubeconfig'; path: string } | { from: 'in-cluster' };

export interface Config {
  host: string;
  port: number;
  prefix: string;
  readOnly: boolean;
  ui?: string;
  cluster: ClusterFrom;
  /** The names it is reached by; none: any (it listens beyond this machine and was given none). */
  hosts?: readonly string[];
  /** Its network is trusted: no warning. */
  trustNetwork?: boolean;
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

/** The configuration of an environment, or why it is not one. */
export function configOf(env: NodeJS.ProcessEnv = process.env, home = homedir()): Config {
  const port = Number(env.OVERKUBE_PORT?.trim() || 8080);
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
  const host = env.OVERKUBE_HOST?.trim() || '127.0.0.1';
  const named = env.OVERKUBE_HOSTS?.split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const hosts = named?.length ? named : isLoopback(host) ? LOOPBACK_NAMES : undefined;
  return {
    host,
    port,
    prefix: GATEWAY_PATH,
    readOnly: flag('OVERKUBE_READ_ONLY', env.OVERKUBE_READ_ONLY),
    ui,
    cluster,
    ...(hosts ? { hosts } : {}),
    ...(flag('OVERKUBE_TRUST_NETWORK', env.OVERKUBE_TRUST_NETWORK) ? { trustNetwork: true } : {}),
  };
}

/** Whether only this machine can reach an address. */
export function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '::1' || host.startsWith('127.') || host.startsWith('::ffff:127.');
}
