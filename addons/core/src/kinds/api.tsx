import { kinds, type ObjectOf } from '@overkube/kube-types';
import { type KubeContributor, type ResourceProps, section } from '@overkube/sdk';
import { useCount, useKind, usePage, useSay } from '@overkube/sdk/preact';
import { Badge, KeyValue, Notice, Ref, Section, Status, Table } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { humanDuration } from '../format.ts';
import { ObjectRef } from '../refs.tsx';
import { RefusedQuietly, refused } from '../refused.tsx';
import { T } from '../texts.ts';
import { parseRequest } from '../x509.ts';
import { addRelated } from './shared.tsx';

/*
 * The API's own kinds, in their views: a custom resource definition's
 * versions (served, stored, deprecated) and its storage version's columns,
 * how many objects of it there are; an API service's service; an admission
 * webhook configuration's hooks (each what it calls, on what, what its
 * failing does); what a certificate signing request asks for (read from
 * it); an event's message, what it is about.
 */

const { CustomResourceDefinition } = kinds.apiextensions.v1;
const { APIService } = kinds.apiregistration.v1;
const { ValidatingWebhookConfiguration, MutatingWebhookConfiguration } = kinds.admissionregistration.v1;
const { CertificateSigningRequest } = kinds.certificates.v1;
const { Event } = kinds.core.v1;
type CrdObject = ObjectOf<typeof CustomResourceDefinition>;
type Hooks = ObjectOf<typeof ValidatingWebhookConfiguration>;
type Hook = NonNullable<Hooks['webhooks']>[number];
type EventObject = ObjectOf<typeof Event>;

/** Its stored version (the one its objects are kept as): the version said stored, else the first. */
const storedOf = (crd: CrdObject) => crd.spec.versions.find((v) => v.storage) ?? crd.spec.versions[0];

/** A definition's versions (the core's section): each served or not, stored, deprecated (its warning). */
export function Versions({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.api;
  const versions = (object as CrdObject).spec.versions;
  return (
    <Section title={say(t.versions)} part="versions">
      <Table
        plain
        rows={versions}
        rowKey={(v) => v.name}
        columns={[
          { id: 'version', header: say(t.version), width: 'minmax(96px, 1fr)', cell: (v) => <span class="uk-mono">{v.name}</span> },
          { id: 'served', header: say(t.served), width: 'minmax(64px, 1fr)', cell: (v) => say(v.served ? t.yes : t.no) },
          {
            id: 'stored',
            header: say(t.stored),
            width: 'minmax(80px, 1fr)',
            cell: (v) =>
              v.storage ? (
                <Status tone="ok" icon="circle-check">
                  {say(t.stored)}
                </Status>
              ) : (
                <span class="uk-quiet">{say(t.no)}</span>
              ),
          },
          {
            id: 'deprecated',
            header: say(t.deprecated),
            width: 'minmax(140px, 2fr)',
            cell: (v) =>
              v.deprecated ? (
                <Status tone="warn" icon="octagon" title={v.deprecationWarning}>
                  {v.deprecationWarning ?? say(t.deprecated)}
                </Status>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </Section>
  );
}

/** Its stored version's columns (the core's section, where it says any): each its name, type, path. */
export function CrdColumns({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.api;
  const stored = storedOf(object as CrdObject);
  return (
    <Section title={say(t.columns, { version: stored?.name ?? '' })} part="columns">
      <Table
        plain
        rows={stored?.additionalPrinterColumns ?? []}
        rowKey={(c) => c.name}
        columns={[
          { id: 'name', header: say(t.name), width: 'minmax(96px, 1fr)', cell: (c) => c.name },
          { id: 'type', header: say(t.type), width: 'minmax(64px, 1fr)', cell: (c) => c.type },
          { id: 'path', header: say(t.path), width: 'minmax(200px, 3fr)', cell: (c) => <span class="uk-mono">{c.jsonPath}</span> },
        ]}
      />
    </Section>
  );
}

/** How many objects of a definition there are (its related field): a link to their page; its kind not served (yet), none said. */
function Objects({ crd }: { crd: CrdObject }) {
  const say = useSay();
  const page = usePage();
  const ref = `${crd.spec.names.plural}.${storedOf(crd)?.name ?? ''}.${crd.spec.group}`;
  const kind = useKind(ref);
  const count = useCount({ kind: ref });
  if (!kind) return <>—</>;
  if (refused(count)) return <RefusedQuietly kind={kind} error={count.error} />;
  return (
    <Ref icon="puzzle" href={page.href(`/k/${ref}`)}>
      {count.total ? say(T.resource.view.api.objects, { count: count.total.count, kind: crd.spec.names.kind }) : '—'}
    </Ref>
  );
}

/** What a hook calls: its service (a link, its path quiet) or its URL. */
function CallsOf({ hook }: { hook: Hook }) {
  const service = hook.clientConfig.service;
  if (!service) return <span class="uk-mono">{hook.clientConfig.url ?? '—'}</span>;
  return (
    <span class="uk-line">
      <ObjectRef kind="v1/Service" name={service.name} namespace={service.namespace} />
      {service.path && <span class="uk-quiet uk-mono">{service.path}</span>}
    </span>
  );
}

/** A webhook configuration's hooks (the core's section): each its name, what it calls, on what (operations, resources), what its failing does. */
export function WebhookHooks({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.api;
  const hooks = (object as Hooks).webhooks ?? [];
  return (
    <Section title={say(t.hooks)} part="hooks">
      <Table
        plain
        rows={hooks}
        rowKey={(h) => h.name}
        columns={[
          { id: 'hook', header: say(t.hook), width: 'minmax(160px, 2fr)', cell: (h) => <span class="uk-mono">{h.name}</span> },
          { id: 'calls', header: say(t.calls), width: 'minmax(160px, 2fr)', cell: (h) => <CallsOf hook={h} /> },
          {
            id: 'on',
            header: say(t.on),
            width: 'minmax(200px, 3fr)',
            cell: (h) => {
              const rules = h.rules ?? [];
              const operations = [...new Set(rules.flatMap((r) => r.operations ?? []))];
              const resources = [...new Set(rules.flatMap((r) => (r.resources ?? []).flatMap((res) => (r.apiGroups ?? ['']).map((g) => (g ? `${g}/${res}` : res)))))];
              return (
                <span class="uk-line">
                  {operations.map((o) => (
                    <Badge key={o}>{o === '*' ? say(t.allOperations) : o}</Badge>
                  ))}
                  <span class="uk-quiet">{resources.join(', ')}</span>
                </span>
              );
            },
          },
          {
            id: 'failing',
            header: say(t.failing),
            width: 'minmax(96px, 1fr)',
            cell: (h) =>
              (h.failurePolicy ?? 'Fail') === 'Fail' ? (
                <Status tone="warn" icon="ban">
                  {say(t.blocks)}
                </Status>
              ) : (
                <span class="uk-quiet">{say(t.ignored)}</span>
              ),
          },
        ]}
      />
    </Section>
  );
}

/** What a certificate signing request asks for (the core's section): whom for, the names, its key (read from it), how long; not read, said so. */
export function Asks({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.api;
  const csr = object as ObjectOf<typeof CertificateSigningRequest>;
  const pem = (() => {
    try {
      return atob(csr.spec.request);
    } catch {
      return '';
    }
  })();
  const asked = parseRequest(pem);
  const mono = (v: string) => <span class="uk-mono">{v}</span>;
  return (
    <Section title={say(t.asks)} part="request">
      {asked ? (
        <KeyValue
          rows={[
            [say(t.subject), mono(asked.subject)],
            ...(asked.names.length ? [[say(t.names), <span class="uk-line">{asked.names.map(mono)}</span>] as [string, ComponentChildren]] : []),
            [say(t.key), asked.key],
            ...(csr.spec.expirationSeconds ? [[say(t.lasts), humanDuration(csr.spec.expirationSeconds * 1000)] as [string, ComponentChildren]] : []),
          ]}
        />
      ) : (
        <Notice level="warn" icon="warning">
          {say(t.notRead)}
        </Notice>
      )}
    </Section>
  );
}

/** An event's message (the core's section, where it has one), as it says it. */
export function Message({ object }: ResourceProps) {
  const say = useSay();
  return (
    <Section title={say(T.resource.view.api.message)} part="message">
      <p>{(object as EventObject).message}</p>
    </Section>
  );
}

/** The API's kinds in the core's view: a definition's versions, columns, objects; an API service's service; a webhook's hooks; what a request asks for; an event's message, what it is about. */
export function addApi(c: KubeContributor): void {
  const t = T.resource.view.api;
  c.add('Fill', 'core.resource.view.crd.versions', section({ kinds: [CustomResourceDefinition], order: 10, render: Versions }));
  c.add(
    'Fill',
    'core.resource.view.crd.columns',
    section({ kinds: [CustomResourceDefinition], order: 20, when: ({ object }) => (storedOf(object)?.additionalPrinterColumns?.length ?? 0) > 0, render: CrdColumns }),
  );
  addRelated<CrdObject>(c, ['crd', CustomResourceDefinition], 'objects', 100, t.objectsOf, (o) => [<Objects crd={o} />, '']);
  addRelated<ObjectOf<typeof APIService>>(c, ['apiservice', APIService], 'service', 100, t.service, (o) =>
    o.spec?.service ? [<ObjectRef kind="v1/Service" name={o.spec.service.name ?? ''} namespace={o.spec.service.namespace} />, o.spec.service.name ?? ''] : undefined,
  );
  c.add(
    'Fill',
    'core.resource.view.webhook.hooks',
    section({ kinds: [ValidatingWebhookConfiguration, MutatingWebhookConfiguration], order: 10, when: ({ object }) => (object.webhooks?.length ?? 0) > 0, render: WebhookHooks }),
  );
  c.add('Fill', 'core.resource.view.csr.request', section({ kinds: [CertificateSigningRequest], order: 10, render: Asks }));
  c.add('Fill', 'core.resource.view.event.message', section({ kinds: [Event], order: 10, when: ({ object }) => !!object.message, render: Message }));
  addRelated<EventObject>(c, ['event', Event], 'about', 100, t.about, (o) => {
    const about = o.involvedObject;
    return about.name ? [<ObjectRef kind={`${about.apiVersion ?? 'v1'}/${about.kind ?? ''}`} name={about.name} namespace={about.namespace} />, about.name] : undefined;
  });
}
