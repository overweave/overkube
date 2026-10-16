import { kinds } from '@overkube/kube-types';
import { cleanup, fakeCluster, kubeWorld, make } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { fireEvent } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSR_PEM, EC_PEM, RSA_PEM } from '../certs.fixture.ts';
import core from '../index.tsx';
import { registriesOf } from './config.tsx';
import { linesOf } from './rbac.tsx';
import { metricOf } from './scaling.tsx';
import { picks } from './shared.tsx';
import { sourceOf } from './storage.tsx';

/*
 * The rest of the core's kinds opened, as their user sees them: config maps
 * and secrets (their keys as files, copied, a secret's hidden), ingresses
 * and network policies (their rules), roles, bindings, service accounts,
 * claims, volumes, storage classes, autoscalers, budgets, namespaces.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const { Pod, Namespace, ConfigMap, Secret, Service, ServiceAccount, PersistentVolumeClaim, PersistentVolume, ResourceQuota, LimitRange } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;
const { Ingress, NetworkPolicy } = kinds.networking.v1;
const { ClusterRole, RoleBinding } = kinds.rbac.v1;
const { StorageClass } = kinds.storage.v1;
const { HorizontalPodAutoscaler } = kinds.autoscaling.v2;
const { PodDisruptionBudget } = kinds.policy.v1;

function world() {
  const w = kubeWorld();
  w.cluster.add(Namespace, make(Namespace, { metadata: { name: 'shop' } }));
  w.addon(core);
  return w;
}

const b64 = (text: string) => btoa(text);
const opened = () => document.querySelector('.uk-modal') as HTMLElement;
const part = (name: string) => opened().querySelector(`[data-part="${name}"]`) as HTMLElement | null;
const parts = (name: string) => [...opened().querySelectorAll(`[data-part="${name}"]`)] as HTMLElement[];
const rows = (el: Element | null) =>
  [...(el?.querySelectorAll('[role="rowgroup"] [role="row"]') ?? [])].map((r) => [...r.querySelectorAll('[role="cell"]')].map((c) => c.textContent));
const pairs = (el: Element | null) => [...(el?.querySelectorAll('dt') ?? [])].map((d) => [d.textContent, d.nextElementSibling?.textContent]);
const related = () => pairs(part('related'));
const button = (el: Element | null | undefined, text: string) => [...(el?.querySelectorAll('button') ?? [])].find((b) => b.textContent === text) as HTMLButtonElement;
/** A pod in shop using these (its volumes, its account). */
const user = (name: string, spec: object) => make(Pod, { metadata: { name, namespace: 'shop' }, spec: { containers: [{ name: 'a' }], ...spec } });

describe('a config map and a secret', () => {
  it('shows a config map’s keys as files (by name; binary said so), copies one — said so; the pods that use it', async () => {
    const written: string[] = [];
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (t: string) => void written.push(t) } });
    const w = world();
    w.cluster.add(ConfigMap, make(ConfigMap, { metadata: { name: 'web', namespace: 'shop' }, data: { 'z.conf': 'zz', 'a.conf': 'port 80\n' }, binaryData: { logo: b64('png') } }));
    w.cluster.add(Pod, user('web-1', { volumes: [{ name: 'c', configMap: { name: 'web' } }] }));
    w.cluster.add(Pod, user('other', {}));
    const page = renderPage(w, '/k/configmaps.v1?open=configmaps.v1/shop/web');
    const files = parts('data');
    expect(
      files.map((f) => [
        f.querySelector('.uk-file-head b')?.textContent,
        f.querySelector('.uk-file-head .uk-quiet')?.textContent,
        f.querySelector('.uk-code, .uk-file-instead')?.textContent,
      ]),
    ).toEqual([
      ['a.conf', '8 B', 'port 80'],
      ['logo', '3 B', 'Binary data'],
      ['z.conf', '2 B', 'zz'],
    ]);
    await page.act(async () => button(files[0], 'Copy').click());
    expect(written).toEqual(['port 80\n']);
    await expect.poll(() => page.notifications().map((n) => n.text)).toContain('Copied a.conf');
    expect(related()).toEqual([['Used by', 'web-1']]);
  });

  it('says a config map with no keys has none', () => {
    const w = world();
    w.cluster.add(ConfigMap, make(ConfigMap, { metadata: { name: 'empty', namespace: 'shop' } }));
    renderPage(w, '/k/configmaps.v1?open=configmaps.v1/shop/empty');
    expect(part('data')?.querySelector('.uk-nothing')?.textContent).toBe('No data.');
  });

  it('hides a secret’s values till shown, copies one without showing it; binary has neither', async () => {
    const written: string[] = [];
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (t: string) => void written.push(t) } });
    const w = world();
    w.cluster.add(Secret, make(Secret, { metadata: { name: 'keys', namespace: 'shop' }, data: { token: b64('s3cret'), blob: btoa(String.fromCharCode(0xff)) } }));
    const page = renderPage(w, '/k/secrets.v1?open=secrets.v1/shop/keys');
    const [blob, token] = parts('data');
    expect([token?.textContent?.includes('s3cret'), token?.querySelector('.uk-file-instead')?.textContent, blob?.querySelectorAll('button').length]).toEqual([false, 'Hidden', 0]);
    await page.act(async () => button(token, 'Copy').click());
    expect([written, token?.textContent?.includes('s3cret')]).toEqual([['s3cret'], false]);
    page.act(() => button(token, 'Show').click());
    expect([token?.querySelector('.uk-code')?.textContent, !!button(token, 'Hide')]).toEqual(['s3cret', true]);
  });
});

describe('a TLS secret and a pull secret', () => {
  it('shows a TLS secret’s certificate: valid till (how long left), from; whom of and by; its names, key, serial, its chain', () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-01T00:00:00Z'), toFake: ['Date'] });
    const w = world();
    const tls = (name: string, crt: string) =>
      make(Secret, { metadata: { name, namespace: 'shop' }, type: 'kubernetes.io/tls', data: { 'tls.crt': b64(crt), 'tls.key': b64('k') } });
    w.cluster.add(Secret, tls('shop', EC_PEM));
    w.cluster.add(Secret, tls('soon', `${RSA_PEM}\n${EC_PEM}`));
    w.cluster.add(Secret, tls('odd', 'not a certificate'));
    const page = renderPage(w, '/k/secrets.v1?open=secrets.v1/shop/shop');
    expect(pairs(part('certificate'))).toEqual([
      ['Not after', '2036-10-123633 days left'],
      ['Not before', '2026-10-15'],
      ['Subject', 'CN=shop.example.com, O=Acme Test, C=US'],
      ['Issuer', 'CN=shop.example.com, O=Acme Test, C=US'],
      ['Subject Alternative Names', 'shop.example.comwww.shop.example.com10.0.0.1'],
      ['Public key', 'ECDSA P-256'],
      ['Serial', '04:a1:9c:3e'],
    ]);
    expect(part('certificate')?.querySelector('.uk-badge')?.getAttribute('data-level')).toBe('ok');
    page.navigate('/k/secrets.v1?open=secrets.v1/shop/soon');
    const soon = Object.fromEntries(pairs(part('certificate')));
    expect([soon['Not after'], soon['Public key'], soon.Chain, part('certificate')?.querySelector('.uk-badge')?.getAttribute('data-level')]).toEqual([
      '2026-11-1413 days left',
      'RSA 2048',
      '1 intermediate certificate',
      'warn',
    ]);
    page.navigate('/k/secrets.v1?open=secrets.v1/shop/odd');
    expect(part('certificate')?.textContent).toContain('Failed to parse tls.crt.');
    vi.useRealTimers();
  });

  it('reads a pull secret’s registries: each its user (said, or in its auth) — its password never, only whether it has one', () => {
    const pull = (config: object, type = 'kubernetes.io/dockerconfigjson', key = '.dockerconfigjson') =>
      make(Secret, { metadata: { name: 'pull' }, type, data: { [key]: b64(JSON.stringify(config)) } });
    expect(
      registriesOf(pull({ auths: { 'ghcr.io': { username: 'bot', password: 'p' }, 'registry-1.docker.io': { auth: b64('acme:secret') }, 'quay.io': { auth: b64('anon:') } } })),
    ).toEqual([
      { registry: 'ghcr.io', user: 'bot', password: true },
      { registry: 'registry-1.docker.io', user: 'acme', password: true },
      { registry: 'quay.io', user: 'anon', password: false },
    ]);
    expect(registriesOf(pull({ 'old.io': { auth: b64('u:p') } }, 'kubernetes.io/dockercfg', '.dockercfg'))).toEqual([{ registry: 'old.io', user: 'u', password: true }]);
    expect(registriesOf(make(Secret, { metadata: { name: 'x' }, data: { '.dockerconfigjson': b64('{') } }))).toBeUndefined();
  });

  it('shows a pull secret’s registries as a table, no password in it', () => {
    const w = world();
    w.cluster.add(
      Secret,
      make(Secret, {
        metadata: { name: 'pull', namespace: 'shop' },
        type: 'kubernetes.io/dockerconfigjson',
        data: { '.dockerconfigjson': b64(JSON.stringify({ auths: { 'ghcr.io': { username: 'bot', password: 'hunter2' } } })) },
      }),
    );
    renderPage(w, '/k/secrets.v1?open=secrets.v1/shop/pull');
    expect(rows(part('registries'))).toEqual([['ghcr.io', 'bot', 'set']]);
    expect(part('registries')?.textContent).not.toContain('hunter2');
  });
});

describe('an ingress and a network policy', () => {
  it('shows an ingress’s rules (each host and path to its service and port — one not there said so), its TLS, its default backend', () => {
    const w = world();
    for (const name of ['api', 'web']) w.cluster.add(Service, make(Service, { metadata: { name, namespace: 'shop' } }));
    w.cluster.add(
      Ingress,
      make(Ingress, {
        metadata: { name: 'shop', namespace: 'shop' },
        spec: {
          defaultBackend: { service: { name: 'fallback', port: { number: 80 } } },
          tls: [{ hosts: ['shop.example.com'], secretName: 'tls' }],
          rules: [
            { host: 'shop.example.com', http: { paths: [{ path: '/api', pathType: 'Prefix', backend: { service: { name: 'api', port: { name: 'http' } } } }] } },
            { http: { paths: [{ path: '/', pathType: 'Exact', backend: { service: { name: 'web', port: { number: 80 } } } }] } },
            { http: { paths: [{ path: '/admin', pathType: 'Prefix', backend: { service: { name: 'admin', port: { number: 80 } } } }] } },
          ],
        },
      }),
    );
    renderPage(w, '/k/ingresses.v1.networking.k8s.io?open=ingresses.v1.networking.k8s.io/shop/shop');
    expect(rows(part('rules'))).toEqual([
      ['shop.example.com', '/api (Prefix)', 'api', 'http'],
      ['*', '/ (Exact)', 'web', '80'],
      ['*', '/admin (Prefix)', 'Service admin not found', '80'],
    ]);
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(part('rules')?.querySelector('.uk-status') as HTMLElement);
    expect(document.querySelector('.uk-tip')?.textContent).toBe('Service shop/admin not found: requests to this path return 503');
    expect([pairs(part('tls')), related()]).toEqual([[['shop.example.com', 'Secrettls']], [['Default backend', 'fallback']]]);
  });

  it('shows a network policy’s rules (each peer — pods, namespaces, an IP block, anyone — its direction and ports), a direction with none denied', () => {
    const w = world();
    w.cluster.add(
      NetworkPolicy,
      make(NetworkPolicy, {
        metadata: { name: 'api', namespace: 'shop' },
        spec: {
          podSelector: { matchLabels: { app: 'api' } },
          policyTypes: ['Ingress', 'Egress'],
          ingress: [
            {
              from: [{ podSelector: { matchLabels: { app: 'web' } } }, { ipBlock: { cidr: '10.0.0.0/8', except: ['10.1.0.0/16'] } }],
              ports: [{ port: 8080 }, { port: 9000, endPort: 9010, protocol: 'UDP' }],
            },
            { from: [{ namespaceSelector: {} }] },
            {},
          ],
        },
      }),
    );
    renderPage(w, '/k/networkpolicies.v1.networking.k8s.io?open=networkpolicies.v1.networking.k8s.io/shop/api');
    expect(rows(part('rules'))).toEqual([
      ['Podsappweb', 'Ingress', '8080/TCP, 9000-9010/UDP'],
      ['IP block10.0.0.0/8 except 10.1.0.0/16', 'Ingress', '8080/TCP, 9000-9010/UDP'],
      ['Namespacesall pods', 'Ingress', 'Any'],
      ['Any', 'Ingress', 'Any'],
    ]);
    expect(part('rules')?.querySelector('.uk-nothing')?.textContent).toBe('All egress traffic denied.');
    expect(related()).toEqual([['Selector', 'appapi']]);
  });
});

describe('roles, bindings, service accounts', () => {
  const role = make(ClusterRole, {
    metadata: { name: 'reader' },
    rules: [
      { apiGroups: ['', 'apps'], resources: ['deployments'], verbs: ['get'] },
      { apiGroups: [''], resources: ['configmaps'], resourceNames: ['a', 'b'], verbs: ['*'] },
      { nonResourceURLs: ['/healthz'], verbs: ['get'] },
    ],
  });

  it('reads a role’s rules as lines: each resource of each group, each URL', () => {
    expect(linesOf(role).map((l) => [l.resource, l.group, l.only, l.url, l.verbs])).toEqual([
      ['deployments', '', undefined, undefined, ['get']],
      ['deployments', 'apps', undefined, undefined, ['get']],
      ['configmaps', '', ['a', 'b'], undefined, ['*']],
      ['/healthz', undefined, undefined, true, ['get']],
    ]);
  });

  it('shows a role’s rules: its group and names quiet, its verbs as badges (all: a warning); none, said so', () => {
    const w = world();
    w.cluster.add(ClusterRole, role);
    w.cluster.add(ClusterRole, make(ClusterRole, { metadata: { name: 'empty' } }));
    const page = renderPage(w, '/k/clusterroles.v1.rbac.authorization.k8s.io?open=clusterroles.v1.rbac.authorization.k8s.io/reader');
    expect(rows(part('rules'))).toEqual([
      ['deployments', 'get'],
      ['deploymentsapps', 'get'],
      ['configmapsresourceNames: a, b', 'All verbs'],
      ['/healthzURL', 'get'],
    ]);
    expect(part('rules')?.querySelector('.uk-badge[data-level="warn"]')?.textContent).toBe('All verbs');
    page.navigate('/k/clusterroles.v1.rbac.authorization.k8s.io?open=clusterroles.v1.rbac.authorization.k8s.io/empty');
    expect(part('rules')?.querySelector('.uk-nothing')).not.toBeNull();
  });

  it('shows a binding’s subjects (a service account a link) and its role', () => {
    const w = world();
    w.cluster.add(
      RoleBinding,
      make(RoleBinding, {
        metadata: { name: 'b', namespace: 'shop' },
        roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'reader' },
        subjects: [
          { kind: 'ServiceAccount', name: 'api', namespace: 'shop' },
          { kind: 'Group', name: 'devs' },
          { kind: 'User', name: 'jane' },
        ],
      }),
    );
    renderPage(w, '/k/rolebindings.v1.rbac.authorization.k8s.io?open=rolebindings.v1.rbac.authorization.k8s.io/shop/b');
    expect(rows(part('subjects'))).toEqual([
      ['api', 'ServiceAccount · shop'],
      ['devs', 'Group'],
      ['jane', 'User'],
    ]);
    expect(part('subjects')?.querySelector('a')?.getAttribute('href')).toContain('open=serviceaccounts.v1/shop/api');
    expect(related()).toEqual([['Role', 'ClusterRolereader']]);
  });

  it('shows an aggregated cluster role’s sources: the roles its selectors pick, each how many rules; none, said so', () => {
    const w = world();
    const role = (name: string, labels: Record<string, string>, rules: number) =>
      make(ClusterRole, { metadata: { name, labels }, rules: Array.from({ length: rules }, () => ({ apiGroups: [''], resources: ['pods'], verbs: ['get'] })) });
    w.cluster.add(ClusterRole, { ...role('view', {}, 2), aggregationRule: { clusterRoleSelectors: [{ matchLabels: { 'aggregate-to-view': 'true' } }] } });
    w.cluster.add(ClusterRole, role('flux-view', { 'aggregate-to-view': 'true' }, 3));
    w.cluster.add(ClusterRole, role('edit', { 'aggregate-to-edit': 'true' }, 5));
    w.cluster.add(ClusterRole, { ...role('lonely', {}, 0), aggregationRule: { clusterRoleSelectors: [{ matchLabels: { nobody: 'true' } }] } });
    const page = renderPage(w, '/k/clusterroles.v1.rbac.authorization.k8s.io?open=clusterroles.v1.rbac.authorization.k8s.io/view');
    expect(rows(part('aggregation'))).toEqual([['flux-view', '3']]);
    page.navigate('/k/clusterroles.v1.rbac.authorization.k8s.io?open=clusterroles.v1.rbac.authorization.k8s.io/flux-view');
    expect(part('aggregation')).toBeNull();
    page.navigate('/k/clusterroles.v1.rbac.authorization.k8s.io?open=clusterroles.v1.rbac.authorization.k8s.io/lonely');
    expect(part('aggregation')?.querySelector('.uk-nothing')?.textContent).toBe('No ClusterRoles match the aggregation rule.');
  });

  it('shows a service account’s pull secrets, its token secrets (as before tokens were projected) and the pods that run as it', () => {
    const w = world();
    w.cluster.add(ServiceAccount, make(ServiceAccount, { metadata: { name: 'api', namespace: 'shop' }, imagePullSecrets: [{ name: 'pull' }], secrets: [{ name: 'api-token' }] }));
    w.cluster.add(Pod, user('api-1', { serviceAccountName: 'api' }));
    w.cluster.add(Pod, user('web-1', { serviceAccountName: 'web' }));
    renderPage(w, '/k/serviceaccounts.v1?open=serviceaccounts.v1/shop/api');
    expect(related()).toEqual([
      ['Pull secrets', 'pull'],
      ['Token secrets', 'api-token'],
      ['Used by', 'api-1'],
    ]);
  });
});

describe('storage', () => {
  it('reads where a volume is: a path, a server and path, a driver and handle; another sort by its name', () => {
    const v = (spec: object) => make(PersistentVolume, { metadata: { name: 'v' }, spec: { capacity: { storage: '1Gi' }, ...spec } });
    expect([
      sourceOf(v({ hostPath: { path: '/data' } })),
      sourceOf(v({ nfs: { server: 'nas', path: '/x' } })),
      sourceOf(v({ csi: { driver: 'ebs', volumeHandle: 'vol-1' } })),
      sourceOf(v({ iscsi: { targetPortal: 'p', iqn: 'q', lun: 0 } })),
    ]).toEqual([
      ['hostPath', [['path', '/data']]],
      [
        'nfs',
        [
          ['server', 'nas'],
          ['path', '/x'],
        ],
      ],
      [
        'csi',
        [
          ['driver', 'ebs'],
          ['handle', 'vol-1'],
        ],
      ],
      ['iscsi', []],
    ]);
  });

  it('shows a claim not bound yet; bound, its volume, class and the pods that mount it', () => {
    const w = world();
    w.cluster.add(
      PersistentVolumeClaim,
      make(PersistentVolumeClaim, { metadata: { name: 'cache', namespace: 'shop' }, spec: { storageClassName: 'fast' }, status: { phase: 'Pending' } }),
    );
    w.cluster.add(
      PersistentVolumeClaim,
      make(PersistentVolumeClaim, { metadata: { name: 'data', namespace: 'shop' }, spec: { storageClassName: 'fast', volumeName: 'pv-1' }, status: { phase: 'Bound' } }),
    );
    w.cluster.add(Pod, user('db-0', { volumes: [{ name: 'd', persistentVolumeClaim: { claimName: 'data' } }] }));
    const page = renderPage(w, '/k/persistentvolumeclaims.v1?open=persistentvolumeclaims.v1/shop/cache');
    expect(part('volume')?.textContent).toContain('Pending: not bound to a volume.');
    page.navigate('/k/persistentvolumeclaims.v1?open=persistentvolumeclaims.v1/shop/data');
    expect([part('volume'), related()]).toEqual([
      null,
      [
        ['Bound to', 'pv-1'],
        ['Storage class', 'fast'],
        ['Used by', 'db-0'],
      ],
    ]);
  });

  it('shows a volume’s source and the nodes it may be used on, its claim and class', () => {
    const w = world();
    w.cluster.add(
      PersistentVolume,
      make(PersistentVolume, {
        metadata: { name: 'pv-1' },
        spec: {
          capacity: { storage: '1Gi' },
          storageClassName: 'fast',
          claimRef: { name: 'data', namespace: 'shop' },
          local: { path: '/mnt/disk' },
          nodeAffinity: { required: { nodeSelectorTerms: [{ matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values: ['n1'] }] }] } },
        },
      }),
    );
    renderPage(w, '/k/persistentvolumes.v1?open=persistentvolumes.v1/pv-1');
    expect([pairs(part('source')), related()]).toEqual([
      [
        ['Type', 'local'],
        ['Path', '/mnt/disk'],
        ['Node affinity', 'kubernetes.io/hostname in (n1)'],
      ],
      [
        ['Claimed by', 'PVCdata'],
        ['Storage class', 'fast'],
      ],
    ]);
  });

  it('shows a storage class’s parameters (none: said so), mount options, topologies, how many claims are of it', () => {
    const w = world();
    w.cluster.add(
      StorageClass,
      make(StorageClass, {
        metadata: { name: 'fast' },
        provisioner: 'ebs',
        parameters: { type: 'gp3' },
        mountOptions: ['noatime'],
        allowedTopologies: [{ matchLabelExpressions: [{ key: 'zone', values: ['a', 'b'] }] }],
      }),
    );
    w.cluster.add(StorageClass, make(StorageClass, { metadata: { name: 'plain' }, provisioner: 'local' }));
    for (const name of ['x', 'y']) w.cluster.add(PersistentVolumeClaim, make(PersistentVolumeClaim, { metadata: { name, namespace: 'shop' }, spec: { storageClassName: 'fast' } }));
    const page = renderPage(w, '/k/storageclasses.v1.storage.k8s.io?open=storageclasses.v1.storage.k8s.io/fast');
    expect([pairs(part('parameters')), part('mount')?.querySelector('.uk-badge')?.textContent, pairs(part('topology')), related()]).toEqual([
      [['type', 'gp3']],
      'noatime',
      [['zone', 'a, b']],
      [['PersistentVolumeClaims', '2 claims']],
    ]);
    page.navigate('/k/storageclasses.v1.storage.k8s.io?open=storageclasses.v1.storage.k8s.io/plain');
    expect([part('parameters')?.querySelector('.uk-nothing')?.textContent, part('mount'), part('topology')]).toEqual(['No parameters (provisioner defaults).', null, null]);
  });
});

describe('autoscalers, budgets, namespaces', () => {
  it('reads a metric now against its target: a share of requests, a value; not known yet', () => {
    expect(
      metricOf({ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } } }, [
        { type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 35 } } },
      ]),
    ).toEqual({ id: 'Resource/cpu', name: 'cpu', share: true, target: '70%', now: '35%', part: 0.5 });
    expect(metricOf({ type: 'Pods', pods: { metric: { name: 'rps' }, target: { type: 'AverageValue', averageValue: '100' } } }, [])).toEqual({
      id: 'Pods/rps/[[],[]]',
      name: 'rps',
      share: false,
      target: '100',
    });
    // Two of one name, told apart by their selectors' expressions (labels in any order).
    const external = (expressions: object[], labels: Record<string, string>, value?: string) => ({
      type: 'External' as const,
      external: {
        metric: { name: 'queue', selector: { matchLabels: labels, matchExpressions: expressions as never } },
        ...(value ? { current: { value } } : { target: { type: 'Value' as const, value: '50' } }),
      },
    });
    const current = [
      external([{ key: 'q', operator: 'In', values: ['a'] }], { b: '1', a: '2' }, '90'),
      external([{ key: 'q', operator: 'In', values: ['b'] }], { a: '2', b: '1' }, '10'),
    ];
    expect([
      metricOf(external([{ key: 'q', operator: 'In', values: ['a'] }], { a: '2', b: '1' }) as never, current as never).now,
      metricOf(external([{ key: 'q', operator: 'In', values: ['b'] }], { a: '2', b: '1' }) as never, current as never).now,
    ]).toEqual(['90', '10']);
    // Two containers' CPU: each its own, by its container.
    const of = (container: string) => ({
      type: 'ContainerResource' as const,
      containerResource: { name: 'cpu', container, target: { type: 'Utilization' as const, averageUtilization: 50 } },
    });
    const now = (container: string, at: number) => ({ type: 'ContainerResource' as const, containerResource: { name: 'cpu', container, current: { averageUtilization: at } } });
    expect([of('app'), of('proxy')].map((m) => metricOf(m, [now('app', 90), now('proxy', 10)])).map((m) => [m.name, m.now])).toEqual([
      ['cpu · app', '90%'],
      ['cpu · proxy', '10%'],
    ]);
  });

  it('shows an autoscaler’s metrics (a share a meter, a value in words) and what it scales; a budget’s pods', () => {
    const w = world();
    w.cluster.add(
      HorizontalPodAutoscaler,
      make(HorizontalPodAutoscaler, {
        metadata: { name: 'api', namespace: 'shop' },
        spec: {
          scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'api' },
          maxReplicas: 5,
          metrics: [
            { type: 'Resource', resource: { name: 'memory', target: { type: 'Utilization', averageUtilization: 80 } } },
            { type: 'Pods', pods: { metric: { name: 'rps' }, target: { type: 'AverageValue', averageValue: '100' } } },
          ],
        },
        status: { desiredReplicas: 2, currentMetrics: [{ type: 'Resource', resource: { name: 'memory', current: { averageUtilization: 96 } } }] },
      }),
    );
    w.cluster.add(PodDisruptionBudget, make(PodDisruptionBudget, { metadata: { name: 'api', namespace: 'shop' }, spec: { selector: { matchLabels: { app: 'api' } } } }));
    const page = renderPage(w, '/k/horizontalpodautoscalers.v2.autoscaling?open=horizontalpodautoscalers.v2.autoscaling/shop/api');
    const meter = part('metrics')?.querySelector('.uk-meter') as HTMLElement;
    expect([
      meter.querySelector('dt')?.textContent,
      meter.querySelector('.uk-meter-said')?.textContent,
      meter.querySelector('.uk-meter-track')?.getAttribute('data-level'),
    ]).toEqual(['memory utilization', '96% (target 80%)', 'error']);
    expect([pairs(part('metrics')?.querySelector('.uk-kv') ?? null), related()]).toEqual([[['rps', '<unknown> (target 100)']], [['Scale target', 'Deploymentapi']]]);
    page.navigate('/k/poddisruptionbudgets.v1.policy?open=poddisruptionbudgets.v1.policy/shop/api');
    expect(related()).toEqual([['Selector', 'appapi']]);
  });

  it('shows how an autoscaler scales each way: how long it waits, at most how much a while, which it picks — the API’s defaults where none said', () => {
    const w = world();
    const target = { apiVersion: 'apps/v1', kind: 'Deployment', name: 'api' };
    w.cluster.add(HorizontalPodAutoscaler, make(HorizontalPodAutoscaler, { metadata: { name: 'api', namespace: 'shop' }, spec: { scaleTargetRef: target, maxReplicas: 5 } }));
    w.cluster.add(
      HorizontalPodAutoscaler,
      make(HorizontalPodAutoscaler, {
        metadata: { name: 'slow', namespace: 'shop' },
        spec: {
          scaleTargetRef: target,
          maxReplicas: 5,
          behavior: { scaleDown: { stabilizationWindowSeconds: 600, policies: [{ type: 'Pods', value: 1, periodSeconds: 60 }], selectPolicy: 'Disabled' } },
        },
      }),
    );
    const page = renderPage(w, '/k/horizontalpodautoscalers.v2.autoscaling?open=horizontalpodautoscalers.v2.autoscaling/shop/api');
    expect(rows(part('behaviour'))).toEqual([
      ['Scale up', '0scontroller default', '+100% per 15sor +4 pods per 15s', 'Max'],
      ['Scale down', '300scontroller default', '−100% per 15s', 'Max'],
    ]);
    page.navigate('/k/horizontalpodautoscalers.v2.autoscaling?open=horizontalpodautoscalers.v2.autoscaling/shop/slow');
    expect(rows(part('behaviour'))[1]).toEqual(['Scale down', '600s', '−1 pods per 60s', 'Disabled']);
  });

  it('shows a namespace’s quotas, used of allowed; none, said so', () => {
    const w = world();
    w.cluster.add(Namespace, make(Namespace, { metadata: { name: 'free' } }));
    w.cluster.add(
      ResourceQuota,
      make(ResourceQuota, { metadata: { name: 'q', namespace: 'shop' }, status: { hard: { pods: '10', 'requests.cpu': '2' }, used: { pods: '9', 'requests.cpu': '500m' } } }),
    );
    const page = renderPage(w, '/k/namespaces.v1?open=namespaces.v1/shop');
    expect([...(part('quota')?.querySelectorAll('.uk-meter') ?? [])].map((m) => [m.querySelector('dt')?.textContent, m.querySelector('.uk-meter-said')?.textContent])).toEqual([
      ['pods', '9 of 10'],
      ['requests.cpu', '500m of 2'],
    ]);
    page.navigate('/k/namespaces.v1?open=namespaces.v1/free');
    expect(part('quota')?.querySelector('.uk-nothing')?.textContent).toBe('No resource quota.');
  });

  it('shows what is in a namespace: each usual kind there is any of, how many, those not well by state; nothing, said so', () => {
    const w = world();
    w.cluster.add(Namespace, make(Namespace, { metadata: { name: 'free' } }));
    const pod = (name: string, phase: 'Running' | 'Pending') => make(Pod, { metadata: { name, namespace: 'shop' }, spec: { containers: [] }, status: { phase } });
    w.cluster.add(Pod, pod('a', 'Running'));
    w.cluster.add(Pod, pod('b', 'Running'));
    w.cluster.add(Pod, pod('c', 'Pending'));
    const stuck = { conditions: [{ type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded' }] };
    w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'web', namespace: 'shop' }, spec: { selector: {}, template: {} }, status: stuck } as never));
    // Still coming up: not unwell.
    w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'new', namespace: 'shop' }, spec: { selector: {}, template: {} } }));
    w.cluster.add(ConfigMap, make(ConfigMap, { metadata: { name: 'web', namespace: 'shop' } }));
    const page = renderPage(w, '/k/namespaces.v1?open=namespaces.v1/shop');
    expect(rows(part('contents'))).toEqual([
      ['Pod', '3', '1 Pending'],
      ['Deployment', '2', '1 Degraded'],
      ['ConfigMap', '1', '—'],
    ]);
    page.navigate('/k/namespaces.v1?open=namespaces.v1/free');
    expect(part('contents')?.querySelector('.uk-nothing')?.textContent).toBe('No resources.');
  });

  it('shows a namespace’s limit ranges (each kind of thing and resource: defaults, bounds) — none, nothing', () => {
    const w = world();
    w.cluster.add(Namespace, make(Namespace, { metadata: { name: 'free' } }));
    w.cluster.add(
      LimitRange,
      make(LimitRange, {
        metadata: { name: 'defaults', namespace: 'shop' },
        spec: {
          limits: [
            { type: 'Container', defaultRequest: { cpu: '100m', memory: '128Mi' }, default: { cpu: '500m', memory: '512Mi' }, max: { memory: '4Gi' } },
            { type: 'PersistentVolumeClaim', min: { storage: '1Gi' } },
          ],
        },
      }),
    );
    const page = renderPage(w, '/k/namespaces.v1?open=namespaces.v1/shop');
    expect(rows(part('limits'))).toEqual([
      ['cpuContainer', '100m', '500m', '—', '—'],
      ['memoryContainer', '128Mi', '512Mi', '—', '4Gi'],
      ['storagePersistentVolumeClaim', '—', '—', '1Gi', '—'],
    ]);
    page.navigate('/k/namespaces.v1?open=namespaces.v1/free');
    expect(part('limits')).toBeNull();
  });
});

describe('the rest of the kinds, as themselves', () => {
  it('shows an endpoint slice’s endpoints (each its pod, address, node, state — going too) and its service', () => {
    const w = world();
    const { EndpointSlice } = kinds.discovery.v1;
    w.cluster.add(
      EndpointSlice,
      make(EndpointSlice, {
        metadata: { name: 'web-x7k2p', namespace: 'shop', labels: { 'kubernetes.io/service-name': 'web' } },
        addressType: 'IPv4',
        endpoints: [
          { addresses: ['10.42.0.4'], nodeName: 'n1', targetRef: { kind: 'Pod', name: 'web-a' }, conditions: { ready: true } },
          { addresses: ['10.42.0.9'], nodeName: 'n1', targetRef: { kind: 'Pod', name: 'web-b' }, conditions: { ready: false, terminating: true } },
          { addresses: ['10.42.0.7'], conditions: { ready: false } },
        ],
      }),
    );
    renderPage(w, '/k/endpointslices.v1.discovery.k8s.io?open=endpointslices.v1.discovery.k8s.io/shop/web-x7k2p');
    expect(rows(part('endpoints'))).toEqual([
      ['web-a', '10.42.0.4', 'n1', 'Ready'],
      ['web-b', '10.42.0.9', 'n1', 'Terminating'],
      ['—', '10.42.0.7', '—', 'Not ready'],
    ]);
    expect(related()).toEqual([['Service', 'Serviceweb']]);
  });

  it('shows a quota’s use of what it allows and a limit range’s limits, as themselves', () => {
    const w = world();
    w.cluster.add(ResourceQuota, make(ResourceQuota, { metadata: { name: 'q', namespace: 'shop' }, status: { hard: { pods: '50' }, used: { pods: '46' } } }));
    w.cluster.add(
      ResourceQuota,
      make(ResourceQuota, {
        metadata: { name: 'best-effort', namespace: 'shop' },
        spec: { hard: { pods: '5' }, scopes: ['BestEffort'], scopeSelector: { matchExpressions: [{ scopeName: 'PriorityClass', operator: 'In', values: ['low'] }] } },
      }),
    );
    w.cluster.add(LimitRange, make(LimitRange, { metadata: { name: 'defaults', namespace: 'shop' }, spec: { limits: [{ type: 'Container', max: { cpu: '2' } }] } }));
    w.cluster.add(LimitRange, make(LimitRange, { metadata: { name: 'ratio', namespace: 'shop' }, spec: { limits: [{ type: 'Container', maxLimitRequestRatio: { cpu: '4' } }] } }));
    const page = renderPage(w, '/k/resourcequotas.v1?open=resourcequotas.v1/shop/q');
    expect([...(part('quota')?.querySelectorAll('.uk-meter') ?? [])].map((m) => m.textContent)).toEqual(['pods46 of 50']);
    page.navigate('/k/limitranges.v1?open=limitranges.v1/shop/defaults');
    expect(rows(part('limits'))).toEqual([['cpuContainer', '—', '—', '—', '2']]);
    // Only a ratio: its column, not an empty table.
    page.navigate('/k/limitranges.v1?open=limitranges.v1/shop/ratio');
    expect(rows(part('limits'))).toEqual([['cpuContainer', '—', '—', '—', '—', '4']]);
    page.navigate('/k/resourcequotas.v1?open=resourcequotas.v1/shop/best-effort');
    expect(pairs(part('quota'))).toEqual([
      ['pods', '0 of 5'],
      ['Scopes', 'BestEffortPriorityClass In (low)'],
    ]);
  });

  it('shows a definition’s versions (served, stored, deprecated), its stored version’s columns, how many objects of it there are', () => {
    const ks = {
      group: 'kustomize.toolkit.fluxcd.io',
      version: 'v1',
      kind: 'Kustomization',
      id: 'kustomize.toolkit.fluxcd.io/v1/Kustomization',
      plural: 'kustomizations',
      singular: 'kustomization',
      namespaced: true,
      verbs: ['get', 'list', 'watch'],
    };
    const w = kubeWorld({ cluster: fakeCluster({ kinds: [ks] }) });
    w.cluster.add(Namespace, make(Namespace, { metadata: { name: 'shop' } }));
    w.addon(core);
    const { CustomResourceDefinition } = kinds.apiextensions.v1;
    w.cluster.add(
      CustomResourceDefinition,
      make(CustomResourceDefinition, {
        metadata: { name: 'kustomizations.kustomize.toolkit.fluxcd.io' },
        spec: {
          group: ks.group,
          scope: 'Namespaced',
          names: { kind: 'Kustomization', plural: 'kustomizations' },
          versions: [
            {
              name: 'v1',
              served: true,
              storage: true,
              additionalPrinterColumns: [{ name: 'Ready', type: 'string', jsonPath: '.status.conditions[?(@.type=="Ready")].status' }],
            },
            { name: 'v1beta2', served: true, storage: false, deprecated: true, deprecationWarning: 'use v1' },
          ],
        },
      }),
    );
    for (const name of ['a', 'b']) w.cluster.add(ks, { apiVersion: 'kustomize.toolkit.fluxcd.io/v1', kind: 'Kustomization', metadata: { name, namespace: 'shop' } });
    renderPage(w, '/k/customresourcedefinitions.v1.apiextensions.k8s.io?open=customresourcedefinitions.v1.apiextensions.k8s.io/kustomizations.kustomize.toolkit.fluxcd.io');
    expect(rows(part('versions'))).toEqual([
      ['v1', 'Yes', 'Stored', '—'],
      ['v1beta2', 'Yes', 'No', 'use v1'],
    ]);
    expect([part('columns')?.querySelector('h2, h3, .uk-section-title')?.textContent, rows(part('columns'))]).toEqual([
      'Columns (v1)',
      [['Ready', 'string', '.status.conditions[?(@.type=="Ready")].status']],
    ]);
    expect(related()).toEqual([['Objects', '2 Kustomization']]);
  });

  it('shows a webhook configuration’s hooks: what each calls, on what, what its failing does', () => {
    const w = world();
    const { ValidatingWebhookConfiguration } = kinds.admissionregistration.v1;
    const hook = { admissionReviewVersions: ['v1'], sideEffects: 'None' as const };
    w.cluster.add(
      ValidatingWebhookConfiguration,
      make(ValidatingWebhookConfiguration, {
        metadata: { name: 'cert-manager-webhook' },
        webhooks: [
          {
            ...hook,
            name: 'webhook.cert-manager.io',
            clientConfig: { service: { name: 'cert-manager-webhook', namespace: 'cert-manager', path: '/validate' } },
            rules: [{ apiGroups: ['cert-manager.io'], apiVersions: ['v1'], operations: ['CREATE', 'UPDATE'], resources: ['*/*'] }],
          },
          {
            ...hook,
            name: 'outside.example.com',
            clientConfig: { url: 'https://hooks.example.com/check' },
            failurePolicy: 'Ignore',
            rules: [{ operations: ['*'], resources: ['pods'] }],
          },
        ],
      }),
    );
    renderPage(w, '/k/validatingwebhookconfigurations.v1.admissionregistration.k8s.io?open=validatingwebhookconfigurations.v1.admissionregistration.k8s.io/cert-manager-webhook');
    expect(rows(part('hooks'))).toEqual([
      ['webhook.cert-manager.io', 'Servicecert-manager-webhook/validate', 'CREATEUPDATEcert-manager.io/*/*', 'Fail'],
      ['outside.example.com', 'https://hooks.example.com/check', '*pods', 'Ignore'],
    ]);
  });

  it('shows what a signing request asks for (read from it); not read, said so', () => {
    const w = world();
    const { CertificateSigningRequest } = kinds.certificates.v1;
    const csr = (name: string, request: string) =>
      make(CertificateSigningRequest, { metadata: { name }, spec: { request, signerName: 'kubernetes.io/kubelet-serving', expirationSeconds: 86400 } });
    w.cluster.add(CertificateSigningRequest, csr('csr-8x2kp', b64(CSR_PEM)));
    w.cluster.add(CertificateSigningRequest, csr('odd', b64('nothing')));
    const page = renderPage(w, '/k/certificatesigningrequests.v1.certificates.k8s.io?open=certificatesigningrequests.v1.certificates.k8s.io/csr-8x2kp');
    expect(pairs(part('request'))).toEqual([
      ['Subject', 'CN=system:node:kube-3, O=system:nodes'],
      ['Subject Alternative Names', 'kube-3192.168.1.23'],
      ['Public key', 'ECDSA P-256'],
      ['Requested duration', '24h'],
    ]);
    page.navigate('/k/certificatesigningrequests.v1.certificates.k8s.io?open=certificatesigningrequests.v1.certificates.k8s.io/odd');
    expect(part('request')?.textContent).toContain('Failed to parse the certificate request.');
  });

  it('shows an event’s message and what it is about', () => {
    const w = world();
    const { Event } = kinds.core.v1;
    w.cluster.add(
      Event,
      make(Event, {
        metadata: { name: 'api.17e8a2c', namespace: 'shop' },
        involvedObject: { apiVersion: 'v1', kind: 'Pod', name: 'api-1', namespace: 'shop' },
        reason: 'Unhealthy',
        message: 'Readiness probe failed: 503',
      }),
    );
    renderPage(w, '/k/events.v1?open=events.v1/shop/api.17e8a2c');
    expect([part('message')?.querySelector('p')?.textContent, related()]).toEqual(['Readiness probe failed: 503', [['Involved object', 'Podapi-1']]]);
  });
});

describe('what the cluster refuses', () => {
  const forbidden = { status: 403, code: 'Forbidden', message: 'no' };

  it('says so — never taken for none: events, quota, endpoints, what a node holds, who uses it', () => {
    const w = world();
    w.cluster.add(ConfigMap, make(ConfigMap, { metadata: { name: 'web', namespace: 'shop' } }));
    w.cluster.add(kinds.core.v1.Service, make(kinds.core.v1.Service, { metadata: { name: 'web', namespace: 'shop' }, spec: { selector: { app: 'web' }, ports: [{ port: 80 }] } }));
    w.cluster.add(kinds.core.v1.Node, make(kinds.core.v1.Node, { metadata: { name: 'n1' } }));
    for (const kind of [kinds.core.v1.Event, ResourceQuota, kinds.discovery.v1.EndpointSlice, Pod]) w.cluster.state(kind, 'error', forbidden);
    const page = renderPage(w, '/k/namespaces.v1?open=namespaces.v1/shop');
    expect([part('quota')?.querySelector('.uk-notice')?.textContent, part('quota')?.querySelector('.uk-nothing')]).toEqual(['resourcequotas cannot be had: Forbidden', null]);
    // Its recent events: refused, said in its Overview (not left out as none).
    expect(part('events')?.textContent).toContain('events cannot be had: Forbidden');
    page.navigate('/k/services.v1?open=services.v1/shop/web');
    expect([part('endpoints')?.querySelector('.uk-notice')?.textContent, part('endpoints')?.querySelector('.uk-nothing')]).toEqual([
      'endpointslices cannot be had: Forbidden',
      null,
    ]);
    page.navigate('/k/nodes.v1?open=nodes.v1/n1');
    expect([part('allocated')?.querySelector('.uk-notice')?.textContent, part('allocated')?.querySelector('.uk-meter'), related()]).toEqual([
      'pods cannot be had: Forbidden',
      null,
      [['Pods', 'pods cannot be had: Forbidden']],
    ]);
    page.navigate('/k/configmaps.v1?open=configmaps.v1/shop/web');
    expect(related()).toEqual([['Used by', 'pods cannot be had: Forbidden']]);
    page.act(() => (opened().querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click());
    expect(opened().querySelector('[role="tabpanel"] .uk-notice')?.textContent).toBe('events cannot be had: Forbidden');
  });
});

describe('what points at an object', () => {
  const { Deployment, StatefulSet } = kinds.apps.v1;
  const { ClusterRoleBinding, Role } = kinds.rbac.v1;
  const { IngressClass } = kinds.networking.v1;
  const { PriorityClass } = kinds.scheduling.v1;
  const { Service } = kinds.core.v1;

  it('tests labels by a selector: its labels and expressions all (an empty one picks every one, none none)', () => {
    const labels = { app: 'web', tier: 'front' };
    expect([
      picks({ matchLabels: { app: 'web' } }, labels),
      picks({ matchLabels: { app: 'db' } }, labels),
      picks({ matchExpressions: [{ key: 'tier', operator: 'In', values: ['front', 'back'] }] }, labels),
      picks({ matchExpressions: [{ key: 'env', operator: 'NotIn', values: ['dev'] }] }, labels),
      picks({ matchExpressions: [{ key: 'env', operator: 'Exists' }] }, labels),
      picks({ matchExpressions: [{ key: 'env', operator: 'DoesNotExist' }] }, labels),
      picks({}, labels),
      picks(undefined, labels),
    ]).toEqual([true, false, true, true, false, true, true, false]);
  });

  it('shows what selects, keeps and scales a workload (and none where none does: no field)', () => {
    const w = world();
    const template = { metadata: { labels: { app: 'web' } }, spec: { containers: [] } };
    w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'web', namespace: 'shop' }, spec: { selector: { matchLabels: { app: 'web' } }, template } }));
    w.cluster.add(
      Deployment,
      make(Deployment, {
        metadata: { name: 'alone', namespace: 'shop' },
        spec: { selector: { matchLabels: { app: 'alone' } }, template: { metadata: { labels: { app: 'alone' } } } },
      }),
    );
    w.cluster.add(Service, make(Service, { metadata: { name: 'web', namespace: 'shop' }, spec: { selector: { app: 'web' } } }));
    w.cluster.add(Service, make(Service, { metadata: { name: 'other', namespace: 'shop' }, spec: { selector: { app: 'db' } } }));
    w.cluster.add(PodDisruptionBudget, make(PodDisruptionBudget, { metadata: { name: 'web', namespace: 'shop' }, spec: { selector: { matchLabels: { app: 'web' } } } }));
    w.cluster.add(
      HorizontalPodAutoscaler,
      make(HorizontalPodAutoscaler, {
        metadata: { name: 'web', namespace: 'shop' },
        spec: { scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' }, maxReplicas: 3 },
      }),
    );
    const page = renderPage(w, '/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    expect(related().filter(([k]) => k !== 'Selector')).toEqual([
      ['Services', 'Serviceweb'],
      ['PodDisruptionBudgets', 'PDBweb'],
      ['HorizontalPodAutoscalers', 'HPAweb'],
    ]);
    page.navigate('/k/deployments.v1.apps?open=deployments.v1.apps/shop/alone');
    expect(related().map(([k]) => k)).toEqual(['Selector']);
  });

  it('leads from a selector to the pods it picks (its namespace’s), from a label to its kind’s objects of it', () => {
    const w = world();
    const labels = { app: 'web' };
    w.cluster.add(
      Deployment,
      make(Deployment, {
        metadata: { name: 'web', namespace: 'shop', labels },
        spec: { selector: { matchLabels: labels, matchExpressions: [{ key: 'canary', operator: 'DoesNotExist' }] } },
      }),
    );
    w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'web', namespace: 'other', labels } }));
    w.cluster.add(Deployment, make(Deployment, { metadata: { name: 'db', namespace: 'shop' } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web-1', namespace: 'shop', labels } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web-2', namespace: 'shop', labels: { ...labels, canary: 'yes' } } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web-1', namespace: 'other', labels } }));
    const page = renderPage(w, '/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    const links = [...(part('related')?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href') ?? '');
    expect(links).toHaveLength(2);
    expect(new Set(links).size).toBe(1);
    expect(part('related')?.querySelector('a')?.getAttribute('aria-label')).toBe('Pods with app=web, !canary');
    page.navigate(links[0].replace(/^#/, ''));
    expect([page.path.split('?')[0], page.column('Name'), page.column('Namespace')]).toEqual(['/k/pods.v1', ['web-1'], ['shop']]);
    page.navigate('/k/deployments.v1.apps?open=deployments.v1.apps/shop/web');
    const label = part('metadata')?.querySelector('a.uk-chip');
    expect(label?.getAttribute('aria-label')).toBe('Deployments with app=web');
    page.navigate((label?.getAttribute('href') ?? '').replace(/^#/, ''));
    expect(page.column('Namespace').sort()).toEqual(['other', 'shop']);
  });

  it('shows a service’s ingresses, a cluster role’s bindings, a service account’s, a policy’s and a budget’s pods', () => {
    const w = world();
    w.cluster.add(Service, make(Service, { metadata: { name: 'api', namespace: 'shop' }, spec: { ports: [{ port: 80 }] } }));
    w.cluster.add(
      Ingress,
      make(Ingress, {
        metadata: { name: 'shop', namespace: 'shop' },
        spec: { rules: [{ http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'api', port: { number: 80 } } } }] } }] },
      }),
    );
    w.cluster.add(ClusterRole, make(ClusterRole, { metadata: { name: 'reader' } }));
    w.cluster.add(ServiceAccount, make(ServiceAccount, { metadata: { name: 'api', namespace: 'shop' } }));
    const subjects = [{ kind: 'ServiceAccount', name: 'api', namespace: 'shop' }];
    w.cluster.add(
      ClusterRoleBinding,
      make(ClusterRoleBinding, { metadata: { name: 'all-read' }, roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'reader' }, subjects }),
    );
    w.cluster.add(
      RoleBinding,
      make(RoleBinding, { metadata: { name: 'shop-read', namespace: 'shop' }, roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'reader' }, subjects }),
    );
    // A binding in another namespace granting it that namespace.
    w.cluster.add(
      RoleBinding,
      make(RoleBinding, { metadata: { name: 'deploys-prod', namespace: 'prod' }, roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'deployer' }, subjects }),
    );
    w.cluster.add(Role, make(Role, { metadata: { name: 'reader', namespace: 'shop' } }));
    w.cluster.add(NetworkPolicy, make(NetworkPolicy, { metadata: { name: 'api', namespace: 'shop' }, spec: { podSelector: { matchLabels: { app: 'api' } } } }));
    w.cluster.add(PodDisruptionBudget, make(PodDisruptionBudget, { metadata: { name: 'api', namespace: 'shop' }, spec: { selector: { matchLabels: { app: 'api' } } } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'api-1', namespace: 'shop', labels: { app: 'api' } } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web-1', namespace: 'shop', labels: { app: 'web' } } }));
    const page = renderPage(w, '/k/services.v1?open=services.v1/shop/api');
    expect(related()).toEqual([['Ingresses', 'Ingressshop']]);
    page.navigate('/k/clusterroles.v1.rbac.authorization.k8s.io?open=clusterroles.v1.rbac.authorization.k8s.io/reader');
    expect(related()).toEqual([
      ['Bindings', 'ClusterRoleBindingall-read'],
      ['RoleBindings', 'RoleBindingshop-read'],
    ]);
    // A role of the same name, binding none: none.
    page.navigate('/k/roles.v1.rbac.authorization.k8s.io?open=roles.v1.rbac.authorization.k8s.io/shop/reader');
    expect(related()).toEqual([]);
    page.navigate('/k/serviceaccounts.v1?open=serviceaccounts.v1/shop/api');
    expect(related()).toEqual([
      ['RoleBindings', 'RoleBindingdeploys-prodRoleBindingshop-read'],
      ['ClusterRoleBindings', 'ClusterRoleBindingall-read'],
    ]);
    page.navigate('/k/networkpolicies.v1.networking.k8s.io?open=networkpolicies.v1.networking.k8s.io/shop/api');
    expect(related().find(([k]) => k === 'Pods')).toEqual(['Pods', 'api-1']);
    page.navigate('/k/poddisruptionbudgets.v1.policy?open=poddisruptionbudgets.v1.policy/shop/api');
    expect(related().find(([k]) => k === 'Pods')).toEqual(['Pods', 'api-1']);
  });

  it('says how many it looked through where there are more than it looks through — none found among them not taken for none', () => {
    const w = world();
    w.cluster.add(PriorityClass, make(PriorityClass, { metadata: { name: 'rare' }, value: 1 }));
    for (let i = 0; i < 501; i++) w.cluster.add(Pod, make(Pod, { metadata: { name: `p-${String(i).padStart(3, '0')}`, namespace: 'shop' }, spec: { containers: [] } }));
    renderPage(w, '/k/priorityclasses.v1.scheduling.k8s.io?open=priorityclasses.v1.scheduling.k8s.io/rare');
    expect(related()).toEqual([['Used by', 'scanned 500 of 501']]);
  });

  it('shows a pull secret’s service accounts, a stateful set’s claims, a class’s ingresses and pods (everywhere)', () => {
    const w = world();
    w.cluster.add(Namespace, make(Namespace, { metadata: { name: 'media' } }));
    w.cluster.add(Secret, make(Secret, { metadata: { name: 'pull', namespace: 'shop' }, type: 'kubernetes.io/dockerconfigjson' }));
    w.cluster.add(ServiceAccount, make(ServiceAccount, { metadata: { name: 'api', namespace: 'shop' }, imagePullSecrets: [{ name: 'pull' }] }));
    w.cluster.add(
      StatefulSet,
      make(StatefulSet, {
        metadata: { name: 'db', namespace: 'shop' },
        spec: { serviceName: 'db', selector: { matchLabels: { app: 'db' } }, template: {}, volumeClaimTemplates: [{ metadata: { name: 'data' } }] },
      }),
    );
    for (const name of ['data-db-0', 'data-db-1', 'data-dbx-0', 'data-db-0-old'])
      w.cluster.add(PersistentVolumeClaim, make(PersistentVolumeClaim, { metadata: { name, namespace: 'shop' } }));
    w.cluster.add(IngressClass, make(IngressClass, { metadata: { name: 'traefik' }, spec: { controller: 'traefik.io/ingress-controller' } }));
    w.cluster.add(Ingress, make(Ingress, { metadata: { name: 'jellyfin', namespace: 'media' }, spec: { ingressClassName: 'traefik' } }));
    w.cluster.add(PriorityClass, make(PriorityClass, { metadata: { name: 'critical' }, value: 1000 }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'api-1', namespace: 'shop' }, spec: { priorityClassName: 'critical', containers: [] } }));
    const page = renderPage(w, '/k/secrets.v1?open=secrets.v1/shop/pull');
    expect(related().find(([k]) => k === 'Image pull secret of')).toEqual(['Image pull secret of', 'ServiceAccountapi']);
    page.navigate('/k/statefulsets.v1.apps?open=statefulsets.v1.apps/shop/db');
    expect(related().find(([k]) => k === 'PersistentVolumeClaims')).toEqual(['PersistentVolumeClaims', 'PVCdata-db-0PVCdata-db-1']);
    page.navigate('/k/ingressclasses.v1.networking.k8s.io?open=ingressclasses.v1.networking.k8s.io/traefik');
    expect(related()).toEqual([['Used by', 'Ingressjellyfin']]);
    page.navigate('/k/priorityclasses.v1.scheduling.k8s.io?open=priorityclasses.v1.scheduling.k8s.io/critical');
    expect(related()).toEqual([['Used by', 'api-1']]);
  });

  it('says it quietly where what would point is refused', () => {
    const w = world();
    w.cluster.add(kinds.core.v1.Service, make(kinds.core.v1.Service, { metadata: { name: 'api', namespace: 'shop' } }));
    w.cluster.state(Ingress, 'error', { status: 403, code: 'Forbidden', message: 'no' });
    renderPage(w, '/k/services.v1?open=services.v1/shop/api');
    expect(related()).toEqual([['Ingresses', 'ingresses cannot be had: Forbidden']]);
  });
});
