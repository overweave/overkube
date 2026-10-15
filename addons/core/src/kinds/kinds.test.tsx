import { kinds } from '@overkube/kube-types';
import { defineAddon, slots } from '@overkube/sdk';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { fill } from '@overweave/ui/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { quantity } from '../format.ts';
import core from '../index.tsx';
import { asks } from './node.tsx';
import { affinityOf, checkOf, containersOf, envOf, probeState, probesOf, resourcesOf, usesOf, wordsOf } from './pod.tsx';
import { said } from './shared.tsx';
import { failureRuleOf, pickedBy, podsOf, tolerates, whyNot } from './workloads.tsx';

/*
 * The usual kinds opened, as their user sees them (over the testkit's
 * world): a pod's containers, volumes, what it is tied to; a workload's
 * pods, template, rollout, claims, jobs; a service's ports and endpoints;
 * what is allocated of a node, its taints, its system — each a section (a
 * fill for its kinds), its parts slots.
 */

afterEach(cleanup);

const { Pod, Node, Service, Namespace } = kinds.core.v1;
const { Deployment, ReplicaSet, StatefulSet, DaemonSet } = kinds.apps.v1;
const { Job, CronJob } = kinds.batch.v1;
const { EndpointSlice } = kinds.discovery.v1;

const addon = (id: string, setup: Parameters<typeof defineAddon>[0]['setup']) => defineAddon({ id, title: id, setup });

/** A pod: an init container done, a sidecar crashing, its own running (not ready); its volumes; what it uses. */
const pod = (extra: object = {}) =>
  make(Pod, {
    metadata: { name: 'web', namespace: 'shop', uid: 'u-web', labels: { app: 'web' } },
    spec: {
      nodeName: 'n1',
      serviceAccountName: 'web',
      imagePullSecrets: [{ name: 'pull' }],
      initContainers: [
        { name: 'init', image: 'busybox:1.37' },
        { name: 'proxy', image: 'proxy:0.9', restartPolicy: 'Always', resources: { requests: { cpu: '10m' }, limits: { cpu: '50m' } } },
      ],
      containers: [
        {
          name: 'web',
          image: 'ghcr.io/acme/web:1.2',
          ports: [{ containerPort: 8080 }, { containerPort: 53, protocol: 'UDP' }],
          resources: { requests: { cpu: '100m', memory: '64Mi' }, limits: { memory: '128Mi' } },
          command: ['web', 'serve'],
          args: ['--port', '8080'],
          envFrom: [{ configMapRef: { name: 'env' } }],
          env: [
            { name: 'KEY', valueFrom: { secretKeyRef: { name: 'keys', key: 'k' } } },
            { name: 'MODE', value: 'fast' },
            { name: 'IP', valueFrom: { fieldRef: { fieldPath: 'status.podIP' } } },
          ],
          livenessProbe: { httpGet: { path: '/healthz', port: 8080 }, initialDelaySeconds: 15 },
          readinessProbe: { tcpSocket: { port: 8080 }, periodSeconds: 5, failureThreshold: 2 },
          volumeMounts: [
            { name: 'config', mountPath: '/etc/web', readOnly: true },
            { name: 'data', mountPath: '/data' },
          ],
        },
      ],
      volumes: [
        { name: 'config', configMap: { name: 'web' } },
        { name: 'data', persistentVolumeClaim: { claimName: 'data-web' } },
        { name: 'tmp', emptyDir: { medium: 'Memory' } },
      ],
    },
    status: {
      phase: 'Running',
      initContainerStatuses: [
        {
          name: 'init',
          image: '',
          imageID: '',
          ready: true,
          restartCount: 0,
          state: { terminated: { exitCode: 0, reason: 'Completed', startedAt: '2026-10-01T10:00:00Z', finishedAt: '2026-10-01T10:00:04Z' } },
        },
        { name: 'proxy', image: '', imageID: '', ready: false, restartCount: 41, state: { waiting: { reason: 'CrashLoopBackOff' } } },
      ],
      containerStatuses: [
        {
          name: 'web',
          image: '',
          imageID: '',
          ready: false,
          started: true,
          restartCount: 2,
          state: { running: {} },
          lastState: { terminated: { exitCode: 137, reason: 'OOMKilled', finishedAt: '2026-10-01T09:00:00Z' } },
        },
      ],
    },
    ...extra,
  });

function world() {
  const w = kubeWorld();
  w.cluster.add(Namespace, make(Namespace, { metadata: { name: 'shop' } }));
  w.addon(core);
  return w;
}

const opened = () => document.querySelector('.uk-modal') as HTMLElement;
const part = (name: string) => opened().querySelector(`[data-part="${name}"]`) as HTMLElement | null;
const parts = (name: string) => [...opened().querySelectorAll(`[data-part="${name}"]`)] as HTMLElement[];
const related_ = (el: Element | null) => [...(el?.querySelectorAll('dt') ?? [])].map((d) => [d.textContent, d.nextElementSibling?.textContent]);
const related = () => [...(part('related')?.querySelectorAll('dt') ?? [])].map((d) => [d.textContent, d.nextElementSibling?.textContent]);
const tableRows = (el: Element | null) =>
  [...(el?.querySelectorAll('[role="rowgroup"] [role="row"]') ?? [])].map((r) => [...r.querySelectorAll('[role="cell"]')].map((c) => c.textContent));
const headers = (el: Element | null) => [...(el?.querySelectorAll('[role="columnheader"]') ?? [])].map((h) => h.textContent);

describe('a pod', () => {
  it('has its containers as its spec and status say them: init containers first (a sidecar: one that keeps running), each its spec and status', () => {
    const p = pod();
    expect(containersOf(p.spec, p.status).map((c) => [c.name, c.role, c.status && wordsOf(c.status)])).toEqual([
      ['init', 'init', 'Completed'],
      ['proxy', 'sidecar', 'CrashLoopBackOff'],
      ['web', undefined, 'Running'],
    ]);
    // A template's: no status.
    expect(containersOf(p.spec).map((c) => c.status)).toEqual([undefined, undefined, undefined]);
  });

  it('reads a container’s probes (the API’s defaults where none said), what each checks, whether it passes as its state says', () => {
    const p = pod();
    const web = containersOf(p.spec, p.status)[2];
    expect(probesOf(web?.spec as never)).toEqual([
      { kind: 'liveness', check: 'GET :8080/healthz', every: 10, fails: 3, after: 15 },
      { kind: 'readiness', check: 'TCP :8080', every: 5, fails: 2, after: 0 },
    ]);
    expect(
      [{ httpGet: { port: 'http', scheme: 'HTTPS' } }, { grpc: { port: 9000, service: 'health' } }, { exec: { command: ['pg_isready', '-q'] } }, {}].map((x) =>
        checkOf(x as never),
      ),
    ).toEqual(['GET https://:http/', 'gRPC :9000 health', 'exec pg_isready -q', '—']);
    const status = (s: object) => ({ name: 'a', image: '', imageID: '', ready: false, restartCount: 0, ...s });
    expect([
      probeState('readiness', status({ state: { running: {} } })),
      probeState('readiness', status({ ready: true, state: { running: {} } })),
      probeState('startup', status({ started: false, state: { running: {} } })),
      probeState('startup', status({ started: true, state: { running: {} } })),
      // Its startup probe not passed yet: the others wait.
      probeState('readiness', status({ started: false, state: { running: {} } })),
      // The API keeps no liveness result.
      probeState('liveness', status({ started: true, state: { running: {} } })),
      probeState('liveness', status({ state: { waiting: { reason: 'CrashLoopBackOff' } } })),
      probeState('readiness', undefined),
    ]).toEqual(['failing', 'passing', 'failing', 'passing', 'unchecked', 'unknown', 'unchecked', 'unchecked']);
  });

  it('reads a container’s environment: a value, a secret’s key (never its value), a field, what it takes whole', () => {
    const p = pod();
    expect(envOf(containersOf(p.spec)[2]?.spec as never)).toEqual([
      { name: 'KEY', from: { kind: 'v1/Secret', name: 'keys', key: 'k' } },
      { name: 'MODE', value: 'fast' },
      { name: 'IP', field: 'status.podIP' },
      { key: 'from/0', name: '*', from: { kind: 'v1/ConfigMap', name: 'env' } },
    ]);
  });

  it('draws a card each: its mark, name, role (init ones numbered), state quiet, restarts or how long it took; its fields, environment, probes (none for an init one)', () => {
    const w = world();
    w.cluster.add(Pod, pod());
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    const cards = parts('containers');
    expect(
      cards.map((c) => [
        c.querySelector('.uk-card-head .uk-status')?.getAttribute('data-tone'),
        c.querySelector('.uk-card-head b')?.textContent,
        c.querySelector('.uk-card-head .uk-badge')?.textContent,
        c.querySelector('.uk-card-head > .uk-quiet')?.textContent,
        c.querySelector('.uk-card-end')?.textContent,
      ]),
    ).toEqual([
      ['done', 'init', 'init 1', 'Completed', 'completed in 4s'],
      ['error', 'proxy', 'sidecar', 'CrashLoopBackOff', '41 restarts'],
      ['ok', 'web', undefined, 'Running · not ready', '2 restarts'],
    ]);
    const web = cards[2] as HTMLElement;
    expect([...web.querySelectorAll('.uk-fields dt')].map((d) => [d.textContent, d.nextElementSibling?.textContent?.replace(/\d+[a-z]+$/, '')])).toEqual([
      ['Image', 'ghcr.io/acme/web1.2'],
      ['CPU req / lim', '100m / —'],
      ['Memory req / lim', '64Mi / 128Mi'],
      ['Last state', 'OOMKilled · exit code 137 · '],
      ['Ports', '8080/TCP, 53/UDP'],
      ['Command', 'web serve --port 8080'],
    ]);
    const [env, probes] = [...web.querySelectorAll('.uk-table')];
    expect(tableRows(env ?? null)).toEqual([
      ['KEY', 'Secretkeysk'],
      ['MODE', 'fast'],
      ['IP', 'status.podIP'],
      ['(all keys)', 'ConfigMapenv'],
    ]);
    expect([tableRows(probes ?? null), [...(probes?.querySelectorAll('[role="cell"] .uk-status') ?? [])].map((x) => x.getAttribute('data-tone'))]).toEqual([
      [
        ['liveness', 'GET :8080/healthz', '10s', '3', '15s'],
        ['readiness', 'TCP :8080', '5s', '2', '—'],
      ],
      ['unknown', 'warn'],
    ]);
    // An init container: no probes; a sidecar with none: said so.
    expect([cards[0]?.querySelector('.uk-nothing'), cards[1]?.querySelector('.uk-nothing')?.textContent]).toEqual([null, 'No probes configured.']);
  });

  it('has an addon’s at each container’s end (its logs, a shell), and its mark after the title', () => {
    const w = world();
    w.cluster.add(Pod, pod());
    w.addon(
      addon('logs', ({ contributor }) => {
        contributor.add(
          'Fill',
          'logs.open',
          fill(slots.resource.view.pod.container.actions, { render: ({ container }) => <button type="button">Logs of {container.name}</button> }),
        );
        contributor.add('Fill', 'logs.mark', fill(slots.resource.view.marks, { render: () => <b class="mark">logged</b> }));
      }),
    );
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    expect(parts('containers').flatMap((c) => [...c.querySelectorAll('.uk-card-end button')].map((b) => b.textContent))).toEqual(['Logs of init', 'Logs of proxy', 'Logs of web']);
    expect(opened().querySelector('h2 .mark')?.textContent).toBe('logged');
  });

  it('has its volumes, one line each: where from (another object a link), where its containers mount it — or not', () => {
    const w = world();
    w.cluster.add(Pod, pod());
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    const volumes = part('volumes');
    expect(tableRows(volumes)).toEqual([
      ['config', 'ConfigMapweb', '/etc/web (read-only)'],
      ['data', 'PVCdata-web', '/data'],
      ['tmp', 'emptyDir (memory)', 'not mounted'],
    ]);
    expect(volumes?.querySelector('a')?.getAttribute('href')).toContain('open=configmaps.v1/shop/web');
  });

  it('has what it is tied to: its owner, the node it runs on, its service account, what it uses (each once)', () => {
    expect(usesOf(pod())).toEqual([
      ['v1/ConfigMap', 'web'],
      ['v1/PersistentVolumeClaim', 'data-web'],
      ['v1/ConfigMap', 'env'],
      ['v1/Secret', 'keys'],
      ['v1/Secret', 'pull'],
    ]);
    const w = world();
    w.cluster.add(Pod, pod());
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    expect(related()).toEqual([
      ['Node', 'n1'],
      ['Service account', 'web'],
      ['References', 'ConfigMapwebPVCdata-webConfigMapenvSecretkeysSecretpull'],
    ]);
  });
});

describe('where a pod may run, how it is held', () => {
  it('reads its affinity as the API names its rules: each required or preferred node, pod, pod anti- affinity term', () => {
    expect(
      affinityOf({
        nodeAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [{ matchExpressions: [{ key: 'zone', operator: 'In', values: ['a'] }] }] },
          preferredDuringSchedulingIgnoredDuringExecution: [{ weight: 1, preference: { matchExpressions: [{ key: 'ssd', operator: 'Exists' }] } }],
        },
        podAntiAffinity: { requiredDuringSchedulingIgnoredDuringExecution: [{ labelSelector: { matchLabels: { app: 'web' } }, topologyKey: 'kubernetes.io/hostname' }] },
      }),
    ).toEqual([
      { rule: 'requiredNode', terms: 'zone in (a)' },
      { rule: 'preferredNode', terms: 'ssd' },
      { rule: 'requiredAnti', terms: 'app=web · topologyKey: kubernetes.io/hostname' },
    ]);
    // Node fields, pod expressions and namespaces, preferred pod affinity: said too.
    expect(
      affinityOf({
        nodeAffinity: { requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [{ matchFields: [{ key: 'metadata.name', operator: 'In', values: ['n1'] }] }] } },
        podAffinity: {
          preferredDuringSchedulingIgnoredDuringExecution: [
            { weight: 1, podAffinityTerm: { labelSelector: { matchExpressions: [{ key: 'tier', operator: 'Exists' }] }, namespaces: ['db'], topologyKey: 'zone' } },
          ],
        },
      }),
    ).toEqual([
      { rule: 'requiredNode', terms: 'metadata.name in (n1)' },
      { rule: 'preferredPod', terms: 'tier · namespaces: db · topologyKey: zone' },
    ]);
  });

  it('shows its scheduling (not the two tolerations every pod has) and its security — neither where it says nothing', () => {
    const w = world();
    w.cluster.add(Pod, pod());
    w.cluster.add(
      Pod,
      make(Pod, {
        metadata: { name: 'held', namespace: 'shop' },
        spec: {
          nodeSelector: { 'kubernetes.io/os': 'linux' },
          priorityClassName: 'critical',
          priority: 1000,
          tolerations: [
            { key: 'node.kubernetes.io/not-ready', operator: 'Exists', effect: 'NoExecute', tolerationSeconds: 300 },
            { key: 'dedicated', operator: 'Equal', value: 'api', effect: 'NoSchedule' },
          ],
          securityContext: { runAsUser: 65532, runAsNonRoot: true, seccompProfile: { type: 'RuntimeDefault' } },
          containers: [
            { name: 'a', securityContext: { readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } } },
            { name: 'b', securityContext: { privileged: true, capabilities: { add: ['NET_ADMIN'] } } },
          ],
        },
      }),
    );
    const page = renderPage(w, '/k/pods.v1?open=pods.v1/shop/web');
    expect([part('scheduling'), part('security')]).toEqual([null, null]);
    page.navigate('/k/pods.v1?open=pods.v1/shop/held');
    expect(related_(part('scheduling'))).toEqual([
      ['Node selector', 'kubernetes.io/oslinux'],
      ['Tolerations', 'dedicated=api · NoSchedule'],
      ['Priority', 'critical1000'],
      ['Restart policy', 'Always'],
    ]);
    expect(related_(part('security'))).toEqual([
      ['Run as user', '65532'],
      ['runAsNonRoot', 'Yes'],
      ['Privileged', 'containers: b'],
      ['Read-only root filesystem', 'containers: a'],
      ['Capabilities', 'drop ALLadd NET_ADMIN'],
      ['Seccomp', 'RuntimeDefault'],
    ]);
  });

  it('takes a container’s own security context over its pod’s: a root container in a non-root pod said so', () => {
    const w = world();
    w.cluster.add(
      Pod,
      make(Pod, {
        metadata: { name: 'mixed', namespace: 'shop' },
        spec: {
          securityContext: { runAsUser: 1000, runAsNonRoot: true },
          containers: [{ name: 'app' }, { name: 'root', securityContext: { runAsUser: 0, runAsNonRoot: false } }],
        },
      }),
    );
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/mixed');
    expect(related_(part('security')).slice(0, 2)).toEqual([
      ['Run as user', 'app: 1000, root: 0'],
      ['runAsNonRoot', 'containers: app'],
    ]);
  });
});

describe('a workload', () => {
  /** A deployment web (app=web): its replica set, its pods — and a pod not its own. */
  function deployed() {
    const w = world();
    const owner = { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web', uid: 'u-deploy', controller: true };
    w.cluster.add(
      Deployment,
      make(Deployment, {
        metadata: { name: 'web', namespace: 'shop', uid: 'u-deploy' },
        spec: {
          selector: { matchLabels: { app: 'web' } },
          template: { metadata: { labels: { app: 'web' } }, spec: { containers: [{ name: 'web', image: 'web:1.2', resources: { requests: { cpu: '100m' } } }] } },
        },
      }),
    );
    w.cluster.add(
      ReplicaSet,
      make(ReplicaSet, { metadata: { name: 'web-1', namespace: 'shop', uid: 'u-rs', ownerReferences: [owner] }, spec: { selector: { matchLabels: { app: 'web' } } } }),
    );
    const rs = { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'web-1', uid: 'u-rs', controller: true };
    for (const name of ['web-1-a', 'web-1-b']) w.cluster.add(Pod, make(Pod, { metadata: { name, namespace: 'shop', labels: { app: 'web' }, ownerReferences: [rs] } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'db-0', namespace: 'shop', labels: { app: 'db' } } }));
    return w;
  }

  it('shows a deployment’s pods (those its selector picks), its template, its rollout (its replica sets) — as their tables, framed by its sections, one namespace not said', () => {
    renderPage(deployed(), '/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    const pods = part('pods');
    expect([pods?.querySelector('.uk-table')?.hasAttribute('data-plain'), headers(pods), tableRows(pods).map((r) => r[0])]).toEqual([
      true,
      ['Name', 'Ready', 'Status', 'Restarts', 'Age'],
      ['web-1-a', 'web-1-b'],
    ]);
    // Its template: its containers as a pod's are drawn, with no state (no mark, no buttons).
    const template = parts('containers');
    expect(template.map((c) => [c.querySelector('.uk-card-head b')?.textContent, c.querySelector('.uk-card-head .uk-status'), c.querySelector('.uk-card-end')])).toEqual([
      ['web', null, null],
    ]);
    expect(tableRows(part('rollout')).map((r) => r[0])).toEqual(['web-1']);
    expect(related()).toEqual([['Selector', 'appweb']]);
  });

  it('counts the pods a rollout may take: a number as it is, a percent of its replicas — rounded up for more, down for fewer', () => {
    expect([podsOf(2, 10, true), podsOf('25%', 10, true), podsOf('25%', 10, false), podsOf('25%', 1, false)]).toEqual([2, 3, 2, 0]);
  });

  it('shows a deployment’s rollout strategy: rolling, what its surge and unavailable come to (the API’s defaults where none said); recreate, said so', () => {
    const w = deployed();
    const page = renderPage(w, '/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    expect(related_(part('strategy'))).toEqual([
      ['Max surge', '25%up to 1 extra pods above 1 during rollout'],
      ['Max unavailable', '25%min available: 1 of 1'],
      ['Min ready seconds', '0s'],
      ['Progress deadline', '600s'],
      ['Revision history limit', '10'],
    ]);
    const web = w.cluster.get(Deployment, 'web', 'shop');
    page.act(() => {
      if (web) w.cluster.add(Deployment, { ...web, spec: { ...web.spec, replicas: 4, minReadySeconds: 5, strategy: { type: 'Recreate' } } } as typeof web);
    });
    expect(related_(part('strategy'))).toEqual([
      ['Strategy', 'Recreateold pods are terminated before new ones are created'],
      ['Min ready seconds', '5s'],
      ['Progress deadline', '600s'],
      ['Revision history limit', '10'],
    ]);
  });

  it('reads why a daemon set is not on a node: its selector, its affinity, a taint it does not tolerate (not one its controller gives it, nor a preference)', () => {
    const node = (labels: Record<string, string>, taints: object[] = []) => make(Node, { metadata: { name: 'n', labels }, spec: { taints } } as never);
    const spec = {
      nodeSelector: { os: 'linux' },
      affinity: {
        nodeAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [{ matchExpressions: [{ key: 'zone', operator: 'NotIn' as const, values: ['b'] }] }] },
        },
      },
      tolerations: [{ key: 'gpu', operator: 'Exists' as const }],
    };
    expect([
      whyNot(spec, node({ os: 'windows' })),
      whyNot(spec, node({ os: 'linux', zone: 'b' })),
      whyNot(spec, node({ os: 'linux' }, [{ key: 'dedicated', value: 'db', effect: 'NoSchedule' }])),
      whyNot(
        spec,
        node({ os: 'linux' }, [
          { key: 'gpu', value: 'x', effect: 'NoSchedule' },
          { key: 'node.kubernetes.io/unschedulable', effect: 'NoSchedule' },
        ]),
      ),
      whyNot(spec, node({ os: 'linux' }, [{ key: 'slow', effect: 'PreferNoSchedule' }])),
    ]).toEqual([{ reason: 'selector' }, { reason: 'affinity' }, { reason: 'taint', taint: 'dedicated=db:NoSchedule' }, undefined, undefined]);
    expect([
      tolerates([{ key: 'a', value: '1' }], { key: 'a', value: '1', effect: 'NoExecute' }),
      tolerates([{ key: 'a', value: '1', effect: 'NoSchedule' }], { key: 'a', value: '1', effect: 'NoExecute' }),
      tolerates([{ operator: 'Exists' }], { key: 'any', effect: 'NoExecute' }),
    ]).toEqual([true, false, true]);
    // Its controller's tolerations by their effect; the network not up, only on the host's network.
    const unschedulableNoExecute = node({ os: 'linux' }, [{ key: 'node.kubernetes.io/unschedulable', effect: 'NoExecute' }]);
    const noNetwork = node({ os: 'linux' }, [{ key: 'node.kubernetes.io/network-unavailable', effect: 'NoSchedule' }]);
    expect([whyNot(spec, unschedulableNoExecute)?.reason, whyNot(spec, noNetwork)?.reason, whyNot({ ...spec, hostNetwork: true }, noNetwork)]).toEqual([
      'taint',
      'taint',
      undefined,
    ]);
    // A node's name by its fields; an empty term picks none.
    const byName = (values: string[]) => ({
      affinity: {
        nodeAffinity: { requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [{ matchFields: [{ key: 'metadata.name', operator: 'In' as const, values }] }] } },
      },
    });
    expect([
      whyNot(byName(['n']), node({})),
      whyNot(byName(['m']), node({}))?.reason,
      whyNot({ affinity: { nodeAffinity: { requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [{}] } } } }, node({}))?.reason,
    ]).toEqual([undefined, 'affinity', 'affinity']);
  });

  it('shows the nodes a daemon set is not on, each why — none where it is on all of them', () => {
    const w = world();
    w.cluster.add(
      DaemonSet,
      make(DaemonSet, {
        metadata: { name: 'agent', namespace: 'shop', uid: 'u-ds' },
        spec: { selector: { matchLabels: { app: 'agent' } }, template: { spec: { nodeSelector: { os: 'linux' }, containers: [{ name: 'a' }] } } },
      }),
    );
    const owner = { apiVersion: 'apps/v1', kind: 'DaemonSet', name: 'agent', uid: 'u-ds', controller: true };
    w.cluster.add(Node, make(Node, { metadata: { name: 'n1', labels: { os: 'linux' } } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'agent-1', namespace: 'shop', ownerReferences: [owner] }, spec: { nodeName: 'n1', containers: [] } }));
    const page = renderPage(w, '/k/daemonsets.v1.apps?open=daemonsets.v1.apps/shop/agent');
    expect(part('nodes')).toBeNull();
    page.act(() => {
      w.cluster.add(Node, make(Node, { metadata: { name: 'n2', labels: { os: 'windows' } } }));
      w.cluster.add(Node, make(Node, { metadata: { name: 'n3', labels: { os: 'linux' } }, spec: { taints: [{ key: 'gpu', effect: 'NoSchedule' }] } }));
      w.cluster.add(Node, make(Node, { metadata: { name: 'n4', labels: { os: 'linux' } } }));
    });
    expect(tableRows(part('nodes'))).toEqual([
      ['n2', 'Node selector mismatch'],
      ['n3', 'Untolerated taint gpu:NoSchedule'],
      ['n4', 'Pod pending'],
    ]);
  });

  it('shows a replica set’s pods and a job’s (those it owns), a cron job’s jobs', () => {
    const w = deployed();
    const cron = { apiVersion: 'batch/v1', kind: 'CronJob', name: 'nightly', uid: 'u-cron', controller: true };
    w.cluster.add(
      CronJob,
      make(CronJob, { metadata: { name: 'nightly', namespace: 'shop', uid: 'u-cron' }, spec: { schedule: '0 3 * * *', jobTemplate: { spec: { template: {} } } } }),
    );
    w.cluster.add(Job, make(Job, { metadata: { name: 'nightly-1', namespace: 'shop', uid: 'u-job', ownerReferences: [cron] }, spec: { template: {} } }));
    w.cluster.add(Job, make(Job, { metadata: { name: 'other', namespace: 'shop' }, spec: { template: {} } }));
    const job = { apiVersion: 'batch/v1', kind: 'Job', name: 'nightly-1', uid: 'u-job', controller: true };
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'nightly-1-x', namespace: 'shop', ownerReferences: [job] } }));
    // Its labels on a pod it does not own: not its.
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'stray', namespace: 'shop', labels: { app: 'web' } } }));
    // Read as a list gives it (no kind on the object): what it owns still, by its kind.
    const rs = w.cluster.get(ReplicaSet, 'web-1', 'shop');
    if (rs) w.cluster.add(ReplicaSet, { ...rs, kind: undefined } as typeof rs);
    const page = renderPage(w, '/k/replicasets.v1.apps?open=replicasets.v1.apps/shop/web-1');
    expect(tableRows(part('pods')).map((r) => r[0])).toEqual(['web-1-a', 'web-1-b']);
    page.navigate('/k/jobs.v1.batch?open=jobs.v1.batch/shop/nightly-1');
    expect(tableRows(part('pods')).map((r) => r[0])).toEqual(['nightly-1-x']);
    page.navigate('/k/cronjobs.v1.batch?open=cronjobs.v1.batch/shop/nightly');
    expect(tableRows(part('jobs')).map((r) => r[0])).toEqual(['nightly-1']);
  });

  it('shows a stateful set’s volume claim templates: each its name, size, class, access', () => {
    const w = world();
    w.cluster.add(
      StatefulSet,
      make(StatefulSet, {
        metadata: { name: 'db', namespace: 'shop' },
        spec: {
          serviceName: 'db',
          selector: { matchLabels: { app: 'db' } },
          template: {},
          volumeClaimTemplates: [
            { metadata: { name: 'data' }, spec: { accessModes: ['ReadWriteOnce'], storageClassName: 'local-path', resources: { requests: { storage: '10Gi' } } } },
          ],
        },
      }),
    );
    renderPage(w, '/k/statefulsets.v1.apps?open=statefulsets.v1.apps/shop/db');
    expect(tableRows(part('claims'))).toEqual([['data', '10Gi', 'local-path', 'ReadWriteOnce']]);
    // No containers in its template: no template drawn.
    expect(part('containers')).toBeNull();
  });
});

describe('more of a pod and of its workloads', () => {
  it('reads what a container asks for: CPU and memory always, then any other resource it names', () => {
    expect(resourcesOf({ name: 'a', resources: { requests: { cpu: '1', 'nvidia.com/gpu': '1' }, limits: { 'nvidia.com/gpu': '1', 'ephemeral-storage': '1Gi' } } })).toEqual([
      { resource: 'cpu', text: '1 / —' },
      { resource: 'memory', text: '— / —' },
      { resource: 'ephemeral-storage', text: '— / 1Gi' },
      { resource: 'nvidia.com/gpu', text: '1 / 1' },
    ]);
  });

  it('shows a container’s pull policy, other resources, lifecycle hooks; an ephemeral container (no probes); scheduling and host namespaces not as by default', () => {
    const w = world();
    w.cluster.add(
      Pod,
      make(Pod, {
        metadata: { name: 'gpu', namespace: 'shop' },
        spec: {
          hostNetwork: true,
          dnsPolicy: 'ClusterFirstWithHostNet',
          terminationGracePeriodSeconds: 5,
          runtimeClassName: 'nvidia',
          containers: [
            {
              name: 'train',
              image: 'trainer:1',
              imagePullPolicy: 'Always',
              resources: { limits: { 'nvidia.com/gpu': '1' } },
              lifecycle: { preStop: { sleep: { seconds: 5 } }, postStart: { exec: { command: ['warm'] } } },
            },
          ],
          ephemeralContainers: [{ name: 'debugger', image: 'busybox:1.37' }],
        },
      } as never),
    );
    renderPage(w, '/k/pods.v1?open=pods.v1/shop/gpu');
    const cards = parts('containers');
    const fields = (card: Element | undefined) => related_(card?.querySelector('.uk-fields') ?? null);
    expect([cards.map((c) => [c.querySelector('.uk-card-head b')?.textContent, c.querySelector('.uk-card-head .uk-badge')?.textContent ?? null]), fields(cards[0])]).toEqual([
      [
        ['train', null],
        ['debugger', 'ephemeral'],
      ],
      [
        ['Image', 'trainer1Always'],
        ['CPU req / lim', '— / —'],
        ['Memory req / lim', '— / —'],
        ['nvidia.com/gpu req / lim', '— / 1'],
        ['postStart', 'exec warm'],
        ['preStop', 'sleep 5s'],
      ],
    ]);
    // An ephemeral container: no probes said.
    expect(cards[1]?.querySelector('.uk-nothing')).toBeNull();
    expect(related_(part('scheduling')).slice(-3)).toEqual([
      ['runtimeClassName', 'nvidia'],
      ['dnsPolicy', 'ClusterFirstWithHostNet'],
      ['terminationGracePeriodSeconds', '5s'],
    ]);
    expect(related_(part('security')).find(([k]) => k === 'Host namespaces')).toEqual(['Host namespaces', 'hostNetwork']);
  });

  it('shows a stateful set’s and a daemon set’s update strategy: partition, unavailable, surge, on delete; pod management, claims’ retention', () => {
    const w = world();
    const template = { metadata: { labels: { app: 'x' } }, spec: { containers: [{ name: 'a' }] } };
    w.cluster.add(
      StatefulSet,
      make(StatefulSet, {
        metadata: { name: 'db', namespace: 'shop' },
        spec: {
          serviceName: 'db',
          selector: { matchLabels: { app: 'x' } },
          template,
          podManagementPolicy: 'Parallel',
          updateStrategy: { type: 'RollingUpdate', rollingUpdate: { partition: 2 } },
          persistentVolumeClaimRetentionPolicy: { whenDeleted: 'Delete' },
        },
      }),
    );
    w.cluster.add(DaemonSet, make(DaemonSet, { metadata: { name: 'agent', namespace: 'shop' }, spec: { selector: { matchLabels: { app: 'x' } }, template } }));
    w.cluster.add(
      DaemonSet,
      make(DaemonSet, { metadata: { name: 'manual', namespace: 'shop' }, spec: { selector: { matchLabels: { app: 'x' } }, template, updateStrategy: { type: 'OnDelete' } } }),
    );
    const page = renderPage(w, '/k/statefulsets.v1.apps?open=statefulsets.v1.apps/shop/db');
    expect(related_(part('strategy'))).toEqual([
      ['Partition', '2pods with ordinal ≥ 2 are updated'],
      ['Max unavailable', '1'],
      ['Pod management policy', 'Parallel'],
      ['Min ready seconds', '0s'],
      ['Revision history limit', '10'],
      ['PVC retention policy', 'whenDeleted: Delete · whenScaled: Retain'],
    ]);
    page.navigate('/k/daemonsets.v1.apps?open=daemonsets.v1.apps/shop/agent');
    expect(related_(part('strategy')).slice(0, 2)).toEqual([
      ['Max unavailable', '1'],
      ['Max surge', '0'],
    ]);
    page.navigate('/k/daemonsets.v1.apps?open=daemonsets.v1.apps/shop/manual');
    expect(related_(part('strategy'))[0]).toEqual(['Strategy', 'OnDeletepods are updated only when deleted']);
  });

  it('shows a job’s and a cron job’s pod template, a job’s pod failure policy', () => {
    const w = world();
    const template = { spec: { restartPolicy: 'Never' as const, containers: [{ name: 'run', image: 'busybox:1.37' }] } };
    w.cluster.add(
      Job,
      make(Job, {
        metadata: { name: 'import', namespace: 'shop' },
        spec: {
          template,
          podFailurePolicy: {
            rules: [
              { action: 'FailJob', onExitCodes: { containerName: 'run', operator: 'In', values: [42] } },
              { action: 'Ignore', onPodConditions: [{ type: 'DisruptionTarget' }] },
            ],
          },
        },
      }),
    );
    w.cluster.add(CronJob, make(CronJob, { metadata: { name: 'nightly', namespace: 'shop' }, spec: { schedule: '0 3 * * *', jobTemplate: { spec: { template } } } }));
    const page = renderPage(w, '/k/jobs.v1.batch?open=jobs.v1.batch/shop/import');
    expect([parts('containers').map((c) => c.querySelector('.uk-card-head b')?.textContent), tableRows(part('failure-policy'))]).toEqual([
      ['run'],
      [
        ['FailJob', 'onExitCodes: run In (42)'],
        ['Ignore', 'onPodConditions: DisruptionTarget=True'],
      ],
    ]);
    page.navigate('/k/cronjobs.v1.batch?open=cronjobs.v1.batch/shop/nightly');
    expect(parts('containers').map((c) => c.querySelector('.uk-card-head b')?.textContent)).toEqual(['run']);
    expect(failureRuleOf({ action: 'Count', onExitCodes: { operator: 'NotIn', values: [0, 1] } })).toBe('onExitCodes: NotIn (0, 1)');
  });
});

describe('a service', () => {
  const service = (spec: object) => make(Service, { metadata: { name: 'web', namespace: 'shop' }, spec });

  it('shows its ports (a node port column only where one has one) and its endpoints: each pod, its address, ready or not', () => {
    const w = world();
    w.cluster.add(
      Service,
      service({
        selector: { app: 'web' },
        ports: [
          { name: 'http', port: 80, targetPort: 8080, nodePort: 30080 },
          { port: 53, protocol: 'UDP' },
        ],
      }),
    );
    w.cluster.add(
      EndpointSlice,
      make(EndpointSlice, {
        metadata: { name: 'web-x', namespace: 'shop', labels: { 'kubernetes.io/service-name': 'web' } },
        addressType: 'IPv4',
        endpoints: [
          { addresses: ['10.0.0.1'], conditions: { ready: true }, targetRef: { kind: 'Pod', name: 'web-a', namespace: 'shop' } },
          { addresses: ['10.0.0.2'], conditions: { ready: false }, targetRef: { kind: 'Pod', name: 'web-b', namespace: 'shop' } },
        ],
      }),
    );
    w.cluster.add(
      EndpointSlice,
      make(EndpointSlice, {
        metadata: { name: 'db-x', namespace: 'shop', labels: { 'kubernetes.io/service-name': 'db' } },
        addressType: 'IPv4',
        endpoints: [{ addresses: ['10.0.0.9'] }],
      }),
    );
    renderPage(w, '/k/services.v1?open=services.v1/shop/web');
    expect([headers(part('ports')), tableRows(part('ports'))]).toEqual([
      ['Name', 'Port', 'Target', 'Node port', 'Protocol'],
      [
        ['http', '80', '8080', '30080', 'TCP'],
        ['—', '53', '53', '—', 'UDP'],
      ],
    ]);
    expect(tableRows(part('endpoints'))).toEqual([
      ['web-a', '10.0.0.1', 'Ready'],
      ['web-b', '10.0.0.2', 'Not ready'],
    ]);
    expect(related()).toEqual([['Selector', 'appweb']]);
  });

  it('says there are no pods behind it; with no selector shows its endpoints made by hand; an external name has none', () => {
    const w = world();
    w.cluster.add(Service, service({ selector: { app: 'web' }, ports: [{ port: 80 }] }));
    const page = renderPage(w, '/k/services.v1?open=services.v1/shop/web');
    expect(part('endpoints')?.querySelector('.uk-nothing')?.textContent).toBe('No ready endpoints: no pod matching the selector is ready.');
    // No selector: its endpoints made by hand — shown; none, said so; an external name, none at all.
    page.act(() => void w.cluster.add(Service, service({ ports: [{ port: 80 }] })));
    expect(part('endpoints')?.querySelector('.uk-nothing')?.textContent).toBe('No endpoints: no selector and no EndpointSlice for this service.');
    page.act(
      () =>
        void w.cluster.add(
          EndpointSlice,
          make(EndpointSlice, {
            metadata: { name: 'web-db', namespace: 'shop', labels: { 'kubernetes.io/service-name': 'web' } },
            addressType: 'IPv4',
            endpoints: [{ addresses: ['192.168.1.50'] }],
          }),
        ),
    );
    expect(tableRows(part('endpoints'))).toEqual([['—', '192.168.1.50', 'Ready']]);
    page.act(() => void w.cluster.add(Service, service({ type: 'ExternalName', externalName: 'db.example.com' })));
    expect(part('endpoints')).toBeNull();
  });
});

describe('a node', () => {
  it('shows what is allocated of it (its pods’ requests, not those done), its taints, its system; how many pods it runs', () => {
    const w = world();
    w.cluster.add(
      Node,
      make(Node, {
        metadata: { name: 'n1' },
        spec: {
          taints: [
            { key: 'gpu', value: 'yes', effect: 'NoSchedule' },
            { key: 'cp', effect: 'NoExecute' },
          ],
        },
        status: {
          allocatable: { cpu: '2', memory: '4Gi', pods: '110' },
          nodeInfo: {
            operatingSystem: 'linux',
            architecture: 'arm64',
            osImage: 'Ubuntu 24.04',
            kernelVersion: '6.8',
            containerRuntimeVersion: 'containerd://2.0',
            kubeletVersion: 'v1.35',
            kubeProxyVersion: '',
            bootID: '',
            machineID: '',
            systemUUID: '',
          },
        },
      }),
    );
    const on = (name: string, phase: 'Running' | 'Pending' | 'Succeeded', cpu: string, memory: string) =>
      w.cluster.add(
        Pod,
        make(Pod, { metadata: { name, namespace: 'shop' }, spec: { nodeName: 'n1', containers: [{ name: 'a', resources: { requests: { cpu, memory } } }] }, status: { phase } }),
      );
    on('a', 'Running', '500m', '1Gi');
    on('b', 'Pending', '250m', '512Mi');
    on('done', 'Succeeded', '4', '8Gi');
    renderPage(w, '/k/nodes.v1?open=nodes.v1/n1');
    const meters = [...(part('allocated')?.querySelectorAll('.uk-meter') ?? [])].map((m) => [
      m.querySelector('dt')?.textContent,
      m.querySelector('.uk-meter-said')?.textContent,
      (m.querySelector('.uk-meter-track > i') as HTMLElement | null)?.style.width,
    ]);
    expect(meters).toEqual([
      ['CPU requested', '750m of 2', '38%'],
      ['Memory requested', '1.5Gi of 4Gi', '38%'],
      ['Pods', '2 of 110', '2%'],
    ]);
    expect(tableRows(part('taints'))).toEqual([
      ['gpu', 'yes', 'NoSchedule'],
      ['cp', 'no value', 'NoExecute'],
    ]);
    expect([...(part('system')?.querySelectorAll('dd') ?? [])].map((d) => d.textContent)).toEqual(['linux/arm64, Ubuntu 24.04', '6.8', 'containerd://2.0', 'v1.35']);
    expect(related()).toEqual([['Pods', '2 pods']]);
  });

  it('shows what it has and gives (each resource, what it keeps back), its pods in every namespace, its addresses; cordoned, said so', () => {
    const w = world();
    w.cluster.add(
      Node,
      make(Node, {
        metadata: { name: 'n1' },
        spec: { unschedulable: true },
        status: {
          capacity: { 'hugepages-2Mi': '0', pods: '110', memory: '8Gi', cpu: '4' },
          allocatable: { 'hugepages-2Mi': '0', pods: '110', memory: '7936Mi', cpu: '3800m' },
          addresses: [
            { type: 'InternalIP', address: '192.168.1.20' },
            { type: 'Hostname', address: 'n1' },
          ],
        },
      }),
    );
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop' }, spec: { nodeName: 'n1', containers: [] }, status: { phase: 'Running' } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'dns', namespace: 'kube-system' }, spec: { nodeName: 'n1', containers: [] }, status: { phase: 'Running' } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'away', namespace: 'shop' }, spec: { nodeName: 'n2', containers: [] }, status: { phase: 'Running' } }));
    renderPage(w, '/k/nodes.v1?open=nodes.v1/n1');
    expect(part('allocated')?.querySelector('.uk-notice')?.textContent).toBe('Cordoned (SchedulingDisabled): new pods are not scheduled on this node.');
    expect(tableRows(part('capacity'))).toEqual([
      ['cpu', '4', '3800m', '200m'],
      ['memory', '8Gi', '7936Mi', '256Mi'],
      ['pods', '110', '110', '0'],
      ['hugepages-2Mi', '0', '0', '0'],
    ]);
    expect(tableRows(part('pods')).map((r) => r.slice(0, 2))).toEqual([
      ['dns', 'kube-system'],
      ['web', 'shop'],
    ]);
    expect(related_(part('addresses'))).toEqual([
      ['InternalIP', '192.168.1.20'],
      ['Hostname', 'n1'],
    ]);
  });
});

describe('nothing to show, said so', () => {
  it('says a node has no taints, and a workload scaled to zero wants no pods (those still going shown under it)', () => {
    const w = world();
    w.cluster.add(Node, make(Node, { metadata: { name: 'n1' } }));
    w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'idle', namespace: 'shop' }, spec: { replicas: 0, selector: { matchLabels: { app: 'idle' } }, template: {} } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'idle-a', namespace: 'shop', labels: { app: 'idle' } } }));
    const page = renderPage(w, '/k/nodes.v1?open=nodes.v1/n1');
    expect(part('taints')?.querySelector('.uk-nothing')?.textContent).toBe('No taints.');
    page.navigate('/k/deployments.v1.apps?open=deployments.v1.apps/shop/idle');
    // Still there (going): shown under it.
    expect([part('pods')?.querySelector('.uk-nothing')?.textContent, tableRows(part('pods')).map((r) => r[0])]).toEqual(['Scaled to zero (replicas: 0).', ['idle-a']]);
    page.act(() => w.cluster.take(Pod, 'idle-a', 'shop'));
    expect([part('pods')?.querySelector('.uk-nothing')?.textContent, part('pods')?.querySelector('[role="table"]')]).toEqual(['Scaled to zero (replicas: 0).', null]);
  });
});

describe('a pod’s requests, as the scheduler counts them', () => {
  const requesting = (init: [string, boolean][], containers: string[]) =>
    make(Pod, {
      metadata: { name: 'p' },
      spec: {
        initContainers: init.map(([cpu, sidecar], i) => ({ name: `i${i}`, ...(sidecar ? { restartPolicy: 'Always' } : {}), resources: { requests: { cpu } } })),
        containers: containers.map((cpu, i) => ({ name: `c${i}`, resources: { requests: { cpu } } })),
      },
    });
  it('are its containers’ and its sidecars’ together — or, where more, an init container’s with the sidecars started before it; its overhead on top, its own request first', () => {
    expect(asks(requesting([], ['100m', '200m']), 'cpu')).toBeCloseTo(0.3);
    // An init container more than its containers: that one.
    expect(asks(requesting([['1', false]], ['100m']), 'cpu')).toBeCloseTo(1);
    // A sidecar runs beside its containers: added to them.
    expect(asks(requesting([['50m', true]], ['100m']), 'cpu')).toBeCloseTo(0.15);
    // An init container after a sidecar: the sidecar runs beside it too.
    expect(
      asks(
        requesting(
          [
            ['300m', true],
            ['1', false],
          ],
          ['100m'],
        ),
        'cpu',
      ),
    ).toBeCloseTo(1.3);
    // One before the sidecar: alone.
    expect(
      asks(
        requesting(
          [
            ['1', false],
            ['300m', true],
          ],
          ['100m'],
        ),
        'cpu',
      ),
    ).toBeCloseTo(1);
    // Its overhead on top; its own (pod-level) request in place of its containers'.
    const over = requesting([], ['500m']);
    const spec = { containers: over.spec?.containers ?? [] };
    expect(asks({ ...over, spec: { ...spec, overhead: { cpu: '250m' } } }, 'cpu')).toBeCloseTo(0.75);
    expect(asks({ ...over, spec: { ...spec, resources: { requests: { cpu: '2' } } } as typeof spec }, 'cpu')).toBeCloseTo(2);
  });
});

describe('a label selector, as a query', () => {
  it('holds all of its labels and expressions: In, NotIn of key=value; Exists, DoesNotExist of keys; none of either, none', () => {
    expect(
      pickedBy({
        matchLabels: { app: 'web' },
        matchExpressions: [
          { key: 'tier', operator: 'In', values: ['a', 'b'] },
          { key: 'env', operator: 'NotIn', values: ['dev'] },
          { key: 'team', operator: 'Exists' },
          { key: 'old', operator: 'DoesNotExist' },
          { key: 'x', operator: 'Gt', values: ['1'] },
        ],
      }),
    ).toEqual({
      op: 'and',
      args: [
        { field: 'core.labels', op: 'eq', value: 'app=web' },
        { field: 'core.labels', op: 'in', values: ['tier=a', 'tier=b'] },
        { op: 'not', arg: { field: 'core.labels', op: 'in', values: ['env=dev'] } },
        { field: 'core.label.keys', op: 'eq', value: 'team' },
        { op: 'not', arg: { field: 'core.label.keys', op: 'eq', value: 'old' } },
        { op: 'or', args: [] },
      ],
    });
    expect([pickedBy(undefined), pickedBy({})]).toEqual([undefined, undefined]);
    expect(
      [
        { key: 'tier', operator: 'In', values: ['a', 'b'] },
        { key: 'env', operator: 'NotIn', values: ['dev'] },
        { key: 'team', operator: 'Exists' },
        { key: 'old', operator: 'DoesNotExist' },
      ].map(said),
    ).toEqual(['tier in (a, b)', 'env notin (dev)', 'team', '!old']);
  });

  it('picks a workload’s pods by its expressions too', () => {
    const w = world();
    w.cluster.add(
      Deployment,
      make(Deployment, {
        metadata: { name: 'web', namespace: 'shop' },
        spec: {
          selector: {
            matchExpressions: [
              { key: 'app', operator: 'In', values: ['web', 'api'] },
              { key: 'canary', operator: 'DoesNotExist' },
            ],
          },
          template: {},
        },
      }),
    );
    for (const [name, labels] of [
      ['web-a', { app: 'web' }],
      ['api-a', { app: 'api' }],
      ['web-canary', { app: 'web', canary: 'yes' }],
      ['db-a', { app: 'db' }],
    ] as const)
      w.cluster.add(Pod, make(Pod, { metadata: { name, namespace: 'shop', labels } }));
    renderPage(w, '/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    expect(tableRows(part('pods')).map((r) => r[0])).toEqual(['api-a', 'web-a']);
    // Its expressions among what it is tied to, as kubectl says them.
    expect([...(part('related')?.querySelectorAll('dd .uk-badge') ?? [])].map((b) => b.textContent)).toEqual(['app in (web, api)', '!canary']);
  });
});

describe('a quantity', () => {
  it('is read as the API writes it: millis, decimal and binary suffixes, exponents; else NaN', () => {
    expect(['100m', '2', '1.5Gi', '512Mi', '1k', '1e3', 3].map(quantity)).toEqual([0.1, 2, 1.5 * 2 ** 30, 512 * 2 ** 20, 1000, 1000, 3]);
    expect([quantity('x'), quantity(undefined)]).toEqual([Number.NaN, Number.NaN]);
  });
});

describe('a kind’s table in one namespace', () => {
  it('says no namespace on its rows', () => {
    const w = world();
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop' } }));
    const page = renderPage(w, '/k/pods.v1');
    expect(page.headers()).toContain('Namespace');
    cleanup();
    const one = deployedOne();
    one.cluster.add(Pod, make(Pod, { metadata: { name: 'web-a', namespace: 'shop', labels: { app: 'web' } } }));
    renderPage(one, '/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    expect(headers(part('pods'))).toEqual(['Name', 'Ready', 'Status', 'Restarts', 'Age']);
  });

  it('says in a word that there are none in another’s frame: no table’s head over nothing, not the page’s empty state', () => {
    renderPage(deployedOne(), '/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    expect([part('pods')?.querySelector('[role="table"]'), part('pods')?.querySelector('.uk-nothing')?.textContent, part('pods')?.querySelector('.uk-empty')]).toEqual([
      null,
      'No pods',
      null,
    ]);
  });
});

function deployedOne() {
  const w = world();
  w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'web', namespace: 'shop' }, spec: { selector: { matchLabels: { app: 'web' } }, template: {} } }));
  return w;
}
