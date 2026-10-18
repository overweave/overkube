import { cleanup, render, waitFor } from '@testing-library/preact';
import { type FunctionComponent, h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import * as stories from './helm.stories.tsx';

/* The Helm addon's stories draw, each: what Storybook shows is what they say. */

afterEach(cleanup);

const SAID: Record<string, string> = {
  Releases: 'ingress-nginx',
  Release: 'hello-0.1.0',
  Failed: 'context deadline exceeded',
  Pending: 'helm rollback ingress 3',
  Start: 'Helm releases',
  Table: 'by-hand',
};

describe('the Helm addon’s stories', () => {
  for (const [name, Story] of Object.entries(stories).filter(([n]) => n !== 'default')) {
    it(`${name} draws`, async () => {
      render(h(Story as FunctionComponent, null));
      expect(SAID[name], `${name}: what it says`).toBeDefined();
      await waitFor(() => expect(document.body.textContent).toContain(SAID[name]));
    });
  }
});
