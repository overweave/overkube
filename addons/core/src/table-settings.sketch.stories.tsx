import { Button, css, Icon, Popover, Table } from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';

/*
 * A sketch, not wired to anything: a table's column settings — a popover
 * from its header listing every column of the kind, grouped by where it
 * comes from (kubectl's own, kubectl's -o wide, each addon's), each turned
 * on and off alone or a group at once (its check: all, some, none). Name
 * is always shown. A filter over them; back to the defaults at the foot.
 * What a column shows and where it is from: its tooltip, to come (not
 * drawn yet).
 */

export default { title: 'core/sketch/Table settings', parameters: { controls: { disable: true } } };

interface Col {
  id: string;
  header: string;
  /** Where its value is from — its tooltip's (to come). */
  hint?: string;
  /** What it shows, in a line — its tooltip's (to come). */
  about?: string;
  /** Always shown (its name). */
  locked?: boolean;
}

interface Group {
  id: string;
  title: string;
  /** Who gives it: kubectl, an addon. */
  from: string;
  columns: Col[];
}

/** A pod's columns, as the core and two addons would give them. */
const GROUPS: Group[] = [
  {
    id: 'general',
    title: 'General',
    from: 'kubectl',
    columns: [
      { id: 'name', header: 'Name', locked: true, hint: '.metadata.name', about: 'Always shown.' },
      { id: 'namespace', header: 'Namespace', hint: '.metadata.namespace' },
      { id: 'ready', header: 'Ready', hint: '.status.containerStatuses', about: 'Ready containers of all of them.' },
      { id: 'status', header: 'Status', hint: 'pod status', about: 'As kubectl tells it: a waiting reason, Running, Completed…' },
      { id: 'restarts', header: 'Restarts', hint: '.status.containerStatuses[*].restartCount', about: 'Restarts of its containers, together.' },
      { id: 'age', header: 'Age', hint: '.metadata.creationTimestamp' },
    ],
  },
  {
    id: 'wide',
    title: 'Wide',
    from: 'kubectl -o wide',
    columns: [
      { id: 'ip', header: 'IP', hint: '.status.podIP', about: 'The pod’s IP address.' },
      { id: 'node', header: 'Node', hint: '.spec.nodeName', about: 'The node it runs on.' },
      { id: 'nominated', header: 'Nominated Node', hint: '.status.nominatedNodeName', about: 'Where the scheduler means to put it once it preempts others.' },
      { id: 'gates', header: 'Readiness Gates', hint: '.spec.readinessGates', about: 'Extra conditions it waits for to be ready: met of all.' },
    ],
  },
  {
    id: 'metrics',
    title: 'Metrics',
    from: 'metrics addon',
    columns: [
      { id: 'cpu', header: 'CPU', hint: 'metrics-server', about: 'CPU used now.' },
      { id: 'memory', header: 'Memory', hint: 'metrics-server', about: 'Memory used now.' },
      { id: 'cpu-req', header: '%CPU/R', hint: 'metrics-server', about: 'CPU used, of what it requests.' },
      { id: 'mem-lim', header: '%MEM/L', hint: 'metrics-server', about: 'Memory used, of its limit.' },
    ],
  },
  {
    id: 'lens',
    title: 'Lens style',
    from: 'lens-style addon',
    columns: [
      { id: 'containers', header: 'Containers', hint: '.status.containerStatuses', about: 'A dot each, coloured by its state.' },
      { id: 'warnings', header: 'Warnings', hint: 'events', about: 'Its latest Warning event, under the pointer.' },
      { id: 'owner', header: 'Controlled By', hint: '.metadata.ownerReferences', about: 'What made it: a link.' },
    ],
  },
];

const DEFAULTS = new Set(['name', 'namespace', 'ready', 'status', 'restarts', 'age']);

const CSS = `
.sk-cols { width: 320px; max-height: min(560px, calc(100vh - 48px)); padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.sk-cols-body { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.sk-cols-body > .uk-ms-search, .sk-foot { flex: none; }
.sk-cols-list { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 4px 6px 6px; }
.sk-group { all: unset; display: block; }
.sk-group + .sk-group { border-top: 1px solid var(--uk-border); margin-top: 4px; padding-top: 4px; }
.sk-row { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; height: 30px; padding: 0 8px; border-radius: var(--uk-radius-sm); cursor: pointer; color: var(--uk-text); }
.sk-row:hover:not(:disabled) { background: var(--uk-panel-2); }
.sk-row:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
.sk-row:disabled { cursor: default; color: var(--uk-muted); }
.sk-head { font-weight: 600; }
.sk-head .sk-from { font-weight: 400; }
.sk-row[aria-pressed='true'] .uk-check, .sk-row[aria-pressed='mixed'] .uk-check { background: var(--uk-accent); border-color: var(--uk-accent); }
.sk-row:disabled .uk-check { opacity: .5; }
.sk-label { flex: 0 0 auto; white-space: nowrap; }
.sk-from, .sk-count { color: var(--uk-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.sk-count { margin-left: auto; }
.sk-item { padding-left: 34px; }
.sk-mixed { width: 8px; height: 2px; border-radius: 1px; background: var(--uk-on-accent); }
.sk-foot { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-top: 1px solid var(--uk-border); color: var(--uk-muted); font-size: 12px; }
`;

/** The page's ground for it: the kit's styles and the sketch's, its root. */
function Ground({ children }: { children: ComponentChildren }) {
  return (
    <div class="uk-root" style={{ padding: 24, minHeight: '100vh', background: 'var(--uk-bg)', fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{css + CSS}</style>
      {children}
    </div>
  );
}

/** Its check: on, off — or, a group's, some of it on (a dash). */
function Check({ state }: { state: boolean | 'mixed' }) {
  return (
    <span class="uk-check" aria-hidden="true">
      {state === 'mixed' ? <span class="sk-mixed" /> : state ? <Icon name="check" /> : null}
    </span>
  );
}

/** The settings: a filter, the groups (each its check and count, its columns under it), the defaults back at the foot. */
function ColumnSettings({ shown, onChange }: { shown: Set<string>; onChange: (shown: Set<string>) => void }) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const set = (ids: string[], on: boolean) => {
    const next = new Set(shown);
    for (const id of ids) on ? next.add(id) : next.delete(id);
    onChange(next);
  };
  const total = GROUPS.reduce((n, g) => n + g.columns.length, 0);
  return (
    <div class="sk-cols-body">
      <div class="uk-ms-search">
        <Icon name="search" />
        <input aria-label="Filter columns" placeholder="Filter columns" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
      </div>
      <div class="sk-cols-list">
        {GROUPS.map((g) => {
          const columns = g.columns.filter((c) => !q || c.header.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q));
          if (!columns.length) return null;
          const free = g.columns.filter((c) => !c.locked).map((c) => c.id);
          const on = g.columns.filter((c) => shown.has(c.id)).length;
          const state = on === g.columns.length ? true : on === 0 ? false : 'mixed';
          return (
            <fieldset key={g.id} class="sk-group" aria-label={g.title}>
              <button type="button" class="sk-row sk-head" aria-pressed={state} onClick={() => set(free, state !== true)}>
                <Check state={state} />
                <span class="sk-label">
                  {g.title} <span class="sk-from">· {g.from}</span>
                </span>
                <span class="sk-count">
                  {on}/{g.columns.length}
                </span>
              </button>
              {columns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  class="sk-row sk-item"
                  aria-pressed={shown.has(c.id)}
                  disabled={c.locked}
                  title={c.locked ? 'Always shown' : undefined}
                  onClick={() => set([c.id], !shown.has(c.id))}
                >
                  <Check state={shown.has(c.id)} />
                  <span class="sk-label">{c.header}</span>
                </button>
              ))}
            </fieldset>
          );
        })}
      </div>
      <div class="sk-foot">
        <span>
          {shown.size} of {total} shown
        </span>
        <button type="button" class="uk-link" onClick={() => onChange(new Set(DEFAULTS))}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

/** The menu by itself, open: some of Wide on (a group's dash), Metrics all on, Lens style off. */
export const Menu = () => {
  const [shown, setShown] = useState(new Set([...DEFAULTS, 'ip', 'node', 'cpu', 'memory', 'cpu-req', 'mem-lim']));
  return (
    <Ground>
      <div class="uk-popover sk-cols">
        <ColumnSettings shown={shown} onChange={setShown} />
      </div>
    </Ground>
  );
};

const PODS = ['web-7d9c4-x2kfp', 'web-7d9c4-b9mgn', 'api-6b97-tjr6n', 'db-0'].map((name, i) => ({
  name,
  namespace: 'shop',
  ready: i === 2 ? '0/1' : '1/1',
  status: i === 2 ? 'CrashLoopBackOff' : 'Running',
  restarts: String(i === 2 ? 41 : i),
  age: `${3 + i}d`,
  ip: `10.42.0.${4 + i}`,
  node: 'kube',
  nominated: '—',
  gates: '—',
  cpu: `${12 + i * 7}m`,
  memory: `${40 + i * 9}Mi`,
  'cpu-req': `${24 + i * 10}%`,
  'mem-lim': `${31 + i * 8}%`,
  containers: i === 2 ? '●○' : '●',
  warnings: i === 2 ? '⚠' : '',
  owner: i === 3 ? 'StatefulSet db' : 'ReplicaSet',
}));

/** Over a table: its header's button opens it; what is turned on or off is the table's columns at once. */
export const OverATable = () => {
  const [shown, setShown] = useState(new Set(DEFAULTS));
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const columns = GROUPS.flatMap((g) => g.columns)
    .filter((c) => shown.has(c.id))
    .map((c) => ({ id: c.id, header: c.header, cell: (r: (typeof PODS)[number]) => r[c.id as keyof (typeof PODS)[number]] }));
  return (
    <Ground>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <span ref={anchor} style={{ display: 'inline-flex' }}>
          <Button variant="ghost" size="sm" icon="columns" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
            Columns
          </Button>
        </span>
      </div>
      <Table rows={PODS} rowKey={(r) => r.name} columns={columns} />
      {open && (
        <Popover anchor={anchor} align="end" label="Columns" onClose={() => setOpen(false)} class="sk-cols">
          <ColumnSettings shown={shown} onChange={setShown} />
        </Popover>
      )}
    </Ground>
  );
};

Menu.storyName = 'Menu';
OverATable.storyName = 'Over a table';
