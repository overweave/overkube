import { kinds } from '@overkube/kube-types';
import { type FakeCluster, make } from '@overkube/testkit';
import { DEPLOYMENT_SCHEMA } from './schema.fixture.ts';

/*
 * A cluster for the Edit addon's tests and stories. In shop: Deployment
 * api (2 replicas, its HorizontalPodAutoscaler 2–6, its ReplicaSet, its two
 * pods on node-a, a PodDisruptionBudget allowing one disruption); web,
 * applied by Flux; cache, a Helm release's (its pod on node-a keeping
 * emptyDir data); a DaemonSet's pod and a pod of no controller on node-a;
 * a CronJob, its Job and its pod. In data: a pod of no controller on
 * node-a. Deployments' schema served (schema()).
 */

const { Namespace, Node, Pod, ConfigMap } = kinds.core.v1;
const { Deployment, ReplicaSet, DaemonSet } = kinds.apps.v1;
const { HorizontalPodAutoscaler } = kinds.autoscaling.v2;
const { PodDisruptionBudget } = kinds.policy.v1;
const { Job, CronJob } = kinds.batch.v1;

const template = (app: string, image: string) => ({ metadata: { labels: { app } }, spec: { containers: [{ name: app, image }] } });

export function editCluster(c: FakeCluster): void {
  c.withSchema(Deployment, DEPLOYMENT_SCHEMA);
  for (const name of ['shop', 'data']) c.add(Namespace, make(Namespace, { metadata: { name } }));
  c.add(Node, make(Node, { metadata: { name: 'node-a' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }));
  c.add(Node, make(Node, { metadata: { name: 'node-b' }, spec: { unschedulable: true }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }));

  // api: scaled by its autoscaler, its pods held by a budget.
  c.add(
    Deployment,
    make(Deployment, {
      metadata: { name: 'api', namespace: 'shop', uid: 'u-api' },
      spec: { replicas: 2, selector: { matchLabels: { app: 'api' } }, template: template('api', 'api:1') },
      status: { replicas: 2, readyReplicas: 2 },
    }),
  );
  c.add(
    HorizontalPodAutoscaler,
    make(HorizontalPodAutoscaler, {
      metadata: { name: 'api', namespace: 'shop' },
      spec: { scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'api' }, minReplicas: 2, maxReplicas: 6 },
    }),
  );
  c.add(
    ReplicaSet,
    make(ReplicaSet, {
      metadata: {
        name: 'api-7d4b9',
        namespace: 'shop',
        uid: 'u-rs-api',
        ownerReferences: [{ apiVersion: 'apps/v1', kind: 'Deployment', name: 'api', uid: 'u-api', controller: true }],
      },
    }),
  );
  for (const name of ['api-7d4b9-a', 'api-7d4b9-b'])
    c.add(
      Pod,
      make(Pod, {
        metadata: {
          name,
          namespace: 'shop',
          labels: { app: 'api', 'pod-template-hash': '7d4b9' },
          ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'api-7d4b9', uid: 'u-rs-api', controller: true }],
        },
        spec: { nodeName: 'node-a', containers: [{ name: 'api', image: 'api:1' }] },
        status: { phase: 'Running' },
      }),
    );
  c.add(
    PodDisruptionBudget,
    make(PodDisruptionBudget, {
      metadata: { name: 'api', namespace: 'shop' },
      spec: { minAvailable: 1, selector: { matchLabels: { app: 'api' } } },
      status: { disruptionsAllowed: 1 },
    }),
  );

  // web: Flux's; cache: a Helm release's, its pod keeping emptyDir data.
  c.add(
    Deployment,
    make(Deployment, {
      metadata: { name: 'web', namespace: 'shop', labels: { app: 'web', 'kustomize.toolkit.fluxcd.io/name': 'apps', 'kustomize.toolkit.fluxcd.io/namespace': 'flux-system' } },
      spec: { replicas: 3, selector: { matchLabels: { app: 'web' } }, template: template('web', 'web:2.4') },
      status: { replicas: 3, readyReplicas: 3 },
    }),
  );
  c.add(
    Deployment,
    make(Deployment, {
      metadata: {
        name: 'cache',
        namespace: 'shop',
        uid: 'u-cache',
        labels: { app: 'cache', 'app.kubernetes.io/managed-by': 'Helm' },
        annotations: { 'meta.helm.sh/release-name': 'cache', 'meta.helm.sh/release-namespace': 'shop' },
      },
      spec: { replicas: 1, selector: { matchLabels: { app: 'cache' } }, template: template('cache', 'redis:8') },
      status: { replicas: 1, readyReplicas: 1 },
    }),
  );
  c.add(
    ReplicaSet,
    make(ReplicaSet, {
      metadata: {
        name: 'cache-6f8d9',
        namespace: 'shop',
        uid: 'u-rs-cache',
        ownerReferences: [{ apiVersion: 'apps/v1', kind: 'Deployment', name: 'cache', uid: 'u-cache', controller: true }],
      },
    }),
  );
  c.add(
    Pod,
    make(Pod, {
      metadata: {
        name: 'cache-6f8d9-q2x7w',
        namespace: 'shop',
        labels: { app: 'cache', 'pod-template-hash': '6f8d9' },
        ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'cache-6f8d9', uid: 'u-rs-cache', controller: true }],
      },
      spec: { nodeName: 'node-a', volumes: [{ name: 'tmp', emptyDir: {} }], containers: [{ name: 'redis', image: 'redis:8' }] },
      status: { phase: 'Running' },
    }),
  );

  // On node-a besides: a DaemonSet's pod, pods of no controller.
  c.add(DaemonSet, make(DaemonSet, { metadata: { name: 'node-agent', namespace: 'shop', uid: 'u-ds' } }));
  c.add(
    Pod,
    make(Pod, {
      metadata: { name: 'node-agent-x7k2p', namespace: 'shop', ownerReferences: [{ apiVersion: 'apps/v1', kind: 'DaemonSet', name: 'node-agent', uid: 'u-ds', controller: true }] },
      spec: { nodeName: 'node-a', containers: [{ name: 'agent', image: 'agent:1' }] },
      status: { phase: 'Running' },
    }),
  );
  c.add(
    Pod,
    make(Pod, { metadata: { name: 'shell', namespace: 'shop' }, spec: { nodeName: 'node-a', containers: [{ name: 'sh', image: 'busybox' }] }, status: { phase: 'Running' } }),
  );
  c.add(
    Pod,
    make(Pod, { metadata: { name: 'db-0', namespace: 'data' }, spec: { nodeName: 'node-a', containers: [{ name: 'db', image: 'postgres:18' }] }, status: { phase: 'Running' } }),
  );

  // A CronJob, its Job, its pod (done).
  c.add(
    CronJob,
    make(CronJob, {
      metadata: { name: 'nightly', namespace: 'shop', uid: 'u-cron' },
      spec: { schedule: '0 3 * * *', jobTemplate: { spec: { template: template('nightly', 'job:1') } } },
    }),
  );
  c.add(
    Job,
    make(Job, {
      metadata: {
        name: 'nightly-29',
        namespace: 'shop',
        uid: 'u-job',
        ownerReferences: [{ apiVersion: 'batch/v1', kind: 'CronJob', name: 'nightly', uid: 'u-cron', controller: true }],
      },
      spec: { template: template('nightly', 'job:1') },
      status: { succeeded: 1 },
    }),
  );
  c.add(
    Pod,
    make(Pod, {
      metadata: { name: 'nightly-29-x', namespace: 'shop', ownerReferences: [{ apiVersion: 'batch/v1', kind: 'Job', name: 'nightly-29', uid: 'u-job', controller: true }] },
      spec: { containers: [{ name: 'nightly', image: 'job:1' }] },
      status: { phase: 'Succeeded' },
    }),
  );
  c.add(ConfigMap, make(ConfigMap, { metadata: { name: 'settings', namespace: 'shop' }, data: { mode: 'prod' } }));
}
