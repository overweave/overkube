import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Fragment } from 'preact';
import { ICONS } from '../display/Icon';
import { Button } from './Button';

const meta = {
  title: 'Actions/Button',
  component: Button,
  args: { children: 'Restart' },
  argTypes: {
    variant: { control: 'select', options: [undefined, 'primary', 'danger', 'ghost', 'field'] },
    size: { control: 'select', options: [undefined, 'sm'] },
    icon: { control: 'select', options: [undefined, ...ICONS] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = [
  [undefined, 'Plain', 'refresh', 'Restart'],
  ['primary', 'Primary', 'check', 'Apply'],
  ['danger', 'Danger', 'x', 'Delete'],
  ['ghost', 'Ghost', 'refresh', 'Try again'],
] as const;

/** Every variant: words, an icon and words, an icon alone, small, disabled, busy. */
export const All: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, max-content)', gap: '14px 16px', alignItems: 'center', padding: '24px' }}>
      {VARIANTS.map(([variant, name, icon, words]) => (
        <Fragment key={name}>
          <span style={{ color: 'var(--uk-muted)', fontSize: '12px', width: '60px' }}>{name}</span>
          <Button variant={variant}>{words}</Button>
          <Button variant={variant} icon={icon}>
            {words}
          </Button>
          <Button variant={variant} icon={icon} aria-label={words} />
          <Button variant={variant} size="sm" icon={icon}>
            {words}
          </Button>
          <Button variant={variant} disabled>
            {words}
          </Button>
          <Button variant={variant} busy>
            {words}
          </Button>
        </Fragment>
      ))}
      <span style={{ color: 'var(--uk-muted)', fontSize: '12px' }}>Field</span>
      <div style={{ gridColumn: 'span 6' }}>
        <Button variant="field" icon="search">
          Search or jump to…
        </Button>
      </div>
    </div>
  ),
};

export const Plain: Story = {};
export const Primary: Story = { args: { variant: 'primary', children: 'Apply' } };
export const Danger: Story = { args: { variant: 'danger', icon: 'x', children: 'Delete' } };
export const Ghost: Story = { args: { variant: 'ghost', icon: 'refresh', children: 'Try again' } };
export const Field: Story = { args: { variant: 'field', icon: 'search', children: 'Search or jump to…' } };
export const Small: Story = { args: { size: 'sm', icon: 'refresh' } };
export const IconOnly: Story = { args: { icon: 'refresh', children: undefined, 'aria-label': 'Refresh' } };
export const Busy: Story = { args: { busy: true, variant: 'primary', children: 'Applying' } };
export const Disabled: Story = { args: { disabled: true } };
