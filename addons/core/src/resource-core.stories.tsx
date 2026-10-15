import { Badge, Button, Chips, Ratio, Section } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import {
  Containers,
  Ext,
  Fields,
  File,
  Image,
  link,
  Meter,
  mono,
  Nothing,
  Pairs,
  ResourceSketch,
  RUNNING,
  ref,
  SecretFile,
  Stage,
  sort,
  state,
  Table,
} from './resource.sketch.tsx';

/*
 * What the core draws of a resource opened (a sketch, not the core's yet):
 * the view every kind has — a custom resource's too — and each built-in
 * kind's own sections, by priority (P1: looked at every day; P2: after).
 * Where an addon puts its own is marked; nothing of an addon's drawn.
 */

export default { title: 'core/resource/Core', parameters: { controls: { disable: true } } };

// ── Every kind ─────────────────────────────────────────────────────────────

/** Any kind's (a Lease here): its summary (its kind's columns), conditions, recent events, related (its owner, what it owns), metadata; Overview, Events, YAML — and where an addon's section, tab, mark, buttons go. */
export const AnyKind = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Lease',
        name: 'kube-scheduler',
        namespace: 'kube-system',
        badge: (
          <Ext slot="resource.view.header" by="an addon's mark" inline>
            <Badge>mark</Badge>
          </Ext>
        ),
        header: [['Action', 'run']],
        tabs: [['Addon', 'puzzle', 'an addon’s tab']],
        summary: [
          ['Holder', mono('kube_4f1e9a')],
          ['Renewed', '2s ago'],
          ['Age', '3d21h'],
        ],
        own: (
          <Ext slot="resource.view.sections" by="an addon's section">
            <Section title="An addon's section">
              <span class="rv-quiet">Before or after the core's, as its order says; for the kinds it is for.</span>
            </Section>
          </Ext>
        ),
        related: [
          ['Held by', ref('Node', 'server', 'kube')],
          ['For', ref('Deployment', 'layers', 'kube-scheduler')],
        ],
        events: [['Normal', 'LeaderElection', 'kube_4f1e9a became leader', '3d21h']],
        labels: { tier: 'control-plane' },
      }}
    />
  </Stage>
);

/** A custom resource (known by its CRD only): its state (kstatus), its CRD's columns as its summary, its conditions — the view any kind has, nothing more. */
export const CustomResource = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Kustomization',
        name: 'infrastructure',
        namespace: 'flux-system',
        summary: [
          ['Status', state('ok', 'circle-check', 'Current')],
          ['Ready', 'True'],
          ['Status (CRD)', 'Applied revision: main@sha1:4f2a9c1'],
          ['Age', '40d'],
        ],
        conditions: [['Ready', 'True', 'ReconciliationSucceeded · Applied revision: main@sha1:4f2a9c1', '3m']],
        events: [['Normal', 'ReconciliationSucceeded', 'Reconciliation finished in 1.2s, next run in 10m0s', '3m', 412]],
        related: [['Owns', <span class="rv-quiet">42 objects (its inventory: not known to the core)</span>]],
      }}
    />
  </Stage>
);

// ── P1: looked at every day ────────────────────────────────────────────────

/** A pod: its containers (a card each: state and why, how each last ended, its environment, its probes), its volumes, where it may run (scheduling), how it is held (security); its node, IP, QoS. */
export const Pod = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Pod',
        name: 'api-7d4b9c-x2kfp',
        namespace: 'shop',
        summary: [
          ['Status', RUNNING],
          ['Ready', <Ratio value={1} of={2} />],
          ['Restarts', '43'],
          ['Node', ref('', 'server', 'kube')],
          ['Pod IP', mono('10.42.0.31')],
          ['QoS', 'Burstable'],
          ['Started', '3h12m ago'],
          ['Age', '3d21h'],
        ],
        own: (
          <>
            <Containers
              list={[
                {
                  name: 'migrate',
                  role: 'init',
                  image: 'ghcr.io/acme/api:2.4.1',
                  state: ['done', 'circle-check', 'Completed'],
                  ready: false,
                  restarts: 0,
                  took: '4s',
                  ports: [],
                  cpu: ['50m'],
                  memory: ['64Mi', '128Mi'],
                  command: 'api migrate --to latest',
                },
                {
                  name: 'metrics-proxy',
                  role: 'sidecar',
                  image: 'ghcr.io/acme/metrics-proxy:0.9.4',
                  state: ['error', 'crash-loop', 'CrashLoopBackOff'],
                  ready: false,
                  restarts: 41,
                  last: 'Error · exit 1 · 2m ago',
                  ports: ['9100/TCP'],
                  cpu: ['10m', '50m'],
                  memory: ['32Mi', '64Mi'],
                  probes: [{ kind: 'liveness', check: 'GET :9100/healthz', every: '10s', fails: 3, failing: true }],
                },
                {
                  name: 'api',
                  image: 'ghcr.io/acme/api:2.4.1',
                  state: ['ok', 'circle-play', 'Running'],
                  ready: false,
                  restarts: 2,
                  last: 'OOMKilled · exit 137 · 3h ago',
                  ports: ['8080/TCP http', '9090/TCP grpc'],
                  cpu: ['250m', '1'],
                  memory: ['256Mi', '512Mi'],
                  command: 'api serve --port 8080',
                  env: [
                    ['LOG_LEVEL', <span class="rv-mono">info</span>],
                    ['DATABASE_URL', ref('Secret', 'key', 'db-credentials · url')],
                    ['FEATURES', ref('ConfigMap', 'file', 'api-config · features')],
                    ['POD_IP', <span class="rv-quiet">status.podIP</span>],
                    ['(all of)', ref('ConfigMap', 'file', 'api-env')],
                  ],
                  probes: [
                    { kind: 'startup', check: 'GET :8080/healthz/startup', every: '5s', fails: 30 },
                    { kind: 'liveness', check: 'GET :8080/healthz', every: '10s', fails: 3, after: '15s' },
                    { kind: 'readiness', check: 'GET :8080/ready', every: '5s', fails: 2, failing: true },
                  ],
                },
              ]}
            />
            <Section title="Volumes" part="volumes">
              <Table
                head={['Name', 'From', 'Mounted at']}
                rows={[
                  ['config', 'config', ref('ConfigMap', 'file', 'api-config'), mono('/etc/api (read-only)')],
                  ['data', 'data', ref('PVC', 'disk', 'data-api-0'), mono('/var/lib/api')],
                  ['tmp', 'tmp', sort('square-dashed', 'emptyDir'), mono('/tmp')],
                  ['token', 'kube-api-access', sort('layers', 'Projected'), mono('/var/run/secrets/…/serviceaccount')],
                ]}
              />
            </Section>
            <Section title="Scheduling" part="scheduling">
              <Pairs
                pairs={[
                  ['Node selector', <Chips items={{ 'kubernetes.io/os': 'linux' }} />],
                  [
                    'Tolerations',
                    <span class="rv-line">
                      <Badge>node.kubernetes.io/not-ready · NoExecute · 300s</Badge>
                      <Badge>dedicated=api · NoSchedule</Badge>
                    </span>,
                  ],
                  ['Affinity', <span class="rv-mono">not on a node with app=api (preferred, by hostname)</span>],
                  [
                    'Priority',
                    <span class="rv-line">
                      {ref('PriorityClass', 'shield', 'business-critical')}
                      <span class="rv-quiet">1000000</span>
                    </span>,
                  ],
                  ['Restart policy', 'Always'],
                ]}
              />
            </Section>
            <Section title="Security" part="security">
              <Pairs
                pairs={[
                  [
                    'Runs as',
                    <span class="rv-line">
                      user 65532<span class="rv-quiet">non-root, group 65532</span>
                    </span>,
                  ],
                  ['Privileged', 'No'],
                  ['Root filesystem', 'Read-only'],
                  [
                    'Capabilities',
                    <span class="rv-line">
                      <Badge>drop ALL</Badge>
                    </span>,
                  ],
                  ['Seccomp', 'RuntimeDefault'],
                ]}
              />
            </Section>
          </>
        ),
        conditions: [
          ['PodScheduled', 'True', '', '3d21h'],
          ['Initialized', 'True', '', '3d21h'],
          ['ContainersReady', 'False', 'ContainersNotReady · containers with unready status: [metrics-proxy api]', '2m'],
          ['Ready', 'False', 'ContainersNotReady', '2m'],
        ],
        events: [
          ['Warning', 'Unhealthy', 'Readiness probe failed: HTTP probe failed with statuscode: 503', '20s', 112],
          ['Warning', 'BackOff', 'Back-off restarting failed container metrics-proxy in pod api-7d4b9c-x2kfp', '1m', 41],
        ],
        related: [
          ['Owned by', ref('ReplicaSet', 'copy', 'api-7d4b9c')],
          ['Runs on', ref('Node', 'server', 'kube')],
          ['Service account', ref('', 'key', 'api')],
          ['Uses', <span class="rv-line">{[ref('ConfigMap', 'file', 'api-config'), ref('Secret', 'key', 'db-credentials'), ref('PVC', 'disk', 'data-api-0')]}</span>],
          ['Behind', ref('Service', 'network', 'api')],
          ['Protected by', ref('PDB', 'shield', 'api')],
        ],
        labels: { app: 'api', 'pod-template-hash': '7d4b9c' },
      }}
    />
  </Stage>
);

/** A deployment: its pods, its template (image, resources), its rollout (revisions: its ReplicaSets). */
export const Deployment = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Deployment',
        name: 'coredns',
        namespace: 'kube-system',
        summary: [
          ['Status', state('ok', 'circle-check', 'Healthy')],
          ['Ready', <Ratio value={2} of={2} />],
          ['Up-to-date', '2'],
          ['Strategy', 'RollingUpdate'],
          ['Revision', '3'],
          ['Age', '3d21h'],
        ],
        own: (
          <>
            <Section title="Rollout strategy" part="strategy">
              <Pairs
                pairs={[
                  [
                    'Max surge',
                    <span class="rv-line">
                      25%<span class="rv-quiet">at most 1 pod over 2 while rolling</span>
                    </span>,
                  ],
                  [
                    'Max unavailable',
                    <span class="rv-line">
                      25%<span class="rv-quiet">at least 2 of 2 kept up (rounded down: 0 may go)</span>
                    </span>,
                  ],
                  ['Ready after', '0s (minReadySeconds)'],
                  ['Gives up after', '600s (progressDeadlineSeconds)'],
                  ['Revisions kept', '10'],
                ]}
              />
            </Section>
            <Section title="Pods" part="pods">
              <Table
                head={['Name', 'Status', 'Ready', 'Restarts', 'Age']}
                rows={[
                  ['b9mgn', link('coredns-75c7b7f4-b9mgn'), RUNNING, <Ratio value={1} of={1} />, '5', '3d21h'],
                  ['8xk2d', link('coredns-75c7b7f4-8xk2d'), RUNNING, <Ratio value={1} of={1} />, '0', '5h31m'],
                ]}
              />
            </Section>
            <Section title="Template" part="template">
              <Fields
                fields={[
                  ['Image', <Image image="registry.k8s.io/coredns/coredns:v1.12.0" />],
                  ['Requests', mono('cpu 100m, mem 70Mi')],
                  ['Limits', mono('mem 170Mi')],
                ]}
              />
            </Section>
            <Section title="Rollout" part="rollout">
              <Table
                head={['Revision', 'ReplicaSet', 'Pods', 'Image', 'Age']}
                rows={[
                  [
                    '3',
                    <span class="rv-line">
                      <b>3</b>
                      <Badge level="ok">now</Badge>
                    </span>,
                    link('coredns-75c7b7f4'),
                    <Ratio value={2} of={2} />,
                    <Image image="registry.k8s.io/coredns/coredns:v1.12.0" />,
                    '5h31m',
                  ],
                  ['2', '2', link('coredns-6d8f9c7b5'), <Ratio value={0} of={0} />, <Image image="registry.k8s.io/coredns/coredns:v1.11.3" />, '3d21h'],
                  ['1', '1', link('coredns-5c98db65d4'), <Ratio value={0} of={0} />, <Image image="registry.k8s.io/coredns/coredns:v1.11.1" />, '40d'],
                ]}
              />
            </Section>
          </>
        ),
        conditions: [
          ['Available', 'True', 'MinimumReplicasAvailable · Deployment has minimum availability.', '3d21h'],
          ['Progressing', 'True', 'NewReplicaSetAvailable · ReplicaSet "coredns-75c7b7f4" has successfully progressed.', '5h31m'],
        ],
        events: [['Normal', 'ScalingReplicaSet', 'Scaled up replica set coredns-75c7b7f4 from 1 to 2', '5h31m']],
        related: [
          ['Owns', ref('ReplicaSet', 'copy', 'coredns-75c7b7f4')],
          ['Selected by', ref('Service', 'network', 'kube-dns')],
          ['Scaled by', ref('HPA', 'activity', 'coredns')],
          ['Protected by', ref('PDB', 'shield', 'coredns')],
        ],
        labels: { 'k8s-app': 'kube-dns' },
      }}
    />
  </Stage>
);

/** A stateful set: its pods in their order, its volume claim templates (each pod's claim). */
export const StatefulSet = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'StatefulSet',
        name: 'db',
        namespace: 'shop',
        summary: [
          ['Status', state('ok', 'circle-check', 'Healthy')],
          ['Ready', <Ratio value={3} of={3} />],
          ['Service', ref('', 'network', 'db-headless')],
          ['Update', 'RollingUpdate · partition 0'],
          ['Pod management', 'OrderedReady'],
          [
            'Revision',
            <span class="rv-line">
              db-6f9d8<span class="rv-quiet">current = update</span>
            </span>,
          ],
          ['Age', '40d'],
        ],
        own: (
          <>
            <Section title="Pods" part="pods">
              <Table head={['Pod', 'Ordinal', 'Status', 'Claim']} rows={['0', '1', '2'].map((i) => [i, link(`db-${i}`), mono(i), RUNNING, ref('', 'disk', `data-db-${i}`)])} />
            </Section>
            <Section title="Volume claim templates" part="claims">
              <Table head={['Name', 'Size', 'Class', 'Access']} rows={[['data', 'data', '10Gi', 'local-path', 'RWO']]} />
            </Section>
            <Section title="Claims made of them" part="claims">
              <Table
                head={['Claim', 'Pod', 'Status', 'Capacity']}
                rows={['0', '1', '2'].map((i) => [i, link(`data-db-${i}`), link(`db-${i}`), state('ok', 'circle-check', 'Bound'), '10Gi'])}
              />
            </Section>
          </>
        ),
        related: [
          ['Governing service', ref('Service', 'network', 'db-headless')],
          ['Protected by', ref('PDB', 'shield', 'db')],
        ],
        events: [],
      }}
    />
  </Stage>
);

/** A daemon set: the nodes it runs on, a pod each (and those it is not on: why). */
export const DaemonSet = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'DaemonSet',
        name: 'node-exporter',
        namespace: 'monitoring',
        summary: [
          ['Status', state('ok', 'circle-check', 'Healthy')],
          ['Ready', <Ratio value={3} of={3} />],
          ['Node selector', mono('kubernetes.io/os=linux')],
          ['Update', 'RollingUpdate · max 1 unavailable'],
          ['Misscheduled', '0'],
          ['Age', '40d'],
        ],
        own: (
          <Section title="On nodes" part="nodes">
            <Table
              head={['Node', 'Pod', 'Status']}
              rows={[
                ...['kube-1', 'kube-2', 'kube-3'].map((n, i): [string, ...ComponentChildren[]] => [n, ref('', 'server', n), link(`node-exporter-${'xk2'.charAt(i)}9fp`), RUNNING]),
                [
                  'gpu-1',
                  ref('', 'server', 'gpu-1'),
                  <span class="rv-quiet">none</span>,
                  <span title="taint dedicated=gpu:NoSchedule, not tolerated">{state('waiting', 'ban', 'Not scheduled: taint dedicated=gpu')}</span>,
                ],
              ]}
            />
          </Section>
        ),
        events: [],
      }}
    />
  </Stage>
);

/** A service: its ports, the pods behind it (its endpoints); its selector among what it is related to. */
export const Service = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Service',
        name: 'kube-dns',
        namespace: 'kube-system',
        summary: [
          ['Type', 'ClusterIP'],
          ['Cluster IP', mono('10.43.0.10')],
          ['IP families', 'IPv4 (SingleStack)'],
          ['Session affinity', 'None'],
          ['Ready', <Ratio value={2} of={2} />],
          ['Age', '3d21h'],
        ],
        own: (
          <>
            <Section title="Ports" part="ports">
              <Table
                head={['Name', 'Port', 'Target', 'Protocol']}
                rows={[
                  ['dns', 'dns', mono('53'), mono('53'), 'UDP'],
                  ['dns-tcp', 'dns-tcp', mono('53'), mono('53'), 'TCP'],
                  ['metrics', 'metrics', mono('9153'), mono('9153'), 'TCP'],
                ]}
              />
            </Section>
            <Section title="Endpoints" part="endpoints">
              <Table
                head={['Pod', 'IP', 'Ready']}
                rows={[
                  ['b9mgn', link('coredns-75c7b7f4-b9mgn'), mono('10.42.0.4'), state('ok', 'circle-check', 'Ready')],
                  ['8xk2d', link('coredns-75c7b7f4-8xk2d'), mono('10.42.0.9'), state('ok', 'circle-check', 'Ready')],
                ]}
              />
            </Section>
          </>
        ),
        related: [
          ['Selector', <Chips items={{ 'k8s-app': 'kube-dns' }} />],
          ['Selects pods of', ref('Deployment', 'layers', 'coredns')],
          ['Routed from', <span class="rv-quiet">no ingress routes to it</span>],
        ],
        events: [],
      }}
    />
  </Stage>
);

/** A load balancer: where it is reached from outside (its external address, as its cloud or MetalLB gave it), how its traffic is kept, its node ports; what routes to it. */
export const ServiceLoadBalancer = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Service',
        name: 'traefik',
        namespace: 'kube-system',
        summary: [
          ['Type', 'LoadBalancer'],
          [
            'External',
            <span class="rv-line">
              {mono('192.168.1.240')}
              <span class="rv-quiet">MetalLB · pool default</span>
            </span>,
          ],
          ['Cluster IP', mono('10.43.88.12')],
          [
            'Traffic policy',
            <span class="rv-line">
              Local<span class="rv-quiet">client IP kept; only nodes with a pod answer</span>
            </span>,
          ],
          ['Ready', <Ratio value={1} of={1} />],
          ['Age', '40d'],
        ],
        own: (
          <Section title="Ports" part="ports">
            <Table
              head={['Name', 'Port', 'Target', 'Node port', 'Protocol']}
              rows={[
                ['web', 'web', mono('80'), mono('8000'), mono('31080'), 'TCP'],
                ['websecure', 'websecure', mono('443'), mono('8443'), mono('31443'), 'TCP'],
              ]}
            />
          </Section>
        ),
        related: [
          ['Selector', <Chips items={{ 'app.kubernetes.io/name': 'traefik' }} />],
          ['Selects pods of', ref('Deployment', 'layers', 'traefik')],
          ['Routed from', <span class="rv-line">{[ref('Ingress', 'globe', 'shop/shop'), ref('Ingress', 'globe', 'media/jellyfin')]}</span>],
        ],
        events: [['Normal', 'IPAllocated', 'Assigned IP ["192.168.1.240"]', '40d']],
      }}
    />
  </Stage>
);

/** A node: what is allocated of it, its system, taints; its conditions (pressures: False is good); its pods. */
export const Node = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Node',
        name: 'kube',
        summary: [
          ['Status', state('ok', 'circle-check', 'Ready')],
          ['Roles', 'control-plane'],
          ['Version', 'v1.35.7'],
          ['Internal IP', mono('192.168.1.20')],
          ['Pods', '18 of 110'],
          ['Pod CIDR', mono('10.42.0.0/24')],
          ['Age', '3d21h'],
        ],
        own: (
          <>
            <Section title="Allocated" part="capacity">
              <dl class="uk-fields">
                <Meter label="CPU requested" said="1.2 of 4 cores" part={30} />
                <Meter label="Memory requested" said="2.1 of 7.6 GiB" part={28} />
                <Meter label="Pods" said="18 of 110" part={16} />
              </dl>
            </Section>
            <Section title="Capacity" part="capacity">
              <Table
                head={['Resource', 'Capacity', 'Allocatable', 'Kept back']}
                rows={[
                  ['cpu', 'CPU', '4', '4', '0'],
                  ['memory', 'Memory', '7.8Gi', '7.6Gi', '200Mi (system, eviction)'],
                  ['pods', 'Pods', '110', '110', '0'],
                  ['storage', 'Ephemeral storage', '116Gi', '113Gi', '3Gi'],
                ]}
              />
            </Section>
            <Section title="Pods" part="pods">
              <Table
                head={['Pod', 'Namespace', 'Status', 'CPU req', 'Memory req']}
                rows={[
                  ['a', link('api-7d4b9c-x2kfp'), 'shop', state('error', 'crash-loop', 'CrashLoopBackOff'), mono('260m'), mono('288Mi')],
                  ['b', link('coredns-75c7b7f4-b9mgn'), 'kube-system', RUNNING, mono('100m'), mono('70Mi')],
                  ['c', link('db-0'), 'shop', RUNNING, mono('250m'), mono('256Mi')],
                  ['d', link('node-exporter-x9fp'), 'monitoring', RUNNING, mono('—'), mono('—')],
                ]}
              />
            </Section>
            <Section title="Addresses" part="addresses">
              <Pairs
                pairs={[
                  ['InternalIP', mono('192.168.1.20')],
                  ['ExternalIP', mono('203.0.113.7')],
                  ['Hostname', mono('kube')],
                ]}
              />
            </Section>
            <Section title="Taints" part="taints">
              <Table
                head={['Key', 'Value', 'Effect']}
                rows={[
                  ['cp', mono('node-role.kubernetes.io/control-plane'), <span class="rv-quiet">no value</span>, 'NoSchedule'],
                  ['gpu', mono('dedicated'), mono('gpu'), 'NoExecute'],
                ]}
              />
            </Section>
            <Section title="System" part="system">
              <Pairs
                pairs={[
                  ['OS', 'linux/arm64, Ubuntu 24.04'],
                  ['Kernel', mono('6.8.0-45-generic')],
                  ['Runtime', mono('containerd://2.0.2')],
                  ['Kubelet', mono('v1.35.7')],
                ]}
              />
            </Section>
          </>
        ),
        conditions: [
          ['Ready', 'True', 'KubeletReady · kubelet is posting ready status', '3d21h'],
          ['MemoryPressure', 'False', 'KubeletHasSufficientMemory', '3d21h', true],
          ['DiskPressure', 'False', 'KubeletHasNoDiskPressure', '3d21h', true],
        ],
        related: [
          [
            'Runs',
            <a class="rv-link" href="#/">
              18 pods
            </a>,
          ],
        ],
        events: [],
      }}
    />
  </Stage>
);

/** A config map: its keys, each its value as code (copied by a click); the pods that use it. */
export const ConfigMap = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'ConfigMap',
        name: 'coredns',
        namespace: 'kube-system',
        summary: [
          ['Keys', '2'],
          ['Size', '460 B'],
          ['Immutable', 'No'],
          ['Age', '3d21h'],
        ],
        own: (
          <>
            <File
              name="Corefile"
              size="412 B"
              actions={
                <Button size="sm" variant="ghost" icon="copy">
                  Copy
                </Button>
              }
            >
              {'.:53 {\n    errors\n    health\n    kubernetes cluster.local in-addr.arpa ip6.arpa\n    forward . /etc/resolv.conf\n    cache 30\n}'}
            </File>
            <File
              name="NodeHosts"
              size="48 B"
              actions={
                <Button size="sm" variant="ghost" icon="copy">
                  Copy
                </Button>
              }
            >
              {'192.168.1.20 kube'}
            </File>
          </>
        ),
        related: [['Used by', ref('Pod', 'cube', 'coredns-75c7b7f4-b9mgn')]],
        events: [],
      }}
    />
  </Stage>
);

/** A secret: its type, its keys, each hidden till shown (or copied without being shown). */
export const Secret = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Secret',
        name: 'shop-tls',
        namespace: 'shop',
        summary: [
          ['Type', mono('kubernetes.io/tls')],
          ['Keys', '2'],
          ['Age', '12d'],
        ],
        own: (
          <>
            <Section title="Certificate" part="certificate">
              <Fields
                fields={[
                  [
                    'Valid till',
                    <span class="rv-line">
                      2027-01-12<Badge level="ok">in 89 days</Badge>
                    </span>,
                  ],
                  ['Valid from', '2026-10-14'],
                  ['Subject', mono('CN=shop.example.com')],
                  ['Issuer', mono("CN=R11, O=Let's Encrypt")],
                ]}
              />
              <div class="rv-card-under">
                <Pairs
                  pairs={[
                    ['Names (SAN)', <span class="rv-line">{[mono('shop.example.com'), mono('www.shop.example.com')]}</span>],
                    ['Key', 'ECDSA P-256'],
                    ['Serial', mono('04:a1:9c:…:3e')],
                  ]}
                />
              </div>
            </Section>
            <SecretFile name="tls.crt" size="1.8 KB">
              {'-----BEGIN CERTIFICATE-----\nMIIFJzCCBA+gAwIBAgISA3x…\n-----END CERTIFICATE-----'}
            </SecretFile>
            <SecretFile name="tls.key" size="227 B">
              {'-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIB3d…\n-----END EC PRIVATE KEY-----'}
            </SecretFile>
          </>
        ),
        related: [['TLS of', ref('Ingress', 'globe', 'shop')]],
        events: [],
      }}
    />
  </Stage>
);

/** A pull secret (dockerconfigjson): the registries it logs in to — each its user, never its password — not its raw key. */
export const SecretPull = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Secret',
        name: 'ghcr-pull',
        namespace: 'shop',
        summary: [
          ['Type', mono('kubernetes.io/dockerconfigjson')],
          ['Keys', '1'],
          ['Age', '40d'],
        ],
        own: (
          <Section title="Registries" part="registries">
            <Table
              head={['Registry', 'User', 'Password']}
              rows={[
                ['ghcr', mono('ghcr.io'), mono('acme-bot'), <span class="rv-quiet">set (hidden)</span>],
                ['hub', mono('registry-1.docker.io'), mono('acme'), <span class="rv-quiet">set (hidden)</span>],
              ]}
            />
          </Section>
        ),
        related: [['Pulled with by', <span class="rv-line">{[ref('ServiceAccount', 'key', 'api'), ref('Pod', 'cube', 'api-7d4b9c-x2kfp')]}</span>]],
        events: [],
      }}
    />
  </Stage>
);

// ── P2: after ──────────────────────────────────────────────────────────────

/** An ingress: its rules (host, path → service and port), TLS (secret, hosts). */
export const Ingress = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Ingress',
        name: 'shop',
        namespace: 'shop',
        summary: [
          ['Class', 'traefik'],
          ['Address', mono('192.168.1.20')],
          ['Hosts', mono('shop.example.com')],
          ['Age', '12d'],
        ],
        own: (
          <>
            <Section title="Rules" part="rules">
              <Table
                head={['Host', 'Path', 'Service', 'Port']}
                rows={[
                  ['root', mono('shop.example.com'), mono('/ (Prefix)'), ref('', 'network', 'web'), mono('80')],
                  ['api', mono('shop.example.com'), mono('/api (Prefix)'), ref('', 'network', 'api'), mono('8080')],
                  [
                    'admin',
                    mono('shop.example.com'),
                    mono('/admin (Prefix)'),
                    <span title="No service admin in shop: this path answers 503">{state('error', 'link-off', 'admin: no such service')}</span>,
                    mono('80'),
                  ],
                ]}
              />
            </Section>
            <Section title="TLS" part="tls">
              <Pairs pairs={[['shop.example.com', ref('Secret', 'key', 'shop-tls')]]} />
            </Section>
            <Section title="Controller's settings" part="annotations">
              <Pairs
                pairs={[
                  ['traefik.ingress.kubernetes.io/router.entrypoints', mono('websecure')],
                  ['traefik.ingress.kubernetes.io/router.middlewares', mono('shop-ratelimit@kubernetescrd')],
                ]}
              />
            </Section>
          </>
        ),
        related: [
          ['Class', ref('IngressClass', 'globe', 'traefik')],
          ['Routes to', <span class="rv-line">{[ref('Service', 'network', 'web'), ref('Service', 'network', 'api')]}</span>],
        ],
        events: [['Warning', 'BackendNotFound', 'service shop/admin not found', '12m', 4]],
      }}
    />
  </Stage>
);

/** A job: how many done of how many, how long, its pods (each its state). */
export const Job = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Job',
        name: 'backup-29012340',
        namespace: 'shop',
        summary: [
          ['Status', state('done', 'circle-check', 'Complete')],
          ['Completions', <Ratio value={1} of={1} />],
          ['Parallelism', '1'],
          ['Failed pods', '0 of 6 allowed'],
          ['Started', '16h48m ago'],
          ['Took', '42s'],
          ['Deadline', '1h (activeDeadlineSeconds)'],
          ['Removed', 'in 7h12m (ttlSecondsAfterFinished: 1d)'],
        ],
        own: (
          <Section title="Pods" part="pods">
            <Table head={['Pod', 'Status', 'Exit', 'Took']} rows={[['zq', link('backup-29012340-zq7nh'), state('done', 'circle-check', 'Completed'), mono('0'), '42s']]} />
          </Section>
        ),
        conditions: [['Complete', 'True', '', '16h47m']],
        related: [['Owned by', ref('CronJob', 'clock', 'backup')]],
        events: [['Normal', 'Completed', 'Job completed', '16h47m']],
      }}
    />
  </Stage>
);

/** A cron job: its schedule (when next, when last), its jobs (each its state, how long). */
export const CronJob = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'CronJob',
        name: 'backup',
        namespace: 'shop',
        summary: [
          ['Status', state('ok', 'clock-pause', 'Scheduled')],
          ['Schedule', mono('0 3 * * *')],
          [
            'Next',
            <span class="rv-line">
              in 7h12m<span class="rv-quiet">03:00 Europe/Berlin</span>
            </span>,
          ],
          ['Last', '16h48m ago'],
          ['Last successful', '16h48m ago'],
          ['Concurrency', 'Forbid'],
          ['History kept', '3 done · 1 failed'],
        ],
        own: (
          <Section title="Jobs" part="jobs">
            <Table
              head={['Job', 'Status', 'Completions', 'Took', 'Age']}
              rows={[
                ['a', link('backup-29012340'), state('done', 'circle-check', 'Complete'), <Ratio value={1} of={1} />, '42s', '16h48m'],
                ['b', link('backup-29010900'), state('error', 'circle-x', 'Failed'), <Ratio value={0} of={1} />, '6m', '1d16h'],
              ]}
            />
          </Section>
        ),
        events: [['Warning', 'BackoffLimitExceeded', 'Job has reached the specified backoff limit', '1d16h']],
      }}
    />
  </Stage>
);

/** A volume claim: its size, class, access, its volume; the pods that mount it. */
export const VolumeClaim = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'PersistentVolumeClaim',
        name: 'data-db-0',
        namespace: 'shop',
        summary: [
          ['Status', state('ok', 'circle-check', 'Bound')],
          [
            'Capacity',
            <span class="rv-line">
              10Gi<span class="rv-quiet">resizing to 20Gi</span>
            </span>,
          ],
          ['Requested', '20Gi'],
          ['Class', ref('', 'disk', 'local-path')],
          ['Access', 'RWO'],
          ['Mode', 'Filesystem'],
          ['From', <span class="rv-quiet">empty (no data source)</span>],
        ],
        conditions: [['FileSystemResizePending', 'True', 'Waiting for user to (re-)start a pod to finish file system resize of volume on node.', '6m', true]],
        related: [
          ['Bound to', ref('PersistentVolume', 'disk', 'pvc-8f1c2e')],
          ['Mounted by', ref('Pod', 'cube', 'db-0')],
          ['From', ref('StatefulSet', 'database', 'db (its claim template)')],
        ],
        events: [['Normal', 'ProvisioningSucceeded', 'Successfully provisioned volume pvc-8f1c2e', '40d']],
      }}
    />
  </Stage>
);

/** A volume: its size, class, reclaim policy, where it is (its source: a path, a CSI driver), its claim. */
export const Volume = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'PersistentVolume',
        name: 'pvc-8f1c2e',
        summary: [
          ['Status', state('ok', 'circle-check', 'Bound')],
          ['Capacity', '10Gi'],
          ['Class', ref('', 'disk', 'local-path')],
          ['Reclaim', 'Delete'],
          ['Access', 'RWO'],
          ['Mode', 'Filesystem'],
          ['Mount options', <span class="rv-quiet">none</span>],
        ],
        own: (
          <Section title="Source" part="source">
            <Pairs
              pairs={[
                ['Type', 'hostPath'],
                ['Path', mono('/var/lib/rancher/k3s/storage/pvc-8f1c2e_shop_data-db-0')],
                ['Node affinity', mono('kubernetes.io/hostname in (kube)')],
              ]}
            />
          </Section>
        ),
        related: [['Claimed by', ref('PVC', 'disk', 'shop/data-db-0')]],
        events: [],
      }}
    />
  </Stage>
);

/** A storage class: its provisioner, reclaim policy, binding, expansion; its parameters; the claims of it. */
export const StorageClass = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'StorageClass',
        name: 'gp3-encrypted',
        summary: [
          ['Provisioner', mono('ebs.csi.aws.com')],
          ['Reclaim', 'Retain'],
          ['Binding', 'WaitForFirstConsumer'],
          ['Expansion', 'Yes'],
          ['Default', 'No'],
        ],
        own: (
          <>
            <Section title="Parameters" part="parameters">
              <Pairs
                pairs={[
                  ['type', mono('gp3')],
                  ['iops', mono('3000')],
                  ['throughput', mono('125')],
                  ['encrypted', mono('true')],
                  ['csi.storage.k8s.io/fstype', mono('ext4')],
                ]}
              />
            </Section>
            <Section title="Mount options" part="mount">
              <span class="rv-line">
                <Badge>noatime</Badge>
                <Badge>discard</Badge>
              </span>
            </Section>
            <Section title="Allowed topologies" part="topology">
              <Pairs pairs={[['topology.kubernetes.io/zone', <span class="rv-line">{[mono('eu-west-1a'), mono('eu-west-1b')]}</span>]]} />
            </Section>
          </>
        ),
        related: [
          [
            'Claims of it',
            <a class="rv-link" href="#/">
              12 claims
            </a>,
          ],
        ],
        events: [],
      }}
    />
  </Stage>
);

/** A storage class with nothing to say of itself (no parameters, mount options, zones): said so, once. */
export const StorageClassPlain = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'StorageClass',
        name: 'local-path',
        summary: [
          ['Provisioner', mono('rancher.io/local-path')],
          ['Reclaim', 'Delete'],
          ['Binding', 'WaitForFirstConsumer'],
          ['Expansion', 'No'],
          ['Default', 'Yes'],
        ],
        own: (
          <Section title="Parameters" part="parameters">
            <Nothing icon="file">No parameters: its provisioner's defaults.</Nothing>
          </Section>
        ),
        related: [
          [
            'Claims of it',
            <a class="rv-link" href="#/">
              4 claims
            </a>,
          ],
        ],
        events: [],
      }}
    />
  </Stage>
);

/** An autoscaler: what it scales, between how few and how many; each metric now against its target. */
export const HPA = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'HorizontalPodAutoscaler',
        name: 'api',
        namespace: 'shop',
        summary: [
          ['Scales', ref('Deployment', 'layers', 'api')],
          [
            'Replicas',
            <span class="rv-line">
              3<span class="rv-quiet">wants 4</span>
            </span>,
          ],
          ['Min / max', '2 / 10'],
          ['Last scaled', '2h ago'],
          ['Age', '21d'],
        ],
        own: (
          <>
            <Section title="Metrics" part="metrics">
              <dl class="uk-fields">
                <Meter label="CPU (of requests)" said="42% now, target 70%" part={60} />
                <Meter label="Memory (of requests)" said="88% now, target 80%" part={110} />
              </dl>
            </Section>
            <Section title="Behaviour" part="behaviour">
              <Table
                head={['Way', 'Waits', 'At most', 'Picks']}
                rows={[
                  [
                    'up',
                    sort('way-out', 'Up'),
                    '0s',
                    <span class="rv-line">
                      <span>+100% per 15s</span>
                      <span class="rv-quiet">or +4 pods</span>
                    </span>,
                    'Max',
                  ],
                  ['down', sort('way-in', 'Down'), '300s', '−100% per 15s', 'Max'],
                ]}
              />
            </Section>
          </>
        ),
        conditions: [
          ['AbleToScale', 'True', 'ReadyForNewScale', '21d'],
          ['ScalingActive', 'True', 'ValidMetricFound', '21d'],
          ['ScalingLimited', 'False', 'DesiredWithinRange', '2h', true],
        ],
        events: [['Normal', 'SuccessfulRescale', 'New size: 3; reason: memory resource utilization (percentage of request) above target', '2h']],
      }}
    />
  </Stage>
);

/** A network policy: the pods it is for; what may come in, what may go out (each rule: from or to whom, which ports). */
export const NetworkPolicy = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'NetworkPolicy',
        name: 'api-allow',
        namespace: 'shop',
        summary: [
          ['Pods', <Chips items={{ app: 'api' }} />],
          ['Policy types', 'Ingress, Egress'],
          ['Age', '21d'],
        ],
        own: (
          <Section title="Rules" part="rules">
            <Table
              head={['Peer', 'Direction', 'Ports']}
              rows={[
                ['web', sort('cube', 'Pods', <Chips items={{ app: 'web' }} />), sort('way-in', 'Ingress'), mono('8080/TCP')],
                ['mon', sort('folder', 'Namespace', link('monitoring')), sort('way-in', 'Ingress'), mono('9090/TCP')],
                ['lb', sort('globe', 'IP block', mono('10.0.0.0/8')), sort('way-in', 'Ingress'), mono('8080/TCP, 8443/TCP')],
                ['db', sort('cube', 'Pods', <Chips items={{ app: 'db' }} />), sort('way-out', 'Egress'), mono('5432/TCP')],
                ['dns', sort('folder', 'Namespace', link('kube-system')), sort('way-out', 'Egress'), 'Any'],
              ]}
            />
          </Section>
        ),
        related: [
          [
            'Applies to',
            <span class="rv-line">
              {[ref('Pod', 'cube', 'api-7d4b9c-x2kfp'), ref('Pod', 'cube', 'api-7d4b9c-q7m2s')]}
              <span class="rv-quiet">2 pods now</span>
            </span>,
          ],
        ],
        events: [],
      }}
    />
  </Stage>
);

/** A resource a role's rule is on: its name, its group quiet (none: the core), the names it is held to quiet after (none: any of them). */
const resource = (name: string, group = '', only?: string) => (
  <span class="rv-line">
    {name === '*' ? <b>All resources</b> : mono(name)}
    {group && <span class="rv-quiet">{group}</span>}
    {only && <span class="rv-quiet">only {only}</span>}
  </span>
);
/** What may be done to it: each verb a badge; every verb, one (a warning). */
const can = (verbs: string[]) => (
  <span class="rv-line">
    {verbs.map((v) =>
      v === '*' ? (
        <Badge key={v} level="warn">
          All verbs
        </Badge>
      ) : (
        <Badge key={v}>{v}</Badge>
      ),
    )}
  </span>
);

/** A role (a cluster role alike): its rules — which verbs on which resources (of which groups, which names). */
export const Role = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'ClusterRole',
        name: 'pod-reader',
        summary: [
          ['Rules', '3'],
          ['Aggregated', 'No'],
          ['Age', '40d'],
        ],
        own: (
          <Section title="Rules" part="rules">
            <Table
              head={['Resource', 'Verbs']}
              rows={[
                ['pods', resource('pods'), can(['get', 'list', 'watch'])],
                ['pods/log', resource('pods/log'), can(['get'])],
                ['events', resource('events'), can(['list'])],
                ['events.k8s.io', resource('events', 'events.k8s.io'), can(['list'])],
                ['cm', resource('configmaps', '', 'app-config'), can(['get', 'update', 'patch'])],
                ['jobs', resource('*', 'batch'), can(['*'])],
              ]}
            />
          </Section>
        ),
        related: [['Bound by', <span class="rv-line">{[ref('ClusterRoleBinding', 'shield', 'pod-reader'), ref('RoleBinding', 'shield', 'shop/api-reads-pods')]}</span>]],
        events: [],
      }}
    />
  </Stage>
);

/** A role binding: which role, to whom (users, groups, service accounts). */
export const RoleBinding = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'RoleBinding',
        name: 'api-reads-pods',
        namespace: 'shop',
        summary: [
          ['Role', ref('ClusterRole', 'shield', 'pod-reader')],
          ['Subjects', '3'],
          ['Age', '21d'],
        ],
        own: (
          <Section title="Subjects" part="subjects">
            <Table
              head={['Name', 'Kind']}
              rows={[
                ['sa', ref('', 'key', 'shop/api'), 'ServiceAccount'],
                ['group', sort('users', 'devs'), 'Group'],
                ['user', sort('user', 'jane@acme.io'), 'User'],
              ]}
            />
          </Section>
        ),
        events: [],
      }}
    />
  </Stage>
);

/** A service account: its pods, its roles (bound to it), its pull secrets. */
export const ServiceAccount = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'ServiceAccount',
        name: 'api',
        namespace: 'shop',
        summary: [
          ['Automount token', 'Yes'],
          ['Pull secrets', '1'],
          ['Token secrets', <span class="rv-quiet">none (tokens are projected)</span>],
          ['Age', '21d'],
        ],
        related: [
          [
            'Used by',
            <a class="rv-link" href="#/">
              3 pods
            </a>,
          ],
          ['Roles', ref('ClusterRole', 'shield', 'pod-reader (by RoleBinding api-reads-pods)')],
          ['Pull secrets', ref('Secret', 'key', 'ghcr-pull')],
        ],
        events: [],
      }}
    />
  </Stage>
);

/** A namespace: its status, how much of each kind is in it, its quotas (used of hard), its limit ranges. */
export const Namespace = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Namespace',
        name: 'shop',
        summary: [
          ['Status', state('ok', 'circle-check', 'Active')],
          [
            'Pod security',
            <span class="rv-line">
              <Badge level="ok">enforce restricted</Badge>
              <span class="rv-quiet">warn restricted</span>
            </span>,
          ],
          ['Age', '40d'],
        ],
        own: (
          <>
            <Section title="In it" part="contents">
              <Table
                head={['Kind', 'Count', 'Not well']}
                rows={[
                  ['pods', ref('', 'cube', 'Pods'), '12', state('error', 'crash-loop', '1 crashing')],
                  ['deploy', ref('', 'layers', 'Deployments'), '4', state('warn', 'octagon', '1 degraded')],
                  ['sts', ref('', 'database', 'StatefulSets'), '1', <span class="rv-quiet">—</span>],
                  ['svc', ref('', 'network', 'Services'), '5', <span class="rv-quiet">—</span>],
                  ['cm', ref('', 'file', 'ConfigMaps'), '7', <span class="rv-quiet">—</span>],
                  ['secret', ref('', 'key', 'Secrets'), '9', <span class="rv-quiet">—</span>],
                  ['pvc', ref('', 'disk', 'PersistentVolumeClaims'), '2', state('waiting', 'circle-dashed', '1 pending')],
                ]}
              />
            </Section>
            <Section title="Quota" part="quota">
              <dl class="uk-fields">
                <Meter label="CPU requested" said="2.4 of 8" part={30} />
                <Meter label="Memory requested" said="5Gi of 16Gi" part={31} />
                <Meter label="Pods" said="12 of 50" part={24} />
              </dl>
            </Section>
            <Section title="Limit ranges" part="limits">
              <Table
                head={['Of', 'Default request', 'Default limit', 'Max']}
                rows={[
                  ['cpu', 'Container CPU', mono('100m'), mono('500m'), mono('2')],
                  ['mem', 'Container memory', mono('128Mi'), mono('512Mi'), mono('4Gi')],
                ]}
              />
            </Section>
          </>
        ),
        events: [],
      }}
    />
  </Stage>
);

/** A disruption budget: the pods it keeps, how many may go now. */
export const PDB = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'PodDisruptionBudget',
        name: 'api',
        namespace: 'shop',
        summary: [
          ['Pods', <Chips items={{ app: 'api' }} />],
          ['Min available', '2'],
          ['Healthy', <Ratio value={3} of={3} />],
          ['May go now', '1'],
          ['Unhealthy pods', 'evicted only if running ready (IfHealthyBudget)'],
        ],
        own: (
          <Section title="Pods it keeps" part="pods">
            <Table
              head={['Pod', 'Node', 'Status']}
              rows={['x2kfp', 'q7m2s', 'b81lp'].map((id, i) => [id, link(`api-7d4b9c-${id}`), ref('', 'server', `kube-${i + 1}`), RUNNING])}
            />
          </Section>
        ),
        conditions: [['DisruptionAllowed', 'True', 'SufficientPods', '21d']],
        events: [],
      }}
    />
  </Stage>
);

/** A node that is not well: NotReady (the kubelet silent), a pressure on it, cordoned; no taints of its own — said so. */
export const NodeNotReady = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Node',
        name: 'kube-2',
        summary: [
          ['Status', state('error', 'ban', 'NotReady,SchedulingDisabled')],
          [
            'Cordoned',
            <span class="rv-line">
              9m ago<span class="rv-quiet">by kubectl drain (taint node.kubernetes.io/unschedulable)</span>
            </span>,
          ],
          ['Roles', 'worker'],
          ['Version', 'v1.35.7'],
          ['Internal IP', mono('192.168.1.21')],
          ['Pods', '0 of 110'],
          ['Age', '12d'],
        ],
        own: (
          <>
            <Section title="Allocated" part="capacity">
              <dl class="uk-fields">
                <Meter label="CPU requested" said="0 of 4 cores" part={0} />
                <Meter label="Memory requested" said="0 of 7.6 GiB" part={0} />
                <Meter label="Pods" said="0 of 110" part={0} />
              </dl>
            </Section>
            <Section title="Taints" part="taints">
              <Nothing icon="shield">No taints: any pod may be scheduled here (once it takes pods again).</Nothing>
            </Section>
          </>
        ),
        conditions: [
          ['Ready', 'Unknown', 'NodeStatusUnknown · Kubelet stopped posting node status.', '14m'],
          ['MemoryPressure', 'True', 'KubeletHasInsufficientMemory · kubelet has insufficient memory available', '20m', true],
          ['DiskPressure', 'False', 'KubeletHasNoDiskPressure', '12d', true],
        ],
        events: [
          ['Warning', 'NodeNotReady', 'Node kube-2 status is now: NodeNotReady', '14m'],
          ['Normal', 'NodeNotSchedulable', 'Node kube-2 status is now: NodeNotSchedulable', '9m'],
        ],
      }}
    />
  </Stage>
);

/** A service nothing is behind: its selector takes no ready pods — said so, and what to look at. */
export const ServiceNoEndpoints = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Service',
        name: 'api',
        namespace: 'shop',
        summary: [
          ['Type', 'ClusterIP'],
          ['Cluster IP', mono('10.43.12.7')],
          ['Ready', <Ratio value={0} of={0} />],
          ['Age', '21d'],
        ],
        own: (
          <>
            <Section title="Ports" part="ports">
              <Table head={['Name', 'Port', 'Target', 'Protocol']} rows={[['http', 'http', mono('80'), mono('8080'), 'TCP']]} />
            </Section>
            <Section title="Endpoints" part="endpoints">
              <Nothing icon="link-off">No pods behind it: none ready of those its selector takes (app=api).</Nothing>
            </Section>
          </>
        ),
        related: [['Selector', <Chips items={{ app: 'api' }} />]],
        events: [],
      }}
    />
  </Stage>
);

/** A deployment scaled to zero: no pods — said so; its template and rollout as ever. */
export const DeploymentScaledToZero = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Deployment',
        name: 'worker',
        namespace: 'shop',
        summary: [
          ['Status', state('done', 'sleep', 'Scaled to zero')],
          ['Ready', <Ratio value={0} of={0} />],
          ['Up-to-date', '0'],
          ['Strategy', 'RollingUpdate'],
          ['Revision', '7'],
          ['Age', '40d'],
        ],
        own: (
          <>
            <Section title="Pods" part="pods">
              <Nothing icon="sleep">No pods: none wanted (replicas: 0).</Nothing>
            </Section>
            <Section title="Template" part="template">
              <Fields
                fields={[
                  ['Image', <Image image="ghcr.io/acme/worker:2.4.1" />],
                  ['Requests', mono('cpu 250m, mem 256Mi')],
                  ['Limits', mono('mem 512Mi')],
                ]}
              />
            </Section>
          </>
        ),
        conditions: [['Available', 'True', 'MinimumReplicasAvailable', '40d']],
        events: [['Normal', 'ScalingReplicaSet', 'Scaled down replica set worker-7f9c from 1 to 0', '2d']],
      }}
    />
  </Stage>
);

/** A claim not bound yet: waiting for its first pod (WaitForFirstConsumer) — said so; no volume, no pod. */
export const VolumeClaimPending = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'PersistentVolumeClaim',
        name: 'cache',
        namespace: 'shop',
        summary: [
          ['Status', state('waiting', 'circle-dashed', 'Pending')],
          ['Requested', '20Gi'],
          ['Class', ref('', 'disk', 'local-path')],
          ['Access', 'RWO'],
          ['Mode', 'Filesystem'],
        ],
        own: (
          <Section title="Volume" part="volume">
            <Nothing icon="hourglass">Not bound yet: its class binds on the first pod that uses it (WaitForFirstConsumer).</Nothing>
          </Section>
        ),
        events: [['Normal', 'WaitForFirstConsumer', 'waiting for first consumer to be created before binding', '3m', 14]],
      }}
    />
  </Stage>
);

/** A config map with no data: said so. */
export const ConfigMapEmpty = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'ConfigMap',
        name: 'kube-root-ca.crt',
        namespace: 'shop',
        summary: [
          ['Keys', '0'],
          ['Size', '0 B'],
          ['Age', '40d'],
        ],
        own: (
          <Section title="Data" part="data">
            <Nothing icon="file">No keys in it.</Nothing>
          </Section>
        ),
        events: [],
      }}
    />
  </Stage>
);

/** An aggregated cluster role: its rules gathered from the roles its selector picks — which those are, what each gives. */
export const RoleAggregated = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'ClusterRole',
        name: 'view',
        summary: [
          ['Rules', '41 (gathered)'],
          [
            'Aggregated',
            <span class="rv-line">
              Yes<span class="rv-quiet">from the roles with rbac.authorization.k8s.io/aggregate-to-view=true</span>
            </span>,
          ],
          ['Age', '40d'],
        ],
        own: (
          <Section title="Gathered from" part="aggregation">
            <Table
              head={['Role', 'Rules']}
              rows={[
                ['flux', ref('', 'shield', 'flux-view'), '6'],
                ['cert', ref('', 'shield', 'cert-manager-view'), '4'],
                ['system', ref('', 'shield', 'system:aggregate-to-view'), '31'],
              ]}
            />
          </Section>
        ),
        related: [['Bound by', ref('ClusterRoleBinding', 'shield', 'viewers')]],
        events: [],
      }}
    />
  </Stage>
);

/** An ingress class: its controller, whether it is the default, the ingresses of it. */
export const IngressClass = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'IngressClass',
        name: 'traefik',
        summary: [
          ['Controller', mono('traefik.io/ingress-controller')],
          ['Default', 'Yes'],
          ['Age', '40d'],
        ],
        related: [['Ingresses of it', <span class="rv-line">{[ref('Ingress', 'globe', 'shop/shop'), ref('Ingress', 'globe', 'media/jellyfin')]}</span>]],
        events: [],
      }}
    />
  </Stage>
);

/** A priority class: its value, whether it is the default, whether its pods push others out; the pods of it. */
export const PriorityClass = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'PriorityClass',
        name: 'business-critical',
        summary: [
          ['Value', '1000000'],
          ['Default', 'No'],
          ['Preempts', 'Lower-priority pods'],
          ['Age', '40d'],
        ],
        related: [
          [
            'Pods of it',
            <span class="rv-line">
              {[ref('Pod', 'cube', 'shop/api-7d4b9c-x2kfp')]}
              <span class="rv-quiet">and 2 more</span>
            </span>,
          ],
        ],
        events: [],
      }}
    />
  </Stage>
);

/** An endpoint slice: its service, each address (its pod, its node, its zone), ready, serving or terminating; its ports. */
export const EndpointSlice = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'EndpointSlice',
        name: 'kube-dns-x7k2p',
        namespace: 'kube-system',
        summary: [
          ['Service', ref('', 'network', 'kube-dns')],
          ['Address type', 'IPv4'],
          ['Ports', mono('53/UDP, 53/TCP, 9153/TCP')],
          ['Age', '3d21h'],
        ],
        own: (
          <Section title="Endpoints" part="endpoints">
            <Table
              head={['Address', 'Pod', 'Node', 'State']}
              rows={[
                ['a', mono('10.42.0.4'), link('coredns-75c7b7f4-b9mgn'), 'kube', state('ok', 'circle-check', 'Ready')],
                ['b', mono('10.42.0.9'), link('coredns-75c7b7f4-8xk2d'), 'kube', state('gone', 'trash', 'Terminating')],
              ]}
            />
          </Section>
        ),
        events: [],
      }}
    />
  </Stage>
);

/** A resource quota as itself: what it holds its namespace to, how much is used; its scopes. */
export const ResourceQuota = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'ResourceQuota',
        name: 'shop',
        namespace: 'shop',
        summary: [
          ['Scopes', <span class="rv-quiet">all pods</span>],
          ['Age', '40d'],
        ],
        own: (
          <Section title="Used of allowed" part="quota">
            <dl class="uk-fields">
              <Meter label="requests.cpu" said="2.4 of 8" part={30} />
              <Meter label="requests.memory" said="5Gi of 16Gi" part={31} />
              <Meter label="pods" said="46 of 50" part={92} />
              <Meter label="services.loadbalancers" said="1 of 1" part={100} />
            </dl>
          </Section>
        ),
        events: [],
      }}
    />
  </Stage>
);

/** A limit range as itself: for each kind of thing, its defaults and bounds. */
export const LimitRange = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'LimitRange',
        name: 'defaults',
        namespace: 'shop',
        summary: [['Age', '40d']],
        own: (
          <Section title="Limits" part="limits">
            <Table
              head={['Of', 'Resource', 'Default request', 'Default limit', 'Min', 'Max']}
              rows={[
                ['c-cpu', 'Container', 'cpu', mono('100m'), mono('500m'), mono('10m'), mono('2')],
                ['c-mem', 'Container', 'memory', mono('128Mi'), mono('512Mi'), mono('16Mi'), mono('4Gi')],
                ['pvc', 'PersistentVolumeClaim', 'storage', mono('—'), mono('—'), mono('1Gi'), mono('100Gi')],
              ]}
            />
          </Section>
        ),
        events: [],
      }}
    />
  </Stage>
);

/** A custom resource definition: its group and names, its versions (served, stored), its columns, how many objects of it; its conditions. */
export const CustomResourceDefinition = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'CustomResourceDefinition',
        name: 'kustomizations.kustomize.toolkit.fluxcd.io',
        summary: [
          ['Status', state('ok', 'circle-check', 'Established')],
          ['Kind', 'Kustomization'],
          ['Scope', 'Namespaced'],
          ['Short names', mono('ks')],
          ['Objects', ref('', 'puzzle', '12 Kustomizations')],
        ],
        own: (
          <>
            <Section title="Versions" part="versions">
              <Table
                head={['Version', 'Served', 'Stored', 'Deprecated']}
                rows={[
                  ['v1', mono('v1'), 'Yes', state('ok', 'circle-check', 'Stored'), '—'],
                  ['v1beta2', mono('v1beta2'), 'Yes', <span class="rv-quiet">no</span>, state('warn', 'octagon', 'use v1')],
                ]}
              />
            </Section>
            <Section title="Columns (v1)" part="columns">
              <Table
                head={['Name', 'Type', 'Path']}
                rows={[
                  ['age', 'Age', 'date', mono('.metadata.creationTimestamp')],
                  ['ready', 'Ready', 'string', mono('.status.conditions[?(@.type=="Ready")].status')],
                  ['status', 'Status', 'string', mono('.status.conditions[?(@.type=="Ready")].message')],
                ]}
              />
            </Section>
          </>
        ),
        conditions: [
          ['NamesAccepted', 'True', 'NoConflicts', '40d'],
          ['Established', 'True', 'InitialNamesAccepted', '40d'],
        ],
        events: [],
      }}
    />
  </Stage>
);

/** An API service: the group it serves, from where (a service, or the server itself), whether it is up — and why not. */
export const APIService = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'APIService',
        name: 'v1beta1.metrics.k8s.io',
        summary: [
          ['Status', state('error', 'network-off', 'FailedDiscoveryCheck')],
          ['Group', mono('metrics.k8s.io/v1beta1')],
          ['Service', ref('', 'network', 'kube-system/metrics-server')],
          ['Age', '40d'],
        ],
        conditions: [['Available', 'False', 'FailedDiscoveryCheck · failing or missing response from https://10.43.12.9:443/apis/metrics.k8s.io/v1beta1: 503', '4m']],
        events: [],
      }}
    />
  </Stage>
);

/** An admission webhook: each of its hooks — what it calls, on what operations and resources, what failing does. */
export const Webhook = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'ValidatingWebhookConfiguration',
        name: 'cert-manager-webhook',
        summary: [
          ['Hooks', '1'],
          ['Age', '40d'],
        ],
        own: (
          <Section title="Hooks" part="hooks">
            <Table
              head={['Hook', 'Calls', 'On', 'Failing']}
              rows={[
                [
                  'cm',
                  mono('webhook.cert-manager.io'),
                  ref('Service', 'network', 'cert-manager/cert-manager-webhook'),
                  <span class="rv-line">
                    <Badge>CREATE</Badge>
                    <Badge>UPDATE</Badge>
                    <span class="rv-quiet">cert-manager.io/*</span>
                  </span>,
                  state('warn', 'ban', 'Fail (blocks)'),
                ],
              ]}
            />
          </Section>
        ),
        events: [],
      }}
    />
  </Stage>
);

/** A certificate signing request: who asks, for what (its signer, usages), approved or not — approving it an action. */
export const CertificateSigningRequest = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'CertificateSigningRequest',
        name: 'csr-8x2kp',
        summary: [
          ['Condition', state('waiting', 'hourglass', 'Pending')],
          ['Requestor', mono('system:node:kube-3')],
          ['Signer', mono('kubernetes.io/kubelet-serving')],
          [
            'Usages',
            <span class="rv-line">
              <Badge>digital signature</Badge>
              <Badge>server auth</Badge>
            </span>,
          ],
          ['Age', '2m'],
        ],
        own: (
          <Section title="Asks for" part="request">
            <Pairs
              pairs={[
                ['Subject', mono('CN=system:node:kube-3, O=system:nodes')],
                ['Names (SAN)', <span class="rv-line">{[mono('kube-3'), mono('192.168.1.23')]}</span>],
              ]}
            />
          </Section>
        ),
        events: [],
      }}
    />
  </Stage>
);

/** An event as itself: what it is about (a link), its reason and message, how often, from whom, when first and last. */
export const EventItself = () => (
  <Stage>
    <ResourceSketch
      view={{
        kind: 'Event',
        name: 'api-7d4b9c-x2kfp.17e8a2c',
        namespace: 'shop',
        summary: [
          ['Type', state('warn', 'octagon', 'Warning')],
          ['Reason', 'Unhealthy'],
          ['About', ref('Pod', 'cube', 'api-7d4b9c-x2kfp')],
          ['Count', '112'],
          ['First', '3h ago'],
          ['Last', '20s ago'],
          ['From', mono('kubelet, kube')],
        ],
        own: (
          <Section title="Message" part="message">
            <span>Readiness probe failed: HTTP probe failed with statuscode: 503</span>
          </Section>
        ),
        events: [],
      }}
    />
  </Stage>
);

AnyKind.storyName = 'Core - Any kind';
CustomResource.storyName = 'Core - Custom resource';
Pod.storyName = 'Core - Pod';
Deployment.storyName = 'Core - Deployment';
StatefulSet.storyName = 'Core - StatefulSet';
DaemonSet.storyName = 'Core - DaemonSet';
Service.storyName = 'Core - Service';
Node.storyName = 'Core - Node';
ConfigMap.storyName = 'Core - ConfigMap';
Secret.storyName = 'Core - Secret';
Ingress.storyName = 'Core - Ingress';
Job.storyName = 'Core - Job';
CronJob.storyName = 'Core - CronJob';
VolumeClaim.storyName = 'Core - PersistentVolumeClaim';
Volume.storyName = 'Core - PersistentVolume';
StorageClass.storyName = 'Core - StorageClass';
HPA.storyName = 'Core - HorizontalPodAutoscaler';
NetworkPolicy.storyName = 'Core - NetworkPolicy';
Role.storyName = 'Core - Role';
RoleBinding.storyName = 'Core - RoleBinding';
ServiceAccount.storyName = 'Core - ServiceAccount';
Namespace.storyName = 'Core - Namespace';
PDB.storyName = 'Core - PodDisruptionBudget';
StorageClassPlain.storyName = 'Core - StorageClass (no parameters)';
NodeNotReady.storyName = 'Core - Node (NotReady, no taints)';
ServiceNoEndpoints.storyName = 'Core - Service (no endpoints)';
DeploymentScaledToZero.storyName = 'Core - Deployment (scaled to zero)';
VolumeClaimPending.storyName = 'Core - PersistentVolumeClaim (pending)';
ConfigMapEmpty.storyName = 'Core - ConfigMap (empty)';
ServiceLoadBalancer.storyName = 'Core - Service (load balancer)';
SecretPull.storyName = 'Core - Secret (pull secret)';
RoleAggregated.storyName = 'Core - ClusterRole (aggregated)';
IngressClass.storyName = 'Core - IngressClass';
PriorityClass.storyName = 'Core - PriorityClass';
EndpointSlice.storyName = 'Core - EndpointSlice';
ResourceQuota.storyName = 'Core - ResourceQuota';
LimitRange.storyName = 'Core - LimitRange';
CustomResourceDefinition.storyName = 'Core - CustomResourceDefinition';
APIService.storyName = 'Core - APIService';
Webhook.storyName = 'Core - ValidatingWebhookConfiguration';
CertificateSigningRequest.storyName = 'Core - CertificateSigningRequest';
EventItself.storyName = 'Core - Event';
