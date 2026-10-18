import { kinds, type ObjectOf } from '@overkube/kube-types';
import { type AltNames, calendarDays, type KubeContributor, parseCertificate, type ResourceProps, type Say, section, shortTime } from '@overkube/sdk';
import { useNotify, useSay } from '@overkube/sdk/preact';
import { Badge, ConfigViewer, type ConfigViewerLabels, KeyValue, Notice, Section, Table, Tip, textOf } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { EMPTY } from '../format.ts';
import { clock, useLive } from '../live.ts';
import { T } from '../texts.ts';

/*
 * A config map's and a secret's own, in their views: their keys (the kit's
 * ConfigViewer: each a file — a secret's hidden till shown), a copy said
 * so; a TLS secret's certificate (read: its dates, names, key), a pull
 * secret's registries (each its user, never its password); the pods that
 * use them among what they are tied to.
 */

const { ConfigMap, Secret } = kinds.core.v1;
type ConfigMapObject = ObjectOf<typeof ConfigMap>;
type SecretObject = ObjectOf<typeof Secret>;

/** The viewer's words in the page's language, and its copy said (a toast). */
function useViewer(): { labels: ConfigViewerLabels; onCopy: (key: string) => void } {
  const say = useSay();
  const notify = useNotify();
  const t = T.resource.view.config;
  return {
    labels: {
      title: say(t.data),
      none: say(t.none),
      copy: say(t.copy),
      show: say(t.show),
      hide: say(t.hide),
      hidden: say(t.hidden),
      binary: say(t.binary),
      more: (lines) => say(t.more, { count: lines }),
      less: say(t.less),
    },
    onCopy: (key) => notify({ level: 'ok', text: say(t.copied, { key }), key: 'core.resource.view.config.copied' }),
  };
}

/** A config map's keys (the core's sections): its data and binary data. */
export function ConfigData({ object }: ResourceProps) {
  const cm = object as ConfigMapObject;
  return <ConfigViewer data={cm.data} binary={cm.binaryData} part="data" {...useViewer()} />;
}

/** A secret's keys (the core's sections): its data, base64, each hidden till shown. */
export function SecretData({ object }: ResourceProps) {
  return <ConfigViewer data={(object as SecretObject).data} base64 secret part="data" {...useViewer()} />;
}

/** A secret's value as text (base64 read); none, or not text: undefined. */
const secretText = (secret: SecretObject, key: string) => {
  const v = secret.data?.[key];
  return v === undefined ? undefined : textOf(v);
};

/** Its subject alternative names, a row a type (DNS Names, IP Addresses, Email Addresses, URIs) — as cert-manager's spec names them. */
export function namesRows(say: Say, names: AltNames): [string, ComponentChildren][] {
  const t = T.resource.view.config;
  return (
    [
      [t.dnsNames, names.dns],
      [t.ipAddresses, names.ip],
      [t.emailAddresses, names.email],
      [t.uris, names.uri],
    ] as const
  ).flatMap(([label, values]) =>
    values.length
      ? [
          [
            say(label),
            <span class="uk-line">
              {values.map((n, i) => (
                <span key={`${i}:${n}`} class="uk-mono">
                  {n}
                </span>
              ))}
            </span>,
          ] as [string, ComponentChildren],
        ]
      : [],
  );
}

/** A TLS secret's certificate (the core's section, where it has one): valid till (how long left, as a badge), from; whom of and by; its names, key, serial, its chain. Not read: said so. */
export function CertificateOf({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.config;
  const pem = secretText(object as SecretObject, 'tls.crt') ?? '';
  const cert = useMemo(() => parseCertificate(pem), [pem]);
  // Days left, live (as the page's calendar has them; ended: none), drawn again once a day, not each second.
  const days = useLive(() => (cert ? (cert.notAfter <= clock.value ? -1 : calendarDays(cert.notAfter, clock.value)) : 0), [cert]);
  if (!cert)
    return (
      <Section title={say(t.certificate)} part="certificate">
        <Notice level="warn" icon="warning">
          {say(t.notRead)}
        </Notice>
      </Section>
    );
  const day = (ms: number) => <Tip content={() => new Date(ms).toISOString()}>{shortTime(ms).slice(0, 10)}</Tip>;
  const mono = (v: string) => <span class="uk-mono">{v}</span>;
  return (
    <Section title={say(t.certificate)} part="certificate">
      <KeyValue
        rows={[
          [
            say(t.validTill),
            <span class="uk-line">
              {day(cert.notAfter)}
              <Badge level={days < 0 ? 'error' : days <= 30 ? 'warn' : 'ok'}>{days < 0 ? say(t.expired) : say(t.daysLeft, { count: days })}</Badge>
            </span>,
          ],
          [say(t.validFrom), day(cert.notBefore)],
          [say(t.subject), mono(cert.subject || EMPTY)],
          [say(t.issuer), mono(cert.issuer || EMPTY)],
          ...namesRows(say, cert.names),
          [say(t.key), cert.key],
          [say(t.serial), mono(cert.serial)],
          ...(cert.chain ? [[say(t.chain), say(t.chainMore, { count: cert.chain })] as [string, ComponentChildren]] : []),
        ]}
      />
    </Section>
  );
}

/** The registries a pull secret logs in to (its .dockerconfigjson's or .dockercfg's): each its user — its password never shown, only whether it has one. */
export function registriesOf(secret: SecretObject): { registry: string; user?: string; password: boolean }[] | undefined {
  const json = secretText(secret, '.dockerconfigjson') ?? secretText(secret, '.dockercfg');
  if (json === undefined) return undefined;
  try {
    const config = JSON.parse(json) as Record<string, unknown>;
    const auths = (secret.type === 'kubernetes.io/dockercfg' ? config : config.auths) as Record<string, { username?: string; password?: string; auth?: string }> | undefined;
    return Object.entries(auths ?? {}).map(([registry, a]) => {
      // Its auth: base64 of user:password.
      const pair = a.auth ? (textOf(a.auth) ?? '') : '';
      const colon = pair.indexOf(':');
      const user = a.username ?? (colon >= 0 ? pair.slice(0, colon) : undefined);
      return { registry, ...(user ? { user } : {}), password: !!a.password || (colon >= 0 && colon < pair.length - 1) };
    });
  } catch {
    return undefined;
  }
}

/** A pull secret's registries (the core's section): each its user, whether it has a password (never it). Not read: said so. */
export function Registries({ object }: ResourceProps) {
  const say = useSay();
  const t = T.resource.view.config;
  const registries = registriesOf(object as SecretObject);
  return (
    <Section title={say(t.registries)} part="registries">
      {registries === undefined ? (
        <Notice level="warn" icon="warning">
          {say(t.notJson)}
        </Notice>
      ) : (
        <Table
          plain
          rows={registries}
          rowKey={(r) => r.registry}
          columns={[
            { id: 'registry', header: say(t.registry), width: 'minmax(160px, 2fr)', cell: (r) => <span class="uk-mono">{r.registry}</span> },
            { id: 'user', header: say(t.user), width: 'minmax(96px, 1fr)', cell: (r) => (r.user ? <span class="uk-mono">{r.user}</span> : '—') },
            { id: 'password', header: say(t.password), width: 'minmax(96px, 1fr)', cell: (r) => <span class="uk-quiet">{say(r.password ? t.passwordSet : t.passwordNone)}</span> },
          ]}
        />
      )}
    </Section>
  );
}

const PULL = new Set(['kubernetes.io/dockerconfigjson', 'kubernetes.io/dockercfg']);

/** A config map's and a secret's in the core's view: their keys; the pods that use them. */
export function addConfig(c: KubeContributor): void {
  c.add('Fill', 'core.resource.view.config.data', section({ kinds: [ConfigMap], order: 10, render: ConfigData }));
  c.add('Fill', 'core.resource.view.secret.data', section({ kinds: [Secret], order: 10, render: SecretData }));
  c.add(
    'Fill',
    'core.resource.view.secret.certificate',
    section({ kinds: [Secret], order: 5, when: ({ object }) => object.data?.['tls.crt'] !== undefined, render: CertificateOf }),
  );
  c.add('Fill', 'core.resource.view.secret.registries', section({ kinds: [Secret], order: 5, when: ({ object }) => PULL.has(object.type ?? ''), render: Registries }));
}
