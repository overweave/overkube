import { cleanup, render, waitFor } from '@testing-library/preact';
import { type FunctionComponent, h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import * as stories from './core.stories.tsx';

/* The core's stories draw, each: what Storybook shows is what they say. */

afterEach(cleanup);

const said: Record<string, string> = {
  Table: 'web-1',
  AnObject: 'Pod shop/web-1',
  SideMenu: 'Workloads',
  Forbidden: 'pods cannot be had: Forbidden',
  Light: 'web-2',
};

describe('the core’s stories', () => {
  for (const [name, Story] of Object.entries(stories).filter(([n]) => n !== 'default')) {
    it(`${name} draws`, async () => {
      const view = render(h(Story as FunctionComponent, null));
      await waitFor(() => expect(view.container.textContent).toContain(said[name]));
    });
  }
});
