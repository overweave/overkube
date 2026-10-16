import { kinds, type ObjectOf } from '@overkube/kube-types';
import { type KubeContributor, kindRef, type ResourceProps, section } from '@overkube/sdk';
import { useList, useSay } from '@overkube/sdk/preact';
import { KeyValue, Nothing, Ref, Section, Status, Table } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { ObjectRef } from '../refs.tsx';
import { T } from '../texts.ts';
import { addRelated, pickingLink, type Selector, shown } from './shared.tsx';

/*
 * An ingress's and a network policy's own, in their views: an ingress's
 * rules (each host and path to its backend: a service and its port), its
 * TLS (each host's secret), its default backend; a network policy's rules
 * (each peer — pods, namespaces, an IP block, anyone — its direction, its
 * ports), a direction it holds with no rule said as all of it denied.
 */

const { Ingress, NetworkPolicy } = kinds.networking.v1;
const { Service } = kinds.core.v1;
type IngressObject = ObjectOf<typeof Ingress>;
type PolicyObject = ObjectOf<typeof NetworkPolicy>;
type Backend = NonNullable<NonNullable<IngressObject['spec']>['defaultBackend']>;

/** An ingress's backend: its service (a link) and port — not there (missing), said so — or another resource. */
function BackendOf({ backend, namespace, missing }: { backend: Backend; namespace: string | undefined; missing?: boolean }) {
  const say = useSay();
  const t = T.resource.view.network;
  const name = backend.service?.name ?? '';
  if (backend.service && missing)
    return (
      <Status tone="error" icon="link-off" title={say(t.noServiceWhy, { name, namespace: namespace ?? '' })}>
        {say(t.noService, { name })}
      </Status>
    );
  if (backend.service) return <ObjectRef kind="v1/Service" name={name} namespace={namespace} quiet />;
  const r = backend.resource;
  return r ? <ObjectRef kind={`${r.apiGroup ? `${r.apiGroup}/` : ''}${r.kind}`} name={r.name} namespace={namespace} /> : <>—</>;
}

const portOf = (backend: Backend) => String(backend.service?.port?.number ?? backend.service?.port?.name ?? '—');

/** An ingress's rules (the core's section, where it has them): each host and path to its backend — one line each. */
export function IngressRules({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.network;
  const ingress = object as IngressObject;
  const namespace = ingress.metadata?.namespace;
  // Its backends' services, asked by name: one not there (the answer live), missing — not to be had, none said missing.
  const names = [
    ...new Set(
      [ingress.spec?.defaultBackend, ...(ingress.spec?.rules ?? []).flatMap((r) => (r.http?.paths ?? []).map((p) => p.backend))].flatMap((b) =>
        b?.service ? [b.service.name] : [],
      ),
    ),
  ];
  const services = useList({
    kind: kindRef(Service),
    ...(namespace ? { scope: { namespaces: [namespace] } } : {}),
    where: { field: 'core.name', op: 'in', values: names },
    page: { offset: 0, limit: names.length || 1 },
  });
  const known = services.state === 'live' ? new Set(services.items.map((i) => i.key.split('/').at(-1))) : undefined;
  const missing = (b: Backend) => !!b.service && !!known && !known.has(b.service.name);
  const rows = (ingress.spec?.rules ?? []).flatMap((rule, i) =>
    (rule.http?.paths ?? []).map((p, j) => ({ key: `${i}/${j}`, host: rule.host, path: `${p.path ?? '/'} (${p.pathType})`, backend: p.backend })),
  );
  return (
    <Section title={say(t.rules)} part="rules">
      <Table
        plain
        rows={rows}
        rowKey={(r) => r.key}
        columns={[
          {
            id: 'host',
            header: say(t.host),
            width: 'minmax(140px, 2fr)',
            cell: (r) => (r.host ? <span class="uk-mono">{r.host}</span> : <span class="uk-quiet">{say(t.anyHost)}</span>),
          },
          { id: 'path', header: say(t.path), width: 'minmax(96px, 1fr)', cell: (r) => <span class="uk-mono">{r.path}</span> },
          { id: 'backend', header: say(t.backend), width: 'minmax(96px, 1fr)', cell: (r) => <BackendOf backend={r.backend} namespace={namespace} missing={missing(r.backend)} /> },
          { id: 'port', header: say(t.port), width: 'minmax(56px, 72px)', cell: (r) => <span class="uk-mono">{portOf(r.backend)}</span> },
        ]}
      />
    </Section>
  );
}

/** An ingress's TLS (the core's section, where it has it): each its hosts, its secret. */
export function IngressTls({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.network;
  const ingress = object as IngressObject;
  return (
    <Section title={say(t.tls)} part="tls">
      <KeyValue
        rows={(ingress.spec?.tls ?? []).map((tls): [string, ComponentChildren] => [
          tls.hosts?.join(', ') || say(t.anyTlsHost),
          tls.secretName ? <ObjectRef kind="v1/Secret" name={tls.secretName} namespace={ingress.metadata?.namespace} /> : undefined,
        ])}
      />
    </Section>
  );
}

type Peer = NonNullable<NonNullable<NonNullable<PolicyObject['spec']>['ingress']>[number]['from']>[number];
type Port = NonNullable<NonNullable<NonNullable<PolicyObject['spec']>['ingress']>[number]['ports']>[number];

/** A rule's peer: pods (by their labels; all), in namespaces (by theirs; all), an IP block (but some) — by its icon. */
function PeerOf({ peer }: { peer: Peer | undefined }) {
  const say = useSay();
  const t = T.resource.view.network;
  const picked = (s: Selector | undefined) => shown(s)?.[0] ?? say(t.allPods);
  if (!peer) return <Ref icon="globe">{say(t.anyone)}</Ref>;
  if (peer.ipBlock)
    return (
      <Ref icon="globe" kind={say(t.ipBlock)}>
        <span class="uk-mono">{peer.ipBlock.cidr}</span>
        {peer.ipBlock.except?.length ? <span class="uk-quiet"> {say(t.except, { cidrs: peer.ipBlock.except.join(', ') })}</span> : null}
      </Ref>
    );
  if (peer.podSelector && peer.namespaceSelector)
    return (
      <Ref icon="cube" kind={say(t.pods)}>
        {picked(peer.podSelector)}
        <span class="uk-quiet"> · {say(t.namespaces)} </span>
        {picked(peer.namespaceSelector)}
      </Ref>
    );
  if (peer.namespaceSelector)
    return (
      <Ref icon="folder" kind={say(t.namespaces)}>
        {picked(peer.namespaceSelector)}
      </Ref>
    );
  return (
    <Ref icon="cube" kind={say(t.pods)}>
      {picked(peer.podSelector)}
    </Ref>
  );
}

/** A rule's ports: each its port (a range: to its end) and protocol; none: any. */
const portsOf = (ports: Port[] | undefined, any: string) =>
  ports?.length ? ports.map((p) => `${p.port ?? any}${p.endPort ? `-${p.endPort}` : ''}/${p.protocol ?? 'TCP'}`).join(', ') : any;

/** A network policy's rules (the core's section): each peer of each rule, its direction, its ports — one line each; a direction it holds with no rule, all of it denied. */
export function PolicyRules({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.network;
  const spec = (object as PolicyObject).spec;
  // None said: Ingress, and Egress where it has egress rules (as the API server defaults it).
  const types = spec?.policyTypes ?? ['Ingress', ...(spec?.egress?.length ? ['Egress'] : [])];
  const of = (direction: 'Ingress' | 'Egress') => {
    const rules = (direction === 'Ingress' ? spec?.ingress : spec?.egress) ?? [];
    return rules.flatMap((rule, i) => {
      const peers = (direction === 'Ingress' ? (rule as { from?: Peer[] }).from : (rule as { to?: Peer[] }).to) ?? [];
      return (peers.length ? peers : [undefined]).map((peer, j) => ({ key: `${direction}/${i}/${j}`, direction, peer, ports: portsOf(rule.ports, say(t.anyPort)) }));
    });
  };
  const rows = [...of('Ingress'), ...of('Egress')];
  const denied = (['Ingress', 'Egress'] as const).filter((d) => types.includes(d) && !rows.some((r) => r.direction === d));
  return (
    <Section title={say(t.rules)} part="rules">
      {rows.length > 0 && (
        <Table
          plain
          rows={rows}
          rowKey={(r) => r.key}
          columns={[
            { id: 'peer', header: say(t.peer), width: 'minmax(180px, 2fr)', cell: (r) => <PeerOf peer={r.peer} /> },
            {
              id: 'direction',
              header: say(t.direction),
              width: 'minmax(96px, 1fr)',
              cell: (r) => <Ref icon={r.direction === 'Ingress' ? 'way-in' : 'way-out'}>{r.direction}</Ref>,
            },
            { id: 'ports', header: say(t.ports), width: 'minmax(80px, 1fr)', cell: (r) => <span class="uk-mono">{r.ports}</span> },
          ]}
        />
      )}
      {denied.map((d) => (
        <Nothing key={d} icon="ban">
          {say(d === 'Ingress' ? t.deniedIn : t.deniedOut)}
        </Nothing>
      ))}
    </Section>
  );
}

/** All the pods of its namespace (a policy's empty selector). */
function AllPods() {
  const say = useSay();
  return <>{say(T.resource.view.network.allPods)}</>;
}

/** An ingress's and a network policy's in the core's view: their rules, an ingress's TLS and default backend; the pods a policy applies to. */
export function addNetwork(c: KubeContributor): void {
  const t = T.resource.view.network;
  c.add(
    'Fill',
    'core.resource.view.ingress.rules',
    section({ kinds: [Ingress], order: 10, when: ({ object }) => (object.spec?.rules ?? []).some((r) => r.http?.paths?.length), render: IngressRules }),
  );
  c.add('Fill', 'core.resource.view.ingress.tls', section({ kinds: [Ingress], order: 20, when: ({ object }) => (object.spec?.tls?.length ?? 0) > 0, render: IngressTls }));
  addRelated<IngressObject>(c, ['ingress', Ingress], 'default', 200, t.defaultBackend, (o) =>
    o.spec?.defaultBackend ? [<BackendOf backend={o.spec.defaultBackend} namespace={o.metadata?.namespace} />, o.spec.defaultBackend.service?.name ?? ''] : undefined,
  );
  c.add('Fill', 'core.resource.view.networkpolicy.rules', section({ kinds: [NetworkPolicy], order: 10, render: PolicyRules }));
  addRelated<PolicyObject>(
    c,
    ['networkpolicy', NetworkPolicy],
    'selector',
    200,
    T.resource.view.workload.selector,
    (o) => pickingLink(o.spec?.podSelector, o.metadata?.namespace) ?? [<AllPods />, ''],
  );
}
