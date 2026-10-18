import type { KubeObject } from '@overkube/kube-types';
import { describe, expect, it } from 'vitest';
import { foundIn, runReach, whereOf } from './cluster.ts';

/* A Service looked for (an addon's answer): where it is, as a target to reach — and whether a target is one looked for. */

const svc = (namespace: string, name: string, ports: { port: number; targetPort?: number }[]) => ({ metadata: { namespace, name }, spec: { ports } }) as KubeObject;
const services = [
  svc('monitoring', 'vmsingle-main', [{ port: 8428 }]),
  svc('shop', 'vmsingle-api', [{ port: 80, targetPort: 8080 }]),
  svc('monitoring', 'prometheus-operated', [{ port: 9090 }]),
];

describe('a Service looked for', () => {
  it('is found by its name (* any run of characters) and a port it has: its port the one asked, or the one in front of it', () => {
    expect(foundIn(services, { service: 'vmsingle-*', port: 8428 })).toEqual({ kind: 'service', namespace: 'monitoring', name: 'vmsingle-main', port: 8428 });
    expect(whereOf(foundIn(services, { service: ['vmselect-*', 'prometheus-operated'] }) as never)).toBe('monitoring/prometheus-operated:9090');
    expect(whereOf(foundIn(services, { service: 'vmsingle-api', port: 8080 }) as never)).toBe('shop/vmsingle-api:80');
  });

  it('is not found by a name only like it, nor without the port asked', () => {
    expect(foundIn(services, { service: 'vmsingle' })).toBeUndefined();
    expect(foundIn(services, { service: 'vmsingle-main', port: 9090 })).toBeUndefined();
    expect(foundIn(services, { service: 'vm.single-*' })).toBeUndefined();
  });

  it('is the first of its names said that is there — not the first of the Services listed', () => {
    expect(foundIn(services, { service: ['prometheus-*', 'vmsingle-*'] })?.name).toBe('prometheus-operated');
  });

  it('is reached where it is found alone — that Service, that port — beside what an addon says it reaches', () => {
    const vm = { kind: 'service', namespace: 'monitoring', name: 'vmsingle-main', port: 8428 } as const;
    const run = { id: 'metrics', signal: new AbortController().signal, reaches: [], finds: [{ service: 'vmsingle-*' }] };
    const found = (spec: Parameters<typeof foundIn>[1]) => foundIn(services, spec) ?? false;
    const request = async () => new Response('{}');
    expect(() => runReach(run, vm, request, found)).not.toThrow();
    expect(() => runReach(run, { ...vm, port: 22 }, request, found)).toThrow(/where the Services its conditions look for are found/);
    expect(() => runReach(run, { ...vm, namespace: 'kube-system' }, request, found)).toThrow();
    expect(() => runReach(run, { ...vm, kind: 'pod' }, request, found)).toThrow();
    expect(() => runReach(run, vm, request, () => false)).toThrow();
  });
});
