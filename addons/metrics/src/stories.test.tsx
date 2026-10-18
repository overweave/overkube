import { cleanup, render, waitFor } from '@testing-library/preact';
import { type FunctionComponent, h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import * as stories from './metrics.stories.tsx';

/* The metrics addon's stories draw, each: what Storybook shows is what they say. */

afterEach(cleanup);

const SAID: Record<string, string> = {
  Pods: '412m',
  PodsNowOnly: '460Mi',
  Nodes: '2.14 cores',
  Overview: 'Top pods',
  PodTab: 'Pod api-7f9c-x2kqp',
  NodeTab: 'Node kube-1',
  PodTabNowOnly: 'Pod api-7f9c-x2kqp',
};

describe('the metrics addon’s stories', () => {
  for (const [name, Story] of Object.entries(stories).filter(([n]) => n !== 'default')) {
    it(`${name} draws`, async () => {
      render(h(Story as FunctionComponent, null));
      expect(SAID[name], `${name}: what it says`).toBeDefined();
      await waitFor(() => expect(document.body.textContent).toContain(SAID[name]));
    });
  }
});
