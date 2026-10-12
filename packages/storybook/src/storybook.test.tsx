import core from '@overkube/addon-core';
import { kinds } from '@overkube/kube-types';
import { column, defineAddon, slots } from '@overkube/sdk';
import { cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { storybook } from './index.ts';
import { KubeStory, make } from './preact/index.ts';

/*
 * A story of the page: the addons given run beside one another over the
 * story's cluster, at its path; one left out, gone; the user's changes over
 * them. And Storybook's config, overkube's sources read as the page reads them.
 */

afterEach(cleanup);

const { Pod } = kinds.core.v1;

const images = defineAddon({
  id: 'images',
  title: 'Images',
  setup: ({ contributor }) =>
    void contributor.add(
      'Column',
      'images.image',
      column({ kinds: [Pod], header: 'Image', value: (p) => p.spec?.containers?.[0]?.image, display: (p) => p.spec?.containers?.[0]?.image ?? '' }),
    ),
});

const pods = (c: Parameters<NonNullable<Parameters<typeof KubeStory>[0]['cluster']>>[0]) => {
  c.add(Pod, make(Pod, { metadata: { name: 'web' }, spec: { containers: [{ name: 'a', image: 'nginx:1.27' }] } }));
};

const headers = (el: Element) => [...el.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent?.trim()).filter(Boolean);

describe('KubeStory', () => {
  it('draws the page at its path, the addons beside one another over the story’s cluster', async () => {
    const view = render(<KubeStory addons={[core, images]} path="/k/pods.v1" cluster={pods} />);
    await waitFor(() => expect(headers(view.container)).toEqual(['Name', 'Namespace', 'Ready', 'Status', 'Restarts', 'Image', 'Age']));
    expect(view.container.textContent).toContain('nginx:1.27');
    expect((view.container.querySelector('input[aria-label="Path"]') as HTMLInputElement).value).toBe('/k/pods.v1');
    // Without it: what it added is gone, the rest as it was.
    view.rerender(<KubeStory addons={[core]} path="/k/pods.v1" cluster={pods} />);
    await waitFor(() => expect(headers(view.container)).toEqual(['Name', 'Namespace', 'Ready', 'Status', 'Restarts', 'Age']));
  });

  it('lays the user’s changes over every addon’s', async () => {
    const view = render(
      <KubeStory
        addons={[core, images]}
        path="/k/pods.v1"
        cluster={pods}
        user={(u) => {
          u.patch('TableView', Pod.id, { hidden: { 'core.namespace': true } });
          u.patch('NavView', 'default', { mode: 'side' });
        }}
      />,
    );
    await waitFor(() => expect(headers(view.container)).toEqual(['Name', 'Ready', 'Status', 'Restarts', 'Image', 'Age']));
    expect(view.container.querySelector('aside.uk-rail')).not.toBeNull();
  });
});

describe('KubeStory’s look', () => {
  it('is dark or light as the story says, the core’s Appearance or none', async () => {
    const light = render(<KubeStory addons={[core]} path="/k/pods.v1" cluster={pods} theme="light" />);
    await waitFor(() => expect((light.container.querySelector('.uk-root') as HTMLElement).dataset.theme).toBe('light'));
    cleanup();
    const bare = defineAddon({
      id: 'bare',
      title: 'Bare',
      setup: ({ contributor }) => {
        contributor.add('Page', 'home', { path: '/' });
        contributor.add('Fill', 'bare.home', { slot: slots.page('home').name, render: () => <p>bare</p> });
      },
    });
    const none = render(<KubeStory addons={[bare]} theme="light" />);
    await waitFor(() => expect(none.container.textContent).toContain('bare'));
    expect((none.container.querySelector('.uk-root') as HTMLElement).dataset.theme).toBe('light');
  });
});

describe('KubeStory, started anew', () => {
  it('reads its start once; another resetKey starts it again with what it is then', async () => {
    const hide = (name: string) => (u: Parameters<NonNullable<Parameters<typeof KubeStory>[0]['user']>>[0]) => u.patch('TableView', Pod.id, { hidden: { [name]: true } });
    const view = render(<KubeStory addons={[core, images]} path="/k/pods.v1" cluster={pods} user={hide('core.namespace')} resetKey={1} />);
    await waitFor(() => expect(headers(view.container)).toEqual(['Name', 'Ready', 'Status', 'Restarts', 'Image', 'Age']));
    view.rerender(<KubeStory addons={[core, images]} path="/k/pods.v1" cluster={pods} user={hide('images.image')} resetKey={1} />);
    expect(headers(view.container)).toEqual(['Name', 'Ready', 'Status', 'Restarts', 'Image', 'Age']);
    view.rerender(<KubeStory addons={[core, images]} path="/k/pods.v1" cluster={pods} user={hide('images.image')} resetKey={2} />);
    await waitFor(() => expect(headers(view.container)).toEqual(['Name', 'Namespace', 'Ready', 'Status', 'Restarts', 'Age']));
  });

  it('lists a definition’s failure under the story', async () => {
    const broken = defineAddon({
      id: 'broken',
      title: 'Broken',
      setup: ({ contributor }) => void contributor.add('Column', 'broken.c', column({ header: 'B', value: () => ({ n: 1n }), display: () => JSON.stringify({ n: 1n }) })),
    });
    const view = render(<KubeStory addons={[core, broken]} path="/k/pods.v1" cluster={pods} />);
    await waitFor(() => expect(view.container.querySelector('[data-overkube-failures]')?.textContent).toContain('Column/broken.c (display)'));
  });
});

describe('storybook', () => {
  it('reads overkube’s and overweave’s packages from their sources', () => {
    const config = storybook({ stories: ['../src/**/*.stories.tsx'], panel: false });
    expect(config.stories).toEqual(['../src/**/*.stories.tsx']);
    const vite = config.viteFinal({}) as { resolve?: { conditions?: string[] } };
    expect(vite.resolve?.conditions?.slice(0, 2)).toEqual(['overkube-source', 'overweave-source']);
  });
});
