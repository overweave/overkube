import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import type { FakeCluster } from '@overkube/testkit';
import type { HelmStatus } from './release.ts';

/*
 * A cluster the Helm addon's tests and stories draw: releases as helm
 * keeps them (a Secret a revision, its release gzip'd and base64'd twice,
 * as helm writes it) — hello, installed then upgraded (two revisions);
 * broken, its install failed (its image not there); retired, uninstalled,
 * its history kept; ingress, stuck in pending-upgrade — and what they made
 * (helm's annotations on it; hello's pod and replica set, by their
 * owners), beside a Deployment no release made.
 */

const { Namespace, Secret, ConfigMap } = kinds.core.v1;
const { Deployment, ReplicaSet } = kinds.apps.v1;
const { Pod } = kinds.core.v1;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ── gzip, its deflate stored (no compression: what any gunzip reads) ────────────────

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const le = (n: number, size: number) => Array.from({ length: size }, (_, i) => (n >>> (8 * i)) & 0xff);

function gzip(text: string): Uint8Array {
  const data = new TextEncoder().encode(text);
  const out: number[] = [0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff];
  for (let at = 0; at < data.length || at === 0; at += 0xffff) {
    const block = data.subarray(at, at + 0xffff);
    out.push(at + 0xffff >= data.length ? 1 : 0, ...le(block.length, 2), ...le(~block.length & 0xffff, 2), ...block);
    if (!data.length) break;
  }
  out.push(...le(crc32(data), 4), ...le(data.length, 4));
  return new Uint8Array(out);
}
const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));

// ── The releases ────────────────────────────────────────────────────────────

const helloManifest = (name: string, message: string, replicas: number, image = 'busybox:1.37') => `---
# Source: hello/templates/hello.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
  labels: { app.kubernetes.io/name: hello, app.kubernetes.io/instance: ${name} }
data:
  message: "${message}"
---
# Source: hello/templates/hello.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  labels: { app.kubernetes.io/name: hello, app.kubernetes.io/instance: ${name} }
spec:
  replicas: ${replicas}
  template:
    spec:
      containers:
        - name: hello
          image: ${image}
`;

const HELLO: Chart = { metadata: { name: 'hello', version: '0.1.0', appVersion: '1.37', apiVersion: 'v2' }, values: { image: 'busybox:1.37', message: 'hello', replicas: 1 } };
const INGRESS: Chart = {
  metadata: { name: 'ingress-nginx', version: '4.13.0', appVersion: '1.13.0', apiVersion: 'v2' },
  values: { controller: { replicaCount: 1, service: { type: 'LoadBalancer' } } },
};

type Chart = { metadata: Record<string, string>; values: Record<string, unknown> };
type Rev = [version: number, status: HelmStatus, description: string, ago: number, config: Record<string, unknown>, manifest: string, chart?: Chart];

const RELEASES: [name: string, namespace: string, revisions: Rev[]][] = [
  [
    'hello',
    'seed-helm',
    [
      [1, 'superseded', 'Install complete', 3 * DAY, { message: 'installed' }, helloManifest('hello', 'installed', 1)],
      [2, 'deployed', 'Upgrade complete', 2 * HOUR, { message: 'upgraded', replicas: 2 }, helloManifest('hello', 'upgraded', 2)],
    ],
  ],
  [
    'broken',
    'seed-helm',
    [
      [
        1,
        'failed',
        'Release "broken" failed: resource Deployment/seed-helm/broken not ready. status: InProgress, message: Available: 0/1: context deadline exceeded',
        2 * HOUR,
        { image: 'busybox:0.0.0-does-not-exist' },
        helloManifest('broken', 'hello', 1, 'busybox:0.0.0-does-not-exist'),
      ],
    ],
  ],
  ['retired', 'seed-helm', [[1, 'uninstalled', 'Deletion complete', DAY, { message: 'retired' }, helloManifest('retired', 'retired', 1)]]],
  [
    'ingress',
    'seed-net',
    [
      [3, 'superseded', 'Upgrade complete', 20 * DAY, {}, '', INGRESS],
      [4, 'pending-upgrade', 'Preparing upgrade', 25 * 60_000, { controller: { replicaCount: 2 } }, '', INGRESS],
    ],
  ],
];

/** A revision's Secret, as helm writes it. */
function secretOf(name: string, namespace: string, [version, status, description, ago, config, manifest, chart = HELLO]: Rev, first: number, now: number): KubeObject {
  const at = new Date(now - ago).toISOString();
  const release = {
    name,
    namespace,
    version,
    info: {
      first_deployed: new Date(first).toISOString(),
      last_deployed: at,
      status,
      description,
      ...(status === 'deployed' ? { notes: `${name} says "${String(config.message ?? 'hello')}".\n` } : {}),
    },
    chart,
    config,
    manifest,
  };
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    type: 'helm.sh/release.v1',
    metadata: {
      name: `sh.helm.release.v1.${name}.v${version}`,
      namespace,
      creationTimestamp: at,
      labels: { name, owner: 'helm', status, version: String(version), modifiedAt: String(Math.floor((now - ago) / 1000)) },
    },
    data: { release: btoa(base64(gzip(JSON.stringify(release)))) },
  } as KubeObject;
}

/** The cluster, its times from now. */
export function helmCluster(c: FakeCluster, now = Date.now()) {
  const put = (kind: KindInfo, object: Record<string, unknown>) =>
    c.add(kind, { apiVersion: kind.group ? `${kind.group}/${kind.version}` : kind.version, kind: kind.kind, ...object } as never);
  for (const ns of ['seed-helm', 'seed-net']) put(Namespace, { metadata: { name: ns } });
  for (const [name, namespace, revisions] of RELEASES) {
    const first = now - Math.max(...revisions.map((r) => r[3]));
    for (const r of revisions) c.add(Secret, secretOf(name, namespace, r, first, now) as never);
  }
  const made = new Date(now - 3 * DAY).toISOString();
  const helm = (release: string, ns: string) => ({
    annotations: { 'meta.helm.sh/release-name': release, 'meta.helm.sh/release-namespace': ns },
    labels: { 'app.kubernetes.io/managed-by': 'Helm' },
  });
  const deploy = (name: string, ns: string, ready: number, release?: string) =>
    put(Deployment, {
      metadata: { name, namespace: ns, creationTimestamp: made, ...(release ? helm(release, ns) : {}) },
      spec: { replicas: 1, selector: {}, template: { spec: { containers: [{ name: 'c', image: 'busybox:1.37' }] } } },
      status: { replicas: 1, readyReplicas: ready, availableReplicas: ready, updatedReplicas: 1, conditions: [{ type: 'Available', status: ready ? 'True' : 'False' }] },
    });
  deploy('hello', 'seed-helm', 1, 'hello');
  deploy('broken', 'seed-helm', 0, 'broken');
  deploy('ingress-nginx-controller', 'seed-net', 1, 'ingress');
  deploy('by-hand', 'seed-helm', 1);
  // hello's replica set and pod: theirs its deployment's (their owner references, the pod's pod-template-hash).
  const owner = (kind: string, name: string) => [{ apiVersion: 'apps/v1', kind, name, uid: `${name}-uid`, controller: true }];
  put(ReplicaSet, {
    metadata: { name: 'hello-7d4b9', namespace: 'seed-helm', creationTimestamp: made, labels: { 'pod-template-hash': '7d4b9' }, ownerReferences: owner('Deployment', 'hello') },
  });
  put(Pod, {
    metadata: {
      name: 'hello-7d4b9-x2k8p',
      namespace: 'seed-helm',
      creationTimestamp: made,
      labels: { 'pod-template-hash': '7d4b9' },
      ownerReferences: owner('ReplicaSet', 'hello-7d4b9'),
    },
    spec: { containers: [{ name: 'hello', image: 'busybox:1.37' }] },
    status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
  });
  for (const n of ['hello', 'broken']) put(ConfigMap, { metadata: { name: n, namespace: 'seed-helm', creationTimestamp: made, ...helm(n, 'seed-helm') }, data: { message: n } });
}
