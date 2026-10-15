import { kinds } from '@overkube/kube-types';
import { defineAddon, slots } from '@overkube/sdk';
import { fill } from '@overkube/sdk/preact';
import { KubeStory, make } from '@overkube/storybook/preact';
import { Badge, Gauge, Nothing, PanelBody, Row, Rows, Status } from '@overkube/uikit';
import core from './index.tsx';

/*
 * The start (/), as the core draws it over a cluster: one in trouble (a
 * node NotReady, pods failing, a rollout going, Warning events), one as it
 * should be — and others' parts in its regions (a GitOps tool's mark at the
 * cluster's line, an alert manager's alerts under the control plane, a
 * metrics server's usage under capacity, a certificate manager's panel).
 */

export default { title: 'core/Overview' };

type Cluster = Parameters<NonNullable<Parameters<typeof KubeStory>[0]['cluster']>>[0];

const { Pod, Node, Event, Namespace, Service, PersistentVolumeClaim } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;
const { Job } = kinds.batch.v1;

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const node = (name: string, role: string, ready = true) =>
  make(Node, {
    metadata: { name, labels: { [`node-role.kubernetes.io/${role}`]: '' }, creationTimestamp: ago(60 * 24 * 200) },
    spec: ready ? {} : { taints: [{ key: 'node.kubernetes.io/unreachable', effect: 'NoExecute' }] },
    status: {
      conditions: [{ type: 'Ready', status: ready ? 'True' : 'Unknown', message: ready ? 'kubelet is posting ready status' : 'Kubelet stopped posting node status.' }],
      allocatable: { cpu: '8', memory: '32Gi', pods: '110' },
      nodeInfo: { kubeletVersion: 'v1.33.1+k3s1' } as never,
    },
  });

const pod = (name: string, namespace: string, on: string, cpu: string, memory: string, state: 'running' | 'crash' | 'pull' | 'pending' | 'done' = 'running', age = 120) =>
  make(Pod, {
    metadata: { name, namespace, creationTimestamp: ago(age) },
    spec: {
      ...(state === 'pending' ? {} : { nodeName: on }),
      containers: [{ name: 'app', image: 'registry.local/app:1', resources: { requests: { cpu, memory }, limits: { memory } } }],
    },
    status: {
      phase: state === 'pending' ? 'Pending' : state === 'done' ? 'Succeeded' : 'Running',
      ...(state === 'pending'
        ? { conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: '0/3 nodes are available: 1 node(s) had untolerated taint' }] }
        : {
            containerStatuses: [
              {
                name: 'app',
                image: 'registry.local/app:1',
                imageID: '',
                ready: state === 'running',
                restartCount: state === 'crash' ? 14 : 0,
                state:
                  state === 'crash'
                    ? { waiting: { reason: 'CrashLoopBackOff', message: 'back-off 5m0s restarting failed container=app' } }
                    : state === 'pull'
                      ? { waiting: { reason: 'ImagePullBackOff', message: 'Back-off pulling image "registry.local/worker:2.4.1"' } }
                      : state === 'done'
                        ? { terminated: { exitCode: 0, reason: 'Completed' } }
                        : { running: { startedAt: ago(age) } },
              },
            ],
          }),
    },
  });

const event = (name: string, type: 'Warning' | 'Normal', reason: string, kind: string, of: string, message: string, count: number, minutes: number) =>
  make(Event, { metadata: { name, namespace: 'shop' }, type, reason, message, count, involvedObject: { kind, name: of, namespace: 'shop' }, lastTimestamp: ago(minutes) });

/** A cluster as it should be: three nodes Ready, its pods running, a job done. */
function healthy(c: Cluster) {
  for (const name of ['shop', 'monitoring', 'kube-system']) c.add(Namespace, make(Namespace, { metadata: { name, creationTimestamp: ago(60 * 24 * 214) } }));
  c.add(Node, node('cp-1', 'control-plane'));
  c.add(Node, node('worker-1', 'worker'));
  c.add(Node, node('worker-2', 'worker'));
  ['web-6c9d-a1', 'web-6c9d-b2', 'api-7f9c-c3', 'db-0'].forEach((name, i) => void c.add(Pod, pod(name, 'shop', ['cp-1', 'worker-1', 'worker-2'][i % 3], '500m', '1Gi')));
  ['prometheus-0', 'grafana-5d8b-x1'].forEach((name) => void c.add(Pod, pod(name, 'monitoring', 'worker-1', '1', '4Gi')));
  c.add(Pod, pod('coredns-75c7-b9', 'kube-system', 'cp-1', '100m', '70Mi'));
  c.add(Pod, pod('backup-29012340-zq7nh', 'shop', 'worker-2', '250m', '256Mi', 'done'));
  c.add(
    Deployment,
    make(Deployment, {
      metadata: { name: 'web', namespace: 'shop', generation: 1 },
      spec: { replicas: 2 },
      status: { observedGeneration: 1, replicas: 2, updatedReplicas: 2, readyReplicas: 2, availableReplicas: 2 },
    }),
  );
  c.add(Job, make(Job, { metadata: { name: 'backup-29012340', namespace: 'shop' }, status: { succeeded: 1, conditions: [{ type: 'Complete', status: 'True' }] } }));
  c.add(Service, make(Service, { metadata: { name: 'web', namespace: 'shop' }, spec: { type: 'ClusterIP' } }));
  c.add(Service, make(Service, { metadata: { name: 'ingress', namespace: 'kube-system' }, spec: { type: 'LoadBalancer' } }));
  c.add(PersistentVolumeClaim, make(PersistentVolumeClaim, { metadata: { name: 'data-db-0', namespace: 'shop' }, status: { phase: 'Bound' } }));
  c.add(Event, event('e1', 'Normal', 'ScalingReplicaSet', 'Deployment', 'web', 'Scaled up replica set web-6c9d to 2 from 1', 1, 8));
  c.add(Event, event('e2', 'Normal', 'Scheduled', 'Pod', 'web-6c9d-b2', 'Successfully assigned shop/web-6c9d-b2 to worker-1', 1, 8));
}

/** The same in trouble: a node NotReady, pods failing and waiting, a rollout going, Warning events. */
function trouble(c: Cluster) {
  healthy(c);
  c.add(Node, node('worker-2', 'worker', false));
  c.add(Pod, pod('api-7f9c-x2kqp', 'shop', 'worker-1', '500m', '512Mi', 'crash', 38));
  c.add(Pod, pod('worker-5d8b-m4n2r', 'shop', 'cp-1', '250m', '256Mi', 'pull', 12));
  c.add(Pod, pod('prometheus-1', 'monitoring', '', '1', '4Gi', 'pending', 6));
  c.add(
    Deployment,
    make(Deployment, {
      metadata: { name: 'api', namespace: 'shop', generation: 3 },
      spec: { replicas: 3 },
      status: {
        observedGeneration: 3,
        replicas: 3,
        updatedReplicas: 2,
        readyReplicas: 2,
        availableReplicas: 2,
        conditions: [{ type: 'Progressing', status: 'True', reason: 'ReplicaSetUpdated', message: 'ReplicaSet "api-7f9c" is progressing.' }],
      },
    }),
  );
  c.add(Event, event('w1', 'Warning', 'BackOff', 'Pod', 'api-7f9c-x2kqp', 'Back-off restarting failed container app in pod api-7f9c-x2kqp', 41, 1));
  c.add(Event, event('w2', 'Warning', 'Failed', 'Pod', 'worker-5d8b-m4n2r', 'Failed to pull image "registry.local/worker:2.4.1": not found', 9, 2));
  c.add(Event, event('w3', 'Warning', 'FailedScheduling', 'Pod', 'prometheus-1', '0/3 nodes are available: 1 node(s) had untolerated taint', 7, 4));
  c.add(Event, event('w4', 'Warning', 'NodeNotReady', 'Node', 'worker-2', 'Node worker-2 status is now: NodeNotReady', 1, 6));
}

/** Others' parts in the start's regions, as addons would put them. */
const others = defineAddon({
  id: 'others',
  title: 'Others',
  setup: ({ contributor }) => {
    contributor.add(
      'Fill',
      'flux.overview.header',
      fill(slots.page('overview', 'header'), {
        render: () => (
          <Badge level="ok" dot title="flux-system: Applied revision main@sha1:4f2a9c1">
            Flux · in sync
          </Badge>
        ),
      }),
    );
    contributor.add(
      'Fill',
      'alertmanager.overview.health',
      fill(slots.page('overview', 'health'), {
        render: () => (
          <div class="uk-gauges">
            <Nothing icon="circle-check">No alerts firing.</Nothing>
          </div>
        ),
      }),
    );
    contributor.add(
      'Fill',
      'metrics.overview.capacity',
      fill(slots.page('overview', 'capacity'), {
        render: () => (
          <div class="uk-gauges">
            <Gauge label="CPU usage" value={21} of={100} said="21% (kubectl top)" />
            <Gauge label="Memory usage" value={52} of={100} said="52%" />
          </div>
        ),
      }),
    );
    contributor.add(
      'Fill',
      'cert-manager.overview.main',
      fill(slots.page('overview', 'main'), {
        order: 400,
        render: () => (
          <section class="uk-panel">
            <div class="uk-panel-head">
              <div class="uk-panel-title">
                <h2>Certificates expiring</h2>
              </div>
            </div>
            <PanelBody>
              <Rows>
                <Row
                  mark={<Status tone="warn" icon="cert" title="Expires in 6 days" />}
                  lead={<b>shop-tls</b>}
                  end="in 6d"
                  under="Renewal failed: ACME challenge for shop.example.com is pending"
                />
              </Rows>
            </PanelBody>
          </section>
        ),
      }),
    );
  },
});

/** A cluster in trouble: what is unhealthy first, a rollout going, Warning events. */
export const InTrouble = () => <KubeStory addons={[core]} path="/" cluster={trouble} />;
/** All as it should be: nothing unhealthy, said so; no Warning events (Normal ones, under All). */
export const Healthy = () => <KubeStory addons={[core]} path="/" cluster={healthy} />;
/** Others' parts in its regions: a GitOps mark, alerts, usage, a panel of their own. */
export const WithAddons = () => <KubeStory addons={[core, others]} path="/" cluster={trouble} />;

InTrouble.storyName = 'In trouble';
WithAddons.storyName = 'With addons';
