import { fieldsOf, scan, valuesOf } from '@overkube/query';
import { describe, expect, it } from 'vitest';
import { BATCH, baseFields, COMMON, CONFIG, type CrdLike, crdFields, type Defs, define, KUBE_CEL, PODS, PRINTERS, WORKLOADS } from './index.ts';

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
    ['core.controller', ['ReplicaSet/web']],
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

  it("each container's state: ready, running not ready, waiting, terminated (by their reasons), none said; init ones first, ephemeral ones last", () => {
    const states = [{ running: {} }, { running: {} }, { waiting: { reason: 'CrashLoopBackOff' } }, { terminated: { reason: 'Completed' } }, {}];
    const statuses = states.map((state, i) => ({ name: `c${i}`, ready: i === 0, state }));
    const init = [{ name: 'setup', state: { terminated: { reason: 'Completed' } } }];
    const debug = [{ name: 'debug', ready: false, state: { running: {} } }];
    expect(valuesOf({ status: { initContainerStatuses: init, ephemeralContainerStatuses: debug } }, 'pods.v1.containerStates', paths(PODS))).toEqual([
      'setup|Completed',
      'debug|NotReady',
    ]);
    expect(valuesOf({ status: { containerStatuses: statuses } }, 'pods.v1.containerStates', paths(PODS))).toEqual([
      'c0|Running',
      'c1|NotReady',
      'c2|CrashLoopBackOff',
      'c3|Completed',
      'c4|Unknown',
    ]);
  });
});

describe('when a job ran and a workload rolled out', () => {
  const t = (iso: string) => [Date.parse(iso)];
  it.each([
    [{ status: { startTime: '2026-10-01T10:00:00Z', completionTime: '2026-10-01T10:05:00Z' } }, BATCH, 'jobs.v1.batch.started', t('2026-10-01T10:00:00Z')],
    [{ status: { completionTime: '2026-10-01T10:05:00Z' } }, BATCH, 'jobs.v1.batch.finished', t('2026-10-01T10:05:00Z')],
    [{ status: {} }, BATCH, 'jobs.v1.batch.finished', []],
    [{ status: { conditions: [{ type: 'Failed', status: 'True', lastTransitionTime: '2026-10-01T10:07:00Z' }] } }, BATCH, 'jobs.v1.batch.finished', t('2026-10-01T10:07:00Z')],
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

describe('what kubectl prints, worked out', () => {
  const of = (object: object, name: string) => valuesOf(object, name, paths(PRINTERS));
  it('writes a label selector as kubectl does: its requirements by key (labels and expressions together), an expression’s values sorted; none, nothing', () => {
    const spec = {
      selector: {
        matchLabels: { tier: 'web', app: 'shop' },
        matchExpressions: [
          { key: 'zone', operator: 'In', values: ['a', 'b'] },
          { key: 'env', operator: 'NotIn', values: ['dev'] },
          { key: 'gpu', operator: 'Exists' },
          { key: 'canary', operator: 'DoesNotExist' },
        ],
      },
    };
    expect(of({ spec }, 'deployments.v1.apps.selector')).toEqual(['app=shop,!canary,env notin (dev),gpu,tier=web,zone in (a,b)']);
    // Values sorted too, a label among the expressions by its key.
    expect(
      of(
        {
          spec: {
            selector: {
              matchLabels: { z: '9' },
              matchExpressions: [
                { key: 'b', operator: 'In', values: ['z', 'a'] },
                { key: 'a', operator: 'Exists' },
              ],
            },
          },
        },
        'deployments.v1.apps.selector',
      ),
    ).toEqual(['a,b in (a,z),z=9']);
    expect(of({ spec: {} }, 'jobs.v1.batch.selector')).toEqual(['']);
    expect(of({ spec: { jobTemplate: { spec: { selector: { matchLabels: { a: '1' } } } } } }, 'cronjobs.v1.batch.selector')).toEqual(['a=1']);
    expect(of({ spec: { selector: { b: '2', a: '1' } } }, 'services.v1.selector')).toEqual(['a=1,b=2']);
  });

  it('reads a workload’s containers and images, a daemon set’s node selector, a cron job’s active jobs, an account’s secrets, an ingress’s ports', () => {
    const template = {
      spec: {
        containers: [
          { name: 'app', image: 'app:1' },
          { name: 'proxy', image: 'proxy:2' },
        ],
        nodeSelector: { os: 'linux' },
      },
    };
    expect([
      of({ spec: { template } }, 'deployments.v1.apps.containers'),
      of({ spec: { template } }, 'jobs.v1.batch.images'),
      of({ spec: { jobTemplate: { spec: { template } } } }, 'cronjobs.v1.batch.containers'),
      of({ spec: { template } }, 'daemonsets.v1.apps.nodeSelector'),
      of({ status: { active: [{ name: 'a' }, { name: 'b' }] } }, 'cronjobs.v1.batch.active'),
      of({}, 'cronjobs.v1.batch.active'),
      of({ secrets: [{ name: 't' }] }, 'serviceaccounts.v1.secrets'),
      of({ spec: { tls: [{ secretName: 'x' }] } }, 'ingresses.v1.networking.k8s.io.ports'),
      of({ spec: {} }, 'ingresses.v1.networking.k8s.io.ports'),
    ]).toEqual([['app', 'proxy'], ['app:1', 'proxy:2'], ['app', 'proxy'], ['os=linux'], [2], [0], [1], ['80, 443'], ['80']]);
  });

  it('writes an autoscaler’s targets as kubectl does: each metric now of its target, matched by type and name; not known yet, <unknown>', () => {
    const hpa = {
      spec: {
        metrics: [
          { type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } } },
          { type: 'Resource', resource: { name: 'memory', target: { type: 'AverageValue', averageValue: '500Mi' } } },
          { type: 'Pods', pods: { metric: { name: 'rps' }, target: { type: 'AverageValue', averageValue: '100' } } },
          { type: 'External', external: { metric: { name: 'queue' }, target: { type: 'AverageValue', averageValue: '30' } } },
        ],
      },
      status: {
        currentMetrics: [
          { type: 'Pods', pods: { metric: { name: 'rps' }, current: { averageValue: '42' } } },
          { type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 42 } } },
        ],
      },
    };
    expect(of(hpa, 'horizontalpodautoscalers.v2.autoscaling.targets')).toEqual(['cpu: 42%/70%', 'memory: <unknown>/500Mi', '42/100', '<unknown>/30 (avg)']);
  });

  it('tells an autoscaler’s metrics of one name apart (the object each describes, its selector), reads the value its target is of — a total for an average, unknown; no target, <auto>', () => {
    const object = (name: string, kind: string, current?: object) => ({
      type: 'Object',
      object: { metric: { name: 'requests' }, describedObject: { kind, name }, ...(current ? { current } : { target: { type: 'Value', value: '100' } }) },
    });
    const external = (q: string, current?: object) => ({
      type: 'External',
      external: { metric: { name: 'queue', selector: { matchLabels: { q } } }, ...(current ? { current } : { target: { type: 'AverageValue', averageValue: '50' } }) },
    });
    const hpa = {
      spec: {
        metrics: [object('a', 'Service'), object('b', 'Service'), external('x'), { type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization' } } }],
      },
      status: {
        currentMetrics: [object('a', 'Service', { value: '10' }), object('b', 'Service', { value: '90' }), external('x', { value: '1000' })],
      },
    };
    expect(of(hpa, 'horizontalpodautoscalers.v2.autoscaling.targets')).toEqual(['10/100', '90/100', '<unknown>/50 (avg)', 'cpu: <unknown>/<auto>']);
  });

  it('writes a quota’s use, its requests apart from its limits (by name), a binding’s subjects by kind, a pod’s readiness gates met', () => {
    const quota = { status: { hard: { pods: '50', 'requests.cpu': '8', 'limits.memory': '4Gi' }, used: { pods: '46', 'limits.memory': '1Gi' } } };
    const binding = {
      metadata: { namespace: 'shop' },
      subjects: [
        { kind: 'User', name: 'jane' },
        { kind: 'Group', name: 'devs' },
        { kind: 'ServiceAccount', name: 'app', namespace: 'shop' },
      ],
    };
    const pod = { spec: { readinessGates: [{ conditionType: 'a' }, { conditionType: 'b' }] }, status: { conditions: [{ type: 'a', status: 'True' }] } };
    expect([
      of(quota, 'resourcequotas.v1.request'),
      of(quota, 'resourcequotas.v1.limit'),
      of(binding, 'rolebindings.v1.rbac.authorization.k8s.io.users'),
      of(binding, 'clusterrolebindings.v1.rbac.authorization.k8s.io.groups'),
      of(binding, 'rolebindings.v1.rbac.authorization.k8s.io.serviceAccounts'),
      of(pod, 'pods.v1.readinessGates'),
      of({ spec: {} }, 'pods.v1.readinessGates'),
    ]).toEqual([['pods: 46/50', 'requests.cpu: 0/8'], ['limits.memory: 1Gi/4Gi'], ['jane'], ['devs'], ['shop:app'], ['1/2'], ['']]);
  });
});
