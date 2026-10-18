import type { KubeObject } from '@overkube/kube-types';

/*
 * A Helm release as its Secret holds it (helm's storage: one Secret a
 * revision, sh.helm.release.v1.<name>.v<revision>, its labels its name,
 * status, revision, when it changed — owner=helm): its release field
 * base64 of what helm encoded, base64 again of gzip'd JSON (helm's own
 * base64, under the Secret's). Its JSON: its info (status, description,
 * when deployed, notes), its chart (its metadata, its own values), the
 * values given (config), the manifest it applied, its revision.
 */

/** helm's states of a release. */
export type HelmStatus = 'unknown' | 'deployed' | 'uninstalled' | 'superseded' | 'failed' | 'uninstalling' | 'pending-install' | 'pending-upgrade' | 'pending-rollback';

export interface Release {
  name: string;
  namespace: string;
  version: number;
  info: { status: HelmStatus; description?: string; first_deployed?: string; last_deployed?: string; notes?: string };
  chart: { metadata: { name: string; version: string; appVersion?: string; description?: string }; values?: Record<string, unknown> };
  config?: Record<string, unknown>;
  manifest?: string;
}

/** Not well: failed, or pending (helm stopped mid-way: each next upgrade refused till it is rolled back). */
export const unwell = (status: string) => status === 'failed' || status.startsWith('pending-');

/** gzip's first bytes: what helm compressed (what it did not: JSON as it is). */
const GZIP = [0x1f, 0x8b];

const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

/** Its release decoded; not one: undefined. */
export async function releaseOf(secret: KubeObject & { data?: Record<string, string> }): Promise<Release | undefined> {
  const field = secret.data?.release;
  if (!field) return undefined;
  try {
    const raw = bytes(atob(field));
    const json =
      raw[0] === GZIP[0] && raw[1] === GZIP[1] ? await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(raw);
    const release = JSON.parse(json) as Partial<Release> | null;
    // Not one helm wrote (a Secret anyone labelled so): none.
    return typeof release?.info?.status === 'string' && typeof release.chart?.metadata?.name === 'string' ? (release as Release) : undefined;
  } catch {
    return undefined;
  }
}

/** The values given, over the chart's own (maps merged, a key at a time; anything else: the given). */
export function merged(defaults: unknown, given: unknown): unknown {
  const map = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!map(defaults) || !map(given)) return given === undefined ? defaults : given;
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(given)) out[k] = merged(defaults[k], v);
  return out;
}

/** What a manifest makes: each document's apiVersion, kind, name, namespace (none said: the release's). */
export function resourcesOf(manifest: string | undefined): { apiVersion: string; kind: string; name: string; namespace?: string }[] {
  return (manifest ?? '').split(/^---\s*$/m).flatMap((doc) => {
    const apiVersion = doc.match(/^apiVersion:\s*["']?([^\s"']+)/m)?.[1];
    const kind = doc.match(/^kind:\s*["']?([^\s"']+)/m)?.[1];
    const metadata = doc.match(/^metadata:\s*\n((?:[ \t]+.*\n?)*)/m)?.[1] ?? '';
    // Its own keys, at its first line's indent (not its labels' or annotations').
    const indent = metadata.match(/^[ \t]*/)?.[0] ?? '';
    const own = (key: string) => metadata.match(new RegExp(`^${indent}${key}:[ \\t]*["']?([^\\s"'#]+)`, 'm'))?.[1];
    const [name, namespace] = [own('name'), own('namespace')];
    return apiVersion && kind && name ? [{ apiVersion, kind, name, ...(namespace ? { namespace } : {}) }] : [];
  });
}
