import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Runway } from './Runway';

/** Certificates on one axis (30 days back to 120 ahead): one not issued yet, one ended, the soon ones, the long ones. */
function Certificates() {
  return (
    <div class="uk-panel" style={{ maxWidth: '720px', padding: '16px' }}>
      <Runway
        from={-30}
        to={120}
        ticks={[
          { at: 0, label: 'now' },
          { at: 30, label: '30d' },
          { at: 60, label: '60d' },
          { at: 90, label: '90d' },
          { at: 120, label: '120d' },
        ]}
        rows={[
          { key: 'a', lead: 'grafana-tls', said: 'issuing' },
          { key: 'b', lead: 'legacy-tls', at: -30, said: 'ended 30d ago', level: 'error' },
          { key: 'c', lead: 'api-tls', at: 2, said: '2d', level: 'error' },
          { key: 'd', lead: 'webhook-serving', at: 7, said: '7d', level: 'warn' },
          { key: 'e', lead: 'shop-tls', at: 86, said: '86d' },
          { key: 'f', lead: 'internal-api', at: 102, said: '102d' },
        ]}
      />
    </div>
  );
}

const meta = { title: 'Data/Runway', component: Certificates } satisfies Meta<typeof Certificates>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Not issued yet, ended, soon, long. */
export const Soonest: Story = {};
