/*
 * The autoscaling group's v2 types (generated) and how kubectl shows its
 * kinds (by hand: printers.go, v1.37.1 — printHorizontalPodAutoscaler,
 * formatHPAMetrics).
 */

import type { HorizontalPodAutoscaler, MetricSpec, MetricStatus } from '../../gen/autoscaling/v2.js';
import { ageColumn, known, nameColumn, type PrinterColumn } from '../print.js';

export * from '../../gen/autoscaling/v2.js';

const q = (v: string | number | undefined) => String(v ?? '0');
const pct = (v: number | undefined) => (v === undefined ? undefined : `${v}%`);

/** One metric as kubectl says it: current/target ("cpu: 45%/80%", "30/50 (avg)"), its current "<unknown>" until the status has it. */
function metric(spec: MetricSpec, status: MetricStatus | undefined): string {
  switch (spec.type) {
    case 'External': {
      const target = spec.external?.target;
      if (target?.averageValue !== undefined) return `${q(status?.external?.current.averageValue ?? '<unknown>')}/${q(target.averageValue)} (avg)`;
      return `${status?.external ? q(status.external.current.value) : '<unknown>'}/${q(target?.value)}`;
    }
    case 'Pods':
      return `${status?.pods ? q(status.pods.current.averageValue) : '<unknown>'}/${q(spec.pods?.target.averageValue)}`;
    case 'Object': {
      const target = spec.object?.target;
      if (target?.averageValue !== undefined) return `${q(status?.object?.current.averageValue ?? '<unknown>')}/${q(target.averageValue)} (avg)`;
      return `${status?.object ? q(status.object.current.value) : '<unknown>'}/${q(target?.value)}`;
    }
    case 'Resource':
    case 'ContainerResource': {
      const s = spec.type === 'Resource' ? spec.resource : spec.containerResource;
      const current = spec.type === 'Resource' ? status?.resource?.current : status?.containerResource?.current;
      if (s?.target.averageValue !== undefined) return `${s.name}: ${current ? q(current.averageValue) : '<unknown>'}/${q(s.target.averageValue)}`;
      return `${s?.name}: ${pct(current?.averageUtilization) ?? '<unknown>'}/${pct(s?.target.averageUtilization) ?? '<auto>'}`;
    }
  }
  return '<unknown type>';
}

/** An autoscaler's metrics, current/target, the first two, "+ n more..." past them; none: "<none>" (formatHPAMetrics). */
export function hpaTargets(specs: readonly MetricSpec[] | undefined, statuses: readonly MetricStatus[] | undefined): string {
  if (!specs?.length) return '<none>';
  const list = specs.map((s, i) => metric(s, statuses?.[i]));
  return list.length > 2 ? `${list.slice(0, 2).join(', ')} + ${list.length - 2} more...` : list.join(', ');
}

export const horizontalPodAutoscalerColumns: PrinterColumn<HorizontalPodAutoscaler>[] = [
  nameColumn,
  {
    name: 'Reference',
    type: 'string',
    value: (o) => `${o.spec?.scaleTargetRef.kind}/${o.spec?.scaleTargetRef.name}`,
    display: (o) => `${o.spec?.scaleTargetRef.kind}/${o.spec?.scaleTargetRef.name}`,
  },
  {
    name: 'Targets',
    type: 'string',
    value: (o) => known(hpaTargets(o.spec?.metrics, o.status?.currentMetrics)),
    display: (o) => hpaTargets(o.spec?.metrics, o.status?.currentMetrics),
  },
  { name: 'MinPods', type: 'string', value: (o) => o.spec?.minReplicas, display: (o) => (o.spec?.minReplicas === undefined ? '<unset>' : String(o.spec.minReplicas)) },
  { name: 'MaxPods', type: 'string', value: (o) => o.spec?.maxReplicas ?? 0, display: (o) => String(o.spec?.maxReplicas ?? 0) },
  { name: 'Replicas', type: 'string', value: (o) => o.status?.currentReplicas ?? 0, display: (o) => String(o.status?.currentReplicas ?? 0) },
  ageColumn,
];
