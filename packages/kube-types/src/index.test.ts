import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Deployment } from './gen/apps/v1.js';
import type { Container, Pod } from './gen/core/v1.js';
import type { ObjectMeta } from './gen/meta/v1.js';
import { apiVersion, type KubeObject, kinds, type ObjectOf } from './index.js';

describe('kube-types', () => {
  it('writes an apiVersion the way objects carry it', () => {
    expect(apiVersion(kinds.core.v1.Pod)).toBe('v1');
    expect(apiVersion(kinds.apps.v1.Deployment)).toBe('apps/v1');
  });

  it('describes each kind as the API serves it', () => {
    expect(kinds.apps.v1.Deployment).toMatchObject({ id: 'apps/v1/Deployment', plural: 'deployments', namespaced: true });
    expect(kinds.core.v1.Node.namespaced).toBe(false);
    expect(kinds.networking.v1.Ingress.group).toBe('networking.k8s.io');
    expect(kinds.core.v1.Pod.verbs).toContain('watch');
  });

  it('gives each kind its objects type', () => {
    expectTypeOf<ObjectOf<typeof kinds.apps.v1.Deployment>>().toEqualTypeOf<Deployment>();
    expectTypeOf<ObjectOf<typeof kinds.core.v1.Pod>>().toEqualTypeOf<Pod>();
  });

  it('types the objects in full', () => {
    expectTypeOf<NonNullable<Pod['spec']>['containers']>().toEqualTypeOf<Container[]>();
    expectTypeOf<Container['imagePullPolicy']>().toEqualTypeOf<'Always' | 'IfNotPresent' | 'Never' | undefined>();
    expectTypeOf<Pod['metadata']>().toEqualTypeOf<ObjectMeta | undefined>();
    expectTypeOf<Pod>().toExtend<KubeObject>();
  });

  it('types any object, a CRD one included', () => {
    expectTypeOf<KubeObject<{ replicas: number }>['spec']>().toEqualTypeOf<{ replicas: number } | undefined>();
  });
});
