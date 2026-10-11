import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Stat } from './Stat';

const meta = {
  title: 'Display/Stat',
  component: Stat,
  args: { icon: 'cube', title: 'Pods', value: 18, total: 25, note: '7 need a look', level: 'error' },
  argTypes: { level: { control: 'select', options: [undefined, 'ok', 'warn', 'error'] } },
} satisfies Meta<typeof Stat>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Failing: Story = {};
export const Fine: Story = { args: { value: 1, total: 1, note: 'all fine', level: undefined, icon: 'server', title: 'Nodes' } };
export const Count: Story = { args: { value: 14, total: undefined, note: undefined, level: undefined, icon: 'file', title: 'Config Maps' } };
export const Loading: Story = { args: { loading: true, value: undefined, total: undefined, note: undefined, level: undefined } };
export const Clickable: Story = { args: { onClick: () => {} } };

/** As the overview has them: tiles in a grid, clickable (the grid lights a tile; the tile its title and arrow). */
export const Tiles: Story = {
  render: () => (
    <div style={{ padding: '24px' }}>
      <div class="uk-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', overflow: 'hidden' }}>
        {[
          { icon: 'server', title: 'Nodes', value: 1, total: 1, note: 'all fine' },
          { icon: 'cube', title: 'Pods', value: 18, total: 25, note: '7 need a look', level: 'error' as const },
          { icon: 'layers', title: 'Deployments', value: 11, total: 12, note: '1 needs a look', level: 'warn' as const },
          { icon: 'network', title: 'Services', value: 12 },
          { icon: 'file', title: 'Config Maps', loading: true },
          { icon: 'key', title: 'Secrets', value: 21 },
        ].map((s) => (
          <div key={s.title} style={{ padding: '18px 20px', minHeight: '112px', borderRight: '1px solid var(--uk-border)', borderBottom: '1px solid var(--uk-border)' }}>
            <Stat {...s} onClick={() => {}} />
          </div>
        ))}
      </div>
    </div>
  ),
};
