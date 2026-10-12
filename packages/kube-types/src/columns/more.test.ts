import { describe, expect, it } from 'vitest';
import { validatingAdmissionPolicyBindingColumns } from './admissionregistration/v1.js';
import { apiServiceColumns } from './apiregistration/v1.js';
import { controllerRevisionColumns } from './apps/v1.js';
import { horizontalPodAutoscalerColumns as hpaV1 } from './autoscaling/v1.js';
import { horizontalPodAutoscalerColumns as hpaV2 } from './autoscaling/v2.js';
import { certificateSigningRequestColumns } from './certificates/v1.js';
import { leaseColumns } from './coordination/v1.js';
import { componentStatusColumns, endpointsColumns, replicationControllerColumns, resourceQuotaColumns } from './core/v1.js';
import { endpointSliceColumns } from './discovery/v1.js';
import { eventColumns } from './events/v1.js';
import { flowSchemaColumns, priorityLevelConfigurationColumns } from './flowcontrol/v1.js';
import { ingressClassColumns, ipAddressColumns } from './networking/v1.js';
import { podDisruptionBudgetColumns } from './policy/v1.js';
import type { PrinterColumn } from './print.js';
import { roleBindingColumns, roleColumns } from './rbac/v1.js';
import { resourceClaimColumns } from './resource/v1.js';
import { priorityClassColumns } from './scheduling/v1.js';

/*
 * The rest of the built-in kinds kubectl prints: their cells as printers_test.go
 * (v1.37.1) has them, their objects as the API gives them; a kind with no
 * printer, the default table (Name, Created At).
 */

const NOW = Date.UTC(2026, 0, 1, 12);
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const M = 60_000;

function cells<O>(columns: readonly PrinterColumn<O>[], object: unknown, wide = false) {
  return columns.filter((c) => wide || !c.priority).map((c) => c.display(object as O, { now: NOW, objects: [object as O] }));
}

describe('more kinds, as kubectl prints them', () => {
  it('an autoscaler (v2): its metrics current/target — "<unknown>" till measured, "(avg)", a resource’s utilization, "+ n more..." past two', () => {
    const hpa = (metrics: object[] | undefined, currentMetrics?: object[]) => ({
      metadata: { name: 'some-hpa' },
      spec: { scaleTargetRef: { kind: 'ReplicationController', name: 'some-rc' }, minReplicas: metrics ? 2 : undefined, maxReplicas: 10, metrics },
      status: { currentReplicas: 4, currentMetrics },
    });
    const pods = { type: 'Pods', pods: { metric: { name: 'some-pods-metric' }, target: { type: 'AverageValue', averageValue: '100m' } } };
    const cpu = { type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } } };
    const cpuNow = { type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 50 } } };
    expect(
      [
        hpa(undefined),
        hpa([{ type: 'External', external: { metric: { name: 'x' }, target: { type: 'AverageValue', averageValue: '100m' } } }]),
        hpa([pods], [{ type: 'Pods', pods: { metric: { name: 'some-pods-metric' }, current: { averageValue: '50m' } } }]),
        hpa([cpu]),
        hpa([cpu], [cpuNow]),
        hpa([pods, cpu, cpu], [{ type: 'Pods', pods: { metric: { name: 'some-pods-metric' }, current: { averageValue: '50m' } } }, cpuNow]),
      ].map((h) => cells(hpaV2, h)),
    ).toEqual([
      ['some-hpa', 'ReplicationController/some-rc', '<none>', '<unset>', '10', '4', '<unknown>'],
      ['some-hpa', 'ReplicationController/some-rc', '<unknown>/100m (avg)', '2', '10', '4', '<unknown>'],
      ['some-hpa', 'ReplicationController/some-rc', '50m/100m', '2', '10', '4', '<unknown>'],
      ['some-hpa', 'ReplicationController/some-rc', 'cpu: <unknown>/80%', '2', '10', '4', '<unknown>'],
      ['some-hpa', 'ReplicationController/some-rc', 'cpu: 50%/80%', '2', '10', '4', '<unknown>'],
      ['some-hpa', 'ReplicationController/some-rc', '50m/100m, cpu: 50%/80% + 1 more...', '2', '10', '4', '<unknown>'],
    ]);
  });

  it('an autoscaler (v1): its CPU target as the server converts it', () => {
    const hpa = {
      metadata: { name: 'h' },
      spec: { scaleTargetRef: { kind: 'Deployment', name: 'web' }, maxReplicas: 5, targetCPUUtilizationPercentage: 80 },
      status: { currentReplicas: 2, currentCPUUtilizationPercentage: 45 },
    };
    expect(cells(hpaV1, hpa)).toEqual(['h', 'Deployment/web', 'cpu: 45%/80%', '<unset>', '5', '2', '<unknown>']);
    // Its other metrics kept in annotations (first, then its CPU; the current ones, as kept, over its CPU's); none at all: CPU at 80%.
    const annotated = {
      ...hpa,
      metadata: {
        name: 'h',
        annotations: {
          'autoscaling.alpha.kubernetes.io/metrics': JSON.stringify([
            { type: 'Resource', resource: { name: 'memory', targetAverageValue: '500Mi' } },
            { type: 'External', external: { metricName: 'queue', targetAverageValue: '30' } },
          ]),
          'autoscaling.alpha.kubernetes.io/current-metrics': JSON.stringify([
            { type: 'Resource', resource: { name: 'memory', currentAverageValue: '200Mi' } },
            { type: 'External', external: { metricName: 'queue', currentValue: '0', currentAverageValue: '12' } },
            { type: 'Resource', resource: { name: 'cpu', currentAverageUtilization: 50, currentAverageValue: '100m' } },
          ]),
        },
      },
    };
    expect(cells(hpaV1, annotated)[2]).toBe('memory: 200Mi/500Mi, 12/30 (avg) + 1 more...');
    // The current ones kept replace its CPU's (none kept — null — none at all); a null in them, one of no type; anything else, not read.
    const only = (current: string) => ({ ...hpa, metadata: { name: 'h', annotations: { 'autoscaling.alpha.kubernetes.io/current-metrics': current } } });
    expect(
      [JSON.stringify([{ type: 'Resource', resource: { name: 'cpu', currentAverageUtilization: 60, currentAverageValue: '0' } }]), 'null', '[null]', '["cpu"]', '{'].map(
        (current) => cells(hpaV1, only(current))[2],
      ),
    ).toEqual(['cpu: 60%/80%', 'cpu: <unknown>/80%', 'cpu: <unknown>/80%', 'cpu: 45%/80%', 'cpu: 45%/80%']);
    const bare = { metadata: { name: 'h' }, spec: { scaleTargetRef: { kind: 'Deployment', name: 'web' }, maxReplicas: 5 } };
    expect(cells(hpaV1, bare)[2]).toBe('cpu: <unknown>/80%');
  });

  it('a certificate request: its condition (Denied over Approved over Pending; Issued), its signer, its requested duration', () => {
    const csr = (name: string, spec: object, status: object = {}) => ({ metadata: { name, creationTimestamp: ago(0) }, spec: { request: '', ...spec }, status });
    expect(
      [
        csr('csr1', {}),
        csr('csr2', { username: 'CSR Requestor', signerName: 'example.com/test-signer', expirationSeconds: 7 * 24 * 3600 + 3600 }, { conditions: [{ type: 'Approved' }] }),
        csr('csr2', { username: 'CSR Requestor' }, { conditions: [{ type: 'Approved' }], certificate: 'Y2VydA==' }),
        csr('csr3', { username: 'CSR Requestor' }, { conditions: [{ type: 'Approved' }, { type: 'Denied' }] }),
      ].map((c) => cells(certificateSigningRequestColumns, c)),
    ).toEqual([
      ['csr1', '0s', '<none>', '', '<none>', 'Pending'],
      ['csr2', '0s', 'example.com/test-signer', 'CSR Requestor', '7d1h', 'Approved'],
      ['csr2', '0s', '<none>', 'CSR Requestor', '<none>', 'Approved,Issued'],
      ['csr3', '0s', '<none>', 'CSR Requestor', '<none>', 'Denied'],
    ]);
  });

  it('endpoints and slices: addresses (with their ports), the first three, "+ n more..."', () => {
    const ep = (name: string, subsets?: object[]) => ({ metadata: { name, creationTimestamp: ago(0) }, subsets });
    expect(
      [
        ep('endpoint1'),
        ep('endpoint3', [{ addresses: [{ ip: '1.2.3.4' }, { ip: '5.6.7.8' }] }]),
        ep('endpoint2', [{ addresses: [{ ip: '1.2.3.4' }, { ip: '5.6.7.8' }, { ip: '9.8.7.6' }, { ip: '::1' }], ports: [{ port: 8001 }] }]),
      ].map((e) => cells(endpointsColumns, e)),
    ).toEqual([
      ['endpoint1', '<none>', '0s'],
      ['endpoint3', '1.2.3.4,5.6.7.8', '0s'],
      ['endpoint2', '1.2.3.4:8001,5.6.7.8:8001,9.8.7.6:8001 + 1 more...', '0s'],
    ]);
    const slice = {
      metadata: { name: 'multiportslice.123', creationTimestamp: ago(5 * M) },
      addressType: 'IPv4',
      ports: [{ port: 80 }, { port: 443 }, { port: 3000 }, { name: 'metrics' }],
      endpoints: [{ addresses: ['10.1.2.3', '2001:db8::1234:5678'] }, { addresses: ['10.2.3.4', '10.3.4.5'] }],
    };
    expect(cells(endpointSliceColumns, slice)).toEqual(['multiportslice.123', 'IPv4', '80,443,3000 + 1 more...', '10.1.2.3,2001:db8::1234:5678,10.2.3.4 + 1 more...', '5m']);
  });

  it('a budget, a binding (its subjects with -o wide), a priority class, a lease', () => {
    const made = (name: string) => ({ name, creationTimestamp: ago(0) });
    expect([
      cells(podDisruptionBudgetColumns, { metadata: made('pdb1'), spec: { minAvailable: 22 }, status: { disruptionsAllowed: 5 } }),
      cells(podDisruptionBudgetColumns, { metadata: made('pdb2'), spec: { maxUnavailable: '11%' }, status: { disruptionsAllowed: 5 } }),
      cells(
        roleBindingColumns,
        {
          metadata: made('binding2'),
          roleRef: { kind: 'Role', name: 'role-name', apiGroup: '' },
          subjects: [
            { kind: 'User', name: 'user-name' },
            { kind: 'Group', name: 'group-name' },
            { kind: 'ServiceAccount', name: 'service-account-name', namespace: 'service-account-namespace' },
          ],
        },
        true,
      ),
      cells(priorityClassColumns, { metadata: made('pc2'), value: 1000000000, globalDefault: true, preemptionPolicy: 'PreemptLowerPriority' }),
      cells(leaseColumns, { metadata: made('lease1'), spec: { holderIdentity: 'holder1' } }),
    ]).toEqual([
      ['pdb1', '22', 'N/A', '5', '0s'],
      ['pdb2', 'N/A', '11%', '5', '0s'],
      ['binding2', 'Role/role-name', '0s', 'user-name', 'group-name', 'service-account-namespace/service-account-name'],
      ['pc2', '1000000000', 'true', '0s', 'PreemptLowerPriority'],
      ['lease1', 'holder1', '0s'],
    ]);
  });

  it('an ingress class (the default marked), a controller revision (its controller as kind.group/name), an IP address (its parent)', () => {
    expect([
      cells(ingressClassColumns, {
        metadata: { name: 'test1' },
        spec: { controller: 'example.com/controller', parameters: { kind: 'customgroup', apiGroup: 'example.com', name: 'example' } },
      }),
      cells(ingressClassColumns, {
        metadata: { name: 'test-default', annotations: { 'ingressclass.kubernetes.io/is-default-class': 'true' } },
        spec: { controller: 'example.com/controller' },
      }),
      cells(controllerRevisionColumns, {
        metadata: { name: 'test1', creationTimestamp: ago(0), ownerReferences: [{ apiVersion: 'apps/v1', kind: 'DaemonSet', name: 'foo', uid: 'u', controller: true }] },
        revision: 1,
      }),
      cells(controllerRevisionColumns, { metadata: { name: 'test2', creationTimestamp: ago(0) }, revision: 2 }),
      cells(ipAddressColumns, { metadata: { name: '192.168.2.2' }, spec: { parentRef: { group: 'mygroup', resource: 'myresource', namespace: 'mynamespace', name: 'myname' } } }),
    ]).toEqual([
      ['test1', 'example.com/controller', 'customgroup.example.com/example', '<unknown>'],
      ['test-default (default)', 'example.com/controller', '<none>', '<unknown>'],
      ['test1', 'daemonset.apps/foo', '1', '0s'],
      ['test2', '<none>', '2', '0s'],
      ['192.168.2.2', 'myresource.mygroup/mynamespace/myname', '<unknown>'],
    ]);
  });

  it('flow control: a schema’s precedence and distinguisher (its level missing: its Dangling status), a level’s shares and queuing', () => {
    expect([
      cells(flowSchemaColumns, { metadata: { name: 'exempt', creationTimestamp: ago(5 * M) }, spec: { priorityLevelConfiguration: { name: 'allee' }, matchingPrecedence: 0 } }),
      cells(flowSchemaColumns, {
        metadata: { name: 'some-matcher', creationTimestamp: ago(5 * M) },
        spec: { priorityLevelConfiguration: { name: 'allee' }, matchingPrecedence: 0, distinguisherMethod: { type: 'ByNamespace' } },
        status: { conditions: [{ type: 'Dangling', status: 'True' }] },
      }),
      cells(priorityLevelConfigurationColumns, { metadata: { name: 'unlimited', creationTimestamp: ago(0) }, spec: { type: 'Exempt' } }),
      cells(priorityLevelConfigurationColumns, {
        metadata: { name: 'queued', creationTimestamp: ago(0) },
        spec: { type: 'Limited', limited: { nominalConcurrencyShares: 42, limitResponse: { type: 'Queue', queuing: { queues: 8, handSize: 3, queueLengthLimit: 4 } } } },
      }),
    ]).toEqual([
      ['exempt', 'allee', '0', '<none>', '5m', '?'],
      ['some-matcher', 'allee', '0', 'ByNamespace', '5m', 'True'],
      ['unlimited', 'Exempt', '<none>', '<none>', '<none>', '<none>', '0s'],
      ['queued', 'Limited', '42', '8', '3', '4', '0s'],
    ]);
  });

  it('a claim’s state, a quota’s requests and limits, a component’s health, a replication controller', () => {
    expect([
      cells(resourceClaimColumns, { metadata: { name: 'c', creationTimestamp: ago(5 * M) }, spec: {} }),
      cells(resourceClaimColumns, {
        metadata: { name: 'c', creationTimestamp: ago(5 * M) },
        spec: {},
        status: { allocation: {}, reservedFor: [{ resource: 'pods', name: 'p', uid: 'u' }] },
      }),
      cells(resourceClaimColumns, { metadata: { name: 'c', creationTimestamp: ago(5 * M), deletionTimestamp: ago(M) }, spec: {} }),
      cells(resourceQuotaColumns, {
        metadata: { name: 'test-resourcequota', creationTimestamp: ago(5 * M) },
        status: {
          hard: { cpu: '100', memory: '4Gi', pods: '10', 'limits.cpu': '200', 'limits.memory': '8Gi' },
          used: { cpu: '1', memory: '1Gi', pods: '1', 'limits.cpu': '2', 'limits.memory': '2Gi' },
        },
      }),
      cells(componentStatusColumns, { metadata: { name: 'cs3' }, conditions: [{ type: 'Healthy', status: 'False', message: 'test message', error: 'test error' }] }),
      cells(
        replicationControllerColumns,
        {
          metadata: { name: 'rc1' },
          spec: { replicas: 5, template: { spec: { containers: [{ name: 'test', image: 'test_image' }] } }, selector: { a: 'b' } },
          status: { replicas: 3, readyReplicas: 1 },
        },
        true,
      ),
    ]).toEqual([
      ['c', 'pending', '5m'],
      ['c', 'allocated,reserved', '5m'],
      ['c', 'deleted', '5m'],
      ['test-resourcequota', 'cpu: 1/100, memory: 1Gi/4Gi, pods: 1/10', 'limits.cpu: 2/200, limits.memory: 2Gi/8Gi', '5m'],
      ['cs3', 'Unhealthy', 'test message', 'test error'],
      ['rc1', '5', '3', '1', '<unknown>', 'test', 'test_image', 'a=b'],
    ]);
  });

  it('an events.k8s.io event as the core one; an API service; a binding’s param; a kind with no printer: Name, Created At', () => {
    expect([
      cells(eventColumns, {
        metadata: { name: 'e' },
        eventTime: ago(3 * 24 * 60 * M),
        type: 'Warning',
        reason: 'Event Reason',
        note: ' Message ',
        regarding: { kind: 'Deployment', name: 'web' },
      }),
      cells(apiServiceColumns, {
        metadata: { name: 'v1beta1.metrics.k8s.io', creationTimestamp: ago(5 * M) },
        spec: { service: { namespace: 'kube-system', name: 'metrics-server' } },
        status: { conditions: [{ type: 'Available', status: 'False', reason: 'MissingEndpoints' }] },
      }),
      cells(apiServiceColumns, { metadata: { name: 'v1.apps', creationTimestamp: ago(5 * M) }, spec: {}, status: { conditions: [{ type: 'Available', status: 'True' }] } }),
      cells(validatingAdmissionPolicyBindingColumns, { metadata: { name: 'b', creationTimestamp: ago(0) }, spec: { policyName: 'p', paramRef: { name: 'cfg' } } }),
      cells(roleColumns, { metadata: { name: 'reader', creationTimestamp: '2026-01-01T10:00:00Z' } }),
    ]).toEqual([
      ['3d', 'Warning', 'Event Reason', 'deployment/web', 'Message'],
      ['v1beta1.metrics.k8s.io', 'kube-system/metrics-server', 'False (MissingEndpoints)', '5m'],
      ['v1.apps', 'Local', 'True', '5m'],
      ['b', 'p', '*/cfg', '0s'],
      ['reader', '2026-01-01T10:00:00Z'],
    ]);
  });
});
