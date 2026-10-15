import { kinds } from '@overkube/kube-types';
import type { KubeStory } from '@overkube/storybook/preact';
import { make } from '@overkube/storybook/preact';

/*
 * A small cluster the core's page stories draw (its table, its navigation,
 * how it looks): a namespace shop, its pods (one as a cluster has it: its
 * labels, its owner, its status and conditions), a deployment.
 */

const { Pod, Namespace } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;

export type StoryCluster = Parameters<NonNullable<Parameters<typeof KubeStory>[0]['cluster']>>[0];

export const shop = (c: StoryCluster) => {
  c.add(Namespace, make(Namespace, { metadata: { name: 'shop' } }));
  for (const name of ['web-2', 'db-0']) c.add(Pod, make(Pod, { metadata: { name, namespace: 'shop' }, spec: { containers: [{ name: 'a', image: 'nginx:1.27' }] } }));
  // One as a cluster has it: its labels, its owner, its status and conditions.
  const started = new Date(Date.now() - 50 * 60_000).toISOString();
  c.add(
    Pod,
    make(Pod, {
      metadata: {
        name: 'web-1',
        namespace: 'shop',
        labels: { app: 'web', 'pod-template-hash': '7d4b9' },
        annotations: { 'kubectl.kubernetes.io/restartedAt': started },
        ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'web-7d4b9', uid: 'rs-1', controller: true }],
      },
      spec: { nodeName: 'node-1', containers: [{ name: 'a', image: 'nginx:1.27' }] },
      status: {
        phase: 'Running',
        podIPs: [{ ip: '10.42.0.12' }],
        containerStatuses: [{ name: 'a', image: 'nginx:1.27', imageID: '', ready: true, restartCount: 0, started: true, state: { running: { startedAt: started } } }],
        conditions: [
          { type: 'PodScheduled', status: 'True', lastTransitionTime: started },
          { type: 'Initialized', status: 'True', lastTransitionTime: started },
          { type: 'ContainersReady', status: 'True', lastTransitionTime: started },
          { type: 'Ready', status: 'True', lastTransitionTime: started },
        ],
      },
    }),
  );
  c.add(
    Deployment,
    make(Deployment, {
      metadata: { name: 'web', namespace: 'shop' },
      spec: { replicas: 2, selector: { matchLabels: { app: 'web' } }, template: { metadata: { labels: { app: 'web' } } } },
      status: {
        readyReplicas: 1,
        updatedReplicas: 2,
        availableReplicas: 1,
        conditions: [
          { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable', message: 'Deployment has minimum availability.', lastTransitionTime: started },
          { type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded', message: 'ReplicaSet "web-7d4b9" has timed out progressing.', lastTransitionTime: started },
        ],
      },
    }),
  );
};
