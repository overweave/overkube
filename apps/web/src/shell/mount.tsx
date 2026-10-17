import type { AddonStatus, UserChanges } from '@overkube/sdk';
import { hashRouter, notifications, Shell } from '@overkube/shell';
import { adoptStyles, Notice } from '@overkube/uikit';
import type { Registry } from '@overweave/core';
import { mountSlotOverlay } from '@overweave/ui/overlay';
import { slotTrace } from '@overweave/ui/preact';
import { render } from 'preact';
import type { AddonHost } from '../host/addons.ts';
import type { ClusterAccess } from '../host/cluster.ts';

export interface Page {
  // biome-ignore lint/suspicious/noExplicitAny: a registry of the dashboard's kinds.
  registry: Registry<any>;
  host: AddonHost;
  cluster: ClusterAccess;
  /** Where the user's changes are made. */
  user: UserChanges;
  /** The slots over the page (where each is, the empty ones): its overlay open, ctrl+shift+s to close it; what the one signed in may not have, shown marked rather than hidden. */
  debug?: boolean;
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
 * How it looks is the shell's (the Appearance); debugged, the slots over
 * it. What it gives back takes it away.
 */
export function mount(element: HTMLElement, page: Page, told = notifications()): () => void {
  const doc = element.ownerDocument;
  const win = doc.defaultView as Window;
  adoptStyles(doc);
  // The kit's root: its tokens' defaults; the shell sets the theme's over them (dark, light, as the system is).
  element.classList.add('uk-root');
  const router = hashRouter(win);
  const trace = page.debug ? slotTrace() : undefined;
  const overlay = trace && mountSlotOverlay({ trace, open: true, parent: doc.body });
  render(
    <>
      <CoreDown host={page.host} />
      <Shell
        registry={page.registry}
        cluster={page.cluster.components()}
        user={page.user}
        addons={page.host}
        router={router}
        notifications={told}
        trace={trace}
        access={page.debug ? 'mark' : 'hide'}
        onFailure={(definition, field, error) => page.host.failed(definition, field, error)}
      />
    </>,
    element,
  );
  return () => {
    render(null, element);
    overlay?.stop();
    router.close();
    told.close();
  };
}
