import { describe, expect, it } from 'vitest';
import { daemonSetColumns, deploymentColumns, statefulSetColumns } from './apps/v1.js';
import { cronJobColumns, jobColumns } from './batch/v1.js';
import { eventColumns, nodeColumns, persistentVolumeClaimColumns, podColumns, serviceColumns } from './core/v1.js';
import { ingressColumns, networkPolicyColumns } from './networking/v1.js';
import { humanDuration, type PrinterColumn, selectorString } from './print.js';
import { storageClassColumns } from './storage/v1.js';

/*
 * kubectl's columns, ported: each kind's cells as kubectl prints them —
 * the cases of the API server's own printers_test.go (v1.37.1), their
 * objects as the API gives them (JSON), their cells as kubectl shows them
 * (without -o wide: the columns of priority 0; with it: all) — as the
 * API server prints them, always wide (an address never clipped).
 */

const NOW = Date.UTC(2026, 0, 1, 12);
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

/** A kind's cells for one object (of these shown with it): kubectl's, or -o wide's. */
function cells<O>(columns: readonly PrinterColumn<O>[], object: unknown, { wide = false, objects }: { wide?: boolean; objects?: unknown[] } = {}) {
  const o = object as O;
  return columns.filter((c) => wide || !c.priority).map((c) => c.display(o, { now: NOW, objects: (objects ?? [object]) as O[] }));
}

/** A pod of n containers (no names: as the Go cases' make([]Container, n)). */
const pod = (name: string, status: object, more: { containers?: number; initContainers?: object[]; deletionTimestamp?: string } = {}) => ({
  metadata: { name, ...(more.deletionTimestamp ? { deletionTimestamp: more.deletionTimestamp } : {}) },
  spec: { containers: Array.from({ length: more.containers ?? 2 }, () => ({ name: '' })), ...(more.initContainers ? { initContainers: more.initContainers } : {}) },
  status,
});
const running = { running: {} };
const ended = (finishedAgo: number) => ({ terminated: { exitCode: 0, finishedAt: ago(finishedAgo) } });

describe('humanDuration (duration.HumanDuration)', () => {
  it('says a span as kubectl does', () => {
    const cases: [number, string][] = [
      [-2 * S, '<invalid>'],
      [-1 * S, '0s'],
      [45 * S, '45s'],
      [119 * S, '119s'],
      [3 * M + 20 * S, '3m20s'],
      [9 * M, '9m'],
      [90 * M, '90m'],
      [5 * H + 12 * M, '5h12m'],
      [7 * H, '7h'],
      [30 * H, '30h'],
      [3 * D + 4 * H, '3d4h'],
      [10 * D, '10d'],
      [3 * 365 * D + 10 * D, '3y10d'],
      [10 * 365 * D, '10y'],
    ];
    expect(cases.map(([ms]) => humanDuration(ms))).toEqual(cases.map(([, said]) => said));
  });
});

describe('a pod (printPod)', () => {
  it('counts its ready containers and restarts; its first container’s reason over its phase; Completed back to Running or NotReady while one runs', () => {
    const rows = [
      pod('test1', { phase: 'podPhase', containerStatuses: [{ ready: true, restartCount: 3, state: running }, { restartCount: 3 }] }),
      pod('test2', {
        phase: 'podPhase',
        containerStatuses: [
          { ready: true, restartCount: 3, state: running },
          { state: { waiting: { reason: 'ContainerWaitingReason' } }, restartCount: 3 },
        ],
      }),
      pod('test3', {
        phase: 'podPhase',
        containerStatuses: [
          { state: { waiting: { reason: 'ContainerWaitingReason' } }, restartCount: 3 },
          { state: { terminated: { reason: 'ContainerTerminatedReason', exitCode: 0 } }, restartCount: 3 },
        ],
      }),
      pod('test4', {
        phase: 'podPhase',
        containerStatuses: [
          { ready: true, restartCount: 3, state: running },
          { ready: true, restartCount: 3 },
        ],
      }),
      pod('test5', {
        reason: 'podReason',
        phase: 'podPhase',
        containerStatuses: [
          { ready: true, restartCount: 3, state: running },
          { ready: true, restartCount: 3 },
        ],
      }),
      pod('test6', {
        phase: 'Running',
        containerStatuses: [
          { ready: true, restartCount: 3, state: { terminated: { reason: 'Completed', exitCode: 0 } } },
          { ready: true, restartCount: 3, state: running },
        ],
      }),
      pod('test6', {
        phase: 'Running',
        containerStatuses: [
          { ready: true, restartCount: 3, state: { terminated: { reason: 'Completed', exitCode: 0 } } },
          { ready: true, restartCount: 3, state: running },
        ],
        conditions: [{ type: 'Ready', status: 'True' }],
      }),
    ].map((p) => cells(podColumns, p));
    expect(rows).toEqual([
      ['test1', '1/2', 'podPhase', '6', '<unknown>'],
      ['test2', '1/2', 'ContainerWaitingReason', '6', '<unknown>'],
      ['test3', '0/2', 'ContainerWaitingReason', '6', '<unknown>'],
      ['test4', '1/2', 'podPhase', '6', '<unknown>'],
      ['test5', '1/2', 'podReason', '6', '<unknown>'],
      ['test6', '1/2', 'NotReady', '6', '<unknown>'],
      ['test6', '1/2', 'Running', '6', '<unknown>'],
    ]);
  });

  it('says its init containers’ progress (Init:n/m), and when it last restarted, live', () => {
    const one = { containers: 1 };
    const rows = [
      pod(
        'test7',
        { phase: 'podPhase', initContainerStatuses: [{ restartCount: 3, state: running, lastState: ended(10 * S) }], containerStatuses: [{ state: { waiting: {} } }] },
        { ...one, initContainers: [{ name: '' }] },
      ),
      pod(
        'test8',
        {
          phase: 'podPhase',
          initContainerStatuses: [{ restartCount: 3, state: running, lastState: ended(10 * S) }, { state: { waiting: {} } }],
          containerStatuses: [{ state: { waiting: {} } }],
        },
        { ...one, initContainers: [{ name: '' }, { name: '' }] },
      ),
      pod(
        'test9',
        {
          phase: 'podPhase',
          initContainerStatuses: [{ state: { terminated: {} } }, { restartCount: 3, state: running, lastState: ended(10 * S) }],
          containerStatuses: [{ state: { waiting: {} } }],
        },
        { ...one, initContainers: [{ name: '' }, { name: '' }] },
      ),
      pod(
        'test10',
        {
          phase: 'podPhase',
          initContainerStatuses: [
            { restartCount: 2, state: { terminated: {} }, lastState: ended(2 * M) },
            { restartCount: 3, state: running, lastState: ended(10 * S) },
          ],
          containerStatuses: [{ state: { waiting: {} } }],
        },
        { ...one, initContainers: [{ name: '' }, { name: '' }] },
      ),
      pod(
        'test11',
        {
          phase: 'Running',
          initContainerStatuses: [{ restartCount: 2, state: { terminated: {} }, lastState: ended(2 * M) }],
          containerStatuses: [{ restartCount: 4, state: running, lastState: ended(20 * S) }],
        },
        { ...one, initContainers: [{ name: '' }] },
      ),
      pod('test12', { phase: 'Running', containerStatuses: [{ ready: true, restartCount: 3, state: running, lastState: ended(5 * D) }] }, one),
      pod('test14', {
        phase: 'Running',
        containerStatuses: [
          { ready: true, restartCount: 3, state: running, lastState: ended(5 * D) },
          { ready: true, restartCount: 6, state: running, lastState: ended(20 * D) },
        ],
      }),
    ].map((p) => cells(podColumns, p));
    expect(rows).toEqual([
      ['test7', '0/1', 'Init:0/1', '3 (10s ago)', '<unknown>'],
      ['test8', '0/1', 'Init:0/2', '3 (10s ago)', '<unknown>'],
      ['test9', '0/1', 'Init:1/2', '3 (10s ago)', '<unknown>'],
      ['test10', '0/1', 'Init:1/2', '5 (10s ago)', '<unknown>'],
      ['test11', '0/1', 'Running', '4 (20s ago)', '<unknown>'],
      ['test12', '1/1', 'Running', '3 (5d ago)', '<unknown>'],
      ['test14', '2/2', 'Running', '9 (5d ago)', '<unknown>'],
    ]);
  });

  it('says it is gated, done, failed, going (Terminating) — a container’s error over Completed', () => {
    const deleted = ago(10 * S);
    const one = { containers: 1 };
    const rows = [
      pod('test15', { phase: 'podPhase', conditions: [{ type: 'PodScheduled', status: 'False', reason: 'SchedulingGated' }] }),
      pod('test16', { phase: 'Succeeded', containerStatuses: [{ state: { terminated: { reason: 'Completed', exitCode: 0 } } }] }, one),
      pod('test17', { phase: 'Failed', containerStatuses: [{ state: { terminated: { reason: 'Error', exitCode: 1 } } }] }, one),
      pod('test18', { phase: 'Succeeded', containerStatuses: [{ state: { terminated: { reason: 'Completed', exitCode: 0 } } }] }, { ...one, deletionTimestamp: deleted }),
      pod('test19', { phase: 'Running', containerStatuses: [{ state: running }] }, { ...one, deletionTimestamp: deleted }),
      pod('test20', { phase: 'Pending' }, { ...one, deletionTimestamp: deleted }),
      pod('test21', {
        phase: 'Failed',
        containerStatuses: [{ state: { terminated: { exitCode: 1, reason: 'podCrash' } } }, { ready: true, state: running }],
      }),
      pod(
        'test23',
        {
          phase: 'Failed',
          containerStatuses: [
            { ready: true, state: running },
            { ready: true, state: { terminated: { exitCode: 1, reason: 'podCrash' } } },
            { ready: true, state: { terminated: { exitCode: 0 } } },
          ],
        },
        { containers: 3 },
      ),
      pod('lost', { phase: 'Running', reason: 'NodeLost' }, { ...one, deletionTimestamp: deleted }),
    ].map((p) => cells(podColumns, p));
    expect(rows).toEqual([
      ['test15', '0/2', 'SchedulingGated', '0', '<unknown>'],
      ['test16', '0/1', 'Completed', '0', '<unknown>'],
      ['test17', '0/1', 'Error', '0', '<unknown>'],
      ['test18', '0/1', 'Completed', '0', '<unknown>'],
      ['test19', '0/1', 'Terminating', '0', '<unknown>'],
      ['test20', '0/1', 'Terminating', '0', '<unknown>'],
      ['test21', '1/2', 'podCrash', '0', '<unknown>'],
      ['test23', '1/3', 'podCrash', '0', '<unknown>'],
      ['lost', '0/1', 'Unknown', '0', '<unknown>'],
    ]);
  });

  it('counts its sidecars (restartable init containers) with its containers, ready once started', () => {
    const sidecars = [
      { name: 'restartable-init-1', restartPolicy: 'Always' },
      { name: 'restartable-init-2', restartPolicy: 'Always' },
    ];
    const rows = [
      pod(
        'test1',
        {
          phase: 'Pending',
          initContainerStatuses: [
            { name: 'restartable-init-1', restartCount: 3, state: running, started: false, lastState: ended(10 * S) },
            { name: 'restartable-init-2', state: { waiting: {} }, started: false },
          ],
          containerStatuses: [{ state: { waiting: {} } }],
          conditions: [{ type: 'Initialized', status: 'False' }],
        },
        { containers: 1, initContainers: sidecars },
      ),
      pod(
        'test2',
        {
          phase: 'Running',
          initContainerStatuses: [
            { name: 'restartable-init-1', restartCount: 3, state: running, started: true, lastState: ended(10 * S) },
            { name: 'restartable-init-2', state: running, started: true },
          ],
          containerStatuses: [{ ready: true, restartCount: 4, state: running, lastState: ended(20 * S) }],
          conditions: [{ type: 'Initialized', status: 'True' }],
        },
        { containers: 1, initContainers: sidecars },
      ),
      pod(
        'test3',
        {
          phase: 'Succeeded',
          initContainerStatuses: [
            { name: 'restartable-init-1', restartCount: 3, state: { terminated: { reason: 'Error', exitCode: 137 } }, started: false, lastState: ended(10 * S) },
            { name: 'restartable-init-2', state: { terminated: { reason: 'Error', exitCode: 137 } }, started: false },
          ],
          containerStatuses: [{ restartCount: 4, state: { terminated: { reason: 'Completed', exitCode: 0 } }, lastState: ended(20 * S) }],
          conditions: [{ type: 'Initialized', status: 'True' }],
        },
        { containers: 1, initContainers: sidecars },
      ),
    ].map((p) => cells(podColumns, p));
    expect(rows).toEqual([
      ['test1', '0/3', 'Init:0/2', '3 (10s ago)', '<unknown>'],
      ['test2', '1/3', 'Running', '7 (10s ago)', '<unknown>'],
      ['test3', '0/3', 'Completed', '7 (10s ago)', '<unknown>'],
    ]);
  });

  it('says, with -o wide, its IP, node, nominated node, readiness gates met', () => {
    const p = {
      metadata: { name: 'web', creationTimestamp: ago(3 * H) },
      spec: { containers: [{ name: 'a' }], nodeName: 'node1', readinessGates: [{ conditionType: 'x' }, { conditionType: 'y' }] },
      status: { phase: 'Running', podIPs: [{ ip: '10.0.0.5' }], conditions: [{ type: 'x', status: 'True' }] },
    };
    expect(cells(podColumns, p, { wide: true })).toEqual(['web', '0/1', 'Running', '0', '3h', '10.0.0.5', 'node1', '<none>', '1/2']);
  });
});

describe('the other kinds', () => {
  it('a service: its external addresses as its type has them, its ports with node ports', () => {
    const svc = (name: string, spec: object, status?: object) => ({ metadata: { name }, spec, status });
    const lb = (ips: string[]) => ({ loadBalancer: { ingress: ips.map((ip) => ({ ip })) } });
    expect(
      [
        svc('service1', { type: 'LoadBalancer', clusterIPs: ['1.2.3.4'], ports: [{ port: 80, protocol: 'TCP' }] }, lb(['2.3.4.5', '3.4.5.6'])),
        svc('service2', {
          type: 'LoadBalancer',
          clusterIPs: ['1.3.4.5'],
          ports: [
            { port: 80, protocol: 'TCP' },
            { port: 8090, protocol: 'UDP' },
          ],
        }),
        // Printed wide, as the server always does: not clipped (printers_test's non-wide "2.3.4.5,3.4.5..." is never asked for).
        svc('service4', { type: 'LoadBalancer', clusterIPs: ['1.5.6.7'], ports: [{ port: 80, protocol: 'TCP' }] }, lb(['2.3.4.5', '3.4.5.6', '5.6.7.8'])),
        svc('np', { type: 'NodePort', clusterIPs: ['10.0.0.1'], ports: [{ port: 80, nodePort: 30080, protocol: 'TCP' }] }),
        svc('ext', { type: 'ExternalName', externalName: 'db.example.com' }),
      ].map((s) => cells(serviceColumns, s)),
    ).toEqual([
      ['service1', 'LoadBalancer', '1.2.3.4', '2.3.4.5,3.4.5.6', '80/TCP', '<unknown>'],
      ['service2', 'LoadBalancer', '1.3.4.5', '<pending>', '80/TCP,8090/UDP', '<unknown>'],
      ['service4', 'LoadBalancer', '1.5.6.7', '2.3.4.5,3.4.5.6,5.6.7.8', '80/TCP', '<unknown>'],
      ['np', 'NodePort', '10.0.0.1', '<none>', '80:30080/TCP', '<unknown>'],
      ['ext', 'ExternalName', '<none>', 'db.example.com', '<none>', '<unknown>'],
    ]);
  });

  it('a node: Ready or not, SchedulingDisabled, Unknown without the condition; its roles from its labels, sorted', () => {
    const node = (name: string, ready: string | undefined, unschedulable = false, labels: Record<string, string> = {}) => ({
      metadata: { name, labels },
      spec: { unschedulable },
      status: { conditions: ready ? [{ type: 'Ready', status: ready }] : [] },
    });
    expect(
      [
        node('foo1', 'True'),
        node('foo2', 'True', true),
        node('foo4', 'False'),
        node('foo8', undefined, true),
        node('foo10', undefined, false, {
          'node-role.kubernetes.io/master': '',
          'node-role.kubernetes.io/control-plane': '',
          'node-role.kubernetes.io/proxy': '',
          'kubernetes.io/role': 'node',
        }),
      ].map((n) => cells(nodeColumns, n)),
    ).toEqual([
      ['foo1', 'Ready', '<none>', '<unknown>', ''],
      ['foo2', 'Ready,SchedulingDisabled', '<none>', '<unknown>', ''],
      ['foo4', 'NotReady', '<none>', '<unknown>', ''],
      ['foo8', 'Unknown,SchedulingDisabled', '<none>', '<unknown>', ''],
      ['foo10', 'Unknown', 'control-plane,master,node,proxy', '<unknown>', ''],
    ]);
  });

  it('an ingress: its class, its first three hosts named ("*": none), its address, its ports', () => {
    const ing = (name: string, spec: object) => ({ metadata: { name, creationTimestamp: ago(10 * 365 * D) }, spec, status: { loadBalancer: { ingress: [{ ip: '2.3.4.5' }] } } });
    const rules = (...hosts: string[]) => hosts.map((host) => ({ host }));
    expect(
      [ing('test1', { ingressClassName: 'foo', rules: [{}] }), ing('many', { rules: rules('', 'a.com', 'b.com', 'c.com', 'd.com'), tls: [{}] })].map((i) =>
        cells(ingressColumns, i),
      ),
    ).toEqual([
      ['test1', 'foo', '*', '2.3.4.5', '80', '10y'],
      ['many', '<none>', 'a.com,b.com,c.com + 2 more...', '2.3.4.5', '80, 443', '10y'],
    ]);
  });

  it('a storage class: "(default)" after the default of those shown — the newest marked, then the first by name', () => {
    const sc = (name: string, made: number, isDefault = false) => ({
      metadata: { name, creationTimestamp: ago(made), annotations: isDefault ? { 'storageclass.kubernetes.io/is-default-class': 'true' } : {} },
      provisioner: 'kubernetes.io/gce-pd',
    });
    const shown = [sc('standard', 60 * M, true), sc('fast', 0, true), sc('alpha', 0, true), sc('zeta', 0)];
    expect(shown.map((c) => cells(storageClassColumns, c, { objects: shown }))).toEqual([
      ['standard', 'kubernetes.io/gce-pd', 'Delete', 'Immediate', 'false', '60m'],
      ['fast', 'kubernetes.io/gce-pd', 'Delete', 'Immediate', 'false', '0s'],
      ['alpha (default)', 'kubernetes.io/gce-pd', 'Delete', 'Immediate', 'false', '0s'],
      ['zeta', 'kubernetes.io/gce-pd', 'Delete', 'Immediate', 'false', '0s'],
    ]);
  });

  it('a job: its state, completions, how long it ran (live while it runs); a cron job: its schedule, last run', () => {
    const job = (name: string, spec: object, status: object, deletionTimestamp?: string) => ({ metadata: { name, creationTimestamp: ago(0), deletionTimestamp }, spec, status });
    expect(
      [
        job('job1', { completions: 2 }, { succeeded: 1 }),
        job('job3', {}, { startTime: ago(60 * M), completionTime: ago(30 * M) }),
        job('job4', {}, { startTime: ago(20 * M) }),
        job('job5', {}, { conditions: [{ type: 'Complete', status: 'True' }] }),
        job('job6', {}, { conditions: [{ type: 'Failed', status: 'True' }] }),
        job('job7', {}, { conditions: [{ type: 'Suspended', status: 'True' }] }),
        job('job8', { parallelism: 3 }, { succeeded: 1 }, ago(S)),
      ].map((j) => cells(jobColumns, j)),
    ).toEqual([
      ['job1', 'Running', '1/2', '', '0s'],
      ['job3', 'Running', '0/1', '30m', '0s'],
      ['job4', 'Running', '0/1', '20m', '0s'],
      ['job5', 'Complete', '0/1', '', '0s'],
      ['job6', 'Failed', '0/1', '', '0s'],
      ['job7', 'Suspended', '0/1', '', '0s'],
      ['job8', 'Terminating', '1/1 of 3', '', '0s'],
    ]);
    const cron = (name: string, spec: object, status: object) => ({
      metadata: { name, creationTimestamp: ago(5 * M) },
      spec: { schedule: '0/5 * * * ?', suspend: false, ...spec },
      status,
    });
    expect([cron('cronjob2', {}, { lastScheduleTime: ago(30 * S) }), cron('cronjob3', { timeZone: 'LOCAL' }, {})].map((c) => cells(cronJobColumns, c))).toEqual([
      ['cronjob2', '0/5 * * * ?', '<none>', 'False', '0', '30s', '5m'],
      ['cronjob3', '0/5 * * * ?', 'LOCAL', 'False', '0', '<none>', '5m'],
    ]);
  });

  it('workloads: ready of desired, up to date, available; with -o wide, their containers, images, selector', () => {
    const template = {
      spec: {
        containers: [
          { name: 'fake-container1', image: 'fake-image1' },
          { name: 'fake-container2', image: 'fake-image2' },
        ],
      },
    };
    const made = { name: 'test1', creationTimestamp: ago(0) };
    const deployment = {
      metadata: made,
      spec: { replicas: 5, template, selector: { matchLabels: { foo: 'bar' } } },
      status: { replicas: 10, updatedReplicas: 2, availableReplicas: 1 },
    };
    const daemonSet = {
      metadata: made,
      spec: { template, selector: { matchLabels: { foo: 'bar' } } },
      status: { currentNumberScheduled: 2, desiredNumberScheduled: 3, numberReady: 1, updatedNumberScheduled: 2, numberAvailable: 0 },
    };
    const statefulSet = { metadata: made, spec: { replicas: 5, template }, status: { readyReplicas: 2 } };
    expect([
      cells(deploymentColumns, deployment, { wide: true }),
      cells(daemonSetColumns, daemonSet, { wide: true }),
      cells(statefulSetColumns, statefulSet, { wide: true }),
    ]).toEqual([
      ['test1', '0/5', '2', '1', '0s', 'fake-container1,fake-container2', 'fake-image1,fake-image2', 'foo=bar'],
      ['test1', '3', '2', '1', '2', '0', '<none>', '0s', 'fake-container1,fake-container2', 'fake-image1,fake-image2', 'foo=bar'],
      ['test1', '2/5', '0s', 'fake-container1,fake-container2', 'fake-image1,fake-image2'],
    ]);
  });

  it('a claim: bound, its volume’s capacity and modes; not, none; its classes; a network policy: its pod selector', () => {
    const claim = (name: string, spec: object, status: object) => ({ metadata: { name }, spec: { volumeMode: 'Filesystem', ...spec }, status });
    expect(
      [
        claim('test1', { volumeName: 'my-volume' }, { phase: 'Bound', capacity: { storage: '4Gi' }, accessModes: ['ReadOnlyMany'] }),
        claim('test2', {}, { phase: 'Lost', capacity: { storage: '4Gi' }, accessModes: ['ReadOnlyMany'] }),
        claim('test4', { volumeName: 'my-volume', storageClassName: 'my-scn' }, { phase: 'Pending', capacity: { storage: '10Gi' }, accessModes: ['ReadWriteOnce'] }),
      ].map((c) => cells(persistentVolumeClaimColumns, c, { wide: true })),
    ).toEqual([
      ['test1', 'Bound', 'my-volume', '4Gi', 'ROX', '', '<unset>', '<unknown>', 'Filesystem'],
      ['test2', 'Lost', '', '', '', '', '<unset>', '<unknown>', 'Filesystem'],
      ['test4', 'Pending', 'my-volume', '10Gi', 'RWO', 'my-scn', '<unset>', '<unknown>', 'Filesystem'],
    ]);
    const policy = (name: string, spec: object) => ({ metadata: { name, creationTimestamp: ago(0) }, spec });
    expect([policy('policy1', { podSelector: {} }), policy('policy2', { podSelector: { matchLabels: { foo: 'bar' } } })].map((p) => cells(networkPolicyColumns, p))).toEqual([
      ['policy1', '<none>', '0s'],
      ['policy2', 'foo=bar', '0s'],
    ]);
  });

  it('an event: last seen (its series’ last, its last, else its first), its object, its message', () => {
    const event = (more: object) => ({ type: 'Normal', reason: 'Event Reason', message: 'Message Data ', involvedObject: { kind: 'Pod', name: 'Pod Name' }, ...more });
    expect(
      [
        event({ firstTimestamp: ago(3 * D), lastTimestamp: ago(2 * D) }),
        event({ firstTimestamp: ago(3 * D) }),
        event({ eventTime: ago(3 * D), series: { count: 2, lastObservedTime: ago(2 * D) } }),
      ].map((e) => cells(eventColumns, e)),
    ).toEqual([
      ['2d', 'Normal', 'Event Reason', 'pod/Pod Name', 'Message Data'],
      ['3d', 'Normal', 'Event Reason', 'pod/Pod Name', 'Message Data'],
      ['2d', 'Normal', 'Event Reason', 'pod/Pod Name', 'Message Data'],
    ]);
  });
});

describe('a label selector (labels.Selector.String)', () => {
  it('writes its requirements sorted by key: =, in, notin, exists, !; an operator it does not know, none', () => {
    expect(
      selectorString({
        matchLabels: { tier: 'web' },
        matchExpressions: [
          { key: 'env', operator: 'In', values: ['prod', 'dev'] },
          { key: 'zone', operator: 'NotIn', values: ['a'] },
          { key: 'app', operator: 'Exists' },
          { key: 'legacy', operator: 'DoesNotExist' },
        ],
      }),
    ).toBe('app,env in (dev,prod),!legacy,tier=web,zone notin (a)');
    expect([selectorString(undefined), selectorString({}), selectorString({ matchExpressions: [{ key: 'a', operator: 'Gt' }] })]).toEqual(['', '', undefined]);
  });
});
