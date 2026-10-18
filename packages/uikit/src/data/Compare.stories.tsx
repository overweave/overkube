import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Compare } from './Compare';

/** A certificate's spec against what its Secret holds: a DNS name missing, an older duration. */
function Drift() {
  return (
    <div style={{ maxWidth: '520px' }}>
      <Compare
        heads={['Asked', 'Holds']}
        rows={[
          { label: 'DNS Names', asked: 'webhook.platform.svc, webhook.platform.svc.cluster.local', holds: 'webhook.platform.svc', differs: true },
          { label: 'Key', asked: 'ECDSA 256', holds: 'ECDSA P-256' },
          { label: 'Duration', asked: '90d', holds: '365d', differs: true },
        ]}
      />
    </div>
  );
}

const meta = { title: 'Data/Compare', component: Drift } satisfies Meta<typeof Drift>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Two of three differ. */
export const Differs: Story = {};
