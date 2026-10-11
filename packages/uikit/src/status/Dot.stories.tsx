import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Dot } from './Dot';

const meta = {
  title: 'Status/Dot',
  component: Dot,
  args: { level: 'ok', title: 'ok' },
  argTypes: { level: { control: 'select', options: [undefined, 'ok', 'warn', 'error'] } },
} satisfies Meta<typeof Dot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ok: Story = {};
export const Warn: Story = { args: { level: 'warn', title: 'warn' } };
export const Failing: Story = { args: { level: 'error', title: 'error' } };
export const Unknown: Story = { args: { level: undefined, title: 'not known' } };
