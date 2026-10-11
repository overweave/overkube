import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useEffect, useState } from 'preact/hooks';
import { Button } from '../actions/Button';
import { Spotlight, type SpotlightItem } from './Spotlight';

/*
 * The search as a page has it: kinds, pages and objects found as one types
 * (the objects a little later: still searching meanwhile), one chosen
 * (Enter, a click), closed (Escape, a click beside it), opened again (the
 * button, ⌘K).
 */

const KINDS = ['Pods', 'Deployments', 'Services', 'StatefulSets', 'DaemonSets', 'ConfigMaps', 'Secrets', 'Nodes', 'Namespaces', 'Ingresses', 'Jobs', 'CronJobs'];
const PAGES = ['Overview', 'Extensions', 'Settings'];
const OBJECTS = ['web-7d9c', 'web-5f2a', 'db-0', 'cache-6b8d', 'ingress-nginx-controller', 'coredns-5d78', 'metrics-server-6f'];

function find(query: string): SpotlightItem[] {
  const q = query.trim().toLowerCase();
  const kinds = KINDS.filter((k) => !q || k.toLowerCase().includes(q)).map((k) => ({ key: `kind/${k}`, title: k, subtitle: 'Kind', icon: 'cube', group: 'Kinds' }));
  const pages = PAGES.filter((p) => !q || p.toLowerCase().includes(q)).map((p) => ({ key: `page/${p}`, title: p, subtitle: 'Page', icon: 'grid', group: 'Pages' }));
  return [...kinds, ...pages];
}

function Search({ delay = 500, startOpen = true }: { delay?: number; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [query, setQuery] = useState('');
  const [objects, setObjects] = useState<SpotlightItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState('—');
  // The objects come later (a cluster asked).
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setObjects([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      setObjects(OBJECTS.filter((o) => o.includes(q)).map((o) => ({ key: `pod/${o}`, title: o, subtitle: 'Pod · apps', icon: 'cube', group: 'Objects' })));
      setBusy(false);
    }, delay);
    return () => clearTimeout(t);
  }, [query, delay]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <div style={{ padding: '24px', minHeight: '480px' }}>
      <Button icon="search" onClick={() => setOpen(true)}>
        Search (⌘K)
      </Button>
      <p style={{ color: 'var(--uk-muted)', fontSize: '12px' }}>
        Chosen: <b>{chosen}</b>
      </p>
      {open && (
        <Spotlight
          label="Search"
          resultsLabel="Results"
          placeholder="Kinds, pages, objects…"
          query={query}
          onQuery={setQuery}
          items={[...find(query), ...objects]}
          busy={busy}
          empty={`Nothing found for “${query.trim()}”`}
          footer={
            <>
              <span>↑↓ to move</span>
              <span>↵ to open</span>
              <span>esc to close</span>
            </>
          }
          onChoose={(item) => {
            setChosen(String(item.title));
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

const meta = { title: 'Overlays/Spotlight', component: Search, parameters: { controls: { disable: true } } } satisfies Meta<typeof Search>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Type: kinds and pages at once, objects a little later. */
export const Searching: Story = {};

/** Closed: the button or ⌘K opens it. */
export const Closed: Story = { args: { startOpen: false } };
