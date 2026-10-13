import type { Meta, StoryObj } from '@storybook/preact-vite';
import { type RelationGroup, Relations } from './Relations';

/*
 * What a resource is related to, as its view will show it (a concept, by
 * hand): a pod (where it comes from, where it runs, its config, who reaches
 * it), a deployment (what it runs, its rollouts), a service selecting no pod
 * (said so).
 */

const meta = { title: 'Data/Relations', component: Relations, parameters: { controls: { disable: true } } } satisfies Meta<typeof Relations>;
export default meta;
type Story = StoryObj<typeof meta>;

const to = (kind: string, name: string) => `#${kind}/${name}`;
const item = (kind: string, name: string, state?: string, level?: 'ok' | 'warn' | 'error') => ({ kind, name, href: to(kind, name), state, level });

const POD: RelationGroup[] = [
  { label: 'Controlled by', items: [item('ReplicaSet', 'coredns-75c7b7f4', '1/1 ready'), item('Deployment', 'coredns', '1/1 ready', 'ok')] },
  { label: 'Runs on', items: [item('Node', 'kube', 'Ready', 'ok')] },
  { label: 'Runs as', items: [item('ServiceAccount', 'coredns')] },
  { label: 'Config', items: [item('ConfigMap', 'coredns', 'volume config-volume'), item('ConfigMap', 'kube-root-ca.crt', 'token volume')] },
  { label: 'Selected by', items: [item('Service', 'kube-dns', 'ClusterIP :53')] },
];

const DEPLOYMENT: RelationGroup[] = [
  {
    label: 'Runs',
    items: [
      item('Pod', 'web-7d4b9-lq7zp', 'CrashLoopBackOff · 4 restarts', 'warn'),
      item('Pod', 'web-7d4b9-2xk8q', 'Running', 'ok'),
      item('Pod', 'web-7d4b9-9fj2m', 'Running', 'ok'),
    ],
  },
  { label: 'Rollouts', items: [item('ReplicaSet', 'web-7d4b9', 'rev 3 · current · 3/3'), item('ReplicaSet', 'web-5c8f1', 'rev 2 · 0/0')] },
  { label: 'Reached through', items: [item('Service', 'web', 'ClusterIP :80')] },
  { label: 'Config', items: [item('ConfigMap', 'web-config', 'env'), item('Secret', 'web-db', 'env')] },
  { label: 'Scaled by', items: [item('HorizontalPodAutoscaler', 'web', 'cpu 45%/80% · 2–10')] },
];

const SERVICE: RelationGroup[] = [
  { label: 'Selects', items: [], none: 'no pod matches app=web — it answers nobody' },
  { label: 'Routed from', items: [item('Ingress', 'web', 'shop.example.com')] },
  { label: 'Budgets', items: [] },
];

const frame = (groups: RelationGroup[]) => ({ args: { groups }, decorators: [(Story: () => unknown) => <div style={{ width: '528px' }}>{Story() as never}</div>] });

export const APod: Story = frame(POD);
export const ADeployment: Story = frame(DEPLOYMENT);
export const AService: Story = frame(SERVICE);
