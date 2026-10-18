import { kinds, type ObjectOf } from '@overkube/kube-types';
import { type KubeContributor, kindRef, type ResourceProps, section } from '@overkube/sdk';
import { ObjectRef, useList, useSay } from '@overkube/sdk/preact';
import { Nothing, Section, Status, Table } from '@overkube/uikit';
import { useMemo } from 'preact/hooks';
import { Refused, refused } from '../refused.tsx';
import { T } from '../texts.ts';
import { addRelated, pickingLink } from './shared.tsx';

/*
 * A service's own, in its view: its ports (each its name, port, where to
 * on its pods, on the nodes, protocol), its endpoints (the pods behind it,
 * as its EndpointSlices say them: each pod, its address, ready or not);
 * its selector among what it is tied to.
 */

const { Service } = kinds.core.v1;
const { EndpointSlice } = kinds.discovery.v1;
type ServiceObject = ObjectOf<typeof Service>;
type Slice = ObjectOf<typeof EndpointSlice>;

/** Its ports (the core's section, where it has them): one line each. */
export function Ports({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.service;
  const ports = (object as ServiceObject).spec?.ports ?? [];
  const nodes = ports.some((p) => p.nodePort);
  return (
    <Section title={say(t.ports)} part="ports">
      <Table
        plain
        rows={ports}
        rowKey={(p) => `${p.name ?? ''}${p.port}${p.protocol ?? ''}`}
        columns={[
          { id: 'name', header: say(t.name), width: 'minmax(100px, 2fr)', cell: (p) => p.name || '—' },
          { id: 'port', header: say(t.port), width: 'minmax(64px, 1fr)', cell: (p) => <span class="uk-mono">{p.port}</span> },
          { id: 'target', header: say(t.target), width: 'minmax(64px, 1fr)', cell: (p) => <span class="uk-mono">{String(p.targetPort ?? p.port)}</span> },
          ...(nodes
            ? [{ id: 'node', header: say(t.nodePort), width: 'minmax(72px, 1fr)', cell: (p: (typeof ports)[number]) => <span class="uk-mono">{p.nodePort ?? '—'}</span> }]
            : []),
          { id: 'protocol', header: say(t.protocol), width: 'minmax(64px, 1fr)', cell: (p) => p.protocol ?? 'TCP' },
        ]}
      />
    </Section>
  );
}

interface Endpoint {
  key: string;
  pod?: string | undefined;
  ip: string;
  node?: string | undefined;
  state: 'ready' | 'notReady' | 'terminating';
}

/** The endpoints EndpointSlices say: each its pod (or none), addresses, node; ready, not, or going (terminating). */
export function endpointsOf(slices: readonly { key: string; object?: Slice | undefined }[]): Endpoint[] {
  return slices.flatMap((i) =>
    (i.object?.endpoints ?? []).map((e) => ({
      key: `${i.key}/${e.addresses.join(',')}`,
      pod: e.targetRef?.kind === 'Pod' ? e.targetRef.name : undefined,
      ip: e.addresses.join(', '),
      node: e.nodeName,
      state: e.conditions?.terminating ? ('terminating' as const) : e.conditions?.ready === false ? ('notReady' as const) : ('ready' as const),
    })),
  );
}

/** Endpoints, one line each: its pod (a link), its address, its node (where any says one), its state. */
function EndpointTable({ endpoints, namespace }: { endpoints: Endpoint[]; namespace: string | undefined }) {
  const say = useSay();
  const t = T.resource.view.service;
  const states = {
    ready: ['ok', 'circle-check'],
    notReady: ['warn', 'octagon'],
    terminating: ['gone', 'trash'],
  } as const;
  return (
    <Table
      plain
      rows={endpoints}
      rowKey={(e) => e.key}
      columns={[
        { id: 'pod', header: say(t.pod), width: 'minmax(140px, 2fr)', cell: (e) => (e.pod ? <ObjectRef kind="v1/Pod" name={e.pod} namespace={namespace} quiet /> : '—') },
        { id: 'ip', header: say(t.ip), width: 'minmax(96px, 1fr)', cell: (e) => <span class="uk-mono">{e.ip}</span> },
        ...(endpoints.some((e) => e.node)
          ? [{ id: 'node', header: say(t.node), width: 'minmax(96px, 1fr)', cell: (e: Endpoint) => (e.node ? <ObjectRef kind="v1/Node" name={e.node} quiet /> : '—') }]
          : []),
        {
          id: 'ready',
          header: say(t.ready),
          width: 'minmax(96px, 1fr)',
          cell: (e) => (
            <Status tone={states[e.state][0]} icon={states[e.state][1]}>
              {say(t[e.state])}
            </Status>
          ),
        },
      ]}
    />
  );
}

/** An endpoint slice's endpoints (the core's section): each its pod, address, node, state; none, said so. */
export function SliceEndpoints({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.service;
  const endpoints = endpointsOf([{ key: object.metadata?.name ?? '', object: object as Slice }]);
  return (
    <Section title={say(t.endpoints)} part="endpoints">
      {endpoints.length ? <EndpointTable endpoints={endpoints} namespace={object.metadata?.namespace} /> : <Nothing icon="network-off">{say(t.noSliceEndpoints)}</Nothing>}
    </Section>
  );
}

/** Its endpoints (the core's section; an external name has none): its EndpointSlices' — those its selector makes, or made by hand — each pod (or address), ready or not; none, said so. */
export function Endpoints({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.service;
  const namespace = object.metadata?.namespace;
  const answer = useList<Slice>({
    kind: kindRef(EndpointSlice),
    ...(namespace ? { scope: { namespaces: [namespace] } } : {}),
    where: { field: 'core.labels', op: 'eq', value: `kubernetes.io/service-name=${object.metadata?.name ?? ''}` },
    page: { offset: 0, limit: 50 },
  });
  const endpoints = useMemo(() => endpointsOf(answer.items), [answer.items]);
  return (
    <Section title={say(t.endpoints)} part="endpoints">
      {refused(answer) ? (
        <Refused kind={EndpointSlice} error={answer.error} />
      ) : endpoints.length ? (
        <EndpointTable endpoints={endpoints} namespace={namespace} />
      ) : (
        answer.state !== 'loading' && <Nothing icon="network-off">{say(Object.keys((object as ServiceObject).spec?.selector ?? {}).length ? t.noEndpoints : t.noSlices)}</Nothing>
      )}
    </Section>
  );
}

/** A service's in the core's view: its ports, its endpoints; its selector among what it is tied to. */
export function addService(c: KubeContributor): void {
  c.add('Fill', 'core.resource.view.service.ports', section({ kinds: [Service], order: 10, when: ({ object }) => (object.spec?.ports?.length ?? 0) > 0, render: Ports }));
  c.add('Fill', 'core.resource.view.service.endpoints', section({ kinds: [Service], order: 20, when: ({ object }) => object.spec?.type !== 'ExternalName', render: Endpoints }));
  c.add('Fill', 'core.resource.view.slice.endpoints', section({ kinds: [EndpointSlice], order: 10, render: SliceEndpoints }));
  // A slice's service: its label's.
  addRelated<Slice>(c, ['slice', EndpointSlice], 'service', 100, T.resource.view.service.service, (o) => {
    const name = o.metadata?.labels?.['kubernetes.io/service-name'];
    return name ? [<ObjectRef kind="v1/Service" name={name} namespace={o.metadata?.namespace} />, name] : undefined;
  });
  addRelated<ServiceObject>(c, ['service', Service], 'selector', 200, T.resource.view.service.selector, (o) =>
    pickingLink({ matchLabels: o.spec?.selector }, o.metadata?.namespace),
  );
}
