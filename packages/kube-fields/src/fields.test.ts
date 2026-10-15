import { fieldsOf, scan, valuesOf } from '@overkube/query';
import { describe, expect, it } from 'vitest';
import { BATCH, baseFields, COMMON, CONFIG, type CrdLike, crdFields, type Defs, define, KUBE_CEL, PODS, WORKLOADS } from './index.ts';

/** Fields as a scan has them (made as the page and a server make them). */
const paths = (defs: Defs) => fieldsOf(defs, KUBE_CEL.compile).fields;

const pod = {
  metadata: {
    namespace: 'shop',
    name: 'web-1',
    uid: 'u1',
    creationTimestamp: '2026-10-01T10:00:00Z',
    deletionTimestamp: '2026-10-02T10:00:00Z',
    finalizers: ['a', 'b'],
    labels: { app: 'web', tier: 'front' },
    ownerReferences: [
      { kind: 'ReplicaSet', name: 'web', uid: 'rs1', controller: true },
      { kind: 'Thing', name: 'x', uid: 't1' },
    ],
  },
  spec: { nodeName: 'n1', containers: [{ image: 'app:1' }, { image: 'side:2' }], volumes: [{ persistentVolumeClaim: { claimName: 'data' } }, { secret: { secretName: 's' } }] },
  status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'False' }] },
};

describe('the fields every object has', () => {
  it.each([
    ['core.name', ['web-1']],
    ['core.created', [Date.UTC(2026, 9, 1, 10)]],
    ['core.deleting', [Date.UTC(2026, 9, 2, 10)]],
    ['core.owner.uid', ['rs1', 't1']],
    ['core.controller.uid', ['rs1']],
    ['core.finalizers', ['a', 'b']],
    ['core.ready', ['False']],
    ['core.labels', ['app=web', 'tier=front']],
    ['core.label.keys', ['app', 'tier']],
  ])('%s: %j', (name, values) => {
    expect(valuesOf(pod, name, paths(COMMON))).toEqual(values);
  });
});

describe("a pod's own", () => {
  it.each([
    ['pods.v1.node', ['n1']],
    ['pods.v1.images', ['app:1', 'side:2']],
    ['pods.v1.pvcs', ['data']],
  ])('%s: %j', (name, values) => {
    expect(valuesOf(pod, name, paths(PODS))).toEqual(values);
  });
});

describe('when a job ran and a workload rolled out', () => {
  const t = (iso: string) => [Date.parse(iso)];
  it.each([
    [{ status: { startTime: '2026-10-01T10:00:00Z', completionTime: '2026-10-01T10:05:00Z' } }, BATCH, 'jobs.v1.batch.started', t('2026-10-01T10:00:00Z')],
    [{ status: { completionTime: '2026-10-01T10:05:00Z' } }, BATCH, 'jobs.v1.batch.finished', t('2026-10-01T10:05:00Z')],
    [{ status: {} }, BATCH, 'jobs.v1.batch.finished', []],
    [{ status: { lastSuccessfulTime: '2026-10-01T09:00:00Z' } }, BATCH, 'cronjobs.v1.batch.lastSuccess', t('2026-10-01T09:00:00Z')],
    [{ status: { lastScaleTime: '2026-10-01T08:00:00Z' } }, BATCH, 'horizontalpodautoscalers.v2.autoscaling.lastScale', t('2026-10-01T08:00:00Z')],
    [{ metadata: { annotations: { 'deployment.kubernetes.io/revision': '7' } } }, WORKLOADS, 'deployments.v1.apps.revision', [7]],
    [{ metadata: {} }, WORKLOADS, 'replicasets.v1.apps.revision', [0]],
  ])('%j: %s is %j', (object, defs, name, values) => {
    expect(valuesOf(object, name as string, paths(defs as Defs))).toEqual(values);
  });
});

describe('what config holds and policies pick', () => {
  it.each([
    [{ data: { a: '1', b: '2' }, binaryData: { c: 'AA==' } }, 'configmaps.v1.keys', [3]],
    [{}, 'configmaps.v1.keys', [0]],
    [{ data: { 'tls.crt': 'x' } }, 'secrets.v1.keys', [1]],
    [{ spec: { podSelector: { matchLabels: { app: 'api' } } } }, 'networkpolicies.v1.networking.k8s.io.pods', ['app=api']],
    [{ spec: { podSelector: {} } }, 'networkpolicies.v1.networking.k8s.io.pods', []],
    [{ metadata: { labels: { 'pod-security.kubernetes.io/enforce': 'restricted' } } }, 'namespaces.v1.podSecurity', ['restricted']],
    [{ metadata: {} }, 'namespaces.v1.podSecurity', ['']],
    [{ metadata: { annotations: { 'storageclass.kubernetes.io/is-default-class': 'true' } } }, 'storageclasses.v1.storage.k8s.io.default', [true]],
    [{ metadata: {} }, 'storageclasses.v1.storage.k8s.io.default', [false]],
    [{ spec: { selector: { matchLabels: { app: 'api', tier: 'x' } } } }, 'poddisruptionbudgets.v1.policy.pods', ['app=api', 'tier=x']],
  ])('%j: %s is %j', (object, name, values) => {
    expect(valuesOf(object, name, paths(CONFIG))).toEqual(values);
  });
});

describe('a field’s version', () => {
  it('is what it is: the same definition, the same version; another, another', () => {
    const one = define({ a: { type: 'string', value: '.x' } }).a;
    expect(define({ b: { type: 'string', value: '.x' } }).b.version).toBe(one.version);
    expect(define({ a: { type: 'string', value: '.y' } }).a.version).not.toBe(one.version);
    expect(define({ a: { type: 'number', value: '.x' } }).a.version).not.toBe(one.version);
    // Its kinds and unit: not what its values are.
    expect(define({ a: { kinds: ['pods.v1'], type: 'string', unit: 'bytes', value: '.x' } }).a.version).toBe(one.version);
  });
});

const crdObject = {
  apiVersion: 'apiextensions.k8s.io/v1',
  kind: 'CustomResourceDefinition',
  metadata: { name: 'certificates.cert-manager.io', generation: 7 },
  spec: {
    group: 'cert-manager.io',
    names: { plural: 'certificates', kind: 'Certificate' },
    scope: 'Namespaced',
    versions: [
      {
        name: 'v1',
        served: true,
        storage: true,
        additionalPrinterColumns: [
          { name: 'Ready', type: 'string', jsonPath: '.status.conditions[?(@.type=="Ready")].status' },
          { name: 'Secret', type: 'string', jsonPath: '.spec.secretName' },
          { name: 'Renewals', type: 'integer', jsonPath: '.status.renewals' },
          { name: 'Everywhere', type: 'string', jsonPath: '..name' },
          { name: 'Odd', type: 'quantity', jsonPath: '.spec.x' },
          { name: 'Age', type: 'date', jsonPath: '.metadata.creationTimestamp' },
          { name: 'Name', type: 'string', jsonPath: '.spec.commonName' },
          { name: 'Issuer', type: 'string', jsonPath: '$.spec.issuerRef.name' },
          { name: 'Secret?', type: 'string', jsonPath: '.spec.other' },
          { name: '???', type: 'string', jsonPath: '.spec.x' },
        ],
      },
      { name: 'v1alpha1', served: false, storage: false, additionalPrinterColumns: [{ name: 'Old', type: 'string', jsonPath: '.spec.old' }] },
    ],
  },
};
/** A CRD as the cluster gives it: what crdFields reads of it is CrdLike. */
const certificates: CrdLike = crdObject;

describe("a CRD's columns", () => {
  const { fields, skipped } = crdFields(certificates);

  it('are fields of each version it serves: its path ($ aside), its declared type (Age every object’s already: its creation; Name of its own, kept)', () => {
    expect(Object.fromEntries(Object.entries(fields).map(([name, def]) => [name, [def.type, def.value, def.kinds]]))).toEqual({
      'certificates.v1.cert-manager.io.ready': ['string', '.status.conditions[?(@.type=="Ready")].status', ['certificates.v1.cert-manager.io']],
      'certificates.v1.cert-manager.io.secret': ['string', '.spec.secretName', ['certificates.v1.cert-manager.io']],
      'certificates.v1.cert-manager.io.renewals': ['number', '.status.renewals', ['certificates.v1.cert-manager.io']],
      'certificates.v1.cert-manager.io.name': ['string', '.spec.commonName', ['certificates.v1.cert-manager.io']],
      'certificates.v1.cert-manager.io.issuer': ['string', '.spec.issuerRef.name', ['certificates.v1.cert-manager.io']],
    });
  });

  it('leave out what is none of ours — a path, a type, a name another’s once made a field’s, no name — and say why', () => {
    expect(skipped).toEqual({
      'certificates.v1.cert-manager.io Everywhere': '.. (all the way down) is not taken at 0 of ..name',
      'certificates.v1.cert-manager.io Odd': 'no type quantity',
      'certificates.v1.cert-manager.io Secret?': "its field is Secret's (certificates.v1.cert-manager.io.secret)",
      'certificates.v1.cert-manager.io ???': 'no name to make a field of',
      'certificates.v1.cert-manager.io Age': "every object's already (core.created)",
    });
  });

  it('answer a scan', () => {
    const cert = { metadata: { name: 'c' }, spec: { secretName: 'tls' }, status: { renewals: '3', conditions: [{ type: 'Ready', status: 'True' }] } };
    const found = scan(
      [cert],
      { kind: 'certificates.v1.cert-manager.io', page: { limit: 5 }, where: { field: 'certificates.v1.cert-manager.io.renewals', op: 'range', gte: 3 } },
      paths(fields),
    );
    expect(found.total?.count).toBe(1);
  });
});

describe("a kind's base", () => {
  it('is every object’s fields and its own: a pod’s, not a node’s', () => {
    const base = Object.keys(baseFields('pods.v1').fields);
    expect(base).toEqual(expect.arrayContaining(['core.name', 'core.conditions', 'pods.v1.restarts']));
    expect(base.some((n) => n.startsWith('nodes.v1.'))).toBe(false);
  });

  it('is a CRD’s columns too, for its kind', () => {
    expect(Object.keys(baseFields('certificates.v1.cert-manager.io', certificates).fields)).toEqual(
      expect.arrayContaining(['core.ready', 'certificates.v1.cert-manager.io.secret']),
    );
  });
});
