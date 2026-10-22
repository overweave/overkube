import { cleanup, render, waitFor } from '@testing-library/preact';
import { type FunctionComponent, h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import * as stories from './edit.stories.tsx';

/* The Edit addon's stories draw, each: what Storybook shows is what they say. */

afterEach(cleanup);

const SAID: Record<string, string> = {
  Actions: 'Edit YAML',
  ManagedByFlux: 'Restart',
  ManagedByHelm: 'Restart',
  EditYaml: 'Edit Deployment api',
  Delete: 'Delete Deployment api',
  DeleteCronJob: 'nightly-29-x',
  ApplyYaml: 'kubectl apply',
  Node: 'Cordon',
  Cordoned: 'Uncordon',
  Drain: 'Drain Node node-a',
};

describe('the Edit addon’s stories', () => {
  for (const [name, Story] of Object.entries(stories).filter(([n]) => n !== 'default')) {
    it(`${name} draws`, async () => {
      render(h(Story as FunctionComponent, null));
      expect(SAID[name], `${name}: what it says`).toBeDefined();
      await waitFor(() => expect(document.body.textContent).toContain(SAID[name]), { timeout: 4000 });
    });
  }
});
