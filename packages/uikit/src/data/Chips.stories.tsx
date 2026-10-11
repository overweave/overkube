import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Chips } from './Chips';

const meta = { title: 'Data/Chips', component: Chips, args: { items: { app: 'web', tier: 'frontend' } } } satisfies Meta<typeof Chips>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Labels: Story = {};

/** Keys with a prefix (quieter); an empty value; a long one, cut short. */
export const Kubernetes: Story = {
  args: {
    items: {
      'app.kubernetes.io/name': 'ingress-nginx',
      'app.kubernetes.io/component': 'controller',
      'app.kubernetes.io/managed-by': 'Helm',
      'helm.sh/chart': 'ingress-nginx-4.11.3',
      'node-role.kubernetes.io/control-plane': '',
      'kubectl.kubernetes.io/last-applied-configuration':
        '{"apiVersion":"apps/v1","kind":"Deployment","metadata":{"annotations":{},"labels":{"app":"web"},"name":"web","namespace":"apps"},"spec":{"replicas":2}}',
    },
  },
};

/** More than shown at first: the rest behind +N. */
export const Many: Story = {
  args: { items: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`label-${String(i).padStart(2, '0')}`, `value-${i}`])) },
};

export const None: Story = { args: { items: {} } };
