import type { ApiGroup, ApiResource, OpenApiDocument, Snapshot } from './schema.ts';

/*
 * Read what the generator needs from a running cluster, through anything that
 * proxies its API without asking for credentials: `kubectl proxy`
 * (http://127.0.0.1:8001), or the dashboard's own server.
 *
 * A group is built in unless a CRD defines it or an APIService sends it to a
 * service of its own (metrics.k8s.io from metrics-server): those are an
 * addon's, whatever installed them.
 */

type Get = <T>(path: string) => Promise<T>;

function client(base: string): Get {
  return async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`);
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  };
}

/** Every group the cluster serves, the core one ("") first, and where each comes from. */
async function groups(get: Get): Promise<ApiGroup[]> {
  const crds = await get<{ items: { spec: { group: string } }[] }>('/apis/apiextensions.k8s.io/v1/customresourcedefinitions');
  const services = await get<{ items: { spec: { group?: string; service?: unknown } }[] }>('/apis/apiregistration.k8s.io/v1/apiservices');
  const defined = new Set(crds.items.map((c) => c.spec.group));
  const aggregated = new Set(services.items.filter((s) => s.spec.service && s.spec.group).map((s) => s.spec.group as string));
  const { groups: list } = await get<{ groups: { name: string; versions: { version: string }[] }[] }>('/apis');
  const named = list
    .map(
      (g): ApiGroup => ({
        name: g.name,
        versions: g.versions.map((v) => v.version).sort(),
        source: defined.has(g.name) ? 'crd' : aggregated.has(g.name) ? 'aggregated' : 'built-in',
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return [{ name: '', versions: ['v1'], source: 'built-in' }, ...named];
}

/** The groups the cluster serves beyond the built-in ones, with their kinds: what an addon can generate types for. */
export async function fetchGroups(base: string): Promise<(ApiGroup & { kinds: string[] })[]> {
  const get = client(base);
  const added = (await groups(get)).filter((g) => g.source !== 'built-in');
  return Promise.all(
    added.map(async (g) => {
      const kinds = new Set<string>();
      for (const v of g.versions) {
        const { resources } = await get<{ resources: ApiResource[] }>(`/apis/${g.name}/${v}`);
        for (const r of resources) if (!r.name.includes('/')) kinds.add(r.kind);
      }
      return { ...g, kinds: [...kinds].sort() };
    }),
  );
}

/**
 * The cluster's version and, for each served version of the groups asked
 * for, its schemas and resources: 'built-in' for the built-in groups (the
 * base types), or an addon's groups by name ("cert-manager.io").
 */
export async function fetchSnapshot(base: string, select: 'built-in' | string[]): Promise<Snapshot> {
  const get = client(base);
  const all = await groups(get);
  let wanted: ApiGroup[];
  if (select === 'built-in') {
    wanted = all.filter((g) => g.source === 'built-in');
  } else {
    const others = all.filter((g) => g.source !== 'built-in').map((g) => g.name);
    wanted = select.map((name) => {
      const group = all.find((g) => g.name === name);
      if (!group) throw new Error(`the cluster serves no group ${name}; beyond the built-in ones it serves: ${others.join(', ') || 'none'}`);
      if (group.source === 'built-in') throw new Error(`${name || 'the core group'} is built in: its types are in @overkube/kube-types`);
      return group;
    });
  }

  const { gitVersion } = await get<{ gitVersion: string }>('/version');
  const index = await get<{ paths: Record<string, { serverRelativeURL: string }> }>('/openapi/v3');
  const groupVersions: Snapshot['groupVersions'] = [];
  for (const group of wanted) {
    for (const version of group.versions) {
      const path = group.name ? `apis/${group.name}/${version}` : 'api/v1';
      const entry = index.paths[path];
      if (!entry) throw new Error(`the cluster publishes no OpenAPI v3 schemas for ${path} (is its service up?)`);
      const openapi = await get<OpenApiDocument>(entry.serverRelativeURL);
      const { resources } = await get<{ resources: ApiResource[] }>(`/${path}`);
      groupVersions.push({ path, openapi, resources });
    }
  }
  groupVersions.sort((a, b) => a.path.localeCompare(b.path));
  return { kubernetes: gitVersion, groupVersions };
}
