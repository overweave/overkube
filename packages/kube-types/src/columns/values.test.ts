import { describe, expect, it } from 'vitest';
import { deploymentColumns, replicaSetColumns } from './apps/v1.js';
import { horizontalPodAutoscalerColumns } from './autoscaling/v2.js';
import { jobColumns } from './batch/v1.js';
import { eventColumns, type Pod, persistentVolumeClaimColumns, podColumns, serviceColumns } from './core/v1.js';
import { ingressColumns, networkPolicyColumns } from './networking/v1.js';
import { ageColumn, known, type PrinterColumn, quantityValue } from './print.js';
import { storageClassColumns } from './storage/v1.js';

/*
 * What the columns sort by (their value) beside what they show (their
 * display): counts as numbers, times as when they were (ms — not how long
 * ago: rows do not move as the clock goes), quantities as numbers, kubectl's
 * placeholders as none (last).
 */

const NOW = Date.UTC(2026, 0, 1, 12);
const at = (iso: string) => Date.parse(iso);

/** A column's value and display of an object, by its header. */
function cell<O>(columns: readonly PrinterColumn<O>[], header: string, object: unknown, now = NOW) {
  const c = columns.find((x) => x.name === header);
  if (!c) throw new Error(`no column ${header}`);
  const context = { now, objects: [object as O] };
  return [c.value(object as O, context), c.display(object as O, context)];
}

describe('a column’s value beside its display', () => {
  it('reads a quantity as a number — suffixed, or with an exponent, not both; anything else, none', () => {
    expect(['10Gi', '500m', '1.5k', '1e3', '1E3', '2Ti', '.5', '1E', '7', 7].map(quantityValue)).toEqual([10 * 2 ** 30, 0.5, 1500, 1000, 1000, 2 * 2 ** 40, 0.5, 1e18, 7, 7]);
    expect(['1e3Ki', '1constructor', '1toString', '1e309', 'x', '', undefined, Number.POSITIVE_INFINITY].map(quantityValue)).toEqual(Array(8).fill(undefined));
  });

  it('takes kubectl’s placeholders (and nothing) as none', () => {
    expect(['<none>', '<unset>', '<pending>', '<unknown>', '', undefined, 'web', '<none>,a'].map(known)).toEqual([...Array(6).fill(undefined), 'web', '<none>,a']);
  });

  it('gives a time as when it was, its display how long ago', () => {
    const made = '2026-01-01T09:00:00Z';
    expect(cell([ageColumn], 'Age', { metadata: { creationTimestamp: made } })).toEqual([at(made), '3h']);
    expect(cell([ageColumn], 'Age', { metadata: {} })).toEqual([undefined, '<unknown>']);
    const event = { involvedObject: {}, lastTimestamp: '2026-01-01T11:58:00Z', firstTimestamp: '2026-01-01T11:00:00Z' };
    expect(cell(eventColumns, 'Last Seen', event)).toEqual([at('2026-01-01T11:58:00Z'), '2m']);
    expect(cell(eventColumns, 'First Seen', event)).toEqual([at('2026-01-01T11:00:00Z'), '60m']);
  });

  it('gives a job’s duration as how long it ran: done, start to end; running, so far (as now goes)', () => {
    const done = { metadata: {}, status: { startTime: '2026-01-01T11:00:00Z', completionTime: '2026-01-01T11:30:00Z' } };
    const running = { metadata: {}, status: { startTime: '2026-01-01T11:50:00Z' } };
    expect([cell(jobColumns, 'Duration', done), cell(jobColumns, 'Duration', running), cell(jobColumns, 'Duration', running, NOW + 60_000)]).toEqual([
      [30 * 60_000, '30m'],
      [10 * 60_000, '10m'],
      [11 * 60_000, '11m'],
    ]);
    expect(cell(jobColumns, 'Duration', { metadata: {} })).toEqual([undefined, '']);
  });

  it('gives counts as numbers (a pod’s restarts, those ready), quantities as numbers', () => {
    const pod = {
      metadata: {},
      spec: { containers: [{ name: 'a' }, { name: 'b' }] },
      status: { containerStatuses: [{ name: 'a', ready: true, restartCount: 3, state: { running: {} }, lastState: { terminated: { finishedAt: '2026-01-01T11:55:00Z' } } }] },
    };
    expect([cell(podColumns, 'Ready', pod), cell(podColumns, 'Restarts', pod)]).toEqual([
      [0.5, '1/2'],
      [3, '3 (5m ago)'],
    ]);
    expect(cell(deploymentColumns, 'Up-to-date', { metadata: {}, status: { updatedReplicas: 2 } })).toEqual([2, '2']);
    // Those ready as a share (1/1 over 1/3); none wanted, none.
    const ready = (readyReplicas: number, replicas: number) => cell(deploymentColumns, 'Ready', { metadata: {}, spec: { replicas }, status: { readyReplicas } });
    expect([ready(1, 1), ready(1, 3), ready(0, 0)]).toEqual([
      [1, '1/1'],
      [1 / 3, '1/3'],
      [0, '0/0'],
    ]);
    // A replica set's Ready a count, as it shows it.
    expect(cell(replicaSetColumns, 'Ready', { metadata: {}, spec: { replicas: 10 }, status: { readyReplicas: 3 } })).toEqual([3, '3']);
    const claim = { metadata: {}, spec: { volumeName: 'pv' }, status: { capacity: { storage: '10Gi' } } };
    expect(cell(persistentVolumeClaimColumns, 'Capacity', claim)).toEqual([10 * 2 ** 30, '10Gi']);
    expect(cell(persistentVolumeClaimColumns, 'Capacity', { metadata: {}, spec: {} })).toEqual([undefined, '']);
  });

  it('keeps a message as written, a placeholder-like one too; none, none', () => {
    expect([cell(eventColumns, 'Message', { involvedObject: {}, message: ' <ready> ' }), cell(eventColumns, 'Message', { involvedObject: {} })]).toEqual([
      ['<ready>', '<ready>'],
      [undefined, ''],
    ]);
  });

  it('takes a kind’s columns for that kind’s objects only', () => {
    // @ts-expect-error a StorageClass's columns read what a Pod has not (provisioner)
    const wrong: readonly PrinterColumn<Pod>[] = storageClassColumns;
    expect(wrong).toBe(storageClassColumns);
  });

  it('gives none where kubectl prints a placeholder or nothing: sorted last, either way', () => {
    const service = { metadata: {}, spec: { type: 'ClusterIP' } };
    const balancer = { metadata: {}, spec: { type: 'LoadBalancer' } };
    expect([
      cell(serviceColumns, 'External-IP', service),
      cell(serviceColumns, 'External-IP', balancer),
      cell(serviceColumns, 'Port(s)', service),
      cell(serviceColumns, 'Selector', service),
      cell(networkPolicyColumns, 'Pod-Selector', { metadata: {}, spec: {} }),
      cell(ingressColumns, 'Address', { metadata: {} }),
      cell(ingressColumns, 'Class', { metadata: {} }),
      cell(horizontalPodAutoscalerColumns, 'Targets', { metadata: {}, spec: { scaleTargetRef: { kind: 'D', name: 'd' }, maxReplicas: 1 } }),
    ]).toEqual([
      [undefined, '<none>'],
      [undefined, '<pending>'],
      [undefined, '<none>'],
      [undefined, '<none>'],
      [undefined, '<none>'],
      [undefined, ''],
      [undefined, '<none>'],
      [undefined, '<none>'],
    ]);
  });
});
