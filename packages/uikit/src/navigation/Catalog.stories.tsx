import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { EmptyState } from '../display/EmptyState';
import { Highlight } from '../display/Highlight';
import { CatalogBody, CatalogBox, CatalogHeading, CatalogPane, CatalogRow, CatalogSearch, CatalogSection, CatalogTop } from './Catalog';

/*
 * A catalog as a page has it: kinds by section (the usual ones, a cluster's
 * CRDs under their groups), pinned and unpinned; filtered — every section
 * searched, the matches by section, one section chosen among them; nothing
 * in one, said so.
 */

type Kind = [name: string, section: string, group?: string];

const KINDS: Kind[] = [
  ['Pods', 'Workloads'],
  ['Deployments', 'Workloads'],
  ['StatefulSets', 'Workloads'],
  ['DaemonSets', 'Workloads'],
  ['Jobs', 'Workloads'],
  ['CronJobs', 'Workloads'],
  ['Services', 'Network'],
  ['Ingresses', 'Network'],
  ['NetworkPolicies', 'Network'],
  ['ConfigMaps', 'Config'],
  ['Secrets', 'Config'],
  ['PersistentVolumeClaims', 'Storage'],
  ['StorageClasses', 'Storage'],
  ['Nodes', 'Cluster'],
  ['Namespaces', 'Cluster'],
  ['Events', 'Cluster'],
  ['Certificates', 'Custom resources', 'cert-manager.io'],
  ['Issuers', 'Custom resources', 'cert-manager.io'],
  ['IngressRoutes', 'Custom resources', 'traefik.io'],
  ['Middlewares', 'Custom resources', 'traefik.io'],
];
const ICONS: Record<string, string> = { Pinned: 'pin', Workloads: 'cube', Network: 'network', Config: 'file', Storage: 'disk', Cluster: 'server', 'Custom resources': 'puzzle' };

function Picker({ kinds = KINDS, pins = ['Pods', 'Deployments', 'Services'], initialQuery = '' }: { kinds?: Kind[]; pins?: string[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [chosen, setChosen] = useState<string | null>('Pinned');
  const [narrow, setNarrow] = useState<string | null>(null);
  const [pinned, setPinned] = useState(pins);
  const q = query.trim().toLowerCase();
  const found = kinds.filter(([name, , group]) => !q || name.toLowerCase().includes(q) || group?.includes(q));
  const sections = ['Pinned', ...new Set(kinds.map(([, s]) => s))];
  const of = (s: string) => found.filter(([name, section]) => (s === 'Pinned' ? pinned.includes(name) : section === s));
  const at = q ? narrow : chosen;
  const shown = at === null ? found : of(at);
  const heads = at === null ? (k: Kind) => k[1] : (k: Kind) => k[2] ?? '';
  let place = 0;
  return (
    <div class="uk-panel" style={{ width: '720px', overflow: 'hidden' }}>
      <CatalogBox>
        <CatalogTop>
          <CatalogSearch
            query={query}
            onQuery={(next) => {
              setQuery(next);
              setNarrow(null);
            }}
            placeholder="Find a kind…"
          />
        </CatalogTop>
        <CatalogBody
          label="Sections"
          side={
            <>
              {q && (
                <CatalogSection icon="search" count={found.length} chosen={narrow === null} onClick={() => setNarrow(null)}>
                  All matches
                </CatalogSection>
              )}
              {sections.map((s) => (
                <CatalogSection key={s} icon={ICONS[s]} count={of(s).length} chosen={s === at} onClick={() => (q ? setNarrow(s) : setChosen(s))}>
                  {s}
                </CatalogSection>
              ))}
            </>
          }
        >
          <CatalogPane key={`${!!q}/${at}`}>
            {shown.length === 0 ? (
              q ? (
                <EmptyState icon="search" title={`Nothing like “${query.trim()}”`} action={{ label: 'Clear the search', run: () => setQuery('') }}>
                  Try part of a name, or an API group.
                </EmptyState>
              ) : (
                <EmptyState icon={ICONS[at ?? 'Pinned'] ?? 'puzzle'} title="Nothing pinned yet">
                  Pin a kind (the pin beside it) to keep it here and in the tabs.
                </EmptyState>
              )
            ) : (
              [...new Set(shown.map(heads))].map((h) => (
                <div key={h}>
                  {h && <CatalogHeading>{h}</CatalogHeading>}
                  {shown
                    .filter((k) => heads(k) === h)
                    .map(([name, section]) => (
                      <CatalogRow
                        key={name}
                        link={{ href: `#/k/${name.toLowerCase()}` }}
                        icon={ICONS[section]}
                        place={place++}
                        pin={{
                          on: pinned.includes(name),
                          label: `${pinned.includes(name) ? 'Unpin' : 'Pin'} ${name}`,
                          onToggle: (on) => setPinned((p) => (on ? [...p, name] : p.filter((n) => n !== name))),
                        }}
                      >
                        <Highlight text={name} query={query} />
                      </CatalogRow>
                    ))}
                </div>
              ))
            )}
          </CatalogPane>
        </CatalogBody>
      </CatalogBox>
    </div>
  );
}

const meta = { title: 'Navigation/Catalog', component: Picker, parameters: { controls: { disable: true } } } satisfies Meta<typeof Picker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Sections down the side, the chosen one's kinds beside them; pinned and unpinned; typed, every section searched. */
export const Kinds: Story = {};

/** Typed: the matches by section, each section's count of them. */
export const Typed: Story = { args: { initialQuery: 'ing' } };

/** Nothing pinned yet: said so. */
export const NothingPinned: Story = { args: { pins: [] } };
