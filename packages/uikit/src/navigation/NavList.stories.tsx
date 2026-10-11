import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { NavList, type NavListGroup } from './NavList';

/* A side menu as a page has it: kinds by category, their counts; one chosen, marked. */

const GROUPS: NavListGroup[] = [
  {
    key: 'workloads',
    title: 'Workloads',
    items: [
      { key: 'pods', label: 'Pods', href: '#/k/pods.v1', extra: 25 },
      { key: 'deployments', label: 'Deployments', href: '#/k/deployments.v1.apps', extra: 16 },
      { key: 'jobs', label: 'Jobs', href: '#/k/jobs.v1.batch', extra: 4 },
    ],
  },
  {
    key: 'network',
    title: 'Network',
    items: [
      { key: 'services', label: 'Services', href: '#/k/services.v1', extra: 12 },
      { key: 'ingresses', label: 'Ingresses', href: '#/k/ingresses.v1.networking.k8s.io' },
    ],
  },
  { key: 'cluster', title: 'Cluster', items: [{ key: 'nodes', label: 'Nodes', href: '#/k/nodes.v1', icon: 'server' }] },
];

function Menu() {
  const [current, setCurrent] = useState('deployments');
  return (
    <div style={{ width: '220px' }}>
      <NavList
        label="Kinds"
        groups={GROUPS}
        current={current}
        onOpen={(item, e) => {
          e.preventDefault();
          setCurrent(item.key);
        }}
      />
    </div>
  );
}

const meta: Meta = { title: 'Navigation/NavList', component: NavList };
export default meta;

export const Kinds: StoryObj = { render: () => <Menu /> };
