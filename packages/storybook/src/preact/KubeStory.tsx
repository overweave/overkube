import type { KindInfo } from '@overkube/kube-types';
import { type Addon, type KubeContributor, kindMatcher, kubeOwnKinds, PRIORITY, standingOf, ui } from '@overkube/sdk';
import { KubeProvider, usePage } from '@overkube/sdk/preact';
import { Frame, memoryRouter, ShellProvider } from '@overkube/shell';
import { type AddonEnv, addonEnv, addonRun, type FakeCluster, fakeCluster } from '@overkube/testkit';
import { css } from '@overkube/uikit';
import { WorldStory } from '@overweave/storybook/preact';
import type { AddonRun } from '@overweave/testkit';
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
  /** The user's own changes, over every addon's: (user) => user.patch('TableView', Pod.id, { hidden: { … } }). */
  user?: (user: KubeContributor) => void;
  /** Dark or light (none: as the Appearance says — the system's, by default). */
  theme?: 'dark' | 'light';
  /** The page's language (none: as the Language says — the browser's, by default): 'pl'. */
  locale?: string;
  /**
   * cluster, served, kinds and user are the story's start: read once. Another
   * resetKey starts it anew with what they are then (a control's value: its key).
   */
  resetKey?: unknown;
}

/** The kit's styles, once per document. */
function styles(doc: Document): void {
  if (doc.getElementById('overkube-css')) return;
  const style = doc.createElement('style');
  style.id = 'overkube-css';
  style.textContent = css;
  doc.head.appendChild(style);
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

/** A story of the page: started anew (its cluster, its world, its path) whenever its resetKey changes. */
export function KubeStory(props: KubeStoryProps) {
  // Another theme, another start (the story's world made anew with it).
  return <Story key={`${String(props.resetKey)}:${props.theme ?? ''}:${props.locale ?? ''}`} {...props} />;
}

function Story({ addons, path = '/', cluster, served, kinds, user, theme, locale }: KubeStoryProps) {
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
  // Each addon run as the same run (the panel's world is made again only when the addons are others).
  const runs = useRef(new WeakMap<Addon, AddonRun>());
  const run = (a: Addon) => {
    const kept = runs.current.get(a);
    if (kept) return kept;
    const made = addonRun(a, env);
    runs.current.set(a, made);
    return made;
  };
  useEffect(() => styles(document), []);
  // A definition's function failing as the page is drawn (a column's value): listed under the story, each once.
  const [failures, setFailures] = useState<readonly string[]>([]);
  const onFailure = (definition: { kind: string; name: string }, field: string, error: unknown) => {
    const said = `${definition.kind}/${definition.name} (${field}): ${error instanceof Error ? error.message : String(error)}`;
    setFailures((now) => (now.includes(said) ? now : [...now, said]));
  };
  return (
    <div class="uk-root" style={{ padding: '16px', background: 'var(--uk-bg)', minHeight: '100%', fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <WorldStory
        ui={ui}
        kinds={kubeOwnKinds}
        matcher={kindMatcher}
        addons={addons.map(run)}
        given={(w) => {
          // The fields its addons define, asked by as the page asks by them.
          env.cluster.follow(w.registry as never);
          if (user) user(w.as('user', standingOf('user')) as unknown as KubeContributor);
          // Its look and language, as the story says: over the user's (a contributor of its own: not one patch replacing another).
          const story = theme || locale ? w.as('story', { priority: PRIORITY.user + 1, rights: ['configure'] }) : undefined;
          if (theme) story?.patch('Appearance', 'default', { mode: theme });
          if (locale) story?.patch('Language', 'default', { locale });
        }}
      >
        <KubeProvider cluster={env.cluster}>
          <ShellProvider router={router} notifications={env.notifications} onFailure={onFailure}>
            <PathBar />
            <Frame />
          </ShellProvider>
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
