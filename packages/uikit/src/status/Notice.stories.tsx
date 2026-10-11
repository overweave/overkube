import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Button } from '../actions/Button';
import { Notice } from './Notice';

const meta = {
  title: 'Status/Notice',
  component: Notice,
  args: { children: 'Loading Pods…' },
  argTypes: { level: { control: 'select', options: [undefined, 'ok', 'warn', 'error'] } },
} satisfies Meta<typeof Notice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Loading: Story = { args: { loading: true } };
export const WithIcon: Story = { args: { icon: 'puzzle', children: 'The cluster does not serve this kind.' } };
export const Ok: Story = { args: { level: 'ok', icon: 'shield', children: 'Pinned: it cannot change under this name.' } };
export const Warn: Story = { args: { level: 'warn', icon: 'warning', children: '3 pods need a look.' } };
export const Failing: Story = { args: { level: 'error', icon: 'warning', children: 'Pods cannot be listed (Forbidden).' } };

/** As the page has them: loading, nothing to show, a title over words, a long one, one with what to do. */
export const All: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '24px', maxWidth: '560px' }}>
      <Notice loading>Loading Pods…</Notice>
      <Notice icon="puzzle">The cluster does not serve networking.k8s.io/v1/Ingress.</Notice>
      <Notice level="ok" icon="shield">
        Pinned: it cannot change under this name.
      </Notice>
      <Notice level="warn" icon="warning" title="Images: latest">
        nginx:latest can change under this name. Pin a tag of a release, or a digest (@sha256:…), so a restart runs what ran before.
      </Notice>
      <Notice
        level="error"
        icon="warning"
        action={
          <Button variant="ghost" size="sm" icon="refresh">
            Retry
          </Button>
        }
      >
        Pods cannot be listed (Forbidden).
      </Notice>
      <Notice level="error" icon="warning" title="The session is over">
        Log in again, then reload the page.
      </Notice>
    </div>
  ),
};
