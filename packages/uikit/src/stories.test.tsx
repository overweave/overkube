import type { Meta, StoryObj } from '@storybook/preact-vite';
import { cleanup, render } from '@testing-library/preact';
import { type ComponentType, h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * Every story drawn, as a smoke test: its render (or its component) with
 * its args, as a component (as Storybook draws it), in a DOM.
 */

type Module = { default: Meta } & Record<string, StoryObj | Meta>;
const modules = import.meta.glob<Module>('./**/*.stories.tsx', { eager: true });

afterEach(cleanup);

describe('the kit’s stories', () => {
  for (const [file, { default: meta, ...stories }] of Object.entries(modules)) {
    for (const [name, story] of Object.entries(stories as Record<string, StoryObj>)) {
      it(`${meta.title} / ${name} (${file}) draws`, () => {
        const args = { ...meta.args, ...story.args } as Record<string, unknown>;
        const Story = () => (story.render ? story.render(args as never, {} as never) : h(meta.component as ComponentType, args));
        const { container } = render(h(Story as ComponentType, null));
        expect(container.innerHTML.length).toBeGreaterThan(0);
      });
    }
  }
});
