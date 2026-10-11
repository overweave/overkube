import { hashRouter, notifications, Shell } from '@overkube/shell';
import { css, Notice } from '@overkube/uikit';
import type { Registry } from '@overweave/core';
import { render } from 'preact';
import type { AddonHost, AddonStatus } from '../host/addons.ts';
import type { ClusterAccess } from '../host/cluster.ts';

export interface Page {
  // biome-ignore lint/suspicious/noExplicitAny: a registry of the dashboard's kinds.
  registry: Registry<any>;
  host: AddonHost;
  cluster: ClusterAccess;
}

/** The kit's styles, once per document. */
function styles(doc: Document): void {
  if (doc.getElementById('overkube-css')) return;
  const style = doc.createElement('style');
  style.id = 'overkube-css';
  style.textContent = css;
  doc.head.appendChild(style);
}

/** The core, not running: said over the page (all it draws is its, so a page without it is empty). */
function CoreDown({ host }: { host: AddonHost }) {
  const core: AddonStatus | undefined = host.status('core');
  if (!core || core.state === 'running' || core.state === 'degraded' || core.state === 'starting') return null;
  return (
    <Notice level="error" icon="warning" title="The core addon is not running">
      {core.state}
      {core.reason ? ` — ${core.reason}` : ''}
      {core.error ? `: ${core.error}` : ''}
    </Notice>
  );
}

/**
 * The page drawn into an element: the shell (the frame, the route at the
 * hash) over the registry and the cluster, what addons tell the user, their
 * failures told as their own — and, should the core not run, that said.
 * Dark, or light as the system is. What it gives back takes it away.
 */
export function mount(element: HTMLElement, page: Page, told = notifications()): () => void {
  const doc = element.ownerDocument;
  const win = doc.defaultView as Window;
  styles(doc);
  element.classList.add('uk-root');
  const light = win.matchMedia?.('(prefers-color-scheme: light)');
  const theme = () => {
    if (light?.matches) element.dataset.theme = 'light';
    else delete element.dataset.theme;
  };
  theme();
  light?.addEventListener('change', theme);
  const router = hashRouter(win);
  render(
    <>
      <CoreDown host={page.host} />
      <Shell
        registry={page.registry}
        cluster={page.cluster.components()}
        router={router}
        notifications={told}
        onFailure={(definition, field, error) => page.host.failed(definition, field, error)}
      />
    </>,
    element,
  );
  return () => {
    render(null, element);
    router.close();
    told.close();
    light?.removeEventListener('change', theme);
  };
}
