import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { Switch } from '../forms/Switch';
import { Catalog, type CatalogGroup } from './Catalog';

/*
 * A catalog as a page has it: kinds by category, their counts; filtered by
 * name, the empty ones hidden (a switch), pinned and unpinned, opened.
 */

const KINDS: Record<string, [string, number][]> = {
  Workloads: [
    ['ControllerRevisions', 2],
    ['CronJobs', 2],
    ['DaemonSets', 1],
    ['Deployments', 16],
    ['HorizontalPodAutoscalers', 1],
    ['Jobs', 4],
    ['PodDisruptionBudgets', 1],
    ['Pods', 25],
    ['ReplicaSets', 16],
    ['StatefulSets', 1],
    ['ReplicationControllers', 0],
  ],
  Network: [
    ['Endpoints', 11],
    ['EndpointSlices', 11],
    ['IngressClasses', 1],
    ['Ingresses', 3],
    ['IPAddresses', 10],
    ['NetworkPolicies', 1],
    ['ServiceCIDRs', 1],
    ['Services', 12],
  ],
  Storage: [
    ['CSINodes', 1],
    ['PersistentVolumes', 3],
    ['StorageClasses', 1],
    ['Volume Claims', 2],
    ['VolumeAttachments', 0],
  ],
  Config: [
    ['Config Maps', 14],
    ['Secrets', 21],
    ['LimitRanges', 0],
  ],
  'Access control': [
    ['ClusterRoleBindings', 67],
    ['ClusterRoles', 80],
    ['RoleBindings', 12],
    ['Roles', 11],
    ['Service Accounts', 45],
  ],
  Cluster: [
    ['Events', 70],
    ['Namespaces', 6],
    ['Nodes', 1],
  ],
};

function Picker({ width = '760px', initialQuery = '' }: { width?: string; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [pinned, setPinned] = useState<string[]>(['Pods', 'Deployments']);
  const [opened, setOpened] = useState('—');
  const q = query.trim().toLowerCase();
  let hidden = 0;
  const groups: CatalogGroup[] = Object.entries(KINDS)
    .map(([title, kinds]) => ({
      key: title,
      title,
      items: kinds
        .filter(([name, count]) => {
          if (q && !name.toLowerCase().includes(q)) return false;
          if (hideEmpty && !q && count === 0 && !pinned.includes(name)) {
            hidden++;
            return false;
          }
          return true;
        })
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, count]) => ({ key: name, label: name, title: name, extra: count, muted: count === 0, on: pinned.includes(name) })),
    }))
    .filter((g) => g.items.length > 0);
  return (
    <div style={{ padding: '24px' }}>
      <div class="uk-panel" style={{ width, overflow: 'hidden', boxShadow: '0 12px 32px rgb(0 0 0 / .35)' }}>
        <Catalog
          groups={groups}
          query={query}
          onQuery={setQuery}
          placeholder="Filter kinds"
          aside={<Switch checked={hideEmpty} onChange={setHideEmpty} label={`Hide empty (${hidden})`} />}
          empty="No kind matches"
          onOpen={(item) => setOpened(item.label)}
          onToggle={(item, on) => setPinned((p) => (on ? [...p, item.key] : p.filter((k) => k !== item.key)))}
          toggleLabel={(item) => (item.on ? `Unpin ${item.label}` : `Pin ${item.label}`)}
        />
      </div>
      <p style={{ color: 'var(--uk-muted)', fontSize: '12px', marginTop: '16px' }}>
        Opened: <b>{opened}</b> · pinned: {pinned.join(', ') || '—'}
      </p>
    </div>
  );
}

const meta = { title: 'Navigation/Catalog', component: Picker, parameters: { controls: { disable: true } } } satisfies Meta<typeof Picker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Filter; hide the empty ones; pin (a pin under the pointer, kept while pinned); open (a click, Enter; the arrows from the filter down). */
export const Kinds: Story = {};

/** Narrow: one column. */
export const Narrow: Story = { args: { width: '300px' } };

/** Nothing matches. */
export const NoMatch: Story = { args: { initialQuery: 'zzz' } };
