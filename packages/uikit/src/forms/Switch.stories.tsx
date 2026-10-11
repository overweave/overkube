import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Switch } from './Switch';

const meta = { title: 'Forms/Switch', component: Switch, args: { label: 'Hide empty', checked: true, onChange: () => {} } } satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = {};
export const Off: Story = { args: { checked: false } };
export const Disabled: Story = { args: { disabled: true } };
export const Turning: Story = {
  render: (args) => {
    const [on, setOn] = useState(args.checked);
    return <Switch {...args} checked={on} onChange={setOn} />;
  },
};

/** Every state, side by side, each live: off, on, disabled off and on. */
export const States: Story = {
  render: () => {
    const [a, setA] = useState(false);
    const [b, setB] = useState(true);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '24px', alignItems: 'flex-start' }}>
        <Switch label="Warn of :latest" checked={a} onChange={setA} />
        <Switch label="Count init containers" checked={b} onChange={setB} />
        <Switch label="Disabled, off" checked={false} onChange={() => {}} disabled />
        <Switch label="Disabled, on" checked onChange={() => {}} disabled />
      </div>
    );
  },
};
