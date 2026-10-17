import type { KindInfo } from '@overkube/kube-types';
import { type Addon, type AddonStatus, type Addons, defineAddon, kindMatcher, kubeOwnKinds, PRIORITY, slots, type UserChanges, ui } from '@overkube/sdk';
import { AddonsProvider, fill, KubeProvider, UserProvider, usePage } from '@overkube/sdk/preact';
import { Frame, memoryRouter, memoryStore, ShellProvider, UserService } from '@overkube/shell';
import { type AddonEnv, addonEnv, addonRun, type FakeCluster, fakeCluster } from '@overkube/testkit';
import { adoptStyles } from '@overkube/uikit';
import { WorldStory } from '@overweave/storybook/preact';
import type { AddonRun } from '@overweave/testkit';
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';

/*
 * The page in a story: the shell's frame at a path (held in memory — a bar
 * over it shows it, and goes elsewhere), the addons given run beside one
 * another as the page runs them (each its ctx: the story's cluster, its
 * notifications, the others' services) — turned off and on in overweave's
 * panel, which tells who says what — over a cluster in memory the story
 * fills, the user's own changes over them all. In the kit's styles, dark or
 * light.
 */

export interface KubeStoryProps {
  /** The addons run, in this order: the core and those beside it, yours among them. */
  addons: readonly Addon[];
  /** Where the page is at first (default: the start). */
  path?: string;
  /** The cluster, as the story wants it: its objects, their kinds' states (c.add, c.state, c.discover). */
  cluster?: (cluster: FakeCluster) => void;
  /** What it serves: groups and kinds (default: every kind known). */
  served?: readonly string[];
  /** Kinds the kinds table does not know (a CRD's), served beside. */
  kinds?: readonly KindInfo[];
  /** The user's own changes, over every addon's, as the page keeps them: (user) => user.patch('TableView', Pod.id, { hidden: { … } }). */
  user?: (user: UserChanges) => void;
  /** Dark or light (none: as the Appearance says — the system's, by default). */
  theme?: 'dark' | 'light';
  /** The page's language (none: as the Language says — the browser's, by default): 'pl'. */
  locale?: string;
  /** How its addons are said to be doing, by id (none: running): { nord: { state: 'crashloop', error: '…' } }. */
  states?: Readonly<Record<string, Partial<AddonStatus>>>;
  /** What the user may not have (c.rules): hidden (none said), or shown marked — debugging. */
  access?: 'hide' | 'mark';
  /**
   * cluster, served, kinds, user and states are the story's start: read once. Another
   * resetKey starts it anew with what they are then (a control's value: its key).
   */
  resetKey?: unknown;
}

/** Where the page is, and a way elsewhere: a path typed in. */
function PathBar() {
  const page = usePage();
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <form
      class="uk-bar"
      onSubmit={(e) => {
        e.preventDefault();
        if (typed) page.navigate(typed.startsWith('/') ? typed : `/${typed}`);
        setTyped(null);
      }}
    >
      <input aria-label="Path" class="uk-input" value={typed ?? page.path.value} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} />
    </form>
  );
}

/** The path bar, over the page's header (beside the side, as the page is). */
const bar = defineAddon({
  id: 'story.bar',
  title: 'Path',
  layer: 'builtin',
  setup: ({ contributor }) => void contributor.add('Fill', 'story.bar', fill(slots.header.above, { render: PathBar })),
});

/** A story of the page: started anew (its cluster, its world, its path) whenever its resetKey changes. */
export function KubeStory(props: KubeStoryProps) {
  // Another theme, another start (the story's world made anew with it).
  return <Story key={`${String(props.resetKey)}:${props.theme ?? ''}:${props.locale ?? ''}:${props.access ?? ''}`} {...props} />;
}

function Story({ addons, path = '/', cluster, served, kinds, user, theme, locale, states, access }: KubeStoryProps) {
  // The story's own, kept while it is shown: its cluster (filled once), its notifications and services, its path.
  const [env] = useState<AddonEnv>(() => {
    const c = fakeCluster({ served, kinds });
    cluster?.(c);
    return addonEnv(c);
  });
  const [router] = useState(() => memoryRouter(path));
  useEffect(() => {
    if (router.path.peek() !== path) router.navigate(path);
  }, [path]);
  useEffect(() => () => env.notifications.close(), []);
  // The user's changes (in memory), made once the world is: what the page below is given asks them of it.
  const kept = useRef<UserService>();
  const [changes] = useState<UserChanges>(() => ({
    patch: (kind, name, change) => kept.current?.patch(kind, name, change) ?? { status: 'rejected', errors: [{ code: 'disposed' }] },
    reset: (kind, name, ...path) => kept.current?.reset(kind, name, ...path),
  }));
  // The addons as the page's host tells them: running, unless the story says otherwise; started again, running.
  const [host] = useState<Addons>(() => {
    const statuses = signal<readonly AddonStatus[]>(
      addons.map((a) => ({
        id: a.id,
        title: a.title,
        ...(a.description ? { description: a.description } : {}),
        layer: a.layer ?? 'addon',
        state: 'running',
        enabled: true,
        suggested: false,
        restarts: 0,
        errors: 0,
        ...states?.[a.id],
      })),
    );
    return { statuses, restart: (id) => (statuses.value = statuses.value.map((s) => (s.id === id ? { ...s, state: 'running', restarts: s.restarts + 1 } : s))) };
  });
  // Each addon run as the same run (the panel's world is made again only when the addons are others).
  const runs = useRef(new WeakMap<Addon, AddonRun>());
  const run = (a: Addon) => {
    const kept = runs.current.get(a);
    if (kept) return kept;
    const made = addonRun(a, env);
    runs.current.set(a, made);
    return made;
  };
  useEffect(() => adoptStyles(document), []);
  // A definition's function failing as the page is drawn (a column's value): listed under the story, each once.
  const [failures, setFailures] = useState<readonly string[]>([]);
  const onFailure = (definition: { kind: string; name: string }, field: string, error: unknown) => {
    const said = `${definition.kind}/${definition.name} (${field}): ${error instanceof Error ? error.message : String(error)}`;
    setFailures((now) => (now.includes(said) ? now : [...now, said]));
  };
  return (
    <div class="uk-root" style={{ padding: '16px', background: 'var(--uk-bg)', minHeight: '100%' }}>
      <WorldStory
        ui={ui}
        kinds={kubeOwnKinds}
        matcher={kindMatcher}
        addons={[...addons, bar].map(run)}
        given={(w) => {
          // The fields its addons define, asked by as the page asks by them.
          env.cluster.follow(w.registry as never);
          // The world made anew: the last one's user gone with it.
          void kept.current?.close();
          kept.current = new UserService({ registry: w.registry as never, store: memoryStore() });
          void kept.current.start();
          user?.(kept.current);
          // Its look and language, as the story says: over the user's (a contributor of its own: not one patch replacing another).
          const story = theme || locale ? w.as('story', { priority: PRIORITY.user + 1, rights: ['configure'] }) : undefined;
          if (theme) story?.patch('Appearance', 'default', { mode: theme });
          if (locale) story?.patch('Language', 'default', { locale });
        }}
      >
        <KubeProvider cluster={env.cluster}>
          <UserProvider user={changes}>
            <ShellProvider router={router} notifications={env.notifications} onFailure={onFailure} access={access}>
              <AddonsProvider addons={host}>
                <Frame />
              </AddonsProvider>
            </ShellProvider>
          </UserProvider>
        </KubeProvider>
      </WorldStory>
      {failures.length > 0 && (
        <ul role="alert" data-overkube-failures="">
          {failures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
