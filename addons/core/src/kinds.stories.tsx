import { kinds } from '@overkube/kube-types';
import { defineAddon, slots } from '@overkube/sdk';
import { KubeStory, make } from '@overkube/storybook/preact';
import { Badge, Button } from '@overkube/uikit';
import { fill } from '@overweave/ui/preact';
import { CSR_PEM, EC_PEM } from './certs.fixture.ts';
import core from './index.tsx';
import type { StoryCluster } from './shop.fixture.tsx';

/*
 * The usual kinds opened, as the core draws them (each its own beside what
 * every kind has): a pod (its containers, volumes, node), its workloads (a
 * deployment, a stateful set, a daemon set, a replica set: their pods,
 * template, rollout), a service (its ports, endpoints), a node (what is
 * allocated of it, taints, system), a job and a cron job (their pods,
 * jobs). One cluster for all of them, the stories' own.
 */

export default { title: 'core/Resource view by kind' };

const { Pod, Namespace, Node, Service, ConfigMap, Secret, PersistentVolumeClaim, PersistentVolume, ServiceAccount, ResourceQuota, Event } = kinds.core.v1;
const { Ingress, NetworkPolicy } = kinds.networking.v1;
const { ClusterRole, RoleBinding } = kinds.rbac.v1;
const { StorageClass } = kinds.storage.v1;
const { HorizontalPodAutoscaler } = kinds.autoscaling.v2;
const { PodDisruptionBudget } = kinds.policy.v1;
const { Deployment, ReplicaSet, StatefulSet, DaemonSet } = kinds.apps.v1;
const { Job, CronJob } = kinds.batch.v1;
const { EndpointSlice } = kinds.discovery.v1;
const { IngressClass } = kinds.networking.v1;
const { PriorityClass } = kinds.scheduling.v1;
const { APIService } = kinds.apiregistration.v1;
const { ValidatingWebhookConfiguration } = kinds.admissionregistration.v1;
const { CertificateSigningRequest } = kinds.certificates.v1;
const { CustomResourceDefinition } = kinds.apiextensions.v1;
const { LimitRange } = kinds.core.v1;

type Cluster = StoryCluster;

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const DAY = 60 * 24;

/** A pod of coredns: an init container done, coredns running, a sidecar crashing; config, a claim, a scratch dir, its token. */
const coredns = (name: string, uid: string, owner: { kind: string; name: string; uid: string; apiVersion: string }, crash = false) =>
  make(Pod, {
    metadata: {
      name,
      namespace: 'kube-system',
      uid,
      labels: { 'k8s-app': 'kube-dns', 'pod-template-hash': '75c7b7f4' },
      ownerReferences: [{ ...owner, controller: true }],
      creationTimestamp: ago(3 * DAY),
    },
    spec: {
      nodeName: 'kube',
      serviceAccountName: 'coredns',
      priorityClassName: 'system-cluster-critical',
      tolerations: [{ key: 'CriticalAddonsOnly', operator: 'Exists' }],
      initContainers: [
        { name: 'wait-for-api', image: 'busybox:1.37', resources: { requests: { memory: '16Mi' } } },
        ...(crash
          ? [
              {
                name: 'metrics-proxy',
                image: 'ghcr.io/acme/metrics-proxy:0.9.4',
                restartPolicy: 'Always',
                resources: { requests: { cpu: '10m', memory: '32Mi' }, limits: { cpu: '50m', memory: '64Mi' } },
              },
            ]
          : []),
      ],
      containers: [
        {
          name: 'coredns',
          image: 'registry.k8s.io/coredns/coredns:v1.12.0',
          command: ['/coredns'],
          args: ['-conf', '/etc/coredns/Corefile', '-dns.port', '53', '-pidfile', '/run/coredns.pid', '-log.level', 'info', '-health.lameduck', '5s'],
          ports: [
            { containerPort: 53, protocol: 'UDP' },
            { containerPort: 53, protocol: 'TCP' },
            { containerPort: 9153, protocol: 'TCP' },
          ],
          resources: { requests: { cpu: '100m', memory: '70Mi' }, limits: { memory: '170Mi' } },
          envFrom: [{ secretRef: { name: 'coredns-env' } }],
          env: [
            { name: 'GOMEMLIMIT', value: '160MiB' },
            { name: 'POD_IP', valueFrom: { fieldRef: { fieldPath: 'status.podIP' } } },
          ],
          livenessProbe: { httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 60, timeoutSeconds: 5, failureThreshold: 5 },
          readinessProbe: { httpGet: { path: '/ready', port: 8181 }, periodSeconds: 10 },
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { add: ['NET_BIND_SERVICE'], drop: ['ALL'] } },
          volumeMounts: [
            { name: 'config-volume', mountPath: '/etc/coredns', readOnly: true },
            { name: 'data', mountPath: '/var/lib/data' },
            { name: 'tmp', mountPath: '/tmp' },
            { name: 'kube-api-access', mountPath: '/var/run/secrets/kubernetes.io/serviceaccount', readOnly: true },
          ],
        },
      ],
      volumes: [
        { name: 'config-volume', configMap: { name: 'coredns' } },
        { name: 'data', persistentVolumeClaim: { claimName: 'data-coredns' } },
        { name: 'tmp', emptyDir: {} },
        { name: 'kube-api-access', projected: { sources: [{ serviceAccountToken: { path: 'token' } }] } },
      ],
    },
    status: {
      phase: 'Running',
      qosClass: 'Burstable',
      podIP: crash ? '10.42.0.9' : '10.42.0.4',
      initContainerStatuses: [
        { name: 'wait-for-api', image: 'busybox:1.37', imageID: '', ready: true, restartCount: 0, state: { terminated: { exitCode: 0, reason: 'Completed' } } },
        ...(crash
          ? [{ name: 'metrics-proxy', image: 'ghcr.io/acme/metrics-proxy:0.9.4', imageID: '', ready: false, restartCount: 41, state: { waiting: { reason: 'CrashLoopBackOff' } } }]
          : []),
      ],
      containerStatuses: [
        {
          name: 'coredns',
          image: 'registry.k8s.io/coredns/coredns:v1.12.0',
          imageID: '',
          ready: true,
          restartCount: 5,
          started: true,
          state: { running: { startedAt: ago(330) } },
        },
      ],
      conditions: [
        { type: 'PodScheduled', status: 'True', lastTransitionTime: ago(3 * DAY) },
        {
          type: 'Ready',
          status: crash ? 'False' : 'True',
          ...(crash ? { reason: 'ContainersNotReady', message: 'containers with unready status: [metrics-proxy]' } : {}),
          lastTransitionTime: ago(330),
        },
      ],
    },
  });

const RS = { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'coredns-75c7b7f4', uid: 'rs-coredns' };

/** One cluster: kube-system's coredns (its deployment, replica sets, pods, service, slices), a node, a stateful set, a daemon set, a cron job and its jobs. */
function cluster(c: Cluster) {
  const secure = { 'pod-security.kubernetes.io/enforce': 'restricted', 'pod-security.kubernetes.io/warn': 'restricted' };
  for (const name of ['kube-system', 'shop', 'monitoring'])
    c.add(Namespace, make(Namespace, { metadata: { name, labels: name === 'shop' ? secure : {}, creationTimestamp: ago(40 * DAY) }, status: { phase: 'Active' } }));
  c.add(
    Node,
    make(Node, {
      metadata: {
        name: 'kube',
        uid: 'node-kube',
        labels: { 'node-role.kubernetes.io/control-plane': 'true', 'kubernetes.io/os': 'linux', 'kubernetes.io/hostname': 'kube' },
        creationTimestamp: ago(3 * DAY),
      },
      spec: {
        taints: [
          { key: 'node-role.kubernetes.io/control-plane', effect: 'NoSchedule' },
          { key: 'dedicated', value: 'gpu', effect: 'NoExecute' },
        ],
      },
      status: {
        capacity: { cpu: '4', memory: '8Gi', pods: '110', 'ephemeral-storage': '116Gi' },
        allocatable: { cpu: '4', memory: '7600Mi', pods: '110', 'ephemeral-storage': '113Gi' },
        addresses: [
          { type: 'InternalIP', address: '192.168.1.20' },
          { type: 'Hostname', address: 'kube' },
        ],
        nodeInfo: {
          architecture: 'arm64',
          operatingSystem: 'linux',
          osImage: 'Ubuntu 24.04.1 LTS',
          kernelVersion: '6.8.0-45-generic',
          containerRuntimeVersion: 'containerd://2.0.2',
          kubeletVersion: 'v1.35.7',
          kubeProxyVersion: '',
          bootID: '',
          machineID: '',
          systemUUID: '',
        },
        conditions: [
          { type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status', lastTransitionTime: ago(3 * DAY) },
          { type: 'MemoryPressure', status: 'False', reason: 'KubeletHasSufficientMemory', lastTransitionTime: ago(3 * DAY) },
          { type: 'DiskPressure', status: 'False', reason: 'KubeletHasNoDiskPressure', lastTransitionTime: ago(3 * DAY) },
        ],
      },
    }),
  );
  c.add(
    ServiceAccount,
    make(ServiceAccount, { metadata: { name: 'coredns', namespace: 'kube-system', creationTimestamp: ago(3 * DAY) }, imagePullSecrets: [{ name: 'ghcr-pull' }] }),
  );
  c.add(
    ConfigMap,
    make(ConfigMap, {
      metadata: { name: 'coredns', namespace: 'kube-system', creationTimestamp: ago(3 * DAY) },
      data: {
        Corefile: '.:53 {\n    errors\n    health\n    kubernetes cluster.local in-addr.arpa ip6.arpa\n    forward . /etc/resolv.conf\n    cache 30\n}\n',
        NodeHosts: '192.168.1.20 kube\n',
      },
    }),
  );
  c.add(
    Secret,
    make(Secret, {
      metadata: { name: 'coredns-env', namespace: 'kube-system', creationTimestamp: ago(3 * DAY) },
      type: 'Opaque',
      data: {
        API_TOKEN: 'czNjcjN0LXQwa2Vu',
        'ca.crt':
          'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSURKekNDQWcrZ0F3SUJBZ0lSQU5McXlqSDFKZ2hnQ3lGVk5DV1NTMW93RFFZSktvWklodmNOQVFFTEJRQXcKSUlESnpDQ0FnK2dBd0lCQWdJUkFOTHF5akgxSmdoZ0N5RlZOQ1dTUzFvd0RRWUpLb1pJaHZjTkFRRUxCUUF3QQpJREp6Q0NBZytnQXdJQkFnSVJBTkxxeWpIMUpnaGdDeUZWTkNXU1Mxb3dEUVlKS29aSWh2Y05BUUVMQlFBd0FCCkRKekNDQWcrZ0F3SUJBZ0lSQU5McXlqSDFKZ2hnQ3lGVk5DV1NTMW93RFFZSktvWklodmNOQVFFTEJRQXdBQkMKSnpDQ0FnK2dBd0lCQWdJUkFOTHF5akgxSmdoZ0N5RlZOQ1dTUzFvd0RRWUpLb1pJaHZjTkFRRUxCUUF3QUJDRAp6Q0NBZytnQXdJQkFnSVJBTkxxeWpIMUpnaGdDeUZWTkNXU1Mxb3dEUVlKS29aSWh2Y05BUUVMQlFBd0FCQ0RFCkNDQWcrZ0F3SUJBZ0lSQU5McXlqSDFKZ2hnQ3lGVk5DV1NTMW93RFFZSktvWklodmNOQVFFTEJRQXdBQkNERUYKTUlJREp6Q0NBZytnQXdJQkFnSVJBTkxxeWpIMUpnaGdDeUZWTkNXU1Mxb3dEUVlKS29aSWh2Y05BUUVMQlFBdwpJSURKekNDQWcrZ0F3SUJBZ0lSQU5McXlqSDFKZ2hnQ3lGVk5DV1NTMW93RFFZSktvWklodmNOQVFFTEJRQXdBCklESnpDQ0FnK2dBd0lCQWdJUkFOTHF5akgxSmdoZ0N5RlZOQ1dTUzFvd0RRWUpLb1pJaHZjTkFRRUxCUUF3QUIKREp6Q0NBZytnQXdJQkFnSVJBTkxxeWpIMUpnaGdDeUZWTkNXU1Mxb3dEUVlKS29aSWh2Y05BUUVMQlFBd0FCQwpKekNDQWcrZ0F3SUJBZ0lSQU5McXlqSDFKZ2hnQ3lGVk5DV1NTMW93RFFZSktvWklodmNOQVFFTEJRQXdBQkNECnpDQ0FnK2dBd0lCQWdJUkFOTHF5akgxSmdoZ0N5RlZOQ1dTUzFvd0RRWUpLb1pJaHZjTkFRRUxCUUF3QUJDREUKQ0NBZytnQXdJQkFnSVJBTkxxeWpIMUpnaGdDeUZWTkNXU1Mxb3dEUVlKS29aSWh2Y05BUUVMQlFBd0FCQ0RFRgpNSUlESnpDQ0FnK2dBd0lCQWdJUkFOTHF5akgxSmdoZ0N5RlZOQ1dTUzFvd0RRWUpLb1pJaHZjTkFRRUxCUUF3CklJREp6Q0NBZytnQXdJQkFnSVJBTkxxeWpIMUpnaGdDeUZWTkNXU1Mxb3dEUVlKS29aSWh2Y05BUUVMQlFBd0EKSURKekNDQWcrZ0F3SUJBZ0lSQU5McXlqSDFKZ2hnQ3lGVk5DV1NTMW93RFFZSktvWklodmNOQVFFTEJRQXdBQgpESnpDQ0FnK2dBd0lCQWdJUkFOTHF5akgxSmdoZ0N5RlZOQ1dTUzFvd0RRWUpLb1pJaHZjTkFRRUxCUUF3QUJDCi0tLS0tRU5EIENFUlRJRklDQVRFLS0tLS0K',
      },
    }),
  );
  c.add(
    PersistentVolumeClaim,
    make(PersistentVolumeClaim, {
      metadata: { name: 'data-coredns', namespace: 'kube-system', creationTimestamp: ago(3 * DAY) },
      spec: { accessModes: ['ReadWriteOnce'], storageClassName: 'local-path', volumeName: 'pvc-8f1c2e', resources: { requests: { storage: '1Gi' } } },
      status: { phase: 'Bound', accessModes: ['ReadWriteOnce'], capacity: { storage: '1Gi' } },
    }),
  );
  storage(c);
  access(c);
  network(c);
  scaling(c);
  api(c);
  // coredns: its deployment, its replica sets (the last two revisions), its pods.
  c.add(
    Deployment,
    make(Deployment, {
      metadata: {
        name: 'coredns',
        namespace: 'kube-system',
        uid: 'deploy-coredns',
        labels: { 'k8s-app': 'kube-dns' },
        annotations: { 'deployment.kubernetes.io/revision': '3' },
        creationTimestamp: ago(3 * DAY),
      },
      spec: {
        replicas: 2,
        selector: { matchLabels: { 'k8s-app': 'kube-dns' } },
        strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: 1 } },
        revisionHistoryLimit: 10,
        progressDeadlineSeconds: 600,
        template: { metadata: { labels: { 'k8s-app': 'kube-dns' } }, spec: coredns('template', '', RS).spec ?? { containers: [] } },
      },
      status: {
        replicas: 2,
        readyReplicas: 1,
        updatedReplicas: 2,
        availableReplicas: 1,
        conditions: [
          { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable', message: 'Deployment has minimum availability.', lastTransitionTime: ago(3 * DAY) },
          {
            type: 'Progressing',
            status: 'True',
            reason: 'NewReplicaSetAvailable',
            message: 'ReplicaSet "coredns-75c7b7f4" has successfully progressed.',
            lastTransitionTime: ago(330),
          },
        ],
      },
    }),
  );
  const owner = { apiVersion: 'apps/v1', kind: 'Deployment', name: 'coredns', uid: 'deploy-coredns', controller: true };
  c.add(
    ReplicaSet,
    make(ReplicaSet, {
      metadata: {
        ...RS,
        namespace: 'kube-system',
        labels: { 'k8s-app': 'kube-dns' },
        annotations: { 'deployment.kubernetes.io/revision': '3' },
        ownerReferences: [owner],
        creationTimestamp: ago(330),
      },
      spec: { replicas: 2, selector: { matchLabels: { 'k8s-app': 'kube-dns' } } },
      status: { replicas: 2, readyReplicas: 1, availableReplicas: 1 },
    }),
  );
  c.add(
    ReplicaSet,
    make(ReplicaSet, {
      metadata: {
        name: 'coredns-6d8f9c7b5',
        namespace: 'kube-system',
        uid: 'rs-coredns-old',
        annotations: { 'deployment.kubernetes.io/revision': '2' },
        ownerReferences: [owner],
        creationTimestamp: ago(3 * DAY),
      },
      spec: { replicas: 0, selector: { matchLabels: { 'k8s-app': 'kube-dns' } } },
      status: { replicas: 0 },
    }),
  );
  c.add(Pod, coredns('coredns-75c7b7f4-b9mgn', 'pod-b9mgn', RS));
  c.add(Pod, coredns('coredns-75c7b7f4-8xk2d', 'pod-8xk2d', RS, true));
  c.add(
    Service,
    make(Service, {
      metadata: { name: 'kube-dns', namespace: 'kube-system', uid: 'svc-dns', creationTimestamp: ago(3 * DAY) },
      spec: {
        type: 'ClusterIP',
        clusterIP: '10.43.0.10',
        selector: { 'k8s-app': 'kube-dns' },
        ports: [
          { name: 'dns', port: 53, targetPort: 53, protocol: 'UDP' },
          { name: 'dns-tcp', port: 53, targetPort: 53, protocol: 'TCP' },
          { name: 'metrics', port: 9153, targetPort: 9153, protocol: 'TCP' },
        ],
      },
    }),
  );
  c.add(
    EndpointSlice,
    make(EndpointSlice, {
      metadata: { name: 'kube-dns-x7k2p', namespace: 'kube-system', labels: { 'kubernetes.io/service-name': 'kube-dns' } },
      addressType: 'IPv4',
      endpoints: [
        { addresses: ['10.42.0.4'], conditions: { ready: true }, targetRef: { kind: 'Pod', name: 'coredns-75c7b7f4-b9mgn', namespace: 'kube-system' } },
        { addresses: ['10.42.0.9'], conditions: { ready: false }, targetRef: { kind: 'Pod', name: 'coredns-75c7b7f4-8xk2d', namespace: 'kube-system' } },
      ],
    }),
  );
  c.add(
    Event,
    make(Event, {
      metadata: { name: 'coredns.a', namespace: 'kube-system' },
      involvedObject: { kind: 'Pod', name: 'coredns-75c7b7f4-8xk2d', uid: 'pod-8xk2d' },
      type: 'Warning',
      reason: 'BackOff',
      message: 'Back-off restarting failed container metrics-proxy',
      count: 41,
      lastTimestamp: ago(1),
    }),
  );
  c.add(
    Event,
    make(Event, {
      metadata: { name: 'coredns.b', namespace: 'kube-system' },
      involvedObject: { kind: 'Deployment', name: 'coredns', uid: 'deploy-coredns' },
      type: 'Normal',
      reason: 'ScalingReplicaSet',
      message: 'Scaled up replica set coredns-75c7b7f4 from 1 to 2',
      lastTimestamp: ago(330),
    }),
  );
  others(c);
}

/** A running pod of a workload: its labels, its owner, its node, what it asks for. */
const running = (name: string, namespace: string, labels: Record<string, string>, owner: { apiVersion: string; kind: string; name: string; uid: string }, extra: object = {}) =>
  make(Pod, {
    metadata: { name, namespace, uid: `pod-${name}`, labels, ownerReferences: [{ ...owner, controller: true }], creationTimestamp: ago(40 * DAY) },
    spec: { nodeName: 'kube', containers: [{ name: 'main', image: 'postgres:17', resources: { requests: { cpu: '250m', memory: '256Mi' } } }], ...extra },
    status: {
      phase: 'Running',
      podIP: '10.42.0.30',
      containerStatuses: [{ name: 'main', image: 'postgres:17', imageID: '', ready: true, restartCount: 0, started: true, state: { running: { startedAt: ago(40 * DAY) } } }],
    },
  });

/** A stateful set (db: its pods, its claims), a daemon set (node-exporter), a cron job (backup: a job done, one failed). */
function others(c: Cluster) {
  const db = { apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'db', uid: 'sts-db' };
  c.add(
    StatefulSet,
    make(StatefulSet, {
      metadata: { name: 'db', namespace: 'shop', uid: 'sts-db', creationTimestamp: ago(40 * DAY) },
      spec: {
        replicas: 2,
        serviceName: 'db-headless',
        selector: { matchLabels: { app: 'db' } },
        updateStrategy: { type: 'RollingUpdate' },
        template: {
          metadata: { labels: { app: 'db' } },
          spec: { containers: [{ name: 'main', image: 'postgres:17', resources: { requests: { cpu: '250m', memory: '256Mi' } } }] },
        },
        volumeClaimTemplates: [
          { metadata: { name: 'data' }, spec: { accessModes: ['ReadWriteOnce'], storageClassName: 'local-path', resources: { requests: { storage: '10Gi' } } } },
        ],
      },
      status: { replicas: 2, readyReplicas: 2, currentReplicas: 2, updatedReplicas: 2, availableReplicas: 2 },
    }),
  );
  for (const i of [0, 1]) c.add(Pod, running(`db-${i}`, 'shop', { app: 'db' }, db));
  const exporter = { apiVersion: 'apps/v1', kind: 'DaemonSet', name: 'node-exporter', uid: 'ds-exporter' };
  c.add(
    DaemonSet,
    make(DaemonSet, {
      metadata: { name: 'node-exporter', namespace: 'monitoring', uid: 'ds-exporter', creationTimestamp: ago(40 * DAY) },
      spec: {
        selector: { matchLabels: { app: 'node-exporter' }, matchExpressions: [{ key: 'canary', operator: 'DoesNotExist' }] },
        template: {
          metadata: { labels: { app: 'node-exporter' } },
          spec: { nodeSelector: { 'kubernetes.io/os': 'linux' }, containers: [{ name: 'exporter', image: 'quay.io/prometheus/node-exporter:v1.9.0' }] },
        },
      },
      status: { desiredNumberScheduled: 1, currentNumberScheduled: 1, numberReady: 1, updatedNumberScheduled: 1, numberAvailable: 1, numberMisscheduled: 0 },
    }),
  );
  c.add(Pod, running('node-exporter-x9fp', 'monitoring', { app: 'node-exporter' }, exporter));
  const backup = { apiVersion: 'batch/v1', kind: 'CronJob', name: 'backup', uid: 'cron-backup' };
  c.add(
    CronJob,
    make(CronJob, {
      metadata: { name: 'backup', namespace: 'shop', uid: 'cron-backup', creationTimestamp: ago(40 * DAY) },
      spec: {
        schedule: '0 3 * * *',
        timeZone: 'Europe/Berlin',
        concurrencyPolicy: 'Forbid',
        jobTemplate: { spec: { template: { spec: { containers: [{ name: 'backup', image: 'restic/restic:0.17' }] } } } },
      },
      status: { lastScheduleTime: ago(16 * 60 + 48) },
    }),
  );
  const job = (name: string, done: boolean, minutes: number) =>
    make(Job, {
      metadata: { name, namespace: 'shop', uid: `job-${name}`, ownerReferences: [{ ...backup, controller: true }], creationTimestamp: ago(minutes) },
      spec: {
        completions: 1,
        backoffLimit: 6,
        // The failed one's: a bad exit fails it at once, a disruption is not counted.
        ...(done
          ? {}
          : {
              podFailurePolicy: {
                rules: [
                  { action: 'FailJob', onExitCodes: { containerName: 'backup', operator: 'In', values: [42] } },
                  { action: 'Ignore', onPodConditions: [{ type: 'DisruptionTarget', status: 'True' }] },
                ],
              },
            }),
        template: { spec: { restartPolicy: 'Never', containers: [{ name: 'backup', image: 'restic/restic:0.17' }] } },
      },
      status: done
        ? { succeeded: 1, startTime: ago(minutes), completionTime: ago(minutes - 1), conditions: [{ type: 'Complete', status: 'True', lastTransitionTime: ago(minutes - 1) }] }
        : {
            failed: 7,
            startTime: ago(minutes),
            conditions: [
              { type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded', message: 'Job has reached the specified backoff limit', lastTransitionTime: ago(minutes - 6) },
            ],
          },
    });
  c.add(Job, job('backup-29012340', true, 16 * 60 + 48));
  c.add(Job, job('backup-29010900', false, 40 * 60));
  c.add(
    Pod,
    make(Pod, {
      metadata: {
        name: 'backup-29012340-zq7nh',
        namespace: 'shop',
        uid: 'pod-zq7nh',
        labels: { 'job-name': 'backup-29012340' },
        ownerReferences: [{ apiVersion: 'batch/v1', kind: 'Job', name: 'backup-29012340', uid: 'job-backup-29012340', controller: true }],
        creationTimestamp: ago(16 * 60 + 48),
      },
      spec: { nodeName: 'kube', restartPolicy: 'Never', containers: [{ name: 'backup', image: 'restic/restic:0.17' }] },
      status: {
        phase: 'Succeeded',
        containerStatuses: [
          { name: 'backup', image: 'restic/restic:0.17', imageID: '', ready: false, restartCount: 0, state: { terminated: { exitCode: 0, reason: 'Completed' } } },
        ],
      },
    }),
  );
}

/** Storage: the claim's volume (a host path on kube), its class, another class with all it can say. */
function storage(c: Cluster) {
  c.add(
    PersistentVolume,
    make(PersistentVolume, {
      metadata: { name: 'pvc-8f1c2e', creationTimestamp: ago(3 * DAY) },
      spec: {
        capacity: { storage: '1Gi' },
        accessModes: ['ReadWriteOnce'],
        persistentVolumeReclaimPolicy: 'Delete',
        storageClassName: 'local-path',
        claimRef: { kind: 'PersistentVolumeClaim', name: 'data-coredns', namespace: 'kube-system' },
        hostPath: { path: '/var/lib/rancher/k3s/storage/pvc-8f1c2e_kube-system_data-coredns' },
        nodeAffinity: { required: { nodeSelectorTerms: [{ matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values: ['kube'] }] }] } },
      },
      status: { phase: 'Bound' },
    }),
  );
  c.add(
    StorageClass,
    make(StorageClass, {
      metadata: { name: 'local-path', annotations: { 'storageclass.kubernetes.io/is-default-class': 'true' }, creationTimestamp: ago(40 * DAY) },
      provisioner: 'rancher.io/local-path',
      reclaimPolicy: 'Delete',
      volumeBindingMode: 'WaitForFirstConsumer',
    }),
  );
  c.add(
    StorageClass,
    make(StorageClass, {
      metadata: { name: 'gp3-encrypted', creationTimestamp: ago(40 * DAY) },
      provisioner: 'ebs.csi.aws.com',
      reclaimPolicy: 'Retain',
      volumeBindingMode: 'WaitForFirstConsumer',
      allowVolumeExpansion: true,
      parameters: { type: 'gp3', iops: '3000', throughput: '125', encrypted: 'true', 'csi.storage.k8s.io/fstype': 'ext4' },
      mountOptions: ['noatime', 'discard'],
      allowedTopologies: [{ matchLabelExpressions: [{ key: 'topology.kubernetes.io/zone', values: ['eu-west-1a', 'eu-west-1b'] }] }],
    }),
  );
}

/** Access: a cluster role (pods read, a named config map changed, all of batch), its binding to coredns's account, a group and a user. */
function access(c: Cluster) {
  c.add(
    ClusterRole,
    make(ClusterRole, {
      metadata: { name: 'pod-reader', creationTimestamp: ago(40 * DAY) },
      rules: [
        { apiGroups: [''], resources: ['pods', 'pods/log'], verbs: ['get', 'list', 'watch'] },
        { apiGroups: ['', 'events.k8s.io'], resources: ['events'], verbs: ['list'] },
        { apiGroups: [''], resources: ['configmaps'], resourceNames: ['extension-apiserver-authentication'], verbs: ['get', 'update', 'patch'] },
        { apiGroups: ['batch'], resources: ['*'], verbs: ['*'] },
        { nonResourceURLs: ['/healthz'], verbs: ['get'] },
      ],
    }),
  );
  // view: gathered from the roles labelled to be (flux's, the system's).
  const toView = { 'rbac.authorization.k8s.io/aggregate-to-view': 'true' };
  c.add(
    ClusterRole,
    make(ClusterRole, {
      metadata: { name: 'view', creationTimestamp: ago(40 * DAY) },
      aggregationRule: { clusterRoleSelectors: [{ matchLabels: toView }] },
      rules: [
        { apiGroups: [''], resources: ['pods', 'services', 'configmaps'], verbs: ['get', 'list', 'watch'] },
        { apiGroups: ['kustomize.toolkit.fluxcd.io'], resources: ['kustomizations'], verbs: ['get', 'list', 'watch'] },
      ],
    }),
  );
  c.add(
    ClusterRole,
    make(ClusterRole, {
      metadata: { name: 'system:aggregate-to-view', labels: toView, creationTimestamp: ago(40 * DAY) },
      rules: [{ apiGroups: [''], resources: ['pods', 'services', 'configmaps'], verbs: ['get', 'list', 'watch'] }],
    }),
  );
  c.add(
    ClusterRole,
    make(ClusterRole, {
      metadata: { name: 'flux-view', labels: toView, creationTimestamp: ago(30 * DAY) },
      rules: [{ apiGroups: ['kustomize.toolkit.fluxcd.io'], resources: ['kustomizations'], verbs: ['get', 'list', 'watch'] }],
    }),
  );
  // coredns's pull secret: the registry it logs in to (its password never shown).
  c.add(
    Secret,
    make(Secret, {
      metadata: { name: 'ghcr-pull', namespace: 'kube-system', creationTimestamp: ago(40 * DAY) },
      type: 'kubernetes.io/dockerconfigjson',
      data: {
        '.dockerconfigjson': btoa(
          JSON.stringify({ auths: { 'ghcr.io': { username: 'acme-bot', password: 'not-a-real-token' }, 'registry-1.docker.io': { auth: btoa('acme:not-real') } } }),
        ),
      },
    }),
  );
  c.add(
    RoleBinding,
    make(RoleBinding, {
      metadata: { name: 'coredns-reads-pods', namespace: 'kube-system', creationTimestamp: ago(21 * DAY) },
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'pod-reader' },
      subjects: [
        { kind: 'ServiceAccount', name: 'coredns', namespace: 'kube-system' },
        { kind: 'Group', apiGroup: 'rbac.authorization.k8s.io', name: 'devs' },
        { kind: 'User', apiGroup: 'rbac.authorization.k8s.io', name: 'jane@acme.io' },
      ],
    }),
  );
}

/** Network: an ingress to shop's services (and TLS — one path to a service not there), its class, a policy letting some in and out; shop's certificate. */
function network(c: Cluster) {
  for (const name of ['web', 'api'])
    c.add(
      Service,
      make(Service, {
        metadata: { name, namespace: 'shop', creationTimestamp: ago(12 * DAY) },
        spec: { type: 'ClusterIP', clusterIP: name === 'web' ? '10.43.20.4' : '10.43.20.5', selector: { app: name }, ports: [{ name: 'http', port: 80, targetPort: 8080 }] },
      }),
    );
  c.add(
    Secret,
    make(Secret, {
      metadata: { name: 'shop-tls', namespace: 'shop', creationTimestamp: ago(12 * DAY) },
      type: 'kubernetes.io/tls',
      data: { 'tls.crt': btoa(EC_PEM), 'tls.key': btoa('-----BEGIN EC PRIVATE KEY-----\n(not shown in stories)\n-----END EC PRIVATE KEY-----\n') },
    }),
  );
  c.add(
    IngressClass,
    make(IngressClass, {
      metadata: { name: 'traefik', annotations: { 'ingressclass.kubernetes.io/is-default-class': 'true' }, creationTimestamp: ago(40 * DAY) },
      spec: { controller: 'traefik.io/ingress-controller' },
    }),
  );
  c.add(
    Ingress,
    make(Ingress, {
      metadata: { name: 'shop', namespace: 'shop', creationTimestamp: ago(12 * DAY) },
      spec: {
        ingressClassName: 'traefik',
        tls: [{ hosts: ['shop.example.com'], secretName: 'shop-tls' }],
        rules: [
          {
            host: 'shop.example.com',
            http: {
              paths: [
                { path: '/', pathType: 'Prefix', backend: { service: { name: 'web', port: { number: 80 } } } },
                { path: '/api', pathType: 'Prefix', backend: { service: { name: 'api', port: { name: 'http' } } } },
                { path: '/admin', pathType: 'Prefix', backend: { service: { name: 'admin', port: { number: 80 } } } },
              ],
            },
          },
        ],
      },
      status: { loadBalancer: { ingress: [{ ip: '192.168.1.20' }] } },
    }),
  );
  c.add(
    NetworkPolicy,
    make(NetworkPolicy, {
      metadata: { name: 'api-allow', namespace: 'shop', creationTimestamp: ago(21 * DAY) },
      spec: {
        podSelector: { matchLabels: { app: 'api' } },
        policyTypes: ['Ingress', 'Egress'],
        ingress: [
          { from: [{ podSelector: { matchLabels: { app: 'web' } } }], ports: [{ port: 8080, protocol: 'TCP' }] },
          { from: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'monitoring' } } }], ports: [{ port: 9090 }] },
          { from: [{ ipBlock: { cidr: '10.0.0.0/8', except: ['10.42.0.0/16'] } }], ports: [{ port: 8080 }, { port: 8443 }] },
        ],
        egress: [{ to: [{ podSelector: { matchLabels: { app: 'db' } } }], ports: [{ port: 5432 }] }, { to: [{ namespaceSelector: {} }] }],
      },
    }),
  );
}

/** Scaling: an autoscaler over coredns (CPU under its target, memory over), a budget keeping it, a quota on shop. */
function scaling(c: Cluster) {
  c.add(
    HorizontalPodAutoscaler,
    make(HorizontalPodAutoscaler, {
      metadata: { name: 'coredns', namespace: 'kube-system', creationTimestamp: ago(21 * DAY) },
      spec: {
        scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'coredns' },
        minReplicas: 2,
        maxReplicas: 10,
        behavior: { scaleDown: { stabilizationWindowSeconds: 600, policies: [{ type: 'Pods', value: 1, periodSeconds: 60 }] } },
        metrics: [
          { type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } } },
          { type: 'Resource', resource: { name: 'memory', target: { type: 'Utilization', averageUtilization: 80 } } },
          { type: 'Pods', pods: { metric: { name: 'dns_requests_per_second' }, target: { type: 'AverageValue', averageValue: '500' } } },
        ],
      },
      status: {
        currentReplicas: 2,
        desiredReplicas: 2,
        currentMetrics: [
          { type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 42 } } },
          { type: 'Resource', resource: { name: 'memory', current: { averageUtilization: 88 } } },
          { type: 'Pods', pods: { metric: { name: 'dns_requests_per_second' }, current: { averageValue: '212' } } },
        ],
        conditions: [
          { type: 'AbleToScale', status: 'True', reason: 'ReadyForNewScale', lastTransitionTime: ago(21 * DAY) },
          { type: 'ScalingActive', status: 'True', reason: 'ValidMetricFound', lastTransitionTime: ago(21 * DAY) },
          { type: 'ScalingLimited', status: 'False', reason: 'DesiredWithinRange', lastTransitionTime: ago(120) },
        ],
      },
    }),
  );
  c.add(
    PodDisruptionBudget,
    make(PodDisruptionBudget, {
      metadata: { name: 'coredns', namespace: 'kube-system', creationTimestamp: ago(21 * DAY) },
      spec: { minAvailable: 1, selector: { matchLabels: { 'k8s-app': 'kube-dns' } } },
      status: {
        currentHealthy: 1,
        desiredHealthy: 1,
        disruptionsAllowed: 0,
        expectedPods: 2,
        conditions: [{ type: 'DisruptionAllowed', status: 'False', reason: 'InsufficientPods', message: '', lastTransitionTime: ago(330) }],
      },
    }),
  );
  c.add(
    ResourceQuota,
    make(ResourceQuota, {
      metadata: { name: 'shop', namespace: 'shop' },
      spec: { hard: { 'requests.cpu': '8', 'requests.memory': '16Gi', pods: '50' } },
      status: { hard: { 'requests.cpu': '8', 'requests.memory': '16Gi', pods: '50' }, used: { 'requests.cpu': '2400m', 'requests.memory': '5Gi', pods: '46' } },
    }),
  );
}

/** The API's own: priority classes, an API service down (and one served by the API server), a webhook, a node's certificate request; shop's limits. */
function api(c: Cluster) {
  c.add(
    LimitRange,
    make(LimitRange, {
      metadata: { name: 'defaults', namespace: 'shop', creationTimestamp: ago(40 * DAY) },
      spec: {
        limits: [
          {
            type: 'Container',
            defaultRequest: { cpu: '100m', memory: '128Mi' },
            default: { cpu: '500m', memory: '512Mi' },
            min: { cpu: '10m', memory: '16Mi' },
            max: { cpu: '2', memory: '4Gi' },
          },
          { type: 'PersistentVolumeClaim', min: { storage: '1Gi' }, max: { storage: '100Gi' } },
        ],
      },
    }),
  );
  c.add(
    PriorityClass,
    make(PriorityClass, {
      metadata: { name: 'system-cluster-critical', creationTimestamp: ago(40 * DAY) },
      value: 2000000000,
      preemptionPolicy: 'PreemptLowerPriority',
      description: 'Used for system critical pods that must run in the cluster, but can be moved to another node if necessary.',
    }),
  );
  c.add(
    APIService,
    make(APIService, {
      metadata: { name: 'v1beta1.metrics.k8s.io', creationTimestamp: ago(40 * DAY) },
      spec: { group: 'metrics.k8s.io', version: 'v1beta1', groupPriorityMinimum: 100, versionPriority: 100, service: { name: 'metrics-server', namespace: 'kube-system' } },
      status: {
        conditions: [
          {
            type: 'Available',
            status: 'False',
            reason: 'FailedDiscoveryCheck',
            message: 'failing or missing response from https://10.43.12.9:443/apis/metrics.k8s.io/v1beta1: 503',
            lastTransitionTime: ago(4),
          },
        ],
      },
    }),
  );
  c.add(
    APIService,
    make(APIService, {
      metadata: { name: 'v1.apps', creationTimestamp: ago(40 * DAY) },
      spec: { group: 'apps', version: 'v1', groupPriorityMinimum: 17800, versionPriority: 15 },
      status: { conditions: [{ type: 'Available', status: 'True', reason: 'Local', message: 'Local APIServices are always available', lastTransitionTime: ago(40 * DAY) }] },
    }),
  );
  c.add(
    ValidatingWebhookConfiguration,
    make(ValidatingWebhookConfiguration, {
      metadata: { name: 'cert-manager-webhook', creationTimestamp: ago(40 * DAY) },
      webhooks: [
        {
          name: 'webhook.cert-manager.io',
          admissionReviewVersions: ['v1'],
          sideEffects: 'None',
          failurePolicy: 'Fail',
          clientConfig: { service: { name: 'cert-manager-webhook', namespace: 'cert-manager', path: '/validate' } },
          rules: [{ apiGroups: ['cert-manager.io', 'acme.cert-manager.io'], apiVersions: ['v1'], operations: ['CREATE', 'UPDATE'], resources: ['*/*'] }],
        },
      ],
    }),
  );
  c.add(
    CertificateSigningRequest,
    make(CertificateSigningRequest, {
      metadata: { name: 'csr-8x2kp', creationTimestamp: ago(2) },
      spec: {
        request: btoa(CSR_PEM),
        signerName: 'kubernetes.io/kubelet-serving',
        username: 'system:node:kube-3',
        usages: ['digital signature', 'server auth'],
      },
    }),
  );
}

const open = (kind: string, path: string) => `/k/${kind}?open=${kind}/${path}`;

/** The one cluster, and more of the story's own. */
const and =
  (...more: ((c: Cluster) => void)[]) =>
  (c: Cluster) => {
    cluster(c);
    for (const m of more) m(c);
  };

// ── Pod ────────────────────────────────────────────────────────────────────

/** A pod as it should be: coredns running, ready; its init container done. */
export const PodRunning = () => <KubeStory addons={[core]} path={open('pods.v1', 'kube-system/coredns-75c7b7f4-b9mgn')} cluster={cluster} />;
PodRunning.storyName = 'Pod';

/** A pod failing: a sidecar crashing (open at first), the pod not ready; a warning among its events. */
export const PodCrashing = () => <KubeStory addons={[core]} path={open('pods.v1', 'kube-system/coredns-75c7b7f4-8xk2d')} cluster={cluster} />;
PodCrashing.storyName = 'Pod - crashing sidecar';

/** A pod not scheduled yet: no node, its containers not started, no volumes; why, in its conditions. */
export const PodPending = () => (
  <KubeStory
    addons={[core]}
    path={open('pods.v1', 'shop/web-5f7c')}
    cluster={and((c) =>
      c.add(
        Pod,
        make(Pod, {
          metadata: { name: 'web-5f7c', namespace: 'shop', uid: 'pod-pending', creationTimestamp: ago(4) },
          spec: { containers: [{ name: 'web', image: 'ghcr.io/acme/web:2.0', resources: { requests: { cpu: '8', memory: '64Gi' } } }] },
          status: {
            phase: 'Pending',
            conditions: [
              {
                type: 'PodScheduled',
                status: 'False',
                reason: 'Unschedulable',
                message: '0/1 nodes are available: 1 Insufficient cpu, 1 Insufficient memory.',
                lastTransitionTime: ago(4),
              },
            ],
          },
        }),
      ),
    )}
  />
);
PodPending.storyName = 'Pod - pending';

/** A pod with an addon's: its logs and a shell at each container's end, its mark after the title. */
const logs = defineAddon({
  id: 'logs',
  title: 'Logs',
  setup: ({ contributor }) => {
    contributor.add(
      'Fill',
      'logs.container',
      fill(slots.resource.view.pod.container.actions, {
        render: () => (
          <>
            <Button size="sm" variant="ghost" icon="file">
              Logs
            </Button>
            <Button size="sm" variant="ghost" icon="enter">
              Shell
            </Button>
          </>
        ),
      }),
    );
    contributor.add('Fill', 'logs.mark', fill(slots.resource.view.marks, { render: () => <Badge level="ok">managed</Badge> }));
  },
});
export const PodAndAnAddon = () => <KubeStory addons={[core, logs]} path={open('pods.v1', 'kube-system/coredns-75c7b7f4-8xk2d')} cluster={cluster} />;
PodAndAnAddon.storyName = 'Pod - an addon’s buttons and mark';

// ── Deployment, ReplicaSet ─────────────────────────────────────────────────

/** A deployment rolling: its pods (one running, one not ready), its template, its rollout (the replica set now, the one before). */
export const DeploymentRolling = () => <KubeStory addons={[core]} path={open('deployments.v1.apps', 'kube-system/coredns')} cluster={cluster} />;
DeploymentRolling.storyName = 'Deployment';

/** A deployment scaled to zero: no pods, its replica set kept; nothing failing. */
export const DeploymentScaledToZero = () => (
  <KubeStory
    addons={[core]}
    path={open('deployments.v1.apps', 'shop/worker')}
    cluster={and((c) => {
      c.add(
        Deployment,
        make(Deployment, {
          metadata: { name: 'worker', namespace: 'shop', uid: 'deploy-worker', creationTimestamp: ago(12 * DAY) },
          spec: {
            replicas: 0,
            selector: { matchLabels: { app: 'worker' } },
            template: { metadata: { labels: { app: 'worker' } }, spec: { containers: [{ name: 'worker', image: 'ghcr.io/acme/worker:3.1' }] } },
          },
          status: { conditions: [{ type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable', lastTransitionTime: ago(2 * DAY) }] },
        }),
      );
      c.add(
        ReplicaSet,
        make(ReplicaSet, {
          metadata: {
            name: 'worker-6c9f',
            namespace: 'shop',
            ownerReferences: [{ apiVersion: 'apps/v1', kind: 'Deployment', name: 'worker', uid: 'deploy-worker', controller: true }],
          },
          spec: { replicas: 0, selector: { matchLabels: { app: 'worker' } } },
          status: { replicas: 0 },
        }),
      );
    })}
  />
);
DeploymentScaledToZero.storyName = 'Deployment - scaled to zero';

/** A deployment stuck: its rollout past its deadline, its new pod not pulling its image. */
export const DeploymentStuck = () => (
  <KubeStory
    addons={[core]}
    path={open('deployments.v1.apps', 'shop/api')}
    cluster={and((c) => {
      c.add(
        Deployment,
        make(Deployment, {
          metadata: { name: 'api', namespace: 'shop', uid: 'deploy-api', creationTimestamp: ago(20 * DAY) },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: 'api' } },
            template: { metadata: { labels: { app: 'api' } }, spec: { containers: [{ name: 'api', image: 'ghcr.io/acme/api:9.9.9' }] } },
          },
          status: {
            replicas: 1,
            updatedReplicas: 1,
            unavailableReplicas: 1,
            conditions: [
              { type: 'Available', status: 'False', reason: 'MinimumReplicasUnavailable', message: 'Deployment does not have minimum availability.', lastTransitionTime: ago(30) },
              {
                type: 'Progressing',
                status: 'False',
                reason: 'ProgressDeadlineExceeded',
                message: 'ReplicaSet "api-7b8d" has timed out progressing.',
                lastTransitionTime: ago(20),
              },
            ],
          },
        }),
      );
      c.add(
        Pod,
        make(Pod, {
          metadata: { name: 'api-7b8d-q2x', namespace: 'shop', labels: { app: 'api' }, creationTimestamp: ago(30) },
          spec: { nodeName: 'kube', containers: [{ name: 'api', image: 'ghcr.io/acme/api:9.9.9' }] },
          status: {
            phase: 'Pending',
            containerStatuses: [
              {
                name: 'api',
                image: 'ghcr.io/acme/api:9.9.9',
                imageID: '',
                ready: false,
                restartCount: 0,
                state: { waiting: { reason: 'ImagePullBackOff', message: 'Back-off pulling image' } },
              },
            ],
          },
        }),
      );
    })}
  />
);
DeploymentStuck.storyName = 'Deployment - stuck rollout';

/** A replica set: its pods (those it owns), its owner (its deployment). */
export const ReplicaSetNow = () => <KubeStory addons={[core]} path={open('replicasets.v1.apps', 'kube-system/coredns-75c7b7f4')} cluster={cluster} />;
ReplicaSetNow.storyName = 'ReplicaSet';

/** A replica set rolled past: scaled to zero, no pods. */
export const ReplicaSetOld = () => <KubeStory addons={[core]} path={open('replicasets.v1.apps', 'kube-system/coredns-6d8f9c7b5')} cluster={cluster} />;
ReplicaSetOld.storyName = 'ReplicaSet - rolled past';

// ── StatefulSet, DaemonSet ─────────────────────────────────────────────────

/** A stateful set: its pods (in their order), its template, its volume claim templates. */
export const StatefulSetRunning = () => <KubeStory addons={[core]} path={open('statefulsets.v1.apps', 'shop/db')} cluster={cluster} />;
StatefulSetRunning.storyName = 'StatefulSet';

/** A daemon set: its pod on each node, its template; its selector (a label, an expression). */
export const DaemonSetRunning = () => <KubeStory addons={[core]} path={open('daemonsets.v1.apps', 'monitoring/node-exporter')} cluster={cluster} />;
DaemonSetRunning.storyName = 'DaemonSet';

/** A daemon set on no node: its node selector takes none. */
export const DaemonSetNowhere = () => (
  <KubeStory
    addons={[core]}
    path={open('daemonsets.v1.apps', 'monitoring/gpu-exporter')}
    cluster={and((c) =>
      c.add(
        DaemonSet,
        make(DaemonSet, {
          metadata: { name: 'gpu-exporter', namespace: 'monitoring', creationTimestamp: ago(6 * DAY) },
          spec: {
            selector: { matchLabels: { app: 'gpu-exporter' } },
            template: {
              metadata: { labels: { app: 'gpu-exporter' } },
              spec: { nodeSelector: { 'nvidia.com/gpu': 'true' }, containers: [{ name: 'exporter', image: 'nvidia/dcgm-exporter:3.3' }] },
            },
          },
          status: { desiredNumberScheduled: 0, currentNumberScheduled: 0, numberReady: 0, numberMisscheduled: 0 },
        }),
      ),
    )}
  />
);
DaemonSetNowhere.storyName = 'DaemonSet - on no node';

/** A daemon set not on every node: one tainted for GPUs (not tolerated), one of another OS (not picked) — each said why. */
export const DaemonSetNotEverywhere = () => (
  <KubeStory
    addons={[core]}
    path={open('daemonsets.v1.apps', 'monitoring/node-exporter')}
    cluster={and((c) => {
      c.add(
        Node,
        make(Node, { metadata: { name: 'gpu-1', labels: { 'kubernetes.io/os': 'linux' } }, spec: { taints: [{ key: 'dedicated', value: 'gpu', effect: 'NoSchedule' }] } }),
      );
      c.add(Node, make(Node, { metadata: { name: 'win-1', labels: { 'kubernetes.io/os': 'windows' } } }));
    })}
  />
);
DaemonSetNotEverywhere.storyName = 'DaemonSet - not on every node';

// ── Service ────────────────────────────────────────────────────────────────

/** A service: its ports, its endpoints (one pod ready, one not), its selector. */
export const ServiceClusterIP = () => <KubeStory addons={[core]} path={open('services.v1', 'kube-system/kube-dns')} cluster={cluster} />;
ServiceClusterIP.storyName = 'Service';

/** A service with no pods behind it: its endpoints say so. */
export const ServiceNoEndpoints = () => (
  <KubeStory
    addons={[core]}
    path={open('services.v1', 'shop/web')}
    cluster={and((c) =>
      c.add(
        Service,
        make(Service, {
          metadata: { name: 'web', namespace: 'shop' },
          spec: { type: 'ClusterIP', clusterIP: '10.43.12.7', selector: { app: 'web' }, ports: [{ name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' }] },
        }),
      ),
    )}
  />
);
ServiceNoEndpoints.storyName = 'Service - no endpoints';

/** A node port service: its node ports beside its ports. */
export const ServiceNodePort = () => (
  <KubeStory
    addons={[core]}
    path={open('services.v1', 'shop/db-admin')}
    cluster={and((c) =>
      c.add(
        Service,
        make(Service, {
          metadata: { name: 'db-admin', namespace: 'shop' },
          spec: { type: 'NodePort', clusterIP: '10.43.40.2', selector: { app: 'db' }, ports: [{ name: 'pg', port: 5432, targetPort: 5432, nodePort: 30432, protocol: 'TCP' }] },
        }),
      ),
    )}
  />
);
ServiceNodePort.storyName = 'Service - node port';

/** An external name: no pods, no endpoints — a name elsewhere. */
export const ServiceExternalName = () => (
  <KubeStory
    addons={[core]}
    path={open('services.v1', 'shop/payments')}
    cluster={and((c) =>
      c.add(Service, make(Service, { metadata: { name: 'payments', namespace: 'shop' }, spec: { type: 'ExternalName', externalName: 'api.payments.example.com' } })),
    )}
  />
);
ServiceExternalName.storyName = 'Service - external name';

// ── Node ───────────────────────────────────────────────────────────────────

/** A node: what is allocated of it (its pods' requests), its taints, its system, its conditions (pressures: False is good), how many pods it runs. */
export const NodeReady = () => <KubeStory addons={[core]} path={open('nodes.v1', 'kube')} cluster={cluster} />;
NodeReady.storyName = 'Node';

/** A node gone quiet: not ready (its kubelet not heard from), cordoned, under memory pressure, nearly full. */
export const NodeNotReady = () => (
  <KubeStory
    addons={[core]}
    path={open('nodes.v1', 'kube-2')}
    cluster={and((c) => {
      c.add(
        Node,
        make(Node, {
          metadata: { name: 'kube-2', creationTimestamp: ago(40 * DAY) },
          spec: {
            unschedulable: true,
            taints: [
              { key: 'node.kubernetes.io/unreachable', effect: 'NoExecute' },
              { key: 'node.kubernetes.io/unschedulable', effect: 'NoSchedule' },
            ],
          },
          status: {
            allocatable: { cpu: '2', memory: '2Gi', pods: '110' },
            nodeInfo: {
              architecture: 'amd64',
              operatingSystem: 'linux',
              osImage: 'Debian 12',
              kernelVersion: '6.1.0-26',
              containerRuntimeVersion: 'containerd://1.7.22',
              kubeletVersion: 'v1.34.2',
              kubeProxyVersion: '',
              bootID: '',
              machineID: '',
              systemUUID: '',
            },
            conditions: [
              { type: 'Ready', status: 'Unknown', reason: 'NodeStatusUnknown', message: 'Kubelet stopped posting node status.', lastTransitionTime: ago(12) },
              { type: 'MemoryPressure', status: 'True', reason: 'KubeletHasInsufficientMemory', lastTransitionTime: ago(15) },
              { type: 'DiskPressure', status: 'False', reason: 'KubeletHasNoDiskPressure', lastTransitionTime: ago(40 * DAY) },
            ],
          },
        }),
      );
      for (const i of [1, 2, 3])
        c.add(
          Pod,
          make(Pod, {
            metadata: { name: `heavy-${i}`, namespace: 'shop' },
            spec: { nodeName: 'kube-2', containers: [{ name: 'a', resources: { requests: { cpu: '600m', memory: '600Mi' } } }] },
            status: { phase: 'Running' },
          }),
        );
    })}
  />
);
NodeNotReady.storyName = 'Node - not ready';

/** A node cordoned (kubectl cordon): no new pods scheduled there, said first. */
export const NodeCordoned = () => (
  <KubeStory
    addons={[core]}
    path={open('nodes.v1', 'kube')}
    cluster={and((c) => {
      const kube = c.get(Node, 'kube');
      if (kube) c.add(Node, { ...kube, spec: { ...kube.spec, unschedulable: true } });
    })}
  />
);
NodeCordoned.storyName = 'Node - cordoned';

// ── Job, CronJob ───────────────────────────────────────────────────────────

/** A job done: its pod, its owner (its cron job). */
export const JobComplete = () => <KubeStory addons={[core]} path={open('jobs.v1.batch', 'shop/backup-29012340')} cluster={cluster} />;
JobComplete.storyName = 'Job';

/** A job failed: past its backoff limit, why in its conditions; its pod failure policy. */
export const JobFailed = () => <KubeStory addons={[core]} path={open('jobs.v1.batch', 'shop/backup-29010900')} cluster={cluster} />;
JobFailed.storyName = 'Job - failed';

/** A cron job: its jobs (one done, one failed). */
export const CronJobScheduled = () => <KubeStory addons={[core]} path={open('cronjobs.v1.batch', 'shop/backup')} cluster={cluster} />;
CronJobScheduled.storyName = 'CronJob';

/** A cron job suspended, never run: no jobs. */
export const CronJobSuspended = () => (
  <KubeStory
    addons={[core]}
    path={open('cronjobs.v1.batch', 'shop/report')}
    cluster={and((c) =>
      c.add(
        CronJob,
        make(CronJob, {
          metadata: { name: 'report', namespace: 'shop', creationTimestamp: ago(2 * DAY) },
          spec: { schedule: '0 9 * * 1', suspend: true, jobTemplate: { spec: { template: { spec: { containers: [{ name: 'report', image: 'ghcr.io/acme/report:1.0' }] } } } } },
        }),
      ),
    )}
  />
);
CronJobSuspended.storyName = 'CronJob - suspended, never run';

// ── ConfigMap, Secret ──────────────────────────────────────────────────────

/** A config map: each key a file, copied by a button; the pods that use it. */
export const ConfigMapWithKeys = () => <KubeStory addons={[core]} path={open('configmaps.v1', 'kube-system/coredns')} cluster={cluster} />;
ConfigMapWithKeys.storyName = 'ConfigMap';

/** A config map with no keys: said so. */
export const ConfigMapEmpty = () => (
  <KubeStory
    addons={[core]}
    path={open('configmaps.v1', 'shop/empty')}
    cluster={and((c) => c.add(ConfigMap, make(ConfigMap, { metadata: { name: 'empty', namespace: 'shop' } })))}
  />
);
ConfigMapEmpty.storyName = 'ConfigMap - empty';

/** A secret: each key hidden till shown, copied without being shown; the pods that use it. */
export const SecretWithKeys = () => <KubeStory addons={[core]} path={open('secrets.v1', 'kube-system/coredns-env')} cluster={cluster} />;
SecretWithKeys.storyName = 'Secret';

/** A TLS secret: its certificate read (valid till, whom of and by, its names, key) over its keys. */
export const SecretTls = () => <KubeStory addons={[core]} path={open('secrets.v1', 'shop/shop-tls')} cluster={cluster} />;
SecretTls.storyName = 'Secret - TLS';

/** A pull secret: the registries it logs in to, each its user — its password never shown. */
export const SecretPull = () => <KubeStory addons={[core]} path={open('secrets.v1', 'kube-system/ghcr-pull')} cluster={cluster} />;
SecretPull.storyName = 'Secret - pull';

// ── Ingress, NetworkPolicy ─────────────────────────────────────────────────

/** An ingress: its rules (host, path to a service and port), its TLS. */
export const IngressRouting = () => <KubeStory addons={[core]} path={open('ingresses.v1.networking.k8s.io', 'shop/shop')} cluster={cluster} />;
IngressRouting.storyName = 'Ingress';

/** A network policy: who may come in, who it may reach — pods, namespaces, an IP block; the pods it applies to. */
export const NetworkPolicyRules = () => <KubeStory addons={[core]} path={open('networkpolicies.v1.networking.k8s.io', 'shop/api-allow')} cluster={cluster} />;
NetworkPolicyRules.storyName = 'NetworkPolicy';

/** A policy that lets nothing in: said so. */
export const NetworkPolicyDenyAll = () => (
  <KubeStory
    addons={[core]}
    path={open('networkpolicies.v1.networking.k8s.io', 'shop/deny-all')}
    cluster={and((c) =>
      c.add(NetworkPolicy, make(NetworkPolicy, { metadata: { name: 'deny-all', namespace: 'shop' }, spec: { podSelector: {}, policyTypes: ['Ingress', 'Egress'] } })),
    )}
  />
);
NetworkPolicyDenyAll.storyName = 'NetworkPolicy - deny all';

// ── Roles, bindings, service accounts ──────────────────────────────────────

/** A cluster role: each resource (its group, the names it is held to) and the verbs allowed on it; all of a group, a URL. */
export const ClusterRoleRules = () => <KubeStory addons={[core]} path={open('clusterroles.v1.rbac.authorization.k8s.io', 'pod-reader')} cluster={cluster} />;
ClusterRoleRules.storyName = 'ClusterRole';

/** An aggregated cluster role (view): the roles it is gathered from, each how many rules. */
export const ClusterRoleAggregated = () => <KubeStory addons={[core]} path={open('clusterroles.v1.rbac.authorization.k8s.io', 'view')} cluster={cluster} />;
ClusterRoleAggregated.storyName = 'ClusterRole - aggregated';

/** A role binding: its role, its subjects (a service account, a group, a user). */
export const RoleBindingSubjects = () => <KubeStory addons={[core]} path={open('rolebindings.v1.rbac.authorization.k8s.io', 'kube-system/coredns-reads-pods')} cluster={cluster} />;
RoleBindingSubjects.storyName = 'RoleBinding';

/** A service account: its pull secrets, the pods that run as it. */
export const ServiceAccountUsed = () => <KubeStory addons={[core]} path={open('serviceaccounts.v1', 'kube-system/coredns')} cluster={cluster} />;
ServiceAccountUsed.storyName = 'ServiceAccount';

// ── Storage ────────────────────────────────────────────────────────────────

/** A claim bound: its volume, its class, the pods that mount it. */
export const ClaimBound = () => <KubeStory addons={[core]} path={open('persistentvolumeclaims.v1', 'kube-system/data-coredns')} cluster={cluster} />;
ClaimBound.storyName = 'PersistentVolumeClaim';

/** A claim not bound yet: said so — why, in its events. */
export const ClaimPending = () => (
  <KubeStory
    addons={[core]}
    path={open('persistentvolumeclaims.v1', 'shop/cache')}
    cluster={and((c) => {
      c.add(
        PersistentVolumeClaim,
        make(PersistentVolumeClaim, {
          metadata: { name: 'cache', namespace: 'shop', uid: 'pvc-cache', creationTimestamp: ago(3) },
          spec: { accessModes: ['ReadWriteOnce'], storageClassName: 'local-path', resources: { requests: { storage: '20Gi' } } },
          status: { phase: 'Pending' },
        }),
      );
      c.add(
        Event,
        make(Event, {
          metadata: { name: 'cache.a', namespace: 'shop' },
          involvedObject: { kind: 'PersistentVolumeClaim', name: 'cache', uid: 'pvc-cache' },
          type: 'Normal',
          reason: 'WaitForFirstConsumer',
          message: 'waiting for first consumer to be created before binding',
          count: 14,
          lastTimestamp: ago(1),
        }),
      );
    })}
  />
);
ClaimPending.storyName = 'PersistentVolumeClaim - pending';

/** A volume: its source (a host path), the node it may be used on; its claim, its class. */
export const VolumeBound = () => <KubeStory addons={[core]} path={open('persistentvolumes.v1', 'pvc-8f1c2e')} cluster={cluster} />;
VolumeBound.storyName = 'PersistentVolume';

/** A storage class with all it can say: its parameters, mount options, allowed topologies. */
export const StorageClassFull = () => <KubeStory addons={[core]} path={open('storageclasses.v1.storage.k8s.io', 'gp3-encrypted')} cluster={cluster} />;
StorageClassFull.storyName = 'StorageClass';

/** A storage class with nothing of its own: its parameters said to be none; how many claims are of it. */
export const StorageClassPlain = () => <KubeStory addons={[core]} path={open('storageclasses.v1.storage.k8s.io', 'local-path')} cluster={cluster} />;
StorageClassPlain.storyName = 'StorageClass - no parameters';

// ── Scaling, budgets, namespaces ───────────────────────────────────────────

/** An autoscaler: its metrics (CPU under target, memory over, a pods' metric in words), what it scales. */
export const AutoscalerMetrics = () => <KubeStory addons={[core]} path={open('horizontalpodautoscalers.v2.autoscaling', 'kube-system/coredns')} cluster={cluster} />;
AutoscalerMetrics.storyName = 'HorizontalPodAutoscaler';

/** A disruption budget: none may go now (too few healthy), the pods it keeps. */
export const BudgetBlocking = () => <KubeStory addons={[core]} path={open('poddisruptionbudgets.v1.policy', 'kube-system/coredns')} cluster={cluster} />;
BudgetBlocking.storyName = 'PodDisruptionBudget';

/** A namespace with a quota: how much of each is used (pods nearly all). */
export const NamespaceQuota = () => <KubeStory addons={[core]} path={open('namespaces.v1', 'shop')} cluster={cluster} />;
NamespaceQuota.storyName = 'Namespace';

/** A namespace with no quota: said so. */
export const NamespaceFree = () => <KubeStory addons={[core]} path={open('namespaces.v1', 'monitoring')} cluster={cluster} />;
NamespaceFree.storyName = 'Namespace - no quota';

// ── The rest ───────────────────────────────────────────────────────────────

/** An ingress class: its controller, the default (its annotation); the ingresses of it. */
export const IngressClassDefault = () => <KubeStory addons={[core]} path={open('ingressclasses.v1.networking.k8s.io', 'traefik')} cluster={cluster} />;
IngressClassDefault.storyName = 'IngressClass';

/** A priority class: its value, whether its pods push others out; the pods of it. */
export const PriorityClassCritical = () => <KubeStory addons={[core]} path={open('priorityclasses.v1.scheduling.k8s.io', 'system-cluster-critical')} cluster={cluster} />;
PriorityClassCritical.storyName = 'PriorityClass';

/** An endpoint slice: each endpoint (its pod, address), ready or not; its service. */
export const EndpointSliceOfService = () => <KubeStory addons={[core]} path={open('endpointslices.v1.discovery.k8s.io', 'kube-system/kube-dns-x7k2p')} cluster={cluster} />;
EndpointSliceOfService.storyName = 'EndpointSlice';

/** A quota as itself: how much of what it allows is used. */
export const ResourceQuotaUsed = () => <KubeStory addons={[core]} path={open('resourcequotas.v1', 'shop/shop')} cluster={cluster} />;
ResourceQuotaUsed.storyName = 'ResourceQuota';

/** A limit range as itself: each kind of thing and resource, its defaults and bounds. */
export const LimitRangeDefaults = () => <KubeStory addons={[core]} path={open('limitranges.v1', 'shop/defaults')} cluster={cluster} />;
LimitRangeDefaults.storyName = 'LimitRange';

const KUSTOMIZATION = {
  group: 'kustomize.toolkit.fluxcd.io',
  version: 'v1',
  kind: 'Kustomization',
  id: 'kustomize.toolkit.fluxcd.io/v1/Kustomization',
  plural: 'kustomizations',
  singular: 'kustomization',
  namespaced: true,
  verbs: ['get', 'list', 'watch'],
  shortNames: ['ks'],
};

/** A custom resource definition: its versions (one deprecated), its stored version's columns, how many objects of it. */
export const CustomResourceDefinitionFlux = () => (
  <KubeStory
    addons={[core]}
    path={open('customresourcedefinitions.v1.apiextensions.k8s.io', 'kustomizations.kustomize.toolkit.fluxcd.io')}
    kinds={[KUSTOMIZATION]}
    cluster={and((c) => {
      c.add(
        CustomResourceDefinition,
        make(CustomResourceDefinition, {
          metadata: { name: 'kustomizations.kustomize.toolkit.fluxcd.io', creationTimestamp: ago(40 * DAY) },
          spec: {
            group: KUSTOMIZATION.group,
            scope: 'Namespaced',
            names: { kind: 'Kustomization', plural: 'kustomizations', singular: 'kustomization', shortNames: ['ks'], listKind: 'KustomizationList' },
            versions: [
              {
                name: 'v1',
                served: true,
                storage: true,
                additionalPrinterColumns: [
                  { name: 'Age', type: 'date', jsonPath: '.metadata.creationTimestamp' },
                  { name: 'Ready', type: 'string', jsonPath: '.status.conditions[?(@.type=="Ready")].status' },
                  { name: 'Status', type: 'string', jsonPath: '.status.conditions[?(@.type=="Ready")].message' },
                ],
              },
              { name: 'v1beta2', served: true, storage: false, deprecated: true, deprecationWarning: 'v1beta2 Kustomization is deprecated, upgrade to v1' },
            ],
          },
          status: {
            conditions: [
              { type: 'NamesAccepted', status: 'True', reason: 'NoConflicts', message: 'no conflicts found', lastTransitionTime: ago(40 * DAY) },
              { type: 'Established', status: 'True', reason: 'InitialNamesAccepted', message: 'the initial names have been accepted', lastTransitionTime: ago(40 * DAY) },
            ],
          },
        }),
      );
      for (const name of ['apps', 'infra'])
        c.add(KUSTOMIZATION, { apiVersion: 'kustomize.toolkit.fluxcd.io/v1', kind: 'Kustomization', metadata: { name, namespace: 'shop', creationTimestamp: ago(30 * DAY) } });
    })}
  />
);
CustomResourceDefinitionFlux.storyName = 'CustomResourceDefinition';

/** An API service down: its service, why it is not available. */
export const APIServiceDown = () => <KubeStory addons={[core]} path={open('apiservices.v1.apiregistration.k8s.io', 'v1beta1.metrics.k8s.io')} cluster={cluster} />;
APIServiceDown.storyName = 'APIService - not available';

/** An admission webhook: its hook — what it calls, on what, that failing blocks. */
export const WebhookBlocking = () => (
  <KubeStory addons={[core]} path={open('validatingwebhookconfigurations.v1.admissionregistration.k8s.io', 'cert-manager-webhook')} cluster={cluster} />
);
WebhookBlocking.storyName = 'ValidatingWebhookConfiguration';

/** A node's certificate signing request, pending: what it asks for, read from it. */
export const CertificateRequestPending = () => <KubeStory addons={[core]} path={open('certificatesigningrequests.v1.certificates.k8s.io', 'csr-8x2kp')} cluster={cluster} />;
CertificateRequestPending.storyName = 'CertificateSigningRequest';

/** An event as itself: its message, what it is about. */
export const EventItself = () => <KubeStory addons={[core]} path={open('events.v1', 'kube-system/coredns.a')} cluster={cluster} />;
EventItself.storyName = 'Event';
