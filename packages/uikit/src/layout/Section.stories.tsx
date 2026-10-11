import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Section } from './Section';

const meta = { title: 'Layout/Section', component: Section, args: { title: 'Overview', children: 'What is in it.' } } satisfies Meta<typeof Section>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
