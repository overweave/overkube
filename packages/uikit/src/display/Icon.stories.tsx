import type { Meta, StoryObj } from '@storybook/preact-vite';
import { ICONS, Icon } from './Icon';

const meta = { title: 'Display/Icon', component: Icon, args: { name: 'kube' }, argTypes: { name: { control: 'select', options: ICONS } } } satisfies Meta<typeof Icon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const One: Story = {};
export const All: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
      {ICONS.map((name) => (
        <span key={name} title={name}>
          <Icon name={name} />
        </span>
      ))}
    </div>
  ),
};
