import core from '@overkube/addon-core';
import { cleanup, fakeCluster, kubeWorld } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRIVY_KINDS, trivyCluster } from './cluster.fixture.ts';
import trivy from './index.tsx';

/*
 * The Trivy addon, as its user sees it over a cluster: a workload's
 * vulnerabilities (its Overview's counts, its tab's each — of its current
 * ReplicaSet's reports, not an old one's), being scanned, not scanned; its
 * config audit (a check failed in two places, once); a ClusterRole's RBAC
 * assessment; the workloads' column (sorted, filtered by it); the Images
 * page; Rescan — what it deletes, shown only to one who may.
 */

afterEach(cleanup);

function world() {
  const w = kubeWorld({ cluster: fakeCluster({ kinds: TRIVY_KINDS }) });
  trivyCluster(w.cluster);
  w.addon(core);
  w.addon(trivy);
  return w;
}

const table = (root: ParentNode = document) => ({
  header: [...root.querySelectorAll('[role="columnheader"]')].map((c) => c.textContent),
  rows: [...root.querySelectorAll('[role="rowgroup"] [role="row"]')].map((r) => [...r.querySelectorAll('[role="cell"]')].map((c) => c.textContent)),
});
const column = (name: string, root: ParentNode = document) => {
  const { header, rows } = table(root);
  return rows.map((r) => r[header.indexOf(name)]);
};
const part = (name: string) => document.querySelector(`[data-part="${name}"]`) as HTMLElement | null;
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.uk-modal button')].find((b) => b.textContent === text);
const DEPLOYMENTS = '/k/deployments.v1.apps';
const open = (name: string, tab?: string) => `${DEPLOYMENTS}?open=deployments.v1.apps/shop/${name}${tab ? `&open-tab=${tab}` : ''}`;

describe('the workloads’ tables', () => {
  const shown = (w: ReturnType<typeof world>) => w.user.patch('TableView', 'apps/v1/Deployment', { hidden: { 'trivy.deployments.vulnerabilities': false } });

  it('have Vulnerabilities among More, not shown till turned on', async () => {
    renderPage(world(), DEPLOYMENTS);
    await vi.waitFor(() => expect(table().header).toContain('Name'));
    expect(table().header).not.toContain('Vulnerabilities');
  });

  it('turned on: the worst severity found (a link to its tab), being scanned, no report', async () => {
    const w = world();
    shown(w);
    renderPage(w, DEPLOYMENTS);
    await vi.waitFor(() => expect(column('Vulnerabilities')).toEqual(['Scanning', 'Not scanned', 'Critical']));
    const link = document.querySelector<HTMLAnchorElement>('.uk-sev-link');
    expect(link?.getAttribute('href')).toContain('open-tab=trivy.vulnerabilities');
  });

  it('are filtered and sorted by it', async () => {
    const w = world();
    shown(w);
    const page = renderPage(w, `${DEPLOYMENTS}?filter=${encodeURIComponent('vulnerabilities >= 4')}`);
    await vi.waitFor(() => expect(column('Name')).toEqual(['web']));
    page.navigate(DEPLOYMENTS);
    await vi.waitFor(() => expect(column('Name')).toHaveLength(3));
    const header = () => [...document.querySelectorAll<HTMLButtonElement>('[role="columnheader"] button')].find((b) => b.textContent === 'Vulnerabilities') as HTMLButtonElement;
    page.act(() => header().click());
    page.act(() => header().click());
    await vi.waitFor(() => expect(column('Name')[0]).toBe('web'));
  });
});

describe('a workload’s view', () => {
  it('Overview: each container’s counts of its current ReplicaSet’s reports (not its old one’s), its OS out of support marked; by what, under them', async () => {
    renderPage(world(), open('web'));
    await vi.waitFor(() => expect(part('vulnerabilities')).not.toBeNull());
    const said = part('vulnerabilities')?.textContent ?? '';
    expect(said).toContain('nginxEOSLlibrary/nginx:1.19-alpine211');
    expect(said).toContain('migrateinitEOSLlibrary/alpine:3.12');
    expect(said).toContain('Trivy 0.75.0');
    expect(said).not.toContain('1.18-alpine');
  });

  it('Config Audit: its failed checks’ counts; the high a row, once though failed in two places; the rest when asked', async () => {
    const page = renderPage(world(), open('web'));
    await vi.waitFor(() => expect(part('config-audit')).not.toBeNull());
    const titles = () => [...(part('config-audit')?.querySelectorAll('.uk-accordion-head') ?? [])].map((t) => t.textContent);
    expect(titles()).toEqual(['Root file system is not read-only']);
    page.act(() => button('Show all 3')?.click());
    await vi.waitFor(() => expect(titles()).toEqual(['Root file system is not read-only', 'Runs as root user', 'Memory not limited']));
  });

  it('its tab: an image a card (the worst first, an init one said so), each vulnerability; filtered by severity; those with nothing found, one line', async () => {
    const page = renderPage(world(), open('web', 'trivy.vulnerabilities'));
    await vi.waitFor(() => expect(document.querySelectorAll('.uk-modal .uk-card')).toHaveLength(3));
    const cards = [...document.querySelectorAll('.uk-modal .uk-card-head')].map((h) => h.textContent);
    expect(cards[0]).toContain('nginx');
    expect(cards[1]).toContain('migrateinit');
    expect(cards[2]).toContain('No vulnerabilities');
    expect(column('Vulnerability ID', document.querySelector('.uk-modal .uk-card') as HTMLElement)).toEqual(['CVE-2022-32207', 'CVE-2021-3711', 'CVE-2021-3518', 'CVE-2021-22922']);
    page.act(() => ([...document.querySelectorAll<HTMLButtonElement>('.uk-sev-toggle')].find((b) => b.textContent?.endsWith('Critical')) as HTMLButtonElement).click());
    await vi.waitFor(() => expect(column('Vulnerability ID', document.querySelector('.uk-modal .uk-card') as HTMLElement)).toEqual(['CVE-2021-3518', 'CVE-2021-22922']));
  });

  it('being scanned (its new ReplicaSet’s scan Job): said, its rows to come; not scanned: said, why there may be none', async () => {
    const page = renderPage(world(), open('api', 'trivy.vulnerabilities'));
    await vi.waitFor(() => expect(document.querySelector('.uk-modal .uk-card-end')?.textContent).toBe('Scanning'));
    page.navigate(open('ghost'));
    await vi.waitFor(() => expect(part('vulnerabilities')?.textContent).toContain('Not scanned'));
  });

  it('a pod’s: its ReplicaSet’s reports', async () => {
    renderPage(world(), '/k/pods.v1?open=pods.v1/shop/web-7d4b9-x2k8p');
    await vi.waitFor(() => expect(part('vulnerabilities')?.textContent).toContain('library/nginx:1.19-alpine'));
  });
});

describe('a ClusterRole’s view', () => {
  it('says its RBAC assessment: its failed checks, each opened', async () => {
    renderPage(world(), '/k/clusterroles.v1.rbac.authorization.k8s.io?open=clusterroles.v1.rbac.authorization.k8s.io/too-much');
    await vi.waitFor(() => expect(part('rbac-assessment')?.textContent).toContain('Manage secrets'));
    expect(part('rbac-assessment')?.textContent).toContain('No wildcard verb roles');
  });
});

describe('the Images page', () => {
  it('has each image once (not an old ReplicaSet’s: nothing runs it), the most vulnerable first; filtered by the reports’ fields', async () => {
    const page = renderPage(world(), '/images');
    await vi.waitFor(() => expect(column('Image')).toEqual(['library/nginx', 'library/alpine', 'library/busybox']));
    expect(column('Tag')).toEqual(['1.19-alpine', '3.12', '1.37']);
    page.navigate(`/images?filter=${encodeURIComponent('os = alpine and critical > 1')}`);
    await vi.waitFor(() => expect(column('Tag')).toEqual(['1.19-alpine']));
  });

  it('an image opened: what it is, its vulnerabilities, where it runs', async () => {
    const page = renderPage(world(), '/images');
    await vi.waitFor(() => expect(column('Image')).toHaveLength(3));
    page.act(() => ([...document.querySelectorAll<HTMLButtonElement>('.uk-cell-link')].find((b) => b.textContent === 'library/alpine') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(document.querySelector('.uk-modal')?.textContent).toContain('CVE-2022-37434'));
    expect(document.querySelector('.uk-modal')?.textContent).toContain('webshopmigrate');
  });
});

describe('the reports', () => {
  const at = (plural: string, name?: string) => `/k/${plural}.v1alpha1.aquasecurity.github.io${name ? `?open=${plural}.v1alpha1.aquasecurity.github.io/${name}` : ''}`;

  it('their tables say what each is of (an old revision’s ReplicaSet its own), its worst severity in kstatus’s place, its counts', async () => {
    renderPage(world(), at('vulnerabilityreports'));
    await vi.waitFor(() => expect(table().header).toEqual(['Name', 'Namespace', 'Resource', 'Severity', 'Found', 'Repository', 'Tag', 'OS', 'Age']));
    expect(column('Resource')).toEqual(['ReplicaSetweb-5c6f8nginx', 'ReplicaSetweb-7d4b9migrate', 'ReplicaSetweb-7d4b9nginx', 'ReplicaSetweb-7d4b9sidecar']);
    expect(column('Severity')).toEqual(['Critical', 'Critical', 'Critical', 'None found']);
    expect(column('Found')[2]).toBe('2 Critical1 High1 Medium');
  });

  it('an SBOM’s has no state at all; a compliance report’s, its result', async () => {
    const page = renderPage(world(), at('sbomreports'));
    await vi.waitFor(() => expect(table().header).toEqual(['Name', 'Namespace', 'Resource', 'Repository', 'Tag', 'Components', 'Age']));
    page.navigate(at('clustercompliancereports'));
    await vi.waitFor(() => expect(table().header).toEqual(['Name', 'Result', 'Fail', 'Pass', 'Age']));
    expect(column('Result')).toEqual(['2 failed']);
  });

  it('one opened says what it found: vulnerabilities, secrets (masked), components, checks, controls', async () => {
    const page = renderPage(world(), at('vulnerabilityreports', 'shop/replicaset-web-7d4b9-nginx'));
    await vi.waitFor(() => expect(part('vulnerabilities')?.textContent).toContain('CVE-2021-3711'));
    page.navigate(at('exposedsecretreports', 'shop/replicaset-api-6b978-api'));
    await vi.waitFor(() => expect(part('secrets')?.textContent).toContain('AWS Access Key IDCritical/app/.envAWS_ACCESS_KEY_ID=*'));
    page.navigate(at('sbomreports', 'shop/replicaset-web-7d4b9-nginx'));
    await vi.waitFor(() => expect(column('Name', part('components') as HTMLElement)).toContain('libssl1.1'));
    page.navigate(at('clusterinfraassessmentreports', 'node-kube'));
    await vi.waitFor(() => expect(part('checks')?.textContent).toContain('anonymous-auth'));
    page.navigate(at('clustercompliancereports', 'k8s-cis-1.23'));
    await vi.waitFor(() => expect(column('ID', part('controls') as HTMLElement)).toEqual(['1.2.1', '1.2.6', '5.1.1', '5.1.3', '5.2.2']));
  });
});

describe('the start', () => {
  it('says the scans going on, the totals, the most vulnerable workloads', async () => {
    renderPage(world(), '/');
    await vi.waitFor(() => expect(document.querySelector('.uk-sev-totals')).not.toBeNull());
    const panel = document.querySelector('.uk-sev-totals')?.closest('.uk-panel')?.textContent ?? '';
    expect(panel).toContain('1 scan Job');
    expect(panel).toContain('webshop21');
  });
});

describe('Rescan', () => {
  const read = { verbs: ['get', 'list', 'watch'], apiGroups: ['*'], resources: ['*'] };

  it('deletes its reports (its ReplicaSets’ all): trivy-operator scans it again', async () => {
    const w = world();
    const page = renderPage(w, open('web'));
    await vi.waitFor(() => expect(button('Rescan')).toBeDefined());
    page.act(() => button('Rescan')?.click());
    await vi.waitFor(() => expect(w.cluster.writes).toHaveLength(4));
    expect(w.cluster.writes.map((x) => [x.op, x.name]).sort()).toEqual([
      ['remove', 'replicaset-web-5c6f8-nginx'],
      ['remove', 'replicaset-web-7d4b9-migrate'],
      ['remove', 'replicaset-web-7d4b9-nginx'],
      ['remove', 'replicaset-web-7d4b9-sidecar'],
    ]);
  });

  it('is shown only to one who may delete vulnerability reports', async () => {
    const w = world();
    w.cluster.rules({ cluster: [read] });
    const page = renderPage(w, open('web'));
    await vi.waitFor(() => expect(part('vulnerabilities')).not.toBeNull());
    expect(button('Rescan')).toBeUndefined();
    page.act(() => w.cluster.rules({ cluster: [read, { verbs: ['delete'], apiGroups: ['aquasecurity.github.io'], resources: ['vulnerabilityreports'] }] }));
    await vi.waitFor(() => expect(button('Rescan')).toBeDefined());
  });
});
