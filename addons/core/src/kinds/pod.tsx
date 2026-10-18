import { type KubeObject, kinds, type ObjectOf } from '@overkube/kube-types';
import { forKinds, humanDuration, type KubeContributor, type ResourceContainerProps, type ResourceProps, section, slots } from '@overkube/sdk';
import { ObjectRef, StatusOf, useSay } from '@overkube/sdk/preact';
import { Badge, Card, Chips, Image, KeyValue, Nothing, Ref, Section, Status, Table } from '@overkube/uikit';
import { fill, slotElement } from '@overweave/ui/preact';
import { type ComponentChildren, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import { Long, relatedField, Since, useChipLabels } from '../details.tsx';
import { T } from '../texts.ts';
import { type Selector, said } from './shared.tsx';

/*
 * A pod's own, in its view: its containers, a card each (init containers
 * first, numbered — they run one after another; a sidecar among them, an
 * init container that keeps running): its state and why, its restarts or
 * how long it took, its image, what it asks for, how it last ended, its
 * ports, command, environment (where each value comes from — a secret's,
 * never its value) and probes (what each checks, how often, after how many
 * fails; passing or failing, as its state says); its volumes; where it may
 * run (scheduling) and how it is held (security); what it is tied to — the
 * node it runs on, its service account, what it uses.
 */

const { Pod } = kinds.core.v1;
type PodObject = ObjectOf<typeof Pod>;
type Container = ResourceContainerProps['container'];
type Spec = Container['spec'];
type ContainerStatus = NonNullable<Container['status']>;

/** A container's state in its words: why it waits, Running, why it ended (none said: Waiting, Terminated). */
export const wordsOf = (s: ContainerStatus) =>
  s.state?.waiting ? s.state.waiting.reason || 'Waiting' : s.state?.running ? 'Running' : s.state?.terminated ? s.state.terminated.reason || 'Terminated' : 'Waiting';

/** Its containers, as its spec and status give them: its init containers (a sidecar among them), then its own, then those added to debug it (ephemeral); a template's, with no status. */
export function containersOf(spec: PodObject['spec'], status?: PodObject['status']): Container[] {
  const statuses = new Map([...(status?.initContainerStatuses ?? []), ...(status?.containerStatuses ?? []), ...(status?.ephemeralContainerStatuses ?? [])].map((s) => [s.name, s]));
  const of = (c: Spec, role?: Container['role']): Container => {
    const s = statuses.get(c.name);
    return { name: c.name, ...(role ? { role } : {}), spec: c, ...(s ? { status: s } : {}) };
  };
  return [
    ...(spec?.initContainers ?? []).map((c) => of(c, c.restartPolicy === 'Always' ? 'sidecar' : 'init')),
    ...(spec?.containers ?? []).map((c) => of(c)),
    ...(spec?.ephemeralContainers ?? []).map((c) => of(c as Spec, 'ephemeral')),
  ];
}

type Templated = { spec?: { template?: { spec?: PodObject['spec'] }; jobTemplate?: { spec?: { template?: { spec?: PodObject['spec'] } } } } };

/** A pod's spec — or a workload's pod template's, a cron job's its job template's. */
export const specOf = (kind: { id: string }, object: KubeObject): PodObject['spec'] => {
  if (kind.id === Pod.id) return (object as PodObject).spec;
  const spec = (object as Templated).spec;
  return spec?.template?.spec ?? spec?.jobTemplate?.spec?.template?.spec;
};

/** Its containers (the core's sections): each resource.view.pod.container's, one fill drawn — a pod's with their state, a template's without. */
export function Containers({ kind, object }: ResourceProps) {
  const spec = specOf(kind, object);
  return (
    <>
      {containersOf(spec, kind.id === Pod.id ? (object as PodObject).status : undefined).map((container) => (
        <Fragment key={`${container.role ?? ''}${container.name}`}>{slotElement(slots.resource.view.pod.container, { kind, object, container }, { limit: 1 })}</Fragment>
      ))}
    </>
  );
}

/** What it asks for of each resource, request / limit: CPU and memory always, then any other it names (a GPU, ephemeral storage, hugepages). */
export function resourcesOf(spec: Spec): { resource: string; text: string }[] {
  const { requests = {}, limits = {} } = spec.resources ?? {};
  const others = [...new Set([...Object.keys(requests), ...Object.keys(limits)])].filter((r) => r !== 'cpu' && r !== 'memory').sort();
  return ['cpu', 'memory', ...others].map((resource) => ({ resource, text: `${requests[resource] ?? '—'} / ${limits[resource] ?? '—'}` }));
}

type Handler = NonNullable<NonNullable<Spec['lifecycle']>['preStop']>;

/** A lifecycle hook's handler, said short: a probe's way (exec, GET, TCP), or a sleep. */
const handlerOf = (h: Handler) => (h.sleep ? `sleep ${h.sleep.seconds}s` : checkOf(h as Probe));

/** Its command as it runs: its command and arguments (none: its image's). */
export const commandOf = (spec: Spec) => [...(spec.command ?? []), ...(spec.args ?? [])].join(' ');

type Probe = NonNullable<Spec['livenessProbe']>;
export type ProbeKind = 'startup' | 'liveness' | 'readiness';

/** What a probe checks, said short: GET :8080/healthz (https: its scheme), TCP :5432, exec <command>, gRPC :9000. */
export function checkOf(p: Probe): string {
  if (p.httpGet) return `GET ${p.httpGet.scheme === 'HTTPS' ? 'https://' : ''}:${p.httpGet.port}${p.httpGet.path ?? '/'}`;
  if (p.tcpSocket) return `TCP :${p.tcpSocket.port}`;
  if (p.grpc) return `gRPC :${p.grpc.port}${p.grpc.service ? ` ${p.grpc.service}` : ''}`;
  if (p.exec) return `exec ${(p.exec.command ?? []).join(' ')}`;
  return '—';
}

/**
 * Whether a probe passes, as its container's status says (the API keeps no
 * probe's result): a startup one, as it is started (not yet: failing); a
 * readiness one, as it is ready; a liveness one, not said (unknown). Not
 * running, or its startup probe not passed yet (the others wait for it):
 * not checked.
 */
export function probeState(kind: ProbeKind, status: ContainerStatus | undefined): 'passing' | 'failing' | 'unchecked' | 'unknown' {
  if (!status?.state?.running) return 'unchecked';
  if (kind === 'startup') return status.started === false ? 'failing' : 'passing';
  if (status.started === false) return 'unchecked';
  if (kind === 'readiness') return status.ready ? 'passing' : 'failing';
  return 'unknown';
}

/** Its probes (startup, liveness, readiness — those it has), each with what it checks and its timing (the API's defaults where none). */
export function probesOf(spec: Spec): { kind: ProbeKind; check: string; every: number; fails: number; after: number }[] {
  return (['startup', 'liveness', 'readiness'] as const).flatMap((kind) => {
    const p = spec[`${kind}Probe`];
    return p ? [{ kind, check: checkOf(p), every: p.periodSeconds ?? 10, fails: p.failureThreshold ?? 3, after: p.initialDelaySeconds ?? 0 }] : [];
  });
}

/** Its probes, a table: one line each — passing or failing its mark (what failing does under the pointer), what it checks, how often, after how many fails, how long after it starts; none, said so. */
function Probes({ container }: { container: Container }) {
  const say = useSay();
  const t = T.resource.view.pod;
  const probes = probesOf(container.spec);
  if (!probes.length) return <Nothing icon="heartbeat">{say(t.noProbes)}</Nothing>;
  const mark = (kind: ProbeKind) => {
    if (!container.status) return null;
    const state = probeState(kind, container.status);
    return state === 'failing' ? (
      <Status tone="warn" icon="octagon" title={say(t.failing)} />
    ) : state === 'passing' ? (
      <Status tone="ok" icon="circle-check" title={say(t.passing)} />
    ) : (
      <Status tone="unknown" icon="circle-dashed" title={say(state === 'unknown' ? t.unknown : t.unchecked)} />
    );
  };
  return (
    <Table
      plain
      rows={probes}
      rowKey={(p) => p.kind}
      columns={[
        {
          id: 'probe',
          header: say(t.probe),
          width: 'minmax(104px, 120px)',
          cell: (p) => (
            <span class="uk-line" title={say(t.does[p.kind])}>
              {mark(p.kind)}
              <span>{p.kind}</span>
            </span>
          ),
        },
        { id: 'check', header: say(t.checks), width: 'minmax(120px, 1fr)', cell: (p) => <span class="uk-mono">{p.check}</span> },
        { id: 'every', header: say(t.every), width: 'minmax(44px, 52px)', cell: (p) => `${p.every}s` },
        { id: 'fails', header: say(t.fails), width: 'minmax(40px, 48px)', cell: (p) => String(p.fails) },
        { id: 'after', header: say(t.after), width: 'minmax(44px, 52px)', cell: (p) => (p.after ? `${p.after}s` : '—') },
      ]}
    />
  );
}

/** Its environment, as lines: each name, its value or where it comes from (a secret's key — never its value; a config map's; a field of the pod's; a resource's); what it takes whole (envFrom). */
export function envOf(spec: Spec): { key?: string; name: string; value?: string; from?: { kind: string; name: string; key?: string }; field?: string }[] {
  return [
    ...(spec.env ?? []).map((e) => {
      const v = e.valueFrom;
      if (v?.secretKeyRef) return { name: e.name, from: { kind: 'v1/Secret', name: v.secretKeyRef.name ?? '', key: v.secretKeyRef.key } };
      if (v?.configMapKeyRef) return { name: e.name, from: { kind: 'v1/ConfigMap', name: v.configMapKeyRef.name ?? '', key: v.configMapKeyRef.key } };
      if (v?.fieldRef) return { name: e.name, field: v.fieldRef.fieldPath };
      if (v?.resourceFieldRef)
        return { name: e.name, field: `${v.resourceFieldRef.containerName ?? ''}${v.resourceFieldRef.containerName ? ' · ' : ''}${v.resourceFieldRef.resource}` };
      return { name: e.name, value: e.value ?? '' };
    }),
    ...(spec.envFrom ?? []).map((e, i) => ({
      key: `from/${i}`,
      name: `${e.prefix ?? ''}*`,
      from: e.secretRef ? { kind: 'v1/Secret', name: e.secretRef.name ?? '' } : { kind: 'v1/ConfigMap', name: e.configMapRef?.name ?? '' },
    })),
  ];
}

function Env({ container, namespace }: { container: Container; namespace: string | undefined }) {
  const say = useSay();
  const t = T.resource.view.pod;
  const env = envOf(container.spec);
  if (!env.length) return null;
  return (
    <Table
      plain
      rows={env}
      rowKey={(e) => e.key ?? e.name}
      columns={[
        { id: 'name', header: say(t.env), width: 'minmax(140px, 1fr)', cell: (e) => <span class="uk-mono">{e.name === '*' ? say(t.allOf) : e.name}</span> },
        {
          id: 'value',
          header: say(t.value),
          width: 'minmax(140px, 1.4fr)',
          cell: (e) =>
            e.from ? (
              <span class="uk-line">
                <ObjectRef kind={e.from.kind} name={e.from.name} namespace={namespace} />
                {e.from.key && <span class="uk-quiet">{e.from.key}</span>}
              </span>
            ) : e.field ? (
              <span class="uk-quiet">{e.field}</span>
            ) : (
              <span class="uk-mono">{e.value}</span>
            ),
        },
      ]}
    />
  );
}

/**
 * A container (the core's, resource.view.pod.container's last): a card — its
 * state's mark, its name, its role (init ones numbered), its state quiet
 * (not ready, where it runs but is not), its restarts or how long it took,
 * what can be done with it (a pod's: resource.view.pod.container.actions);
 * its fields (image, what it asks for, how it last ended, ports, command);
 * its environment; its probes (an init container has none).
 */
export function ContainerCard(props: ResourceContainerProps) {
  const say = useSay();
  const t = T.resource.view.pod;
  const { container: c, kind, object } = props;
  const s = c.status;
  const words = s ? wordsOf(s) : undefined;
  const spec = specOf(kind, object);
  const n = (spec?.initContainers ?? []).findIndex((x) => x.name === c.name) + 1;
  const done = s?.state?.terminated;
  const took = c.role === 'init' && done?.startedAt && done.finishedAt ? humanDuration(Date.parse(done.finishedAt) - Date.parse(done.startedAt)) : undefined;
  const last = s?.lastState?.terminated;
  const ports = (c.spec.ports ?? []).map((p) => `${p.containerPort}/${p.protocol ?? 'TCP'}${p.name ? ` ${p.name}` : ''}`);
  const command = commandOf(c.spec);
  const hooks = (['postStart', 'preStop'] as const).flatMap((hook) => {
    const h = c.spec.lifecycle?.[hook];
    return h ? [[hook, <Long mono>{handlerOf(h)}</Long>] as [string, ComponentChildren]] : [];
  });
  const fields: [string, ComponentChildren][] = [
    [
      say(t.image),
      <span class="uk-line">
        <Image image={c.spec.image ?? ''} />
        {c.spec.imagePullPolicy && <span class="uk-quiet">{c.spec.imagePullPolicy}</span>}
      </span>,
    ],
    ...resourcesOf(c.spec).map(({ resource, text }): [string, ComponentChildren] => [
      resource === 'cpu' ? say(t.cpu) : resource === 'memory' ? say(t.memory) : say(t.resource, { resource }),
      <span class="uk-mono">{text}</span>,
    ]),
    ...(last ? [[say(t.lastEnded), <Ended reason={last.reason ?? 'Terminated'} code={last.exitCode} at={last.finishedAt} />] as [string, ComponentChildren]] : []),
    ...(ports.length ? [[say(t.ports), <Long mono>{ports.join(', ')}</Long>] as [string, ComponentChildren]] : []),
    ...(command ? [[say(t.command), <Long mono>{command}</Long>] as [string, ComponentChildren]] : []),
    ...hooks,
  ];
  return (
    <Card
      part="containers"
      mark={s && words ? <StatusOf kind={kind} words={words} mark /> : undefined}
      title={c.name}
      badges={c.role && <Badge>{c.role === 'init' ? say(t.init, { n }) : say(t[c.role])}</Badge>}
      quiet={s ? [words, c.role !== 'init' && !s.ready && s.state?.running && say(t.notReady)].filter(Boolean).join(' · ') : undefined}
      end={
        s && (
          <>
            {s.restartCount > 0 && <span>{say(t.restarts, { count: s.restartCount })}</span>}
            {took && <span>{say(t.took, { time: took })}</span>}
            {slotElement(slots.resource.view.pod.container.actions, props)}
          </>
        )
      }
    >
      <dl class="uk-fields">
        {fields.map(([label, value]) => (
          <div key={label} class="uk-field">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <Env container={c} namespace={object.metadata?.namespace} />
      {c.role !== 'init' && c.role !== 'ephemeral' && <Probes container={c} />}
    </Card>
  );
}

/** How it last ended: its reason, its exit code, how long ago (live). */
function Ended({ reason, code, at }: { reason: string; code: number; at: string | undefined }) {
  const say = useSay();
  return (
    <span>
      {say(T.resource.view.pod.ended, { reason, code })}
      {at && (
        <span class="uk-quiet">
          {' · '}
          <Since time={at} />
        </span>
      )}
    </span>
  );
}

/** The two tolerations every pod is given (not ready, unreachable: 300s) — not said of each. */
const GIVEN = new Set(['node.kubernetes.io/not-ready', 'node.kubernetes.io/unreachable']);

/** How it is scheduled and stopped where not as by default (field: value): its scheduler, runtime class, DNS policy, termination grace period. */
const unusual = (spec: PodObject['spec']): [string, string][] => [
  ...(spec?.schedulerName && spec.schedulerName !== 'default-scheduler' ? [['schedulerName', spec.schedulerName] as [string, string]] : []),
  ...(spec?.runtimeClassName ? [['runtimeClassName', spec.runtimeClassName] as [string, string]] : []),
  ...(spec?.dnsPolicy && spec.dnsPolicy !== 'ClusterFirst' ? [['dnsPolicy', spec.dnsPolicy] as [string, string]] : []),
  ...(spec?.terminationGracePeriodSeconds !== undefined && spec.terminationGracePeriodSeconds !== 30
    ? [['terminationGracePeriodSeconds', `${spec.terminationGracePeriodSeconds}s`] as [string, string]]
    : []),
];

/** The host's namespaces it shares (hostNetwork, hostPID, hostIPC). */
const hostOf = (spec: PodObject['spec']) => (['hostNetwork', 'hostPID', 'hostIPC'] as const).filter((k) => spec?.[k]);

/** Where it may run (the core's section, where it says anything): its node selector, tolerations (not the two every pod has), affinity, priority, restart policy. */
export function Scheduling({ object }: ResourceProps) {
  const say = useSay();
  const chips = useChipLabels();
  const t = T.resource.view.pod;
  const spec = (object as PodObject).spec;
  const tolerations = (spec?.tolerations ?? []).filter((x) => !(GIVEN.has(x.key ?? '') && x.tolerationSeconds === 300));
  const affinity = affinityOf(spec?.affinity);
  const rows: [string, ComponentChildren][] = [
    ...(Object.keys(spec?.nodeSelector ?? {}).length ? [[say(t.nodeSelector), <Chips items={spec?.nodeSelector ?? {}} labels={chips} />] as [string, ComponentChildren]] : []),
    ...(tolerations.length
      ? [
          [
            say(t.tolerations),
            <span class="uk-badges">
              {tolerations.map((x) => {
                const text = `${x.key ?? '*'}${x.operator === 'Exists' ? '' : `=${x.value ?? ''}`}${x.effect ? ` · ${x.effect}` : ''}${x.tolerationSeconds ? ` · ${x.tolerationSeconds}s` : ''}`;
                return <Badge key={text}>{text}</Badge>;
              })}
            </span>,
          ] as [string, ComponentChildren],
        ]
      : []),
    ...affinity.map((a): [string, ComponentChildren] => [say(t.affinityRules[a.rule]), <span class="uk-mono">{a.terms}</span>]),
    ...(spec?.priorityClassName
      ? [
          [
            say(t.priority),
            <span class="uk-line">
              <ObjectRef kind="scheduling.k8s.io/v1/PriorityClass" name={spec.priorityClassName} quiet />
              {spec.priority !== undefined && <span class="uk-quiet">{spec.priority}</span>}
            </span>,
          ] as [string, ComponentChildren],
        ]
      : []),
    [say(t.restartPolicy), spec?.restartPolicy ?? 'Always'],
    ...unusual(spec).map(([key, value]): [string, ComponentChildren] => [key, <span class="uk-mono">{value}</span>]),
  ];
  return (
    <Section title={say(t.scheduling)} part="scheduling">
      <KeyValue rows={rows} />
    </Section>
  );
}

type Affinity = NonNullable<PodObject['spec']>['affinity'];

type Rule = 'requiredNode' | 'preferredNode' | 'requiredPod' | 'preferredPod' | 'requiredAnti' | 'preferredAnti';
type Requirement = { key: string; operator: string; values?: string[] };
type PodTerm = { labelSelector?: Selector; namespaces?: string[]; topologyKey: string };

/** Its affinity, each rule as the API names it (required, preferred; node, pod, pod anti-) with its terms: a node term's expressions and fields, a pod term's selector, namespaces, topology key. */
export function affinityOf(a: Affinity): { rule: Rule; terms: string }[] {
  const node = (list: { matchExpressions?: Requirement[]; matchFields?: Requirement[] }[] | undefined) =>
    (list ?? []).map((term) => [...(term.matchExpressions ?? []), ...(term.matchFields ?? [])].map(said).join(', ') || '*');
  const pods = (list: PodTerm[] | undefined) =>
    (list ?? []).map((x) =>
      [
        [...Object.entries(x.labelSelector?.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`), ...(x.labelSelector?.matchExpressions ?? []).map(said)].join(', ') || '*',
        ...(x.namespaces?.length ? [`namespaces: ${x.namespaces.join(', ')}`] : []),
        `topologyKey: ${x.topologyKey}`,
      ].join(' · '),
    );
  const rules: [Rule, string[]][] = [
    ['requiredNode', node(a?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms)],
    ['preferredNode', node(a?.nodeAffinity?.preferredDuringSchedulingIgnoredDuringExecution?.map((p) => p.preference))],
    ['requiredPod', pods(a?.podAffinity?.requiredDuringSchedulingIgnoredDuringExecution)],
    ['preferredPod', pods(a?.podAffinity?.preferredDuringSchedulingIgnoredDuringExecution?.map((p) => p.podAffinityTerm))],
    ['requiredAnti', pods(a?.podAntiAffinity?.requiredDuringSchedulingIgnoredDuringExecution)],
    ['preferredAnti', pods(a?.podAntiAffinity?.preferredDuringSchedulingIgnoredDuringExecution?.map((p) => p.podAffinityTerm))],
  ];
  return rules.flatMap(([rule, terms]) => terms.map((x) => ({ rule, terms: x })));
}

/** How it is held (the core's section, where it says anything): whom it runs as, privileged (which containers), read-only root, capabilities, seccomp. */
export function Security({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.pod;
  const spec = (object as PodObject).spec;
  const pod = spec?.securityContext;
  const all = [...(spec?.initContainers ?? []), ...(spec?.containers ?? [])];
  const which = (test: (c: Spec) => boolean | undefined) => all.filter((c) => test(c)).map((c) => c.name);
  const privileged = which((c) => c.securityContext?.privileged);
  const readOnly = which((c) => c.securityContext?.readOnlyRootFilesystem);
  const added = [...new Set(all.flatMap((c) => c.securityContext?.capabilities?.add ?? []))];
  const dropped = [...new Set(all.flatMap((c) => c.securityContext?.capabilities?.drop ?? []))];
  // Each container as it runs: its own context over the pod's.
  const effective = <K extends 'runAsUser' | 'runAsGroup' | 'runAsNonRoot'>(key: K) => all.map((c) => ({ name: c.name, value: c.securityContext?.[key] ?? pod?.[key] }));
  const valued = (key: 'runAsUser' | 'runAsGroup') => {
    const each = effective(key);
    const values = new Set(each.map((e) => e.value));
    if (values.size === 1) return [...values][0] === undefined ? undefined : String([...values][0]);
    return each.map((e) => `${e.name}: ${e.value ?? '—'}`).join(', ');
  };
  const user = valued('runAsUser');
  const group = valued('runAsGroup');
  const nonRoot = which((c) => effective('runAsNonRoot').find((e) => e.name === c.name)?.value);
  const some = (names: string[]) => (names.length === all.length ? say(t.yes) : say(t.some, { names: names.join(', ') }));
  const rows: [string, ComponentChildren][] = [
    [say(t.runsAs), user === undefined ? '—' : <span class="uk-mono">{user}</span>],
    ...(group === undefined ? [] : [[say(t.runAsGroup), <span class="uk-mono">{group}</span>] as [string, ComponentChildren]]),
    [say(t.nonRoot), nonRoot.length ? some(nonRoot) : say(t.no)],
    [say(t.privileged), privileged.length ? <Badge level="warn">{some(privileged)}</Badge> : say(t.no)],
    ...(hostOf(spec).length
      ? [
          [
            say(t.hostNamespaces),
            <span class="uk-badges">
              {hostOf(spec).map((k) => (
                <Badge key={k} level="warn">
                  {k}
                </Badge>
              ))}
            </span>,
          ] as [string, ComponentChildren],
        ]
      : []),
    [say(t.rootFs), readOnly.length ? some(readOnly) : say(t.no)],
    ...(added.length || dropped.length
      ? [
          [
            say(t.capabilities),
            <span class="uk-badges">
              {dropped.map((c) => (
                <Badge key={`-${c}`}>{say(t.drop, { capability: c })}</Badge>
              ))}
              {added.map((c) => (
                <Badge key={`+${c}`} level="warn">
                  {say(t.add, { capability: c })}
                </Badge>
              ))}
            </span>,
          ] as [string, ComponentChildren],
        ]
      : []),
    ...(pod?.seccompProfile ? [[say(t.seccomp), pod.seccompProfile.type] as [string, ComponentChildren]] : []),
  ];
  return (
    <Section title={say(t.security)} part="security">
      <KeyValue rows={rows} />
    </Section>
  );
}

type Volume = NonNullable<NonNullable<PodObject['spec']>['volumes']>[number];

/** Where a volume is from: another object (a config map, a secret, a claim), else its sort by an icon. */
function From({ volume: v, namespace }: { volume: Volume; namespace: string | undefined }) {
  const say = useSay();
  const t = T.resource.view.pod;
  if (v.configMap?.name) return <ObjectRef kind="v1/ConfigMap" name={v.configMap.name} namespace={namespace} />;
  if (v.secret?.secretName) return <ObjectRef kind="v1/Secret" name={v.secret.secretName} namespace={namespace} />;
  if (v.persistentVolumeClaim?.claimName) return <ObjectRef kind="v1/PersistentVolumeClaim" name={v.persistentVolumeClaim.claimName} namespace={namespace} />;
  if (v.emptyDir) return <Ref icon="square-dashed">{say(v.emptyDir.medium === 'Memory' ? t.emptyDirMemory : t.emptyDir)}</Ref>;
  if (v.hostPath)
    return (
      <Ref icon="server" kind="hostPath">
        {v.hostPath.path}
      </Ref>
    );
  if (v.projected) return <Ref icon="layers">{say(t.projected)}</Ref>;
  if (v.downwardAPI) return <Ref icon="layers">{say(t.downwardApi)}</Ref>;
  const sort = Object.keys(v).find((k) => k !== 'name');
  return <Ref icon="disk">{sort ?? '—'}</Ref>;
}

/** Its volumes (the core's section, where it has them): each its name, where it is from, where its containers mount it — one line each. */
export function Volumes({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.pod;
  const pod = object as PodObject;
  const mounts = useMemo(() => {
    const at = new Map<string, string[]>();
    for (const c of [...(pod.spec?.initContainers ?? []), ...(pod.spec?.containers ?? [])])
      for (const m of c.volumeMounts ?? []) at.set(m.name, [...(at.get(m.name) ?? []), m.readOnly ? say(t.readOnly, { path: m.mountPath }) : m.mountPath]);
    return at;
  }, [pod.spec, say, t.readOnly]);
  return (
    <Section title={say(t.volumes)} part="volumes">
      <Table
        plain
        rows={pod.spec?.volumes ?? []}
        rowKey={(v) => v.name}
        columns={[
          { id: 'name', header: say(t.volume), width: 'minmax(140px, 2fr)', cell: (v) => v.name },
          { id: 'from', header: say(t.from), width: 'minmax(120px, 2fr)', cell: (v) => <From volume={v} namespace={pod.metadata?.namespace} /> },
          {
            id: 'mounted',
            header: say(t.mounted),
            width: 'minmax(120px, 2fr)',
            cell: (v) => {
              const at = [...new Set(mounts.get(v.name) ?? [])];
              return at.length ? <span class="uk-mono">{at.join(', ')}</span> : <span class="uk-quiet">{say(t.notMounted)}</span>;
            },
          },
        ]}
      />
    </Section>
  );
}

/** What it uses (config maps, secrets, claims): of its volumes, its containers' env and envFrom, its pull secrets — each once, in that order. */
export function usesOf(pod: PodObject): [kind: string, name: string][] {
  const found = new Map<string, [string, string]>();
  const add = (kind: string, name: string | undefined) => name && found.set(`${kind}/${name}`, [kind, name]);
  for (const v of pod.spec?.volumes ?? []) {
    add('v1/ConfigMap', v.configMap?.name);
    add('v1/Secret', v.secret?.secretName);
    add('v1/PersistentVolumeClaim', v.persistentVolumeClaim?.claimName);
    for (const s of v.projected?.sources ?? []) {
      add('v1/ConfigMap', s.configMap?.name);
      add('v1/Secret', s.secret?.name);
    }
  }
  for (const c of [...(pod.spec?.initContainers ?? []), ...(pod.spec?.containers ?? [])]) {
    for (const e of c.envFrom ?? []) {
      add('v1/ConfigMap', e.configMapRef?.name);
      add('v1/Secret', e.secretRef?.name);
    }
    for (const e of c.env ?? []) {
      add('v1/ConfigMap', e.valueFrom?.configMapKeyRef?.name);
      add('v1/Secret', e.valueFrom?.secretKeyRef?.name);
    }
  }
  for (const s of pod.spec?.imagePullSecrets ?? []) add('v1/Secret', s.name);
  return [...found.values()];
}

/** A pod's in the core's view: its sections, what can be done with each container (an addon's), its related fields. */
export function addPod(c: KubeContributor): void {
  const t = T.resource.view.pod;
  c.add('Fill', 'core.resource.view.pod.containers', section({ kinds: [Pod], order: 10, render: Containers }));
  c.add('Fill', 'core.resource.view.pod.container', fill(slots.resource.view.pod.container, { order: 1000, render: ContainerCard }));
  c.add(
    'Fill',
    'core.resource.view.pod.scheduling',
    section({
      kinds: [Pod],
      order: 30,
      when: ({ object: { spec } }) =>
        Object.keys(spec?.nodeSelector ?? {}).length > 0 ||
        (spec?.tolerations ?? []).some((x) => !(GIVEN.has(x.key ?? '') && x.tolerationSeconds === 300)) ||
        spec?.affinity !== undefined ||
        spec?.priorityClassName !== undefined ||
        unusual(spec).length > 0,
      render: Scheduling,
    }),
  );
  c.add(
    'Fill',
    'core.resource.view.pod.security',
    section({
      kinds: [Pod],
      order: 40,
      when: ({ object: { spec } }) =>
        spec?.securityContext !== undefined ||
        hostOf(spec).length > 0 ||
        [...(spec?.initContainers ?? []), ...(spec?.containers ?? [])].some((x) => x.securityContext !== undefined),
      render: Security,
    }),
  );
  c.add('Fill', 'core.resource.view.pod.volumes', section({ kinds: [Pod], order: 20, when: ({ object }) => (object.spec?.volumes?.length ?? 0) > 0, render: Volumes }));
  const related = (name: string, order: number, render: ReturnType<typeof relatedField>) =>
    c.add('Fill', `core.resource.view.related.pod.${name}`, fill(slots.resource.view.related, { order, target: forKinds(Pod), render }));
  related(
    'node',
    200,
    relatedField<PodObject>('node', t.node, (p) => (p.spec?.nodeName ? [<ObjectRef kind="v1/Node" name={p.spec.nodeName} quiet />, p.spec.nodeName] : undefined)),
  );
  related(
    'account',
    300,
    relatedField<PodObject>('account', t.account, (p) =>
      p.spec?.serviceAccountName
        ? [<ObjectRef kind="v1/ServiceAccount" name={p.spec.serviceAccountName} namespace={p.metadata?.namespace} quiet />, p.spec.serviceAccountName]
        : undefined,
    ),
  );
  related(
    'uses',
    400,
    relatedField<PodObject>('uses', t.uses, (p) => {
      const uses = usesOf(p);
      if (!uses.length) return undefined;
      return [
        <span class="uk-refs">
          {uses.map(([kind, name]) => (
            <ObjectRef key={`${kind}/${name}`} kind={kind} name={name} namespace={p.metadata?.namespace} />
          ))}
        </span>,
        uses.map(([, name]) => name).join(', '),
      ];
    }),
  );
}
