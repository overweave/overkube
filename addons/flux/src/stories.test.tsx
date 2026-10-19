import { cleanup, render, waitFor } from '@testing-library/preact';
import { type FunctionComponent, h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import * as stories from './flux.stories.tsx';

/* The Flux addon's stories draw, each: what Storybook shows is what they say. */

afterEach(cleanup);

const SAID: Record<string, string> = {
  GitRepositories: 'GitOperationFailed',
  Kustomizations: 'ArtifactFailed',
  HelmReleases: 'UpgradeFailed',
  Reconciling: 'Reconciling',
  SourceFailing: 'still served',
  Inventory: 'NotFound',
  UsedBy: 'seed-flux-hello-chart',
  Start: 'Suspended',
  Pods: 'by-hand',
  ManagedBy: 'Managed By',
};

describe('the Flux addon’s stories', () => {
  for (const [name, Story] of Object.entries(stories).filter(([n]) => n !== 'default')) {
    it(`${name} draws`, async () => {
      render(h(Story as FunctionComponent, null));
      expect(SAID[name], `${name}: what it says`).toBeDefined();
      await waitFor(() => expect(document.body.textContent).toContain(SAID[name]));
    });
  }
});
