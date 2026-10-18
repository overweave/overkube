import {
  adoptStyles,
  Badge,
  Button,
  Chips,
  Code,
  Icon,
  Image,
  KeyValue,
  Meter as KitMeter,
  Row as KitRow,
  Table as KitTable,
  Nothing,
  Ref,
  Section,
  Segmented,
  Status,
  Switch,
  type Tone,
} from '@overkube/uikit';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/*
 * A resource opened, as it could be (a sketch, not the core's yet): one
 * view every kind has, and what each usual kind adds to it. Drawn of three
 * forms only, inside the kit's sections, on one scale (4, 8, 12, 16):
 * fields (a name over its value, in a grid: the summary), names and values
 * (a list, ruled: metadata, related), rows (ruled: conditions, containers,
 * events, ports, pods). No card inside a card. Where an addon puts its own
 * is outlined (the slot, whose) — shown or not (the bar's switch). The data
 * is the stories' (resource-core, resource-addons: what the core draws,
 * what addons would).
 */

// ── The sketch's own looks: few, on the kit's scale ────────────────────────

const SKETCH = `
.rv-stage { padding: 24px; min-height: 100vh; background: var(--uk-bg); font-family: var(--uk-font); }
.rv-bar { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; color: var(--uk-muted); font-size: 12px; }
.rv-frame { margin: 0 auto; }
.rv-frame .uk-modal-panel { width: 100%; max-height: none; animation: none; }
.rv-title { display: flex; align-items: baseline; gap: 8px; }
.rv-title small { color: var(--uk-muted); font-weight: 400; font-size: 13px; }
/* Its tabs: under its header, the active one underlined. */
.rv-tabs { display: flex; gap: 4px; padding: 0 12px; border-bottom: 1px solid var(--uk-border); overflow-x: auto; scrollbar-width: none; }
.rv-tab { all: unset; position: relative; flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 10px 8px; color: var(--uk-muted); font-size: 13px; cursor: pointer; }
.rv-tab:hover, .rv-tab[aria-selected='true'] { color: var(--uk-text); }
.rv-tab[aria-selected='true']::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--uk-accent); }
.rv-tab .uk-icon { width: 14px; height: 14px; }
/* In a line: words of every size on one baseline; what is no word (an icon, a button, a ring, a switch) by the line's middle. */
:is(.rv-line, .rv-file-head, .rv-route-stack, .rv-file-actions) > :is(.uk-icon, .uk-button, .uk-ratio, .uk-switch, .rv-ext-inline) { align-self: center; }
.rv-file-head > .rv-file-actions { align-self: center; }
:is(.rv-line, .uk-row-lead, .rv-route-stack, .uk-ref) > .uk-badge { align-self: baseline; }
.uk-badge .uk-icon { width: 12px; height: 12px; }
/* A container's card: its head (mark, name, role, state, restarts, buttons), its fields, its tables under them. */
.rv-card-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.rv-card-head > .uk-status { align-self: center; }
.rv-card-head > b { font-weight: 600; }
.rv-card-end { margin-left: auto; display: flex; align-items: baseline; gap: 10px; }
.rv-card-end .rv-ext-inline { align-self: center; }
.rv-card-under { margin-top: 18px; }
.rv-link { color: var(--uk-accent); text-decoration: none; }
.rv-mono { font-family: var(--uk-mono); font-size: 12px; overflow-wrap: break-word; }
.rv-quiet { color: var(--uk-muted); font-size: 12px; }
.rv-line { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.uk-table-row .rv-line { flex-wrap: nowrap; gap: 6px 8px; }
.rv-secret { letter-spacing: 2px; color: var(--uk-muted); }
/* A file: its head (its name, its size, its actions), its text under a line, edge to edge and to its foot. */
.uk-section.rv-file { padding: 0; overflow: hidden; }
.rv-file-head { display: flex; align-items: baseline; gap: 10px; min-height: 44px; padding: 6px 8px 6px 16px; }
.rv-file-actions { margin-left: auto; display: flex; gap: 4px; }
.rv-file-hidden { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--uk-border); color: var(--uk-muted); font-size: 12px; }
.rv-file > .uk-code { border: 0; border-top: 1px solid var(--uk-border); border-radius: 0; padding: 12px 16px; max-height: 360px; overflow: auto; }
/* A route, left to right: where it comes in, what it matches, what it passes through, where it goes — arrows between. */
.rv-route { display: grid; grid-template-columns: auto 16px minmax(0, 1.4fr) 16px minmax(0, 1fr) 16px auto; align-items: baseline; gap: 8px; }
.rv-route > .rv-arrow { color: var(--uk-muted); text-align: center; }
.rv-route-stack { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; }
@container uk-modal-body (max-width: 700px) { .rv-route { grid-template-columns: minmax(0, 1fr); } .rv-route > .rv-arrow { display: none; } }
/* A certificate's life: from when it is valid to when it is not; when it is renewed, and now, marked on it. */
.rv-life { display: grid; gap: 8px; }
.rv-life-track { position: relative; height: 8px; border-radius: 4px; background: var(--uk-panel-2); }
.rv-life-track > i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: color-mix(in srgb, var(--uk-ok) 70%, transparent); }
.rv-life-mark { position: absolute; top: -4px; bottom: -4px; width: 2px; border-radius: 1px; background: var(--uk-text); }
.rv-life-mark[data-kind='renew'] { background: var(--uk-info); }
.rv-life-labels { display: flex; justify-content: space-between; color: var(--uk-muted); font-size: 12px; }
/* A log: its tools over it; its lines, numbered, its time quiet, a warning's and an error's in their colours — on the page's ground. */
/* An addon's place: outlined, its slot and whose in its corner (shown or not). */
.rv-stage[data-ext] .rv-ext { position: relative; outline: 1px dashed color-mix(in srgb, var(--uk-accent) 60%, transparent); outline-offset: 4px; border-radius: var(--uk-radius-lg); }
.rv-stage[data-ext] .rv-ext::before { content: attr(data-slot); position: absolute; z-index: 1; top: -13px; right: 8px; padding: 0 6px; background: var(--uk-panel); color: var(--uk-accent); font: 10.5px/16px var(--uk-mono); border-radius: 4px; white-space: nowrap; }
.rv-stage[data-ext] .rv-ext-inline { outline-offset: 2px; }
.rv-stage[data-ext] .rv-ext-inline::before { display: none; }
.rv-stage[data-ext] .rv-ext-tab { outline: 1px dashed color-mix(in srgb, var(--uk-accent) 60%, transparent); outline-offset: -4px; border-radius: 8px; }
`;

export type Layout = 'right' | 'center' | 'full';

/** The kit's styles and the sketch's; a frame as wide as the layout chosen; addons' places shown or not. */
export function Stage({ children }: { children: ComponentChildren }) {
  useEffect(() => {
    adoptStyles(document);
    const style = document.getElementById('rv-css') ?? document.head.appendChild(Object.assign(document.createElement('style'), { id: 'rv-css' }));
    style.textContent = SKETCH;
  }, []);
  const [layout, setLayout] = useState<Layout>('right');
  const [ext, setExt] = useState(true);
  const width = layout === 'right' ? 560 : layout === 'center' ? 960 : 1320;
  return (
    <div class="uk-root rv-stage" data-ext={ext ? '' : undefined}>
      <div class="rv-bar">
        <Segmented
          label="Layout"
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'right', label: 'Side panel', icon: 'panel-right' },
            { value: 'center', label: 'Window', icon: 'window' },
            { value: 'full', label: 'Full screen', icon: 'maximize' },
          ]}
        />
        <span>{width}px</span>
        <Switch checked={ext} onChange={setExt} label="Where addons add theirs" />
      </div>
      <div class="rv-frame" style={{ width: `${width}px` }}>
        {children}
      </div>
    </div>
  );
}

/** An addon's place: outlined (the slot, whose), else drawn as it is. Inline (buttons in a line): its slot under the pointer. */
export function Ext({ slot, by, inline = false, children }: { slot: string; by: string; inline?: boolean; children: ComponentChildren }) {
  return (
    <div
      class={`rv-ext${inline ? ' rv-ext-inline' : ''}`}
      data-slot={`${slot} · ${by}`}
      title={inline ? `${slot} · ${by}` : undefined}
      style={inline ? { display: 'inline-flex', gap: '4px' } : undefined}
    >
      {children}
    </div>
  );
}

// ── The forms ───────────────────────────────────────────────────────────────

export type Field = [label: string, value: ComponentChildren];

/** Fields at a glance: a name over its value, in a grid. */
export { Nothing };

export function Fields({ fields }: { fields: Field[] }) {
  return (
    <dl class="uk-fields">
      {fields.map(([label, value]) => (
        <div key={label} class="uk-field">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Names and values, a list, ruled. */
export function Pairs({ pairs }: { pairs: Field[] }) {
  return <KeyValue rows={pairs} />;
}

/** A row (the kit's): its mark a state's icon (its tone, its icon). */
export function Row({
  mark,
  lead,
  end,
  under,
  children,
}: {
  mark?: [tone: Tone, icon: string];
  lead: ComponentChildren;
  end?: ComponentChildren;
  under?: ComponentChildren;
  children?: ComponentChildren;
}) {
  return (
    <KitRow mark={mark && <Status tone={mark[0]} icon={mark[1]} />} lead={lead} end={end} under={under}>
      {children}
    </KitRow>
  );
}

/**
 * A table of a few rows: the kit's Table, as a kind's is — its columns
 * moved and sized by the user (the page's while it runs; the user's layer's,
 * once there is one), each cell one line (cut short, in full under the
 * pointer), the table scrolled sideways when wider than its section. Its
 * first column (a name) wider than the rest.
 */
export function Table({ head, rows }: { head: string[]; rows: [key: string, ...cells: ComponentChildren[]][] }) {
  return (
    <KitTable
      rows={rows}
      rowKey={(r) => r[0]}
      plain
      columns={head.map((h, i) => ({ id: h, header: h, width: i === 0 ? 'minmax(160px, 2fr)' : 'minmax(72px, 1fr)', cell: (r: [string, ...ComponentChildren[]]) => r[i + 1] }))}
    />
  );
}

/** A key and its value as a file: a section of its own — its name, its size quiet, what can be done with it at its end; its value under them, edge to edge (no box in the box). */
export function File({ name, size, actions, children }: { name: string; size: string; actions?: ComponentChildren; children: string }) {
  return (
    <section class="uk-section rv-file" data-part="data">
      <header class="rv-file-head">
        <b class="rv-mono">{name}</b>
        <span class="rv-quiet">{size}</span>
        <span class="rv-file-actions">{actions}</span>
      </header>
      <Code>{children}</Code>
    </section>
  );
}

/** A secret's key as a file: its value hidden till shown (shown, as code), copied without being shown. */
export function SecretFile({ name, size, children }: { name: string; size: string; children: string }) {
  const [shown, setShown] = useState(false);
  return (
    <section class="uk-section rv-file" data-part="data">
      <header class="rv-file-head">
        <b class="rv-mono">{name}</b>
        <span class="rv-quiet">{size}</span>
        <span class="rv-file-actions">
          <Button size="sm" variant="ghost" icon={shown ? 'eye-off' : 'eye'} onClick={() => setShown(!shown)}>
            {shown ? 'Hide' : 'Show'}
          </Button>
          <Button size="sm" variant="ghost" icon="copy">
            Copy
          </Button>
        </span>
      </header>
      {shown ? (
        <Code>{children}</Code>
      ) : (
        <div class="rv-file-hidden">
          <Icon name="eye-off" />
          Hidden
        </div>
      )}
    </section>
  );
}

/** Another object, by its kind's icon: its kind quiet, its name a link. */
export const ref = (kind: string, icon: string, name: string) => (
  <Ref icon={icon} kind={kind || undefined} href="#/">
    {name}
  </Ref>
);
/** Something that is no object of its own (an empty directory, pods by their labels, a range of IPs): by an icon as an object is, its sort quiet, what it is beside. */
export const sort = (icon: string, kind: string, what?: ComponentChildren) =>
  what === undefined ? (
    <Ref icon={icon}>{kind}</Ref>
  ) : (
    <Ref icon={icon} kind={kind}>
      {what}
    </Ref>
  );
export const link = (name: string) => (
  <a class="rv-link" href="#/">
    {name}
  </a>
);
/** Words of a machine (an IP, a path, an image): monospace; a path broken only after its slashes (not inside a name). */
export const mono = (text: string) => <span class="rv-mono">{text.split('/').flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, `/${part}`]))}</span>;
export const state = (tone: Tone, icon: string, words: string) => (
  <Status tone={tone} icon={icon}>
    {words}
  </Status>
);
export const RUNNING = state('ok', 'circle-play', 'Running');

export const Meter = ({ label, said, part }: { label: string; said: string; part: number }) => (
  <KitMeter label={label} value={part} of={100}>
    {said}
  </KitMeter>
);

// ── The view every kind has ────────────────────────────────────────────────

export type Condition = [type: string, status: 'True' | 'False' | 'Unknown', why: string, age: string, bad?: boolean];
export type Event = [type: 'Normal' | 'Warning', reason: string, message: string, age: string, count?: number];

export interface View {
  kind: string;
  name: string;
  namespace?: string;
  summary: Field[];
  /** The kind's own sections (and an addon's), after its summary. */
  own?: ComponentChildren;
  /** An addon's tabs (between the core's Events and YAML). */
  tabs?: [label: string, icon: string, by: string][];
  /** Its actions (the footer's: the core has none yet — an addon's), a dangerous one red; none, no footer. */
  actions?: [label: string, icon: string, dangerous?: boolean][];
  /** An addon's mark beside its title (a revision, how vulnerable it is): a pill, more of it under the pointer. */
  badge?: ComponentChildren;
  conditions?: Condition[];
  /** What it is related to: how, and to what. */
  related?: Field[];
  events?: Event[];
  labels?: Record<string, string>;
  /** Its tab at first. */
  at?: string;
}

export const LAYOUTS = [
  { value: 'right' as const, label: 'Side panel', icon: 'panel-right' },
  { value: 'center' as const, label: 'Window', icon: 'window' },
  { value: 'full' as const, label: 'Full screen', icon: 'maximize' },
];

export function ResourceSketch({ view }: { view: View }) {
  const [tab, setTab] = useState(view.at ?? 'overview');
  const tabs: [key: string, label: string, icon: string, by?: string][] = [
    ['overview', 'Overview', 'grid'],
    ['events', 'Events', 'activity'],
    ...(view.tabs ?? []).map(([label, icon, by]): [string, string, string, string] => [label.toLowerCase(), label, icon, by]),
    ['yaml', 'YAML', 'file'],
  ];
  return (
    <div class="uk-modal-panel">
      <header>
        <h2 class="rv-title">
          {view.kind} {view.name}
          {view.namespace && <small>{view.namespace}</small>}
        </h2>
        {view.badge}
        <Segmented label="Layout" value="right" onChange={() => {}} options={LAYOUTS} />
        <Button variant="ghost" icon="x" aria-label="Close" />
      </header>
      <div class="rv-tabs" role="tablist">
        {tabs.map(([key, label, icon, by]) => (
          <button
            key={key}
            type="button"
            role="tab"
            class={`rv-tab${by ? ' rv-ext-tab' : ''}`}
            aria-selected={tab === key}
            title={by && `resource.view.tabs · ${by}`}
            onClick={() => setTab(key)}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </div>
      <div class="uk-modal-body">
        {tab === 'overview' && <Overview view={view} />}
        {tab === 'events' && (
          <Section title="Events">
            <Events events={view.events ?? []} />
          </Section>
        )}
        {tab === 'metrics' && (
          <Ext slot="resource.view.tabs" by="metrics addon">
            <Section title="Usage, last hour">
              <dl class="uk-fields">
                <Meter label="CPU" said="12m of 100m requested" part={12} />
                <Meter label="Memory" said="41Mi of 70Mi requested, 170Mi limit" part={58} />
              </dl>
            </Section>
          </Ext>
        )}
        {tab === 'yaml' && (
          <Section title="YAML">
            <Code>{YAML}</Code>
          </Section>
        )}
      </div>
      {view.actions && (
        <footer class="uk-modal-footer">
          <Ext slot="resource.view.footer · Action" by="addons" inline>
            {view.actions.map(([label, icon, dangerous]) => (
              <Button key={label} size="sm" icon={icon} {...(dangerous ? { variant: 'danger' as const } : {})}>
                {label}
              </Button>
            ))}
          </Ext>
        </footer>
      )}
    </div>
  );
}

export function Overview({ view }: { view: View }) {
  return (
    <div class="uk-region uk-details">
      {view.summary.length > 0 && (
        <section class="uk-section" data-part="summary">
          <Fields fields={view.summary} />
        </section>
      )}
      {view.own}
      {view.conditions && view.conditions.length > 0 && (
        <Section title="Conditions" part="conditions">
          <div class="uk-rows">
            {view.conditions.map(([type, status, why, age, bad]) => {
              const good = (status === 'True') !== !!bad;
              return (
                <Row
                  key={type}
                  mark={status === 'Unknown' ? ['unknown', 'help'] : good ? ['ok', 'circle-check'] : ['error', 'circle-x']}
                  lead={type}
                  end={age}
                  under={why || undefined}
                />
              );
            })}
          </div>
        </Section>
      )}
      {view.events && view.events.length > 0 && (
        <Section title="Recent events" part="events">
          <Events events={view.events.slice(0, 3)} />
        </Section>
      )}
      {view.related && view.related.length > 0 && (
        <Section title="Related" part="metadata">
          <Pairs pairs={view.related} />
        </Section>
      )}
      <Section title="Metadata" part="metadata">
        <Pairs
          pairs={[
            ['Created', '2026-10-10 22:59 (3d21h)'],
            ['UID', mono('faf0d6a6-0e77-44d6-bee5-713671517908')],
            ...(view.labels ? [['Labels', <Chips items={view.labels} />] as Field] : []),
          ]}
        />
      </Section>
    </div>
  );
}

export function Events({ events }: { events: Event[] }) {
  if (!events.length) return <Nothing icon="activity">No events in the last hour (the cluster keeps them about that long).</Nothing>;
  return (
    <div class="uk-rows">
      {events.map(([type, reason, message, age, count]) => (
        <Row
          key={`${reason}${age}`}
          mark={type === 'Warning' ? ['warn', 'octagon'] : ['done', 'circle-check']}
          lead={reason}
          end={`${count && count > 1 ? `×${count} · ` : ''}${age}`}
          under={message}
        />
      ))}
    </div>
  );
}

export const YAML = `apiVersion: v1
kind: Pod
metadata:
  name: coredns-75c7b7f4-b9mgn
  namespace: kube-system
spec:
  containers:
    - name: coredns
      image: registry.k8s.io/coredns/coredns:v1.12.0`;

/** A container, as a pod (or a template) has it: its name, its state, ready, restarts; its image; its ports; what it asks for and may use of CPU and memory. */
export interface ContainerSketch {
  name: string;
  /** Its kind of container: an init container (run before the rest), a sidecar (an init container that keeps running). */
  role?: 'init' | 'sidecar';
  image: string;
  state: [tone: Tone, icon: string, words: string];
  ready: boolean;
  restarts: number;
  ports: string[];
  cpu: [request?: string, limit?: string];
  memory: [request?: string, limit?: string];
  /** How it last ended, if it did: its reason, exit code, when. */
  last?: string;
  /** How long it took (an init container done). */
  took?: string;
  /** Its command and arguments, as it runs. */
  command?: string;
  /** Its environment: each name, its value (or where it comes from: a secret's key, never its value). */
  env?: [name: string, value: ComponentChildren][];
  probes?: ProbeSketch[];
}

/** A container's probe: its kind, what it checks, how often, after how many fails, how long after it starts; failing now. */
export interface ProbeSketch {
  kind: 'startup' | 'liveness' | 'readiness';
  check: string;
  every: string;
  fails: number;
  after?: string;
  failing?: boolean;
}

/** What each probe does when it fails. */
const DOES: Record<ProbeSketch['kind'], string> = { startup: 'holds the others back', liveness: 'restarts it', readiness: 'takes it off its services' };

/** Its probes, a table: one line each — passing or failing its mark, its kind, what it checks, how often, after how many fails, how long after it starts; none, said so. */
export function Probes({ probes }: { probes: ProbeSketch[] }) {
  if (!probes.length) return <Nothing icon="heartbeat">No probes: ready as soon as it starts, restarted only when it exits.</Nothing>;
  return (
    <KitTable
      plain
      rows={probes}
      rowKey={(p) => p.kind}
      columns={[
        {
          id: 'probe',
          header: 'Probe',
          width: 'minmax(104px, 120px)',
          cell: (p) => (
            <span class="uk-line" title={`${p.failing ? 'Failing now' : 'Passing'} — when it fails, it ${DOES[p.kind]}`}>
              {p.failing ? <Status tone="warn" icon="octagon" title="failing" /> : <Status tone="ok" icon="circle-check" title="passing" />}
              <span>{p.kind}</span>
            </span>
          ),
        },
        { id: 'check', header: 'Checks', width: 'minmax(120px, 1fr)', cell: (p) => <span class="rv-mono">{p.check}</span> },
        { id: 'every', header: 'Every', width: 'minmax(44px, 52px)', cell: (p) => p.every },
        { id: 'fails', header: 'Fails', width: 'minmax(40px, 48px)', cell: (p) => String(p.fails) },
        { id: 'after', header: 'After', width: 'minmax(44px, 52px)', cell: (p) => p.after ?? '—' },
      ]}
    />
  );
}

/** An image: its registry and path quiet (cut short where long), its name, its tag apart. */
export { Image };

/**
 * Containers, a card each (as Lens and Headlamp draw them): its head — its
 * state's mark, its name, its role (init ones numbered: they run one after
 * another), its state quiet, its restarts or how long it took, an addon's
 * buttons; its fields as a grid (image, what it asks for, how it last
 * ended, ports, command); its environment and its probes as tables (an init
 * container has no probes).
 */
export function Containers({
  list,
  actions = false,
}: {
  list: ContainerSketch[];
  /** The logs addon's buttons on each (its logs, a shell). */
  actions?: boolean;
}) {
  let inits = 0;
  return (
    <>
      {list.map((c) => {
        const quiet = [c.state[2], c.role !== 'init' && !c.ready && c.state[2] === 'Running' && 'not ready'].filter(Boolean).join(' · ');
        if (c.role === 'init') inits++;
        return (
          <section key={c.name} class="uk-section rv-card" data-part="containers">
            <header class="rv-card-head">
              <Status tone={c.state[0]} icon={c.state[1]} title={c.state[2]} />
              <b>{c.name}</b>
              {c.role && <Badge>{c.role === 'init' ? `init ${inits}` : c.role}</Badge>}
              <span class="rv-quiet">{quiet}</span>
              <span class="rv-card-end">
                {c.restarts > 0 && <span class="rv-quiet">{c.restarts} restarts</span>}
                {c.took && <span class="rv-quiet">took {c.took}</span>}
                {actions && (
                  <Ext slot="resource.view.pod.container.actions" by="logs addon" inline>
                    <Button size="sm" variant="ghost" icon="file">
                      Logs
                    </Button>
                    <Button size="sm" variant="ghost" icon="enter">
                      Shell
                    </Button>
                  </Ext>
                )}
              </span>
            </header>
            <Fields
              fields={[
                ['Image', <Image image={c.image} />],
                ['CPU req / lim', <span class="rv-mono">{`${c.cpu[0] ?? '—'} / ${c.cpu[1] ?? '—'}`}</span>],
                ['Memory req / lim', <span class="rv-mono">{`${c.memory[0] ?? '—'} / ${c.memory[1] ?? '—'}`}</span>],
                ...(c.last ? [['Last ended', c.last] as Field] : []),
                ...(c.ports.length ? [['Ports', <span class="rv-mono">{c.ports.join(', ')}</span>] as Field] : []),
                ...(c.command ? [['Command', <span class="rv-mono">{c.command}</span>] as Field] : []),
              ]}
            />
            {c.env && c.env.length > 0 && (
              <div class="rv-card-under">
                <KitTable
                  plain
                  rows={c.env}
                  rowKey={([name]) => name}
                  columns={[
                    { id: 'name', header: 'Environment', width: 'minmax(140px, 1fr)', cell: ([name]) => <span class="rv-mono">{name}</span> },
                    { id: 'value', header: 'Value', width: 'minmax(140px, 1.4fr)', cell: ([, value]) => value },
                  ]}
                />
              </div>
            )}
            {c.role !== 'init' && (
              <div class="rv-card-under">
                <Probes probes={c.probes ?? []} />
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

export const FLUX = (
  <Ext slot="resource.view.sections" by="flux addon">
    <Section title="Flux">
      <Pairs
        pairs={[
          ['Managed by', ref('Kustomization', 'layers', 'flux-system/infrastructure')],
          [
            'Revision',
            <span class="rv-line">
              {mono('main@sha1:4f2a9c1')}
              {state('ok', 'circle-check', 'Applied 3m ago')}
            </span>,
          ],
        ]}
      />
    </Section>
  </Ext>
);

// ── What addons draw ───────────────────────────────────────────────────────

/** A Traefik route: where it comes in, what it matches, the middlewares it passes, where it goes. */
export function Route({ entry, match, middlewares, to, tls }: { entry: string[]; match: string; middlewares: string[]; to: ComponentChildren; tls?: boolean }) {
  return (
    <div class="rv-route">
      <span class="rv-route-stack">
        {entry.map((e) => (
          <Badge key={e}>
            <Icon name={tls ? 'shield' : 'globe'} /> {e}
          </Badge>
        ))}
      </span>
      <span class="rv-arrow">→</span>
      <span class="rv-mono">{match}</span>
      <span class="rv-arrow">→</span>
      <span class="rv-route-stack">
        {middlewares.length ? (
          middlewares.map((m) => (
            <Badge key={m}>
              <Icon name="layers" /> {m}
            </Badge>
          ))
        ) : (
          <span class="rv-quiet">no middlewares</span>
        )}
      </span>
      <span class="rv-arrow">→</span>
      {to}
    </div>
  );
}
