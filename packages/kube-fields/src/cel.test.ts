import { prepareCatalog } from '@overkube/cel';
import { fieldsOf, scan, valuesOf } from '@overkube/query';
import { describe, expect, it } from 'vitest';
import { BUILT_IN, baseFields, COMMON, crdFields, KUBE_CEL } from './index.ts';
import { samples } from './pods.fixture.ts';
import { podSummary } from './pods.reference.test-helper.ts';

const made = fieldsOf({ ...COMMON, ...BUILT_IN }, KUBE_CEL.compile);
const value = (object: unknown, name: string) => valuesOf(object, name, made.fields);
const summary = (pod: unknown) => ({
  status: value(pod, 'pods.v1.status')[0],
  ready: value(pod, 'pods.v1.ready')[0],
  containers: value(pod, 'pods.v1.containers')[0],
  notReady: value(pod, 'pods.v1.not-ready')[0],
  restarts: value(pod, 'pods.v1.restarts')[0],
});
const reference = (pod: unknown) => {
  const w = podSummary(pod as never);
  return { status: w.reason, ready: w.ready, containers: w.total, notReady: w.total - w.ready, restarts: w.restarts };
};

/** A seeded random (mulberry32): the same pods each run. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A pod of any make: init containers (sidecars among them), every kind of state, reason, exit code, signal; deleted, lost, evicted, gated. */
function anyPod(rnd: () => number, i: number) {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const state = () =>
    pick([
      { running: { startedAt: '2026-01-01T00:00:00Z' } },
      { waiting: { reason: pick(['', 'CrashLoopBackOff', 'ContainerCreating', 'PodInitializing', 'ImagePullBackOff']) } },
      { waiting: {} },
      { terminated: { exitCode: pick([0, 1, 137]), signal: pick([0, 0, 9, 15]), reason: pick(['', 'Completed', 'Error', 'OOMKilled']) } },
    ]);
  const status = (name: string) => ({ name, image: 'x', imageID: '', ready: rnd() < 0.5, started: rnd() < 0.5, restartCount: Math.floor(rnd() * 4), state: state() });
  const inits = Array.from({ length: Math.floor(rnd() * 3) }, (_, k) => ({ name: `i${k}`, ...(rnd() < 0.4 ? { restartPolicy: 'Always' } : {}) }));
  const containers = Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, k) => ({ name: `c${k}` }));
  const conditions = [
    ...(rnd() < 0.5 ? [{ type: 'Ready', status: pick(['True', 'False']) }] : []),
    ...(rnd() < 0.5 ? [{ type: 'Initialized', status: pick(['True', 'False']) }] : []),
    ...(rnd() < 0.1 ? [{ type: 'PodScheduled', status: 'False', reason: 'SchedulingGated' }] : []),
  ];
  return {
    metadata: { name: `p${i}`, ...(rnd() < 0.15 ? { deletionTimestamp: '2026-01-01T00:00:00Z' } : {}) },
    spec: { ...(inits.length ? { initContainers: inits } : {}), containers },
    status: {
      phase: pick(['Pending', 'Running', 'Running', 'Succeeded', 'Failed']),
      ...(rnd() < 0.15 ? { reason: pick(['Evicted', 'NodeLost', 'Shutdown']) } : {}),
      ...(conditions.length ? { conditions } : {}),
      ...(inits.length && rnd() < 0.9 ? { initContainerStatuses: inits.map((c) => status(c.name)) } : {}),
      ...(rnd() < 0.9 ? { containerStatuses: containers.map((c) => status(c.name)) } : {}),
    },
  };
}

describe('the fields of CEL', () => {
  it('are all made: none left out', () => {
    expect(made.rejected).toEqual({});
  });

  it.each(samples.map((p) => [p.metadata.name, p] as const))("a pod's as kubectl prints it: %s", (_, pod) => {
    expect(summary(pod)).toEqual(reference(pod));
  });

  it("a pod's as kubectl prints it, of 2000 pods of any make (printers.go's port, the reference)", () => {
    const rnd = random(7);
    const differ = Array.from({ length: 2000 }, (_, i) => anyPod(rnd, i)).filter((p) => JSON.stringify(summary(p)) !== JSON.stringify(reference(p)));
    expect(differ.map((p) => ({ pod: p, got: summary(p), want: reference(p) })).slice(0, 2)).toEqual([]);
  });

  it("a pod's even with a null where a list is (as omitempty has it: not there)", () => {
    const pod = { metadata: { name: 'p' }, spec: { containers: [{ name: 'a' }] }, status: { phase: 'Running', conditions: null, containerStatuses: null } };
    expect(summary(pod)).toEqual(reference({ ...pod, status: { phase: 'Running' } }));
  });

  it("a pod's secrets and config maps, wherever it refers to them", () => {
    const pod = {
      metadata: { name: 'p' },
      spec: {
        imagePullSecrets: [{ name: 'pull' }],
        volumes: [
          { secret: { secretName: 'tls' } },
          { configMap: { name: 'conf' } },
          { projected: { sources: [{ secret: { name: 'proj' } }, { configMap: { name: 'pconf' } }] } },
          { csi: { nodePublishSecretRef: { name: 'csi' } } },
        ],
        initContainers: [{ name: 'i', envFrom: [{ secretRef: { name: 'init' } }] }],
        ephemeralContainers: [{ name: 'e', envFrom: [{ configMapRef: { name: 'eph' } }] }],
        containers: [
          { name: 'a', envFrom: [{ secretRef: { name: 'env' } }, { configMapRef: { name: 'more' } }] },
          { name: 'b', env: [{ name: 'X', valueFrom: { secretKeyRef: { name: 'key', key: 'k' } } }] },
        ],
      },
    };
    expect([[...value(pod, 'pods.v1.secrets')].sort(), [...value(pod, 'pods.v1.configmaps')].sort()]).toEqual([
      ['csi', 'env', 'init', 'key', 'proj', 'pull', 'tls'],
      ['conf', 'eph', 'more', 'pconf'],
    ]);
    expect([value({ metadata: { name: 'bare' } }, 'pods.v1.secrets'), value({ metadata: { name: 'bare' } }, 'pods.v1.pvcs')]).toEqual([[], []]);
  });

  it("every object's labels and conditions, as key=value and Type=Status (none: none)", () => {
    const o = { metadata: { name: 'o', labels: { app: 'web', tier: 'db' } }, status: { conditions: [{ type: 'Ready', status: 'True' }, { type: 'Odd' }] } };
    expect([value(o, 'core.labels'), value(o, 'core.conditions'), value({ metadata: { name: 'bare' } }, 'core.labels'), value({}, 'core.conditions')]).toEqual([
      ['app=web', 'tier=db'],
      ['Ready=True', 'Odd='],
      [],
      [],
    ]);
  });

  it("a node's CPU and memory as numbers (cores, bytes: 1.5Gi too); its roles as kubectl tells them; taints", () => {
    const node = {
      metadata: { name: 'n', labels: { 'node-role.kubernetes.io/control-plane': '', 'node-role.kubernetes.io/': '', 'kubernetes.io/role': 'master', other: 'x' } },
      spec: { taints: [{ key: 'gpu', effect: 'NoSchedule' }] },
      status: { capacity: { cpu: '4', memory: '1.5Gi' }, allocatable: { cpu: '3500m', memory: '15Gi' } },
    };
    expect(['nodes.v1.cpu', 'nodes.v1.cpu-allocatable', 'nodes.v1.memory', 'nodes.v1.roles', 'nodes.v1.taints', 'nodes.v1.unschedulable'].map((n) => value(node, n))).toEqual([
      [4],
      [3.5],
      [1610612736],
      ['control-plane', 'master'],
      ['gpu:NoSchedule'],
      [false],
    ]);
  });

  it.each(['deployments.v1.apps', 'statefulsets.v1.apps', 'replicasets.v1.apps'])("a %s's replicas as kubectl shows them, a status or none yet", (kind) => {
    const fresh = { metadata: { name: 'd' }, spec: {} };
    const running = { metadata: { name: 'd' }, spec: { replicas: 3 }, status: { readyReplicas: 2, availableReplicas: 1 } };
    expect([fresh, running].map((o) => ['desired', 'ready', 'available'].map((n) => value(o, `${kind}.${n}`)[0]))).toEqual([
      [1, 0, 0],
      [3, 2, 1],
    ]);
  });

  it("a DaemonSet's, of its status (none yet: 0)", () => {
    expect(['desired', 'ready', 'updated', 'available'].map((n) => value({ metadata: { name: 'ds' } }, `daemonsets.v1.apps.${n}`)[0])).toEqual([0, 0, 0, 0]);
  });
});

describe('a base catalog', () => {
  it('prepares as it is: none of its fields left out, their versions as defined', () => {
    const base = baseFields('pods.v1');
    const { catalog, rejected } = prepareCatalog(base);
    expect(rejected).toEqual({});
    expect(Object.fromEntries(Object.entries(catalog.fields).map(([n, d]) => [n, d.version]))).toEqual(
      Object.fromEntries(Object.entries(base.fields).map(([n, d]) => [n, d.version])),
    );
  });

  it('is laid over: a field defined again answers as it is defined, a scan by it says its errors', () => {
    const { catalog, cel } = prepareCatalog({
      ...baseFields('pods.v1'),
      fields: { ...baseFields('pods.v1').fields, 'pods.v1.restarts': { type: 'number', value: { cel: '1 / 0' } } },
    });
    const { fields } = fieldsOf(catalog.fields, cel.compile);
    const found = scan(samples, { kind: 'pods.v1', page: { limit: 1 }, sort: [{ field: 'pods.v1.restarts' }] }, fields);
    expect(found.fieldErrors).toEqual({ 'pods.v1.restarts': { count: samples.length, code: 'division_by_zero', message: 'division by zero' } });
  });

  it("is a CRD's columns too, for its kind, as it says them", () => {
    const crd = {
      spec: {
        group: 'g.io',
        names: { plural: 'things' },
        versions: [
          { name: 'v1', served: true, deprecated: true, additionalPrinterColumns: [{ name: 'Size', type: 'integer', jsonPath: '.spec.size', format: 'int64', priority: 1 }] },
        ],
      },
    };
    const base = baseFields('things.v1.g.io', crd);
    expect([Object.keys(base.fields).includes('things.v1.g.io.size'), base.columns]).toEqual([
      true,
      [{ field: 'things.v1.g.io.size', kind: 'things.v1.g.io', name: 'Size', type: 'integer', format: 'int64', priority: 1, deprecated: true }],
    ]);
    expect(crdFields(crd).skipped).toEqual({});
  });
});

describe('what the last review found', () => {
  it("a node's roles once each, in order (as kubectl's nodeRoles)", () => {
    const node = { metadata: { name: 'n', labels: { 'node-role.kubernetes.io/z': '', 'node-role.kubernetes.io/a': '', 'kubernetes.io/role': 'a' } } };
    expect(value(node, 'nodes.v1.roles')).toEqual(['a', 'z']);
  });

  it("a pod's secrets of the in-tree volumes too", () => {
    const pod = {
      metadata: { name: 'p' },
      spec: {
        containers: [{ name: 'a' }],
        volumes: [
          { azureFile: { secretName: 'az' } },
          ...['cephfs', 'cinder', 'flexVolume', 'iscsi', 'rbd', 'scaleIO', 'storageos'].map((t) => ({ [t]: { secretRef: { name: t } } })),
        ],
      },
    };
    expect([...value(pod, 'pods.v1.secrets')].sort()).toEqual(['az', 'cephfs', 'cinder', 'flexVolume', 'iscsi', 'rbd', 'scaleIO', 'storageos']);
  });

  it("a pod's status, a condition without its type or status none the less", () => {
    const pod = { metadata: { name: 'p' }, spec: { containers: [{ name: 'a' }] }, status: { phase: 'Running', conditions: [{ type: 'Ready' }, { status: 'True' }] } };
    expect(value(pod, 'pods.v1.status')).toEqual([reference(pod).status]);
  });

  it('a base catalog prepares under a bound, its own fields trusted', () => {
    const base = baseFields('pods.v1');
    expect(prepareCatalog(base, { bound: { size: 1000, cost: 1_000_000 }, trusted: Object.keys(base.fields) }).rejected).toEqual({});
  });

  it("a CRD's column of no path (the whole object): left out, and why", () => {
    const crd = {
      spec: { group: 'g.io', names: { plural: 't' }, versions: [{ name: 'v1', served: true, additionalPrinterColumns: [{ name: 'All', type: 'string', jsonPath: '$' }] }] },
    };
    expect(crdFields(crd).skipped).toEqual({ 't.v1.g.io All': 'no path (the whole object)' });
  });
});
