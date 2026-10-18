import core from '@overkube/addon-core';
import { cleanup, fakeCluster, kubeWorld } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { helmCluster } from './cluster.fixture.ts';
import helm from './index.tsx';
import { openedIn } from './page.tsx';
import { merged, releaseOf, resourcesOf } from './release.ts';

/*
 * The Helm addon, as its user sees it over a cluster: its page (each
 * release once, its latest revision's chart and state — those not well
 * first), a release opened (why it failed; stuck, the rollback; what it
 * made; the values given and with the chart's; its history, two revisions
 * compared), the start's panel (only those not well), what helm made
 * marked beside its name.
 */

afterEach(cleanup);

function world() {
  const w = kubeWorld({ cluster: fakeCluster() });
  helmCluster(w.cluster);
  w.addon(core);
  w.addon(helm);
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
const modal = () => document.querySelector('.uk-modal')?.textContent ?? '';
const tab = (name: string) => ([...document.querySelectorAll<HTMLButtonElement>('.uk-modal [role="tab"]')].find((b) => b.textContent === name) as HTMLButtonElement).click();

describe('a release', () => {
  it('is read of its Secret: its manifest’s resources; its values over the chart’s', () => {
    expect(
      resourcesOf('---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: a\n  namespace: x\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  labels: {}\n  name: b\n'),
    ).toEqual([
      { apiVersion: 'v1', kind: 'ConfigMap', name: 'a', namespace: 'x' },
      { apiVersion: 'apps/v1', kind: 'Deployment', name: 'b' },
    ]);
    expect(merged({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 }, e: 5 })).toEqual({ a: 1, b: { c: 9, d: 3 }, e: 5 });
  });

  it('its name the object’s own, not a label’s of it', () => {
    expect(resourcesOf('---\napiVersion: v1\nkind: Namespace\nmetadata:\n  labels:\n    name: monitoring\n  name: prometheus\n')).toEqual([
      { apiVersion: 'v1', kind: 'Namespace', name: 'prometheus' },
    ]);
  });

  it('none, of a Secret not as helm writes it (labelled so by anyone)', async () => {
    const secret = (json: string) => ({ apiVersion: 'v1', kind: 'Secret', metadata: { name: 'x' }, data: { release: btoa(btoa(json)) } });
    expect(await releaseOf(secret('{"name":"x"}'))).toBeUndefined();
    expect(await releaseOf(secret('null'))).toBeUndefined();
    expect(await releaseOf(secret('not json'))).toBeUndefined();
  });

  it('opened by its link; a link not to be read, none', () => {
    expect(openedIn('/helm?release=seed-helm%2Fhello')).toBe('seed-helm/hello');
    expect(openedIn('/helm?release=%E0%A4%A')).toBeUndefined();
  });
});

describe('the page', () => {
  it('has each release once, its latest revision: its chart, its state — those not well first (the newest first among them)', async () => {
    renderPage(world(), '/helm');
    await vi.waitFor(() => expect(column('Chart')).toEqual(['ingress-nginx', 'hello', 'hello', 'hello']));
    expect(column('Release')).toEqual(['ingress', 'broken', 'hello', 'retired']);
    expect(column('Status')).toEqual(['pending-upgrade', 'failed', 'deployed', 'uninstalled']);
    expect(column('Revision')).toEqual(['4', '1', '2', '1']);
  });

  it('is filtered as a kind’s table is (its Secrets’ fields: release, status, revision — CEL, in its link): those whose latest revision it lets through', async () => {
    renderPage(world(), `/helm?filter=${encodeURIComponent('status = deployed')}`);
    await vi.waitFor(() => expect(column('Release')).toEqual(['hello']));
    cleanup();
    // hello's first revision is superseded: hello not through.
    renderPage(world(), `/helm?filter=${encodeURIComponent('status = superseded')}`);
    await vi.waitFor(() => expect(document.querySelector('.uk-nothing')?.textContent).toBe('No releases found.'));
    expect(document.querySelector('input[placeholder^="Filter"]')).not.toBeNull();
  });

  it('a release opened: its state, its chart, what it made as it is now, its notes', async () => {
    renderPage(world(), '/helm?release=seed-helm%2Fhello');
    await vi.waitFor(() => expect(part('summary')?.textContent).toContain('hello-0.1.0'));
    expect(column('Name', part('resources') as HTMLElement)).toEqual(['hello', 'hello']);
    await vi.waitFor(() => expect(column('Status', part('resources') as HTMLElement)[1]).not.toBe(''));
    expect(part('notes')?.textContent).toContain('hello says "upgraded"');
    // Laid out as anything opened is: the user's switch of it in its header.
    expect(document.querySelector('.uk-modal [role="group"][aria-label="Layout"]')).not.toBeNull();
  });

  it('a failed one says why; one stuck pending, the rollback that undoes it', async () => {
    const page = renderPage(world(), '/helm?release=seed-helm%2Fbroken');
    await vi.waitFor(() => expect(part('summary')?.textContent).toContain('context deadline exceeded'));
    page.navigate('/helm?release=seed-net%2Fingress');
    await vi.waitFor(() => expect(modal()).toContain('helm rollback ingress 3 -n seed-net'));
  });

  it('its values: those given, or with the chart’s own; its history, a revision chosen compared with the one before', async () => {
    const page = renderPage(world(), '/helm?release=seed-helm%2Fhello');
    await vi.waitFor(() => expect(part('summary')).not.toBeNull());
    page.act(() => tab('Values'));
    await vi.waitFor(() => expect(part('values')?.textContent).toContain('message: upgraded'));
    expect(part('values')?.textContent).not.toContain('image');
    page.act(() =>
      ([...document.querySelectorAll<HTMLButtonElement>('[data-part="values"] button')].find((b) => b.textContent === 'With chart defaults') as HTMLButtonElement).click(),
    );
    await vi.waitFor(() => expect(part('values')?.textContent).toContain('image: busybox:1.37'));
    page.act(() => tab('History'));
    const lines = () => [...(part('compare')?.querySelectorAll('.uk-diff-row') ?? [])].map((r) => [...r.children].map((c) => c.textContent).join('|'));
    await vi.waitFor(() => expect(lines()).toEqual(['|@@ -1,2 +1,3 @@', '1||−message: installed', '|1|+message: upgraded', '|2|+replicas: 2', '2|3| ']));
    // Its manifest: each object changed, its own diff under its kind and name.
    page.act(() => ([...document.querySelectorAll<HTMLButtonElement>('[data-part="compare"] button')].find((b) => b.textContent === 'Manifest') as HTMLButtonElement).click());
    await vi.waitFor(() => expect([...(part('compare')?.querySelectorAll('.uk-diff-title') ?? [])].map((h) => h.textContent)).toEqual(['ConfigMap hello', 'Deployment hello']));
    // Its first revision chosen: nothing before it.
    page.act(() => ([...(part('history')?.querySelectorAll<HTMLElement>('[role="rowgroup"] [role="row"]') ?? [])].at(-1) as HTMLElement).click());
    await vi.waitFor(() => expect(part('compare')?.textContent).toContain('nothing before it'));
    // Another release opened (the first still open): its own, from its start.
    page.navigate('/helm?release=seed-net%2Fingress');
    await vi.waitFor(() => expect(part('summary')?.textContent).toContain('ingress-nginx-4.13.0'));
  });
});

describe('the start', () => {
  it('has the releases not well, each why', async () => {
    renderPage(world(), '/');
    await vi.waitFor(() => expect(document.querySelector('.uk-panel')?.parentElement?.textContent).toContain('Helm releases'));
    const panel = [...document.querySelectorAll('.uk-panel')].find((p) => p.querySelector('.uk-panel-head')?.textContent?.startsWith('Helm releases')) as HTMLElement;
    await vi.waitFor(() => expect(column('Release', panel)).toEqual(['broken', 'ingress']));
    await vi.waitFor(() => expect(column('Description', panel)[0]).toContain('context deadline exceeded'));
  });
});

describe('the tables', () => {
  it('mark what helm made beside its name: helm’s mark, its release in its tip, a link to it', async () => {
    renderPage(world(), '/k/deployments.v1.apps');
    await vi.waitFor(() => expect(document.querySelectorAll('.uk-mark-link')).toHaveLength(3));
    const marks = [...document.querySelectorAll<HTMLAnchorElement>('.uk-mark-link')];
    expect(marks.map((m) => m.querySelector('.uk-status')?.getAttribute('aria-label'))).toEqual(['Helm release broken', 'Helm release hello', 'Helm release ingress']);
    expect(marks[1]?.getAttribute('href')).toContain('release=seed-helm%2Fhello');
  });
});
