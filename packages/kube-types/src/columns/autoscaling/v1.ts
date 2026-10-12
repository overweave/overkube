/*
 * The autoscaling group's v1 types (generated) and how kubectl shows its
 * kinds (by hand: printers.go, v1.37.1 — printHorizontalPodAutoscaler, as
 * the API server converts a v1 autoscaler first: conversion.go,
 * Convert_v1_HorizontalPodAutoscaler_To_autoscaling_HorizontalPodAutoscaler —
 * its other metrics (kept in annotations, as v1 has them) first, then its
 * CPU target; none at all: CPU at 80%; its current metrics, those kept in
 * an annotation if any, else its CPU's).
 */

import type { HorizontalPodAutoscaler } from '../../gen/autoscaling/v1.js';
import type { MetricSpec, MetricStatus } from '../../gen/autoscaling/v2.js';
import { ageColumn, known, nameColumn, type PrinterColumn, quantityValue } from '../print.js';
import { hpaTargets } from './v2.js';

export * from '../../gen/autoscaling/v1.js';

/** Where v1 keeps the metrics it has no fields for (the targets, the current ones). */
const SPECS = 'autoscaling.alpha.kubernetes.io/metrics';
const STATUSES = 'autoscaling.alpha.kubernetes.io/current-metrics';

/** The CPU target an autoscaler with no metrics has (autoscaling.DefaultCPUUtilization). */
const DEFAULT_CPU = 80;

type Quantity = string | number;
interface ObjectRef {
  kind: string;
  name: string;
  apiVersion?: string;
}

/** A metric as v1 keeps it in its annotation (autoscalingv1.MetricSpec). */
interface V1MetricSpec {
  type: string;
  resource?: { name: string; targetAverageUtilization?: number; targetAverageValue?: Quantity };
  containerResource?: { name: string; container: string; targetAverageUtilization?: number; targetAverageValue?: Quantity };
  pods?: { metricName: string; targetAverageValue: Quantity };
  object?: { target: ObjectRef; metricName: string; targetValue: Quantity; averageValue?: Quantity };
  external?: { metricName: string; targetValue?: Quantity; targetAverageValue?: Quantity };
}

/** A current metric as v1 keeps it (autoscalingv1.MetricStatus). */
interface V1MetricStatus {
  type: string;
  resource?: { name: string; currentAverageUtilization?: number; currentAverageValue: Quantity };
  containerResource?: { name: string; container: string; currentAverageUtilization?: number; currentAverageValue: Quantity };
  pods?: { metricName: string; currentAverageValue: Quantity };
  object?: { target: ObjectRef; metricName: string; currentValue: Quantity; averageValue?: Quantity };
  external?: { metricName: string; currentValue: Quantity; currentAverageValue?: Quantity };
}

const q = (v: Quantity | undefined) => (v === undefined ? undefined : String(v));

/** A v1 metric as v2 has it (Convert_v1_*MetricSource_To_autoscaling_*). */
function specOf(m: V1MetricSpec): MetricSpec {
  const resource = (r: { name: string; targetAverageUtilization?: number; targetAverageValue?: Quantity }) => ({
    name: r.name,
    target: {
      type: r.targetAverageUtilization === undefined ? 'AverageValue' : 'Utilization',
      averageUtilization: r.targetAverageUtilization,
      averageValue: q(r.targetAverageValue),
    },
  });
  switch (m.type) {
    case 'Resource':
      return m.resource ? { type: m.type, resource: resource(m.resource) } : { type: m.type };
    case 'ContainerResource':
      return m.containerResource ? { type: m.type, containerResource: { ...resource(m.containerResource), container: m.containerResource.container } } : { type: m.type };
    case 'Pods':
      return m.pods
        ? { type: m.type, pods: { metric: { name: m.pods.metricName }, target: { type: 'AverageValue', averageValue: q(m.pods.targetAverageValue) } } }
        : { type: m.type };
    case 'Object': {
      const o = m.object;
      if (!o) return { type: m.type };
      // With an average: its value kept only if not zero (v1 cannot leave it out).
      const value = o.averageValue === undefined || quantityValue(o.targetValue) !== 0 ? q(o.targetValue) : undefined;
      const target = { type: o.averageValue === undefined ? 'Value' : 'AverageValue', value, averageValue: q(o.averageValue) };
      return { type: m.type, object: { describedObject: o.target, metric: { name: o.metricName }, target } };
    }
    case 'External': {
      const e = m.external;
      if (!e) return { type: m.type };
      const target = { type: e.targetValue === undefined ? 'AverageValue' : 'Value', value: q(e.targetValue), averageValue: q(e.targetAverageValue) };
      return { type: m.type, external: { metric: { name: e.metricName }, target } };
    }
  }
  return { type: m.type };
}

/** A v1 current metric as v2 has it (Convert_v1_*MetricStatus_To_autoscaling_*). */
function statusOf(m: V1MetricStatus): MetricStatus {
  switch (m.type) {
    case 'Resource':
      return m.resource
        ? {
            type: m.type,
            resource: { name: m.resource.name, current: { averageUtilization: m.resource.currentAverageUtilization, averageValue: q(m.resource.currentAverageValue) } },
          }
        : { type: m.type };
    case 'ContainerResource': {
      const c = m.containerResource;
      return c
        ? {
            type: m.type,
            containerResource: { name: c.name, container: c.container, current: { averageUtilization: c.currentAverageUtilization, averageValue: q(c.currentAverageValue) } },
          }
        : { type: m.type };
    }
    case 'Pods':
      return m.pods ? { type: m.type, pods: { metric: { name: m.pods.metricName }, current: { averageValue: q(m.pods.currentAverageValue) } } } : { type: m.type };
    case 'Object': {
      const o = m.object;
      return o
        ? { type: m.type, object: { describedObject: o.target, metric: { name: o.metricName }, current: { value: q(o.currentValue), averageValue: q(o.averageValue) } } }
        : { type: m.type };
    }
    case 'External': {
      const e = m.external;
      return e ? { type: m.type, external: { metric: { name: e.metricName }, current: { value: q(e.currentValue), averageValue: q(e.currentAverageValue) } } } : { type: m.type };
    }
  }
  return { type: m.type };
}

/**
 * An annotation's list, read as Go's json.Unmarshal reads it: null, an
 * empty list; a null in it, a metric of no type; anything else in it (or
 * not a list, or not JSON), none read.
 */
function annotated<T extends { type: string }>(o: HorizontalPodAutoscaler, key: string): T[] | undefined {
  const text = o.metadata?.annotations?.[key];
  if (text === undefined) return undefined;
  let list: unknown;
  try {
    list = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (list === null) return [];
  if (!Array.isArray(list) || !list.every((m) => m === null || (typeof m === 'object' && !Array.isArray(m)))) return undefined;
  return list.map((m) => (m ?? { type: '' }) as T);
}

/** An autoscaler's metrics and current metrics, as v2 has them (the server's conversion). */
function metrics(o: HorizontalPodAutoscaler): [MetricSpec[], MetricStatus[]] {
  const cpu = (utilization: number): MetricSpec => ({ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: utilization } } });
  const target = o.spec?.targetCPUUtilizationPercentage;
  const specs = [...(annotated<V1MetricSpec>(o, SPECS) ?? []).map(specOf), ...(target === undefined ? [] : [cpu(target)])];
  const current = o.status?.currentCPUUtilizationPercentage;
  const statuses =
    annotated<V1MetricStatus>(o, STATUSES)?.map(statusOf) ??
    (current === undefined ? [] : [{ type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: current } } }]);
  return [specs.length ? specs : [cpu(DEFAULT_CPU)], statuses];
}

export const horizontalPodAutoscalerColumns: PrinterColumn<HorizontalPodAutoscaler>[] = [
  nameColumn,
  {
    name: 'Reference',
    type: 'string',
    value: (o) => `${o.spec?.scaleTargetRef.kind}/${o.spec?.scaleTargetRef.name}`,
    display: (o) => `${o.spec?.scaleTargetRef.kind}/${o.spec?.scaleTargetRef.name}`,
  },
  { name: 'Targets', type: 'string', value: (o) => known(hpaTargets(...metrics(o))), display: (o) => hpaTargets(...metrics(o)) },
  { name: 'MinPods', type: 'string', value: (o) => o.spec?.minReplicas, display: (o) => (o.spec?.minReplicas === undefined ? '<unset>' : String(o.spec.minReplicas)) },
  { name: 'MaxPods', type: 'string', value: (o) => o.spec?.maxReplicas ?? 0, display: (o) => String(o.spec?.maxReplicas ?? 0) },
  { name: 'Replicas', type: 'string', value: (o) => o.status?.currentReplicas ?? 0, display: (o) => String(o.status?.currentReplicas ?? 0) },
  ageColumn,
];
