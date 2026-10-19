import { kinds } from '@overkube/kube-types';
import { type FakeCluster, make } from '@overkube/testkit';

/*
 * A namespace for the map's tests and stories (shop): an Ingress to a
 * Service (and to one that is not there), a Service selecting nothing, a
 * Deployment that reads a ConfigMap and a Secret, scaled by an autoscaler,
 * its ReplicaSet and its pods (one crashing) on a node; another namespace's
 * pod on that node (data); a CronJob, its Job (complete), its pod; a pod of
 * no workload a Service selects (debug); a ConfigMap nothing reads (spare); a kind no map takes (a ClusterRole).
 */

const { Pod, Service, ConfigMap, Secret, Namespace, Node } = kinds.core.v1;
const { Deployment, ReplicaSet } = kinds.apps.v1;
const { Ingress } = kinds.networking.v1;
const { HorizontalPodAutoscaler } = kinds.autoscaling.v2;
const { Job, CronJob } = kinds.batch.v1;
const { ClusterRole } = kinds.rbac.v1;

export function mapCluster(c: FakeCluster): void {
  for (const ns of ['shop', 'data']) c.add(Namespace, make(Namespace, { metadata: { name: ns } }));
  c.add(Node, make(Node, { metadata: { name: 'node-a' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }));
  c.add(
    Ingress,
    make(Ingress, {
      metadata: { name: 'shop', namespace: 'shop' },
      spec: {
        rules: [
          { host: 'api.example.com', http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'api', port: { number: 80 } } } }] } },
          { host: 'old.example.com', http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'legacy', port: { number: 80 } } } }] } },
        ],
      },
    }),
  );
  c.add(Service, make(Service, { metadata: { name: 'api', namespace: 'shop' }, spec: { selector: { app: 'api' }, ports: [{ port: 80 }], clusterIP: '10.43.0.7' } }));
  c.add(Service, make(Service, { metadata: { name: 'reports', namespace: 'shop' }, spec: { selector: { app: 'reports' }, ports: [{ port: 80 }] } }));
  c.add(
    Deployment,
    make(Deployment, {
      metadata: { name: 'api', namespace: 'shop', uid: 'u-api' },
      spec: {
        replicas: 2,
        selector: { matchLabels: { app: 'api' } },
        template: {
          metadata: { labels: { app: 'api' } },
          spec: {
            volumes: [{ name: 'conf', configMap: { name: 'api-config' } }],
            containers: [{ name: 'api', image: 'api:1', volumeMounts: [{ name: 'conf', mountPath: '/etc/api' }], envFrom: [{ secretRef: { name: 'api-env' } }] }],
          },
        },
      },
      status: { replicas: 2, readyReplicas: 1 },
    }),
  );
  c.add(ConfigMap, make(ConfigMap, { metadata: { name: 'api-config', namespace: 'shop' } }));
  c.add(ConfigMap, make(ConfigMap, { metadata: { name: 'spare', namespace: 'shop' } }));
  c.add(Secret, make(Secret, { metadata: { name: 'api-env', namespace: 'shop' } }));
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
        uid: 'u-rs',
        ownerReferences: [{ apiVersion: 'apps/v1', kind: 'Deployment', name: 'api', uid: 'u-api', controller: true }],
      },
    }),
  );
  const pod = (name: string, ready: boolean) =>
    c.add(
      Pod,
      make(Pod, {
        metadata: {
          name,
          namespace: 'shop',
          labels: { app: 'api', 'pod-template-hash': '7d4b9' },
          ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'api-7d4b9', uid: 'u-rs', controller: true }],
        },
        spec: { nodeName: 'node-a', containers: [{ name: 'api', image: 'api:1' }] },
        status: {
          phase: 'Running',
          containerStatuses: [
            ready
              ? { name: 'api', image: 'api:1', imageID: '', ready: true, restartCount: 0, state: { running: {} } }
              : { name: 'api', image: 'api:1', imageID: '', ready: false, restartCount: 9, state: { waiting: { reason: 'CrashLoopBackOff' } } },
          ],
        },
      }),
    );
  pod('api-7d4b9-a', true);
  pod('api-7d4b9-b', false);
  c.add(Pod, make(Pod, { metadata: { name: 'db-0', namespace: 'data' }, spec: { nodeName: 'node-a', containers: [{ name: 'db', image: 'pg' }] }, status: { phase: 'Running' } }));
  c.add(
    CronJob,
    make(CronJob, {
      metadata: { name: 'nightly', namespace: 'shop', uid: 'u-cron' },
      spec: {
        schedule: '0 3 * * *',
        jobTemplate: { spec: { template: { spec: { restartPolicy: 'Never', containers: [{ name: 'run', image: 'job:1', envFrom: [{ secretRef: { name: 'api-env' } }] }] } } } },
      },
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
      spec: { template: { spec: { restartPolicy: 'Never', containers: [{ name: 'run', image: 'job:1' }] } } },
      status: { succeeded: 1, conditions: [{ type: 'Complete', status: 'True' }] },
    }),
  );
  c.add(
    Pod,
    make(Pod, {
      metadata: { name: 'nightly-29-x', namespace: 'shop', ownerReferences: [{ apiVersion: 'batch/v1', kind: 'Job', name: 'nightly-29', uid: 'u-job', controller: true }] },
      spec: { nodeName: 'node-a', containers: [{ name: 'run', image: 'job:1' }] },
      status: { phase: 'Succeeded' },
    }),
  );
  c.add(Service, make(Service, { metadata: { name: 'debug', namespace: 'shop' }, spec: { selector: { run: 'debug' }, ports: [{ port: 8080 }] } }));
  c.add(
    Pod,
    make(Pod, { metadata: { name: 'debug', namespace: 'shop', labels: { run: 'debug' } }, spec: { containers: [{ name: 'sh', image: 'busybox' }] }, status: { phase: 'Running' } }),
  );
  c.add(ClusterRole, make(ClusterRole, { metadata: { name: 'view' } }));
}
