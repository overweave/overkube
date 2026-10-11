import type { Client } from '@overkube/client';
import { kindMatcher } from '@overkube/sdk';
import { KubeProvider } from '@overkube/sdk/preact';
import { css } from '@overkube/uikit';
import type { Registry } from '@overweave/core';
import { OverweaveProvider } from '@overweave/ui/preact';
import { render } from 'preact';
import type { AddonHost } from '../host/addons.ts';
import type { ClusterAccess } from '../host/cluster.ts';
import { App } from './App.tsx';
import { HostContext } from './context.ts';
import { placeOf } from './place.ts';

export interface Page {
  client: Client;
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

/**
 * The page drawn into an element: the registry and how its slots choose
 * (overweave's provider, the kinds' matcher; a failure told as its
 * addon's), the cluster its components work with, the frame. Dark, or light
 * as the system is. What it gives back takes it away.
 */
export function mount(element: HTMLElement, page: Page): () => void {
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
  const { place, close } = placeOf(win);
  // Components hold kinds while drawn (useCollection), never for good: theirs has no collection().
  const cluster = page.cluster.components();
  render(
    <OverweaveProvider registry={page.registry} matcher={kindMatcher} onError={(f) => page.host.fail(f)}>
      <HostContext.Provider value={page.host}>
        <KubeProvider cluster={cluster}>
          <App client={page.client} place={place} />
        </KubeProvider>
      </HostContext.Provider>
    </OverweaveProvider>,
    element,
  );
  return () => {
    render(null, element);
    close();
    light?.removeEventListener('change', theme);
  };
}
