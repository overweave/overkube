import { EditorView } from '@codemirror/view';
import core from '@overkube/addon-core';
import { kinds } from '@overkube/kube-types';
import { loadOf } from '@overkube/sdk';
import { cleanup, kubeWorld, make } from '@overkube/testkit';
import { renderPage } from '@overkube/testkit/preact';
import { fireEvent } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fieldPath, refusalOf } from './asked.ts';
import { editCluster } from './cluster.fixture.ts';
import { groupsOf } from './drain.tsx';
import edit from './index.tsx';
import { editedIn, editIn } from './links.ts';

/*
 * The Edit addon, as its user sees it over a cluster: a workload's
 * replicas in its view's footer (scaled there, its autoscaler marked);
 * Restart; what Flux or Helm manages, locked (its tip saying by what);
 * Edit YAML — its manifest, the server's dry run (what it refuses, at its
 * field), applied as a replace at the version read (one changed since:
 * 409, rebased on the latest, its changes kept); Delete — its dependents, its cascade, its name typed; a
 * node's Cordon, Uncordon, Drain — the Eviction API, its budgets. Each
 * dialog in the page's path (&edit=). Each action shown to one who may.
 */

// Its setup's module loaded first (its own chunk, as the page loads it before it starts it): set up at once, as it is drawn.
await loadOf(edit)?.();

afterEach(cleanup);

const { Deployment, DaemonSet } = kinds.apps.v1;
const { Node } = kinds.core.v1;

function world() {
  const w = kubeWorld();
  editCluster(w.cluster);
  w.addon(core);
  w.addon(edit);
  return w;
}

const D = 'deployments.v1.apps';
const opened = (ref: string, ns: string | undefined, name: string) => `/k/${ref}?open=${ref}/${ns ? `${ns}/` : ''}${name}`;
const buttons = (root: ParentNode = document) => [...root.querySelectorAll<HTMLButtonElement>('button')];
const button = (text: string, root: ParentNode = document) =>
  buttons(root).find((b) => b.textContent === text || b.getAttribute('aria-label') === text || b.getAttribute('title') === text);
/** The dialog's footer (its own: the resource view's is another). */
const footer = () => document.querySelector<HTMLElement>('[data-part$="-footer"]')?.closest('.uk-modal-footer') as HTMLElement;
const dialog = (part: string) => document.querySelector<HTMLElement>(`[data-part="${part}"]`);
const later = { timeout: 4000 };

describe('links', () => {
  it('say the dialog asked for in the path: its object its own; none, out of it', () => {
    const at = editIn('/k/pods.v1?open=pods.v1/shop/a', { what: 'delete', ref: D, namespace: 'shop', name: 'api' });
    expect(at).toBe('/k/pods.v1?open=pods.v1/shop/a&edit=delete/deployments.v1.apps/shop/api');
    expect(editedIn(at)).toEqual({ what: 'delete', ref: D, namespace: 'shop', name: 'api' });
    expect(editedIn('/?edit=drain/nodes.v1/node-a')).toEqual({ what: 'drain', ref: 'nodes.v1', name: 'node-a' });
    expect([editIn(at, undefined), editedIn('/?edit=rm/x/y'), editedIn('/')]).toEqual(['/k/pods.v1?open=pods.v1/shop/a', undefined, undefined]);
    // A name of its own words (a "/", a "%"): read back as it was.
    const odd = { what: 'yaml' as const, ref: 'configmaps.v1', namespace: 'shop', name: 'a/b%c' };
    expect(editedIn(editIn('/', odd))).toEqual(odd);
  });

  it('read a refusal: its message, each cause at its field (a path of the document)', () => {
    expect(fieldPath('spec.template.spec.containers[0].image')).toEqual(['spec', 'template', 'spec', 'containers', 0, 'image']);
    expect(fieldPath('metadata.labels[app]')).toEqual(['metadata', 'labels', 'app']);
    expect(fieldPath('metadata.labels[app.kubernetes.io/name]')).toEqual(['metadata', 'labels', 'app.kubernetes.io/name']);
    expect(fieldPath('spec.containers[1].env[0].name')).toEqual(['spec', 'containers', 1, 'env', 0, 'name']);
    const error = Object.assign(new Error('Deployment.apps "api" is invalid'), {
      status: 422,
      kubeStatus: { message: 'Deployment.apps "api" is invalid', details: { causes: [{ field: 'spec.selector', message: 'field is immutable' }] } },
    });
    expect(refusalOf(error)).toEqual({ message: 'Deployment.apps "api" is invalid', causes: [{ field: 'spec.selector', message: 'field is immutable' }], status: 422 });
  });
});

describe('a workload’s view', () => {
  it('has its replicas in its footer: scaled there (✓), kept (×); its autoscaler marked', async () => {
    const w = world();
    const page = renderPage(w, opened(D, 'shop', 'api'));
    await vi.waitFor(() => expect(dialog('scale')).not.toBeNull());
    expect(dialog('scale')?.querySelector('[aria-label="HorizontalPodAutoscaler"]')).not.toBeNull();
    page.act(() => button('More replicas')?.click());
    expect(dialog('scale')?.querySelector('[data-part="replicas"]')?.textContent).toBe('3/2');
    page.act(() => button('Keep 2')?.click());
    expect(dialog('scale')?.querySelector('[data-part="replicas"]')?.textContent).toBe('2');
    page.act(() => button('More replicas')?.click());
    page.act(() => button('Scale 2 → 3')?.click());
    await vi.waitFor(() => expect((w.cluster.get(Deployment, 'api', 'shop') as { spec?: { replicas?: number } }).spec?.replicas).toBe(3));
    expect(w.cluster.writes.at(-1)).toMatchObject({ op: 'patch', name: 'api', change: { type: 'merge', patch: { spec: { replicas: 3 } } } });
  });

  it('locks the replicas of one its controller sets (a Deployment’s ReplicaSet): its tip, and its description, saying by what', async () => {
    renderPage(world(), opened('replicasets.v1.apps', 'shop', 'api-7d4b9'));
    await vi.waitFor(() => expect(dialog('scale')).not.toBeNull());
    const more = button('More replicas') as HTMLButtonElement;
    expect(more.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(more.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Controlled by Deployment api');
    more.click();
    expect(dialog('scale')?.querySelector('[data-part="replicas"]')?.textContent).not.toContain('/');
  });

  it('locks Edit YAML of what a controller keeps (a ReplicaSet’s pod): its tip saying by what; Delete not (made anew)', async () => {
    const page = renderPage(world(), opened('pods.v1', 'shop', 'api-7d4b9-a'));
    await vi.waitFor(() => expect(button('Edit YAML')).toBeDefined());
    const yaml = button('Edit YAML') as HTMLButtonElement;
    expect(yaml.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(yaml.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Controlled by ReplicaSet api-7d4b9');
    page.act(() => yaml.click());
    expect(page.path).not.toContain('edit=');
    expect(button('Delete')?.getAttribute('aria-disabled')).toBeNull();
  });

  it('edits a StatefulSet’s PersistentVolumeClaim all the same (resized, as kubectl edit pvc)', async () => {
    const w = world();
    const { PersistentVolumeClaim } = kinds.core.v1;
    w.cluster.add(
      PersistentVolumeClaim,
      make(PersistentVolumeClaim, {
        metadata: { name: 'data-db-0', namespace: 'data', ownerReferences: [{ apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'db', uid: 'u-db', controller: true }] },
      }),
    );
    renderPage(w, opened('persistentvolumeclaims.v1', 'data', 'data-db-0'));
    await vi.waitFor(() => expect(button('Edit YAML')).toBeDefined());
    expect(button('Edit YAML')?.getAttribute('aria-disabled')).toBeNull();
  });

  it('restarts it as kubectl rollout restart: its pod template annotated', async () => {
    const w = world();
    const page = renderPage(w, opened(D, 'shop', 'api'));
    await vi.waitFor(() => expect(button('Restart')).toBeDefined());
    page.act(() => button('Restart')?.click());
    await vi.waitFor(() => expect(w.cluster.writes.at(-1)?.op).toBe('patch'));
    const change = w.cluster.writes.at(-1)?.change?.patch as { spec: { template: { metadata: { annotations: Record<string, string> } } } };
    expect(change.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt']).toMatch(/^\d{4}-/);
  });

  it('locks what changes what Flux applies — its tip saying by what; Restart not', async () => {
    renderPage(world(), opened(D, 'shop', 'web'));
    await vi.waitFor(() => expect(button('Edit YAML')).toBeDefined());
    for (const name of ['Edit YAML', 'Delete', 'More replicas']) {
      const b = button(name) as HTMLButtonElement;
      expect([name, b.getAttribute('aria-disabled')]).toEqual([name, 'true']);
    }
    expect(button('Restart')?.getAttribute('aria-disabled')).toBeNull();
    fireEvent.pointerEnter(button('Edit YAML') as HTMLElement, { pointerType: 'mouse' });
    await vi.waitFor(() => expect(document.body.textContent).toContain('Managed by Flux (Kustomization flux-system/apps): a change made here is reverted at its next reconcile'));
  });

  it('says why in its tip (a Helm release’s), and does nothing pressed', async () => {
    const page = renderPage(world(), opened(D, 'shop', 'cache'));
    await vi.waitFor(() => expect(button('Delete')).toBeDefined());
    fireEvent.pointerEnter(button('Delete') as HTMLElement, { pointerType: 'mouse' });
    await vi.waitFor(() => expect(document.body.textContent).toContain('Managed by Helm (release shop/cache)'));
    page.act(() => button('Delete')?.click());
    expect(page.path).not.toContain('edit=');
  });

  it('shows none of its actions to one who may only read', async () => {
    const w = world();
    w.cluster.rules({ cluster: [{ verbs: ['get', 'list', 'watch'], apiGroups: ['*'], resources: ['*'] }] });
    renderPage(w, opened(D, 'shop', 'api'));
    await vi.waitFor(() => expect(document.querySelector('.uk-modal')).not.toBeNull());
    expect(['Restart', 'Edit YAML', 'Delete'].map((n) => button(n) !== undefined)).toEqual([false, false, false]);
    expect(dialog('scale')).toBeNull();
  });
});

describe('Edit YAML', () => {
  const editor = async () => {
    await vi.waitFor(() => expect(document.querySelector('[data-part="edit-yaml"] .cm-editor')).not.toBeNull(), later);
    return EditorView.findFromDOM(document.querySelector('[data-part="edit-yaml"] .cm-editor') as HTMLElement) as EditorView;
  };
  const type = (page: { act: (f: () => void) => void }, view: EditorView, from: string, to: string) =>
    page.act(() => {
      const text = view.state.doc.toString();
      const at = text.indexOf(from);
      view.dispatch({ changes: { from: at, to: at + from.length, insert: to } });
    });

  it('edits its manifest (no status, no managedFields): checked by the server’s dry run, applied as a replace at the version read', async () => {
    const w = world();
    const page = renderPage(w, opened(D, 'shop', 'api'));
    await vi.waitFor(() => expect(button('Edit YAML')).toBeDefined());
    page.act(() => button('Edit YAML')?.click());
    expect(page.path).toContain('&edit=yaml/deployments.v1.apps/shop/api');
    const view = await editor();
    expect(view.state.doc.toString()).toContain('replicas: 2');
    expect(view.state.doc.toString()).not.toMatch(/managedFields|^status:/m);
    type(page, view, 'replicas: 2', 'replicas: 4');
    await vi.waitFor(() => expect(footer().textContent).toContain('Server dry run: valid'), later);
    expect(w.cluster.writes.at(-1)).toMatchObject({ op: 'update', name: 'api', dryRun: true });
    expect((w.cluster.get(Deployment, 'api', 'shop') as { spec?: { replicas?: number } }).spec?.replicas).toBe(2);
    page.act(() => button('Apply', footer())?.click());
    await vi.waitFor(() => expect((w.cluster.get(Deployment, 'api', 'shop') as { spec?: { replicas?: number } }).spec?.replicas).toBe(4));
    await vi.waitFor(() => expect(page.path).not.toContain('edit='));
  });

  it('says what the server refuses, at its field; not applied', async () => {
    const w = world();
    const page = renderPage(w, `${opened(D, 'shop', 'api')}&edit=yaml/${D}/shop/api`);
    const view = await editor();
    w.cluster.refuse('update', {
      status: 422,
      code: 'Invalid',
      message: 'Deployment.apps "api" is invalid: spec.selector: Invalid value: field is immutable',
      details: { causes: [{ reason: 'FieldValueInvalid', field: 'spec.selector', message: 'Invalid value: field is immutable' }] },
    });
    type(page, view, 'app: api\n  template', 'app: web\n  template');
    await vi.waitFor(() => expect(footer().textContent).toContain('Server dry run: 1 error'), later);
    expect(button('Apply', footer())?.disabled).toBe(true);
    await vi.waitFor(() => expect([...document.querySelectorAll('.cm-lintRange-error')].map((e) => e.textContent)).toContain('selector'), later);
  });

  it('refuses to apply over a change made since (409): rebased on the latest, its changes kept, applied at that version', async () => {
    const w = world();
    const page = renderPage(w, `${opened(D, 'shop', 'api')}&edit=yaml/${D}/shop/api`);
    const view = await editor();
    const now = w.cluster.get(Deployment, 'api', 'shop');
    w.cluster.change(Deployment, { ...now, metadata: { ...now?.metadata, annotations: { team: 'b' } } } as never);
    type(page, view, 'replicas: 2', 'replicas: 5');
    await vi.waitFor(() => expect(footer().textContent).toContain('409 Conflict'), later);
    expect(button('Apply', footer())?.disabled).toBe(true);
    page.act(() => button('Rebase on latest', footer())?.click());
    await vi.waitFor(() => expect(footer().textContent).toContain('Server dry run: valid'), later);
    expect(view.state.doc.toString()).toContain('replicas: 5');
    page.act(() => button('Apply', footer())?.click());
    await vi.waitFor(() => expect((w.cluster.get(Deployment, 'api', 'shop') as { spec?: { replicas?: number } }).spec?.replicas).toBe(5));
  });

  it('is not applied while its schema says it wrong (error validating data)', async () => {
    const w = world();
    const page = renderPage(w, `${opened(D, 'shop', 'api')}&edit=yaml/${D}/shop/api`);
    const view = await editor();
    type(page, view, 'replicas: 2', 'replicas: 2x');
    await vi.waitFor(() => expect(footer().textContent).toContain('error validating data: 1 error'), later);
    expect(button('Apply', footer())?.disabled).toBe(true);
  });
});

describe('a dialog in the path', () => {
  it('opens for an object as the API lists it (no apiVersion, no kind of its own): its kind the action’s', async () => {
    const w = world();
    const listed = { ...w.cluster.get(Deployment, 'api', 'shop') } as Record<string, unknown>;
    delete listed.apiVersion;
    delete listed.kind;
    w.cluster.change(Deployment, listed as never);
    const page = renderPage(w, opened(D, 'shop', 'api'));
    await vi.waitFor(() => expect(button('Edit YAML')).toBeDefined());
    page.act(() => button('Edit YAML')?.click());
    await vi.waitFor(() => expect(page.path).toContain(`&edit=yaml/${D}/shop/api`));
    await vi.waitFor(() => expect(dialog('edit-yaml')).not.toBeNull(), later);
    // Its manifest says its kind (as kubectl edit shows it): applied as it is.
    await vi.waitFor(() => expect(document.querySelector('[data-part="edit-yaml"] .cm-editor')).not.toBeNull(), later);
    const view = EditorView.findFromDOM(document.querySelector('[data-part="edit-yaml"] .cm-editor') as HTMLElement) as EditorView;
    expect(view.state.doc.toString()).toMatch(/^apiVersion: apps\/v1\nkind: Deployment\n/);
    page.act(() => {
      const at = view.state.doc.toString().indexOf('replicas: 2');
      view.dispatch({ changes: { from: at, to: at + 11, insert: 'replicas: 3' } });
    });
    await vi.waitFor(() => expect(footer().textContent).toContain('Server dry run: valid'), later);
  });

  it('closed, is out of the path as it was: Back does not open it again', async () => {
    const page = renderPage(world(), opened(D, 'shop', 'api'));
    await vi.waitFor(() => expect(button('Delete')).toBeDefined());
    page.act(() => button('Delete')?.click());
    await vi.waitFor(() => expect(dialog('delete')).not.toBeNull());
    page.act(() => button('Cancel', footer())?.click());
    await vi.waitFor(() => expect(page.path).not.toContain('edit='));
    page.act(() => page.back());
    expect(page.path).not.toContain('edit=');
  });

  it('goes with its object (deleted elsewhere): out of the path', async () => {
    const w = world();
    const page = renderPage(w, `${opened(D, 'shop', 'api')}&edit=delete/${D}/shop/api`);
    await vi.waitFor(() => expect(dialog('delete')).not.toBeNull());
    page.act(() => w.cluster.take(Deployment, 'api', 'shop'));
    await vi.waitFor(() => expect(page.path).not.toContain('edit='));
  });
});

describe('Apply YAML', () => {
  const opening = async (w: ReturnType<typeof world>) => {
    const page = renderPage(w, '/k/pods.v1');
    await vi.waitFor(() => expect(button('Apply YAML')).toBeDefined());
    page.act(() => button('Apply YAML')?.click());
    expect(page.path).toBe('/k/pods.v1?edit=apply');
    await vi.waitFor(() => expect(document.querySelector('[data-part="apply"] .cm-editor')).not.toBeNull(), later);
    const view = EditorView.findFromDOM(document.querySelector('[data-part="apply"] .cm-editor') as HTMLElement) as EditorView;
    const put = (text: string) => page.act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }));
    const rows = () => [...document.querySelectorAll('[data-object]')].map((r) => r.textContent);
    return { page, put, rows };
  };
  const applyFooter = () => document.querySelector('[data-part="apply-footer"]') as HTMLElement;
  const CM = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: made\n  namespace: shop\ndata:\n  a: "1"\n';
  const SCALED = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n  namespace: shop\nspec:\n  replicas: 5\n';

  it('applies each object of its documents server-side, checked first by the server’s dry run; told as kubectl tells it', async () => {
    const w = world();
    const { page, put, rows } = await opening(w);
    put(`${CM}---\n${SCALED}`);
    await vi.waitFor(() => expect(rows()).toEqual(['configmap/madedry run: valid', 'deployment.apps/apidry run: valid']), later);
    expect(w.cluster.writes.filter((x) => x.op === 'patch').map((x) => [x.name, x.change?.type, x.change?.dryRun])).toEqual([
      ['made', 'apply', true],
      ['api', 'apply', true],
    ]);
    expect(w.cluster.get(kinds.core.v1.ConfigMap, 'made', 'shop')).toBeUndefined();
    page.act(() => button('Apply', applyFooter())?.click());
    await vi.waitFor(() => expect(applyFooter().textContent).toContain('2 of 2 applied'));
    expect(rows()).toEqual(['configmap/madeserverside-applied', 'deployment.apps/apiserverside-applied']);
    expect(w.cluster.get(kinds.core.v1.ConfigMap, 'made', 'shop')?.data).toEqual({ a: '1' });
    expect((w.cluster.get(Deployment, 'api', 'shop') as { spec?: { replicas?: number } }).spec?.replicas).toBe(5);
  });

  it('takes a List’s items one by one; its namespace none, default; --force-conflicts sent as force', async () => {
    const w = world();
    const { put, rows } = await opening(w);
    (document.querySelector<HTMLButtonElement>('[data-part="apply"] [role="switch"]') as HTMLButtonElement).click();
    put(
      'apiVersion: v1\nkind: List\nitems:\n  - apiVersion: v1\n    kind: ConfigMap\n    metadata:\n      name: one\n  - apiVersion: v1\n    kind: ConfigMap\n    metadata:\n      name: two\n',
    );
    await vi.waitFor(() => expect(rows()).toEqual(['configmap/onedry run: valid', 'configmap/twodry run: valid']), later);
    expect(w.cluster.writes.at(-1)).toMatchObject({ op: 'patch', name: 'two', namespace: 'default', change: { type: 'apply', force: true, dryRun: true } });
  });

  it('refuses what the cluster does not serve, one without a name or apiVersion, YAML it cannot read — those not applied, the rest are', async () => {
    const w = world();
    const { page, put, rows } = await opening(w);
    put(`apiVersion: example.com/v1\nkind: Widget\nmetadata:\n  name: w\n---\napiVersion: v1\nkind: ConfigMap\nmetadata: {}\n---\nkind: Secret\n---\n${CM}`);
    await vi.waitFor(
      () =>
        expect(rows()).toEqual([
          'widget/wno matches for kind "Widget" in version "example.com/v1"',
          'configmap/resource name may not be empty',
          "secret/Object 'apiVersion' is missing",
          'configmap/madedry run: valid',
        ]),
      later,
    );
    page.act(() => button('Apply', applyFooter())?.click());
    await vi.waitFor(() => expect(applyFooter().textContent).toContain('1 of 4 applied'));
    expect(w.cluster.writes.filter((x) => x.op === 'patch' && !x.change?.dryRun).map((x) => x.name)).toEqual(['made']);
    put('kind: [\n');
    await vi.waitFor(() => expect(applyFooter().textContent).toContain('error parsing YAML'));
  });

  it('says what the server refuses of an object, at the line of its field', async () => {
    const w = world();
    const { put } = await opening(w);
    w.cluster.refuse('patch', {
      status: 422,
      code: 'Invalid',
      message: 'Deployment.apps "api" is invalid: spec.replicas: Invalid value: -1: must be greater than or equal to 0',
      details: { causes: [{ field: 'spec.replicas', message: 'Invalid value: -1: must be greater than or equal to 0' }] },
    });
    put(SCALED.replace('replicas: 5', 'replicas: -1'));
    await vi.waitFor(() => expect(document.querySelector('[data-object]')?.textContent).toContain('must be greater than or equal to 0'), later);
    await vi.waitFor(() => expect([...document.querySelectorAll('.cm-lint-marker-error')].length).toBeGreaterThan(0), later);
  });

  it('applies what needs those before it (a Namespace, then what is in it): their dry run refused, told, not in the way; applied in turn', async () => {
    const w = world();
    const { Namespace, ConfigMap } = kinds.core.v1;
    // The API server's: an object of a namespace not there, refused.
    const patch = w.cluster.patch.bind(w.cluster);
    vi.spyOn(w.cluster, 'patch').mockImplementation(async (k, o, c) => {
      if (o.metadata?.namespace === 'new' && !w.cluster.get(Namespace, 'new')) throw Object.assign(new Error('namespaces "new" not found'), { status: 404, code: 'NotFound' });
      return patch(k, o, c);
    });
    const { page, put, rows } = await opening(w);
    put(`apiVersion: v1\nkind: Namespace\nmetadata:\n  name: new\n---\n${CM.replace('namespace: shop', 'namespace: new')}`);
    await vi.waitFor(() => expect(rows()).toEqual(['namespace/newdry run: valid', 'configmap/madenamespaces "new" not found']), later);
    expect(button('Apply', applyFooter())?.disabled).toBe(false);
    page.act(() => button('Apply', applyFooter())?.click());
    await vi.waitFor(() => expect(applyFooter().textContent).toContain('2 of 2 applied'));
    expect(rows()).toEqual(['namespace/newserverside-applied', 'configmap/madeserverside-applied']);
    expect(w.cluster.get(ConfigMap, 'made', 'new')?.data).toEqual({ a: '1' });
  });

  it('dry-runs a manifest of many a few at a time; applied, its flag changed, says so no more', async () => {
    const w = world();
    let now = 0;
    let most = 0;
    const patch = w.cluster.patch.bind(w.cluster);
    vi.spyOn(w.cluster, 'patch').mockImplementation(async (k, o, c) => {
      most = Math.max(most, ++now);
      await new Promise((r) => setTimeout(r, 5));
      now--;
      return patch(k, o, c);
    });
    const { page, put, rows } = await opening(w);
    put(Array.from({ length: 20 }, (_, i) => CM.replace('name: made', `name: m${i}`)).join('---\n'));
    await vi.waitFor(() => expect(rows().filter((r) => r?.endsWith('dry run: valid'))).toHaveLength(20), later);
    expect(most).toBeLessThanOrEqual(8);
    page.act(() => button('Apply', applyFooter())?.click());
    await vi.waitFor(() => expect(applyFooter().textContent).toContain('20 of 20 applied'), later);
    page.act(() => (document.querySelector<HTMLButtonElement>('[data-part="apply"] [role="switch"]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(rows().some((r) => r?.endsWith('serverside-applied'))).toBe(false));
  });

  it('keeps each one’s dry run while the rest are applied', async () => {
    const w = world();
    let go: () => void = () => {};
    const patch = w.cluster.patch.bind(w.cluster);
    vi.spyOn(w.cluster, 'patch').mockImplementation(async (k, o, c) => {
      if (!c.dryRun && o.metadata?.name === 'made') await new Promise<void>((r) => (go = r));
      return patch(k, o, c);
    });
    const { page, put, rows } = await opening(w);
    put(`${CM}---\n${SCALED}`);
    await vi.waitFor(() => expect(rows()).toEqual(['configmap/madedry run: valid', 'deployment.apps/apidry run: valid']), later);
    page.act(() => button('Apply', applyFooter())?.click());
    await new Promise((r) => setTimeout(r, 50));
    expect(rows()).toEqual(['configmap/madedry run: valid', 'deployment.apps/apidry run: valid']);
    page.act(() => go());
    await vi.waitFor(() => expect(rows()).toEqual(['configmap/madeserverside-applied', 'deployment.apps/apiserverside-applied']));
  });
});

describe('Delete', () => {
  it('shows its dependents, deletes it by the cascade chosen once its name is typed', async () => {
    const w = world();
    const page = renderPage(w, opened(D, 'shop', 'api'));
    await vi.waitFor(() => expect(button('Delete')).toBeDefined());
    page.act(() => button('Delete')?.click());
    await vi.waitFor(() => expect(dialog('delete')?.textContent).toContain('api-7d4b9-b'));
    expect([...(dialog('delete')?.querySelectorAll('.ok-edit-list li') ?? [])].map((li) => li.textContent)).toEqual(['ReplicaSetapi-7d4b9', 'Podapi-7d4b9-a', 'Podapi-7d4b9-b']);
    const remove = () => button('Delete', footer()) as HTMLButtonElement;
    expect(remove().disabled).toBe(true);
    const input = dialog('delete')?.querySelector('input.uk-input') as HTMLInputElement;
    page.act(() => {
      input.value = 'api';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const orphan = [...(dialog('delete')?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])][2] as HTMLInputElement;
    page.act(() => orphan.click());
    expect(dialog('delete')?.textContent).toContain('Dependents (orphaned)');
    page.act(() => remove().click());
    await vi.waitFor(() => expect(w.cluster.get(Deployment, 'api', 'shop')).toBeUndefined());
    expect(w.cluster.writes.at(-1)).toMatchObject({ op: 'remove', name: 'api', propagationPolicy: 'Orphan' });
  });

  it('lists no pods of a kind that owns none (a ConfigMap): not asked for', async () => {
    const w = world();
    const cm = w.cluster.get(kinds.core.v1.ConfigMap, 'settings', 'shop');
    const pod = w.cluster.get(kinds.core.v1.Pod, 'shell', 'shop');
    w.cluster.change(kinds.core.v1.Pod, {
      ...pod,
      metadata: { ...pod?.metadata, ownerReferences: [{ apiVersion: 'v1', kind: 'ConfigMap', name: 'settings', uid: cm?.metadata?.uid ?? '' }] },
    } as never);
    renderPage(w, `${opened('configmaps.v1', 'shop', 'settings')}&edit=delete/configmaps.v1/shop/settings`);
    await vi.waitFor(() => expect(dialog('delete')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(dialog('delete')?.querySelector('.ok-edit-list')).toBeNull();
  });

  it('is deleted by Enter once its name is typed', async () => {
    const w = world();
    const page = renderPage(w, `${opened('configmaps.v1', 'shop', 'settings')}&edit=delete/configmaps.v1/shop/settings`);
    await vi.waitFor(() => expect(dialog('delete')).not.toBeNull());
    const input = dialog('delete')?.querySelector('input.uk-input') as HTMLInputElement;
    page.act(() => fireEvent.keyDown(input, { key: 'Enter' }));
    expect(w.cluster.writes.filter((x) => x.op === 'remove')).toEqual([]);
    page.act(() => {
      input.value = 'settings';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    page.act(() => fireEvent.keyDown(input, { key: 'Enter' }));
    await vi.waitFor(() => expect(w.cluster.get(kinds.core.v1.ConfigMap, 'settings', 'shop')).toBeUndefined());
  });

  it('shows a CronJob’s Jobs and their pods', async () => {
    renderPage(world(), `${opened('cronjobs.v1.batch', 'shop', 'nightly')}&edit=delete/cronjobs.v1.batch/shop/nightly`);
    await vi.waitFor(() => expect([...document.querySelectorAll('.ok-edit-list li')].map((li) => li.textContent)).toEqual(['Jobnightly-29', 'Podnightly-29-x']));
  });
});

describe('a node', () => {
  it('is cordoned and uncordoned', async () => {
    const w = world();
    const page = renderPage(w, opened('nodes.v1', undefined, 'node-a'));
    await vi.waitFor(() => expect(button('Cordon')).toBeDefined());
    page.act(() => button('Cordon')?.click());
    await vi.waitFor(() => expect((w.cluster.get(Node, 'node-a') as { spec?: { unschedulable?: boolean } }).spec?.unschedulable).toBe(true));
    await vi.waitFor(() => expect(button('Uncordon')).toBeDefined());
    page.act(() => button('Uncordon')?.click());
    await vi.waitFor(() => expect((w.cluster.get(Node, 'node-a') as { spec?: { unschedulable?: boolean } }).spec?.unschedulable).toBeUndefined());
  });

  it('is drained as kubectl drain does it: its pods grouped, --force, --ignore-daemonsets and --delete-emptydir-data asked; cordoned, evicted, a budget’s pod retried', async () => {
    const w = world();
    const page = renderPage(w, opened('nodes.v1', undefined, 'node-a'));
    await vi.waitFor(() => expect(button('Drain')).toBeDefined());
    page.act(() => button('Drain')?.click());
    await vi.waitFor(() => expect(dialog('drain')?.querySelectorAll('[data-pod]').length).toBe(6));
    const group = (g: string) => [...(dialog('drain')?.querySelectorAll(`[data-group="${g}"] [data-pod]`) ?? [])].map((r) => r.getAttribute('data-pod'));
    expect([group('noController'), group('evict'), group('budget'), group('daemonSet')]).toEqual([
      ['data/db-0', 'shop/shell'],
      ['shop/api-7d4b9-a', 'shop/cache-6f8d9-q2x7w'],
      ['shop/api-7d4b9-b'],
      ['shop/node-agent-x7k2p'],
    ]);
    const start = () => button('Drain', footer()) as HTMLButtonElement;
    expect([footer().textContent?.includes('use --force to override'), start().disabled]).toEqual([true, true]);
    const switches = () => [...(dialog('drain')?.querySelectorAll<HTMLButtonElement>('[role="switch"]') ?? [])];
    page.act(() => switches()[0]?.click());
    expect([footer().textContent?.includes('use --ignore-daemonsets to ignore'), start().disabled]).toEqual([true, true]);
    page.act(() => switches()[2]?.click());
    expect([footer().textContent?.includes('use --delete-emptydir-data to override'), start().disabled]).toEqual([true, true]);
    page.act(() => switches()[1]?.click());
    expect(start().disabled).toBe(false);
    page.act(() => start().click());
    await vi.waitFor(() => expect(dialog('drain')?.querySelector('[data-pod="shop/api-7d4b9-b"]')?.textContent).toContain('retrying'), later);
    expect((w.cluster.get(Node, 'node-a') as { spec?: { unschedulable?: boolean } }).spec?.unschedulable).toBe(true);
    const evicted = () => new Set(w.cluster.writes.filter((x) => x.op === 'evict').map((x) => x.name));
    await vi.waitFor(() => expect(evicted()).toEqual(new Set(['db-0', 'shell', 'api-7d4b9-a', 'cache-6f8d9-q2x7w', 'api-7d4b9-b'])), later);
    expect(w.cluster.get(kinds.core.v1.Pod, 'api-7d4b9-a', 'shop')).toBeUndefined();
    expect(w.cluster.get(kinds.core.v1.Pod, 'api-7d4b9-b', 'shop')).toBeDefined();
  });
});

describe('a drain going wrong', () => {
  const started = async (w: ReturnType<typeof world>) => {
    const page = renderPage(w, `${opened('nodes.v1', undefined, 'node-a')}&edit=drain/nodes.v1/node-a`);
    await vi.waitFor(() => expect(dialog('drain')?.querySelectorAll('[role="switch"]').length).toBe(3));
    for (const s of [...(dialog('drain')?.querySelectorAll<HTMLButtonElement>('[role="switch"]') ?? [])]) page.act(() => s.click());
    page.act(() => (button('Drain', footer()) as HTMLButtonElement).click());
    return page;
  };

  it('says the node was not cordoned (its patch refused) and evicts nothing — to be asked again', async () => {
    const w = world();
    w.cluster.refuse('patch', { status: 403, code: 'Forbidden', message: 'nodes "node-a" is forbidden' });
    await started(w);
    await vi.waitFor(() => expect(dialog('drain')?.textContent).toContain('node/node-a not cordoned'));
    expect(w.cluster.writes.filter((x) => x.op === 'evict')).toEqual([]);
    expect(button('Drain', footer())?.disabled).toBe(false);
  });

  it('takes a pod gone meanwhile (404) as evicted, as kubectl drain does', async () => {
    const w = world();
    w.cluster.refuse('evict', { status: 404, code: 'NotFound', message: 'pods "db-0" not found' });
    await started(w);
    await vi.waitFor(() => expect(dialog('drain')?.querySelector('[data-pod="data/db-0"]')?.textContent).toContain('evicted'), later);
  });

  it('asks before it is closed while it goes; closed, evicts no more (its retries stopped)', async () => {
    const w = world();
    const page = await started(w);
    await vi.waitFor(() => expect(dialog('drain')?.querySelector('[data-pod="shop/api-7d4b9-b"]')?.textContent).toContain('retrying'), later);
    page.act(() => button('Close', footer())?.click());
    expect(footer().textContent).toContain('Closing stops the drain: node/node-a stays cordoned, 1 pod not evicted');
    page.act(() => button('Stop draining', footer())?.click());
    await vi.waitFor(() => expect(page.path).not.toContain('edit='));
    const tries = w.cluster.writes.filter((x) => x.op === 'evict' && x.name === 'api-7d4b9-b').length;
    await new Promise((r) => setTimeout(r, 5500));
    expect(w.cluster.writes.filter((x) => x.op === 'evict' && x.name === 'api-7d4b9-b').length).toBe(tries);
  }, 15000);

  it('asks before it is closed by Escape too; Continue draining keeps it going', async () => {
    const w = world();
    const page = await started(w);
    await vi.waitFor(() => expect(dialog('drain')?.querySelector('[data-pod="shop/api-7d4b9-b"]')?.textContent).toContain('retrying'), later);
    page.act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    await vi.waitFor(() => expect(footer().textContent).toContain('Closing stops the drain'));
    expect(page.path).toContain('edit=drain');
    page.act(() => button('Continue draining', footer())?.click());
    expect(footer().textContent).not.toContain('Closing stops the drain');
    expect(page.path).toContain('edit=drain');
  });

  it('says a pod evicted once it is gone, not when its eviction is accepted', async () => {
    const w = world();
    const evict = w.cluster.evict.bind(w.cluster);
    // Accepted, not gone yet (it terminates).
    vi.spyOn(w.cluster, 'evict').mockImplementation(async (p) => {
      if (p.metadata?.name !== 'shell') return evict(p);
    });
    const page = await started(w);
    await vi.waitFor(() => expect(dialog('drain')?.querySelector('[data-pod="data/db-0"]')?.textContent).toContain('evicted'), later);
    expect(dialog('drain')?.querySelector('[data-pod="shop/shell"]')?.textContent).toContain('evicting');
    page.act(() => w.cluster.take(kinds.core.v1.Pod, 'shell', 'shop'));
    await vi.waitFor(() => expect(dialog('drain')?.querySelector('[data-pod="shop/shell"]')?.textContent).toContain('evicted'), later);
  });
});

describe('a node’s pods, grouped as kubectl drain tells them', () => {
  it('evicts those of a controller (a budget’s spent pod by pod), ignores DaemonSet-managed and mirror pods, refuses those of none — a done one aside', () => {
    const pod = (name: string, more: object) => ({ metadata: { name, namespace: 'ns', ...more } });
    const owned = (kind: string) => ({ ownerReferences: [{ apiVersion: 'apps/v1', kind, name: 'x', uid: 'x', controller: true }] });
    const budget = { metadata: { name: 'b', namespace: 'ns' }, spec: { selector: { matchLabels: { app: 'a' } } }, status: { disruptionsAllowed: 1 } };
    const g = groupsOf(
      [
        pod('a1', { ...owned('ReplicaSet'), labels: { app: 'a' } }),
        pod('a2', { ...owned('ReplicaSet'), labels: { app: 'a' } }),
        pod('ds', owned('DaemonSet')),
        pod('static', { annotations: { 'kubernetes.io/config.mirror': 'x' } }),
        pod('bare', {}),
        { ...pod('done', {}), spec: { volumes: [{ name: 'tmp', emptyDir: {} }] }, status: { phase: 'Succeeded' } },
        pod('exp', { ...owned('ReplicaSet'), labels: { tier: 'db' } }),
      ],
      [
        budget,
        {
          metadata: { name: 'e', namespace: 'ns' },
          spec: { selector: { matchExpressions: [{ key: 'tier', operator: 'In', values: ['db'] }] } },
          status: { disruptionsAllowed: 0 },
        },
      ],
    );
    expect(g.map((p) => [p.name, p.group])).toEqual([
      ['a1', 'evict'],
      ['a2', 'budget'],
      ['ds', 'daemonSet'],
      ['static', 'mirror'],
      ['bare', 'noController'],
      ['done', 'evict'],
      ['exp', 'budget'],
    ]);
    // A done one's emptyDir data: no reason to stop (kubectl's localStorageFilter).
    expect(g.find((p) => p.name === 'done')?.emptyDir).toBe(false);
    expect(DaemonSet.kind).toBe('DaemonSet');
  });
});
