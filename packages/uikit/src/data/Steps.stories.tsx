import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Badge } from '../status/Badge';
import { Step, Steps } from './Steps';

/** An issuance stuck at its third step: done, going, stuck (what is said of it under it), not reached. */
function Issuance() {
  return (
    <div style={{ maxWidth: '520px' }}>
      <Steps>
        <Step state="done" title={<a href="#a">api-tls-3</a>} status={<Badge level="ok">Approved</Badge>} meta="CertificateRequest · 51m ago" />
        <Step state="going" title={<a href="#b">api-tls-3-1840556</a>} status={<Badge level="warn">pending</Badge>} meta="Order · 51m ago" />
        <Step state="stuck" title={<a href="#c">api.shop.example.com</a>} status={<Badge level="error">pending</Badge>} meta="Challenge · HTTP-01 · 51m ago">
          wrong status code '404', expected '200'
        </Step>
        <Step state="later" title={<a href="#d">api-tls</a>} meta="Secret" />
      </Steps>
    </div>
  );
}

const meta = { title: 'Data/Steps', component: Issuance } satisfies Meta<typeof Issuance>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Done, going, stuck, not reached. */
export const Stuck: Story = {};
