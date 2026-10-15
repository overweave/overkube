import type { Meta, StoryObj } from '@storybook/preact-vite';
import { ConfigViewer } from './ConfigViewer';

const corefile = '.:53 {\n    errors\n    health\n    kubernetes cluster.local in-addr.arpa ip6.arpa\n    forward . /etc/resolv.conf\n    cache 30\n}\n';
const long = Array.from({ length: 30 }, (_, i) => `line ${i + 1}: ${'x'.repeat(40)}`).join('\n');

/** As a view lays its sections out: one under another, apart. */
const meta = {
  title: 'Data/ConfigViewer',
  component: ConfigViewer,
  decorators: [
    (Story) => (
      <div class="uk-region">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConfigViewer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Text keys (one long: cut at its first lines), a binary one. */
export const Config: Story = { args: { data: { Corefile: corefile, 'long.txt': long }, binary: { logo: btoa('png bytes') } } };

/** A secret's: base64, each hidden till shown; a binary one. */
export const Secret: Story = { args: { data: { token: btoa('s3cr3t-t0ken'), 'ca.crt': btoa(long), raw: btoa(String.fromCharCode(0xff, 0xfe)) }, base64: true, secret: true } };

/** No keys. */
export const Empty: Story = { args: {} };
