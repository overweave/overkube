import core from '@overkube/addon-core';
import { cleanup, fakeCluster, kubeWorld } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CERT_MANAGER_KINDS, certManagerCluster } from './cluster.fixture.ts';
import certManager from './index.tsx';

/*
 * The cert-manager addon, as its user sees it over a cluster: its kinds'
 * tables (their CRDs' columns, though the CRDs cannot be read; when each
 * certificate ends), a Certificate's view (its lifetime, how its revision
 * goes and where it stops, its failed attempts), an issuer's, an Ingress's
 * TLS, the start's panel — and Renew, Approve, Deny: what they write, shown
 * only to one who may.
 */

// Days are said by calendar dates: the clock at noon, so that a time some hours past one from now falls on the same date whenever the tests run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date().setUTCHours(12, 0, 0, 0));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function world() {
  const w = kubeWorld({ cluster: fakeCluster({ kinds: CERT_MANAGER_KINDS }) });
  certManagerCluster(w.cluster);
  w.addon(core);
  w.addon(certManager);
  return w;
}

/** A table's header and its rows: each its cells' words. */
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

describe('the tables', () => {
  it('have each kind’s CRD’s columns, though its CRD cannot be read — its state in cert-manager’s words, no kstatus beside it', async () => {
    renderPage(world(), '/k/certificates.v1.cert-manager.io');
    await vi.waitFor(() => expect(table().header).toEqual(['Name', 'Namespace', 'Ready', 'Secret', 'Expires', 'Age']));
    expect(Object.fromEntries(table().rows.map((r) => [r[0], r[2]]))).toEqual({ 'api-tls': 'Ready', 'docs-tls': 'Failed', 'shop-tls': 'Ready', 'store-tls': 'Issuing' });
  });

  it('say when each certificate ends — near it (its renewal past) an error; not issued, none — and sort by it', async () => {
    const page = renderPage(world(), '/k/certificates.v1.cert-manager.io');
    await vi.waitFor(() => expect(column('Expires')).toEqual(['3d', '—', '60d', '—']));
    expect(document.querySelector('.uk-life-cell[data-level="error"]')).not.toBeNull();
    page.act(() => ([...document.querySelectorAll<HTMLButtonElement>('[role="columnheader"] button')].find((b) => b.textContent === 'Expires') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(column('Name').slice(0, 2)).toEqual(['api-tls', 'shop-tls']));
  });

  it('say a request’s Approved, Denied, Ready, Issuer, Requester; a challenge’s State and Domain', async () => {
    const page = renderPage(world(), '/k/certificaterequests.v1.cert-manager.io');
    await vi.waitFor(() => expect(table().header).toEqual(['Name', 'Namespace', 'Approved', 'Denied', 'Ready', 'Issuer', 'Requester', 'Age']));
    expect(table().rows.map((r) => r.slice(0, 7))).toEqual([
      ['partner-1', 'shop', '—', '—', 'Pending', 'partner', 'alice'],
      ['shop-tls-2', 'shop', 'True', '—', 'Issued', 'letsencrypt', 'system:serviceaccount:cert-manager:cert-manager'],
      ['store-tls-1', 'shop', 'True', '—', 'Pending', 'letsencrypt', 'system:serviceaccount:cert-manager:cert-manager'],
    ]);
    page.navigate('/k/challenges.v1.acme.cert-manager.io');
    await vi.waitFor(() => expect(table().header).toEqual(['Name', 'Namespace', 'State', 'Domain', 'Age']));
    expect(column('Domain')).toEqual(['store.shop.test']);
  });

  it('say an issuer’s state and type', async () => {
    renderPage(world(), '/k/clusterissuers.v1.cert-manager.io');
    await vi.waitFor(() =>
      expect(table().rows.map((r) => r.slice(0, 3))).toEqual([
        ['letsencrypt', 'Ready', 'ACME'],
        ['vault', 'NotReady', 'Vault'],
      ]),
    );
  });
});

describe('a Certificate’s view', () => {
  it('says its lifetime, and its spec against what its Secret holds', async () => {
    renderPage(world(), '/k/certificates.v1.cert-manager.io?open=certificates.v1.cert-manager.io/shop/shop-tls');
    await vi.waitFor(() => expect(part('validity')?.textContent).toContain('Renewal Time'));
    expect(part('validity')?.textContent).toContain('in 60d');
    await vi.waitFor(() => expect(part('secret')?.textContent).toContain('www.shop.example.com'));
    // Its Secret holds an IP its spec does not ask for.
    expect(part('secret')?.textContent).toContain('10.0.0.1');
  });

  it('follows its revision: its request, its Order, its Challenge stuck — why, and what it usually means', async () => {
    renderPage(world(), '/k/certificates.v1.cert-manager.io?open=certificates.v1.cert-manager.io/shop/store-tls');
    await vi.waitFor(() => expect(part('issuance')?.querySelectorAll('.uk-step')).toHaveLength(4));
    const steps = [...(part('issuance')?.querySelectorAll('.uk-step') ?? [])];
    expect(part('issuance')?.querySelector('h3')?.textContent).toBe('Revision 1');
    expect(steps.map((s) => s.getAttribute('data-state'))).toEqual(['going', 'going', 'stuck', 'later']);
    expect(steps[2].textContent).toContain('no such host');
    expect(steps[2].textContent).toContain('Its DNS name does not resolve from the cluster');
  });

  it('links each step to its object: a Challenge, said by its DNS name, opened by its own name', async () => {
    renderPage(world(), '/k/certificates.v1.cert-manager.io?open=certificates.v1.cert-manager.io/shop/store-tls');
    await vi.waitFor(() => expect(part('issuance')?.querySelectorAll('.uk-step')).toHaveLength(4));
    const link = [...(part('issuance')?.querySelectorAll('a') ?? [])].find((a) => a.textContent === 'store.shop.test') as HTMLAnchorElement;
    expect([link.title, decodeURIComponent(link.getAttribute('href') ?? '')]).toEqual(['store-tls-1-1-1', expect.stringContaining('/shop/store-tls-1-1-1')]);
  });

  it('says its failed issuance attempts, and when cert-manager tries again (an hour, doubled each time)', async () => {
    renderPage(world(), '/k/certificates.v1.cert-manager.io?open=certificates.v1.cert-manager.io/shop/docs-tls');
    await vi.waitFor(() => expect(part('failed')?.textContent).toContain('Failed Issuance Attempts: 2'));
    expect(part('failed')?.textContent).toMatch(/Last Failure Time.* \(30m\)Next Attempt.* \(in 90m\)/);
  });

  it('relates its issuer, its Secret, what serves it', async () => {
    renderPage(world(), '/k/certificates.v1.cert-manager.io?open=certificates.v1.cert-manager.io/shop/shop-tls');
    await vi.waitFor(() => expect(part('related')?.textContent).toContain('Used By'));
    expect(part('related')?.textContent).toMatch(/IssuerClusterIssuerletsencrypt.*Secretshop-tls.*Used ByIngressshop/);
  });
});

describe('issuers', () => {
  it('say an ACME issuer’s server, its solvers, what it issues', async () => {
    renderPage(world(), '/k/clusterissuers.v1.cert-manager.io?open=clusterissuers.v1.cert-manager.io/letsencrypt');
    await vi.waitFor(() => expect(document.querySelector('.uk-modal')?.textContent).toContain('HTTP-01 · Ingress class nginx'));
    expect(document.querySelector('.uk-modal')?.textContent).toContain('acme-staging-v02.api.letsencrypt.org');
    await vi.waitFor(() => expect(document.querySelector('.uk-modal')?.textContent).toMatch(/api-tls.*shop-tls.*docs-tls.*store-tls/));
  });

  it('say a CA’s own end, and that nothing renews it', async () => {
    renderPage(world(), '/k/issuers.v1.cert-manager.io?open=issuers.v1.cert-manager.io/shop/partner-ca');
    await vi.waitFor(() => expect(document.querySelector('.uk-modal')?.textContent).toContain('No Certificate manages Secret partner-ca'));
    expect(document.querySelector('.uk-modal')?.textContent).toContain('CN=shop.example.com');
  });
});

describe('where certificates are used', () => {
  it('an Ingress’s TLS: each entry’s Certificate, its lifetime; a host no entry covers; an issuer named that is not there', async () => {
    const page = renderPage(world(), '/k/ingresses.v1.networking.k8s.io?open=ingresses.v1.networking.k8s.io/shop/shop');
    await vi.waitFor(() => expect(part('tls')?.textContent).toContain('60d'));
    expect(part('tls')?.textContent).toContain('admin.shop.example.comNot covered by TLS');
    page.navigate('/k/ingresses.v1.networking.k8s.io?open=ingresses.v1.networking.k8s.io/shop/legacy');
    await vi.waitFor(() => expect(part('tls')?.textContent).toContain('cert-manager.io/cluster-issuer: no ClusterIssuer zerossl'));
    expect(part('tls')?.textContent).toContain('No Certificate for Secret legacy-tls');
  });

  it('a Secret’s: the Certificate it is managed by', async () => {
    renderPage(world(), '/k/secrets.v1?open=secrets.v1/shop/shop-tls');
    await vi.waitFor(() => expect(part('related')?.textContent).toContain('Managed ByCertificateshop-tls'));
  });
});

describe('the Ingresses’ table', () => {
  it('says when each one’s certificates end, beside the core’s TLS — sorted by it (the soonest first, none last)', async () => {
    const page = renderPage(world(), '/k/ingresses.v1.networking.k8s.io');
    await vi.waitFor(() => expect(column('Expires')).toEqual(['—', '60d']));
    expect(column('TLS')).toEqual(['legacy-tls', 'shop-tls']);
    page.act(() => ([...document.querySelectorAll<HTMLButtonElement>('[role="columnheader"] button')].find((b) => b.textContent === 'Expires') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(column('Name')).toEqual(['shop', 'legacy']));
  });
});

describe('the start', () => {
  it('has its certificates as a table: those not issued first, then the soonest end first; each its state, its lifetime, its issuer', async () => {
    renderPage(world(), '/');
    const panel = () => [...document.querySelectorAll('.uk-panel')].find((p) => p.querySelector('.uk-panel-head')?.textContent?.startsWith('Certificates')) as HTMLElement;
    await vi.waitFor(() => expect(column('Certificate', panel())).toEqual(['docs-tls', 'store-tls', 'api-tls', 'shop-tls']));
    expect(table(panel()).header).toEqual(['Certificate', 'Namespace', 'Ready', 'Expires', 'Issuer']);
    expect(column('Expires', panel())).toEqual(['—', '—', '3d', '60d']);
  });
});

describe('Renew, Approve, Deny', () => {
  it('Renew: its Issuing condition set on its status, as cmctl renew does — the whole object updated, not patched', async () => {
    const w = world();
    const page = renderPage(w, '/k/certificates.v1.cert-manager.io?open=certificates.v1.cert-manager.io/shop/shop-tls');
    await vi.waitFor(() => expect(button('Renew')).toBeDefined());
    page.act(() => button('Renew')?.click());
    await vi.waitFor(() => expect(w.cluster.writes).toHaveLength(1));
    const [write] = w.cluster.writes;
    expect(write).toMatchObject({ op: 'update', kind: 'cert-manager.io/v1/Certificate', name: 'shop-tls', namespace: 'shop', subresource: 'status' });
    expect(write.object?.metadata?.name).toBe('shop-tls');
    expect((write.object as { status: { conditions: { type: string; status: string; reason: string }[] } }).status.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'Ready', status: 'True' }),
        expect.objectContaining({ type: 'Issuing', status: 'True', reason: 'ManuallyTriggered' }),
      ]),
    );
  });

  it('Renew: not while it is issuing', async () => {
    renderPage(world(), '/k/certificates.v1.cert-manager.io?open=certificates.v1.cert-manager.io/shop/store-tls');
    await vi.waitFor(() => expect(part('issuance')).not.toBeNull());
    expect(button('Renew')).toBeUndefined();
  });

  it('Approve: its Approved condition set on its status; once decided, neither offered', async () => {
    const w = world();
    const page = renderPage(w, '/k/certificaterequests.v1.cert-manager.io?open=certificaterequests.v1.cert-manager.io/shop/partner-1');
    await vi.waitFor(() => expect(button('Approve')).toBeDefined());
    expect(document.querySelector('.uk-modal')?.textContent).toContain('A request for PartnerIssuer (issuers.example.com) is approved by');
    page.act(() => button('Approve')?.click());
    await vi.waitFor(() => expect(w.cluster.writes).toHaveLength(1));
    expect(w.cluster.writes[0]).toMatchObject({ op: 'update', name: 'partner-1', subresource: 'status' });
    await vi.waitFor(() => expect(button('Deny')).toBeUndefined());
    expect(button('Approve')).toBeUndefined();
  });

  it('are shown only to one who may: Renew to who may update a Certificate’s status; Approve, Deny to who may also approve for signers', async () => {
    const w = world();
    const read = { verbs: ['get', 'list', 'watch'], apiGroups: ['*'], resources: ['*'] };
    const status = { verbs: ['update'], apiGroups: ['cert-manager.io'], resources: ['certificates/status', 'certificaterequests/status'] };
    // A viewer: none.
    w.cluster.rules({ cluster: [read] });
    const page = renderPage(w, '/k/certificates.v1.cert-manager.io?open=certificates.v1.cert-manager.io/shop/shop-tls');
    await vi.waitFor(() => expect(part('validity')).not.toBeNull());
    expect(button('Renew')).toBeUndefined();
    // An editor (cert-manager-edit: update on the status): Renew; not Approve.
    page.act(() => w.cluster.rules({ cluster: [read, status] }));
    await vi.waitFor(() => expect(button('Renew')).toBeDefined());
    page.navigate('/k/certificaterequests.v1.cert-manager.io?open=certificaterequests.v1.cert-manager.io/shop/partner-1');
    await vi.waitFor(() => expect(document.querySelector('.uk-modal')?.textContent).toContain('Not approved'));
    expect(button('Approve')).toBeUndefined();
    // One who may approve for signers too: Approve and Deny.
    page.act(() => w.cluster.rules({ cluster: [read, status, { verbs: ['approve'], apiGroups: ['cert-manager.io'], resources: ['signers'] }] }));
    await vi.waitFor(() => expect(button('Approve')).toBeDefined());
    expect(button('Deny')).toBeDefined();
  });
});

describe('Approve, Deny, for one who may approve for some signers alone (a rule naming them, as cert-manager’s docs grant it)', () => {
  const read = { verbs: ['get', 'list', 'watch'], apiGroups: ['*'], resources: ['*'] };
  const status = { verbs: ['update'], apiGroups: ['cert-manager.io'], resources: ['certificaterequests/status'] };
  const may = (...resourceNames: string[]) => ({ verbs: ['approve'], apiGroups: ['cert-manager.io'], resources: ['signers'], resourceNames });
  const shown = async (rule: ReturnType<typeof may>) => {
    const w = world();
    w.cluster.rules({ cluster: [read, status, rule] });
    renderPage(w, '/k/certificaterequests.v1.cert-manager.io?open=certificaterequests.v1.cert-manager.io/shop/partner-1');
    await vi.waitFor(() => expect(document.querySelector('.uk-modal')?.textContent).toContain('Not approved'));
    return [button('Approve') !== undefined, button('Deny') !== undefined];
  };

  it('are shown for its issuer: this one (its namespace and name), or every one of its kind', async () => {
    expect(await shown(may('partnerissuers.issuers.example.com/shop.partner'))).toEqual([true, true]);
    cleanup();
    expect(await shown(may('partnerissuers.issuers.example.com/*'))).toEqual([true, true]);
  });

  it('are not for one granted it in a namespace alone: signers are of none, the webhook asks of the cluster', async () => {
    const w = world();
    w.cluster.rules({ cluster: [read, status], namespaces: { shop: [may('partnerissuers.issuers.example.com/*')] } });
    renderPage(w, '/k/certificaterequests.v1.cert-manager.io?open=certificaterequests.v1.cert-manager.io/shop/partner-1');
    await vi.waitFor(() => expect(document.querySelector('.uk-modal')?.textContent).toContain('Not approved'));
    expect(button('Approve')).toBeUndefined();
  });

  it('are not for another’s', async () => {
    expect(await shown(may('issuers.cert-manager.io/*', 'partnerissuers.issuers.example.com/shop.other'))).toEqual([false, false]);
  });
});
