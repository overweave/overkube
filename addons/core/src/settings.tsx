import { type AddonState, type AddonStatus, Appearance, Language, Messages, messagesName, NavView, RIGHTS_OF, Theme } from '@overkube/sdk';
import { useAddons, usePage, useSay, useUser } from '@overkube/sdk/preact';
import {
  Accordion,
  AccordionItem,
  Badge,
  Board,
  BoardAside,
  Button,
  DEFAULT_TOKENS,
  knobsOf,
  Modal,
  madeTheme,
  NavList,
  Nothing,
  Panel,
  PanelBody,
  PanelHead,
  Segmented,
  Select,
  Slider,
  Status,
  Swatches,
  Switch,
  type ThemeKnobs,
  ThemePicker,
} from '@overkube/uikit';
import { useDefinition, useDefinitions, useOverweave } from '@overweave/ui/preact';
import { type ComponentChildren, Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { LIBRARIES, OVERKUBE } from './licenses.generated.ts';
import { T } from './texts.ts';

/*
 * The page's settings (/settings): reached by the gear at the header's
 * end, not a kind nor a tab. A board as the overview's — its parts down
 * the side, the one chosen beside them, each a panel of names and values:
 * the interface (the theme — each drawn small; one's own, made by a few
 * knobs in a dialog and worn as they turn —, dark or light, the size, the
 * language, the navigation), the addons the page runs (each how it is
 * doing, why, started again), what the user changed (each taken back, or
 * all), overkube itself and the libraries it runs, with their licenses.
 * Each choice the user's: a patch, kept by the page.
 */

const t = T.page.settings;
export const SETTINGS_PATH = '/settings';

/** The gear at the header's end: to the settings (lit while there). */
export function SettingsButton() {
  const page = usePage();
  const say = useSay();
  const here = page.path.value === SETTINGS_PATH;
  return <Button icon="gear" variant="ghost" title={say(t.title)} aria-current={here ? 'page' : undefined} onClick={() => page.navigate(SETTINGS_PATH)} />;
}

/** A part: a panel as the overview's. */
const Part = ({ title, count, tools, children }: { title: string; count?: number; tools?: ComponentChildren; children: ComponentChildren }) => (
  <Panel header={<PanelHead title={title} {...(count === undefined ? {} : { count })} tools={tools} />}>
    <PanelBody>{children}</PanelBody>
  </Panel>
);

/** One's own theme: the theme the core adds bare, its tokens the user's (made by the knobs). */
export const OWN_THEME = 'custom';
const ACCENTS = ['#ff8c2f', '#e5534b', '#e3b341', '#4caf50', '#3ddbd9', '#58a6ff', '#a371f7', '#f778ba'];
const FONTS = [
  { value: 'inherit', title: 'System' },
  { value: 'Inter, system-ui, sans-serif', title: 'Inter' },
  { value: 'var(--uk-mono)', title: 'Monospace' },
];

/** What the user said of a definition's field (none: nothing: as given). */
function usersOf(registry: ReturnType<typeof useOverweave>['registry'], kind: string, name: string, field: string): unknown {
  return registry
    .inspect(kind, name)
    .contributions.find((c) => c.contributor === 'user')
    ?.leaves.find((l) => l.path.length === 1 && l.path[0] === field)?.value;
}

/** One's own theme made: knobs, each turned worn at once (the page in it); kept as it is, or taken back as it was. */
function OwnTheme({ onClose }: { onClose: () => void }) {
  const say = useSay();
  const user = useUser();
  const { registry } = useOverweave();
  const own = useDefinition(Theme, OWN_THEME)?.spec;
  // As it was — the user's own colours, the theme the user chose (none: as given): put back if not kept.
  const [was] = useState(() => ({ dark: own?.dark, light: own?.light, theme: usersOf(registry, 'Appearance', 'default', 'theme') }));
  const [knobs, setKnobs] = useState<ThemeKnobs>(() => knobsOf(own?.dark));
  const wear = (k: ThemeKnobs) => {
    user.patch('Theme', OWN_THEME, madeTheme(k));
    user.patch('Appearance', 'default', { theme: OWN_THEME });
  };
  const turn = (change: Partial<ThemeKnobs>) => {
    const next = { ...knobs, ...change };
    setKnobs(next);
    wear(next);
  };
  // Worn at once, as the knobs say.
  useEffect(() => wear(knobs), []);
  const kept = useRef(false);
  const close = () => {
    if (!kept.current) {
      user.reset('Theme', OWN_THEME);
      if (was.dark || was.light) user.patch('Theme', OWN_THEME, { dark: was.dark, light: was.light });
      if (was.theme === undefined) user.reset('Appearance', 'default', 'theme');
      else user.patch('Appearance', 'default', { theme: was.theme });
    }
    onClose();
  };
  return (
    <Modal
      title={say(t.ownTheme)}
      placement="right"
      onClose={close}
      closeLabel={say(t.cancel)}
      footer={(leave) => (
        <>
          <Button onClick={leave}>{say(t.cancel)}</Button>
          <Button
            variant="primary"
            onClick={() => {
              kept.current = true;
              leave();
            }}
          >
            {say(t.keep)}
          </Button>
        </>
      )}
    >
      <dl class="uk-board-facts">
        <dt>{say(t.accent)}</dt>
        <dd>
          <Swatches label={say(t.accent)} colors={ACCENTS} value={knobs.accent} onChange={(accent) => turn({ accent })} />
        </dd>
        <dt>{say(t.hue)}</dt>
        <dd>
          <Slider label={say(t.hue)} hue value={knobs.hue} min={0} max={360} unit="°" onChange={(hue) => turn({ hue })} />
        </dd>
        <dt>{say(t.tint)}</dt>
        <dd>
          <Slider label={say(t.tint)} value={knobs.tint} min={0} max={50} unit="%" onChange={(tint) => turn({ tint })} />
        </dd>
        <dt>{say(t.darkness)}</dt>
        <dd>
          <Slider label={say(t.darkness)} value={knobs.depth} min={0} max={30} unit="%" onChange={(depth) => turn({ depth })} />
        </dd>
        <dt>{say(t.contrast)}</dt>
        <dd>
          <Slider label={say(t.contrast)} value={knobs.contrast} min={60} max={100} unit="%" onChange={(contrast) => turn({ contrast })} />
        </dd>
        <dt>{say(t.corners)}</dt>
        <dd>
          <Slider label={say(t.corners)} value={knobs.corners} min={0} max={14} unit="px" onChange={(corners) => turn({ corners })} />
        </dd>
        <dt>{say(t.font)}</dt>
        <dd>
          <Select label={say(t.font)} value={knobs.font} onChange={(font) => turn({ font })} options={FONTS} />
        </dd>
      </dl>
    </Modal>
  );
}

function Interface() {
  const say = useSay();
  const user = useUser();
  const appearance = useDefinition(Appearance, 'default')?.spec;
  const themes = useDefinitions(Theme);
  const locale = useDefinition(Language, 'default')?.spec.locale ?? 'system';
  const messages = useDefinitions(Messages);
  const nav = useDefinition(NavView, 'default')?.spec;
  const mode = appearance?.mode ?? 'system';
  const variant = mode === 'light' || (mode === 'system' && globalThis.matchMedia?.('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  // The languages there are: those of a pack (Messages <locale>:<addon>), each in its own name.
  const locales = useMemo(() => [...new Set(messages.map((m) => messagesName(m.name)?.locale).filter((l): l is string => !!l))].sort(), [messages]);
  // In its own name (a tag the browser does not take: as it is).
  const nameOf = (l: string) => {
    try {
      return new Intl.DisplayNames([l], { type: 'language' }).of(l) ?? l;
    } catch {
      return l;
    }
  };
  const browser = navigator.language;
  const [making, setMaking] = useState(false);
  // One's own among them once made (its tokens set), named as one's own.
  const shown = themes.filter((theme) => theme.name !== OWN_THEME || theme.spec.dark);
  return (
    <>
      <Part title={say(t.theme)}>
        <ThemePicker
          label={say(t.theme)}
          value={appearance?.theme ?? 'default'}
          onChange={(theme) => user.patch('Appearance', 'default', { theme })}
          themes={shown.map((theme) => ({
            key: theme.name,
            title: theme.name === OWN_THEME ? say(t.ownTheme) : theme.spec.title,
            tokens: { ...DEFAULT_TOKENS[variant], ...theme.spec[variant] },
          }))}
          more={{ label: say(shown.length < themes.length ? t.makeOwn : t.editOwn), onClick: () => setMaking(true) }}
        />
        {making && <OwnTheme onClose={() => setMaking(false)} />}
        <dl class="uk-board-facts">
          <dt>{say(t.mode)}</dt>
          <dd>
            <Segmented
              label={say(t.mode)}
              value={mode}
              onChange={(m) => user.patch('Appearance', 'default', { mode: m })}
              options={[
                { value: 'system', label: say(t.system) },
                { value: 'dark', label: say(t.dark) },
                { value: 'light', label: say(t.light) },
              ]}
            />
          </dd>
          <dt>{say(t.size)}</dt>
          <dd>
            <Segmented
              label={say(t.size)}
              value={appearance?.size ?? 'compact'}
              onChange={(size) => user.patch('Appearance', 'default', { size })}
              options={[
                { value: 'compact', label: say(t.compact) },
                { value: 'comfortable', label: say(t.comfortable) },
                { value: 'large', label: say(t.large) },
              ]}
            />
          </dd>
        </dl>
      </Part>
      <Part title={say(t.languageAndNavigation)}>
        <dl class="uk-board-facts">
          <dt>{say(t.language)}</dt>
          <dd>
            <Select
              label={say(t.language)}
              value={locale}
              onChange={(l) => user.patch('Language', 'default', { locale: l })}
              options={[{ value: 'system', title: say(t.asBrowser, { language: nameOf(browser) }) }, ...locales.map((l) => ({ value: l, title: nameOf(l), hint: l }))]}
            />
          </dd>
          <dt>{say(t.navigation)}</dt>
          <dd>
            <Segmented
              label={say(t.navigation)}
              value={nav?.mode ?? 'tabs'}
              onChange={(m) => user.patch('NavView', 'default', { mode: m })}
              options={[
                { value: 'tabs', label: say(t.tabs) },
                { value: 'side', label: say(t.side) },
              ]}
            />
          </dd>
          <dt>{say(t.sideRail)}</dt>
          <dd>
            <Switch
              label={say(t.pinnedOpen)}
              checked={nav?.side === 'pinned'}
              disabled={nav?.mode !== 'side'}
              onChange={(on) => user.patch('NavView', 'default', { side: on ? 'pinned' : 'collapsed' })}
            />
          </dd>
        </dl>
      </Part>
    </>
  );
}

interface Change {
  kind: string;
  name: string;
  fields: string[];
}

/** What the user changed (the user's patches, each its fields): read anew as the registry changes, given anew only when it is another. */
function useChanges(): readonly Change[] {
  const { registry } = useOverweave();
  const read = (): Change[] =>
    registry.contributions('user').map(({ kind, name }) => {
      const mine = registry.inspect(kind, name).contributions.find((c) => c.contributor === 'user');
      return { kind, name, fields: [...new Set(mine?.leaves.map((l) => l.path[0]).filter(Boolean) ?? [])] };
    });
  const [changes, setChanges] = useState(read);
  useEffect(
    () =>
      registry.subscribe(() => {
        const now = read();
        setChanges((was) => (JSON.stringify(now) === JSON.stringify(was) ? was : now));
      }),
    [registry],
  );
  return changes;
}

function Changes({ changes }: { changes: readonly Change[] }) {
  const say = useSay();
  const user = useUser();
  return (
    <Part
      title={say(t.changes)}
      tools={
        changes.length > 0 && (
          <Button
            variant="danger"
            onClick={() => {
              for (const c of changes) user.reset(c.kind, c.name);
            }}
          >
            {say(t.resetAll)}
          </Button>
        )
      }
    >
      {changes.length === 0 ? (
        <Nothing>{say(t.noChanges)}</Nothing>
      ) : (
        <dl class="uk-board-facts">
          {changes.map((c) => (
            <Fragment key={`${c.kind}/${c.name}`}>
              <dt>
                {c.kind} <span class="uk-mono">{c.name}</span>
              </dt>
              <dd>
                <span class="uk-muted">{c.fields.join(', ')}</span>{' '}
                <Button variant="ghost" size="sm" onClick={() => user.reset(c.kind, c.name)}>
                  {say(t.reset)}
                </Button>
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
    </Part>
  );
}

/** Each state as the page tells it: its tone, its icon. */
const STATES: Record<AddonState, { tone: 'ok' | 'progress' | 'waiting' | 'warn' | 'error' | 'gone'; icon: string }> = {
  running: { tone: 'ok', icon: 'circle-check' },
  starting: { tone: 'progress', icon: 'spinner' },
  unavailable: { tone: 'waiting', icon: 'hourglass' },
  degraded: { tone: 'warn', icon: 'warning' },
  crashloop: { tone: 'error', icon: 'crash-loop' },
  failed: { tone: 'error', icon: 'circle-x' },
  disabled: { tone: 'gone', icon: 'circle-dashed' },
};

/** An addon: a line (how it is doing, its name, its id and layer; started again at its end, if it failed), opened: why, what it is, what it may do. */
function AddonLine({ addon, onRestart }: { addon: AddonStatus; onRestart: () => void }) {
  const say = useSay();
  const look = STATES[addon.state];
  const state = say(t.states[addon.state]);
  const failing = addon.state === 'crashloop' || addon.state === 'failed' || addon.state === 'degraded';
  return (
    <AccordionItem
      mark={<Status tone={look.tone} icon={look.icon} title={state} />}
      title={
        <>
          <span>{addon.title}</span>
          <span>
            {addon.id} · {addon.layer}
          </span>
        </>
      }
      end={
        failing && (
          <Button icon="refresh" variant="ghost" size="sm" onClick={onRestart}>
            {say(t.restart)}
          </Button>
        )
      }
    >
      <dl class="uk-board-facts">
        <dt>{say(t.state)}</dt>
        <dd>
          <Status tone={look.tone} icon={look.icon}>
            {state}
          </Status>
          {addon.reason && <span class="uk-muted"> · {addon.reason}</span>}
        </dd>
        {addon.error && (
          <>
            <dt>{say(t.lastError)}</dt>
            <dd class="uk-mono">{addon.error}</dd>
          </>
        )}
        {(addon.restarts > 0 || addon.errors > 0) && (
          <>
            <dt>{say(t.restarts)}</dt>
            <dd>{say(t.restartsErrors, { restarts: addon.restarts, errors: addon.errors })}</dd>
          </>
        )}
        {addon.description && (
          <>
            <dt>{say(t.description)}</dt>
            <dd>{addon.description}</dd>
          </>
        )}
        <dt>{say(t.may)}</dt>
        <dd>
          <span class="uk-refs">
            {RIGHTS_OF[addon.layer].map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </span>
        </dd>
      </dl>
    </AccordionItem>
  );
}

function AddonsPart() {
  const say = useSay();
  const addons = useAddons();
  const statuses = addons?.statuses.value ?? [];
  return (
    <Part title={say(t.addons)} {...(addons ? { count: statuses.length } : {})}>
      {addons ? (
        <Accordion>
          {statuses.map((a) => (
            <AddonLine key={a.id} addon={a} onRestart={() => addons.restart(a.id)} />
          ))}
        </Accordion>
      ) : (
        <Nothing>{say(t.noAddons)}</Nothing>
      )}
    </Part>
  );
}

/** overkube itself, and the libraries it runs: each its version, its license, a link to it. */
function About() {
  const say = useSay();
  return (
    <>
      <Part title={OVERKUBE.name}>
        <dl class="uk-board-facts">
          <dt>{say(t.version)}</dt>
          <dd class="uk-mono">{OVERKUBE.version}</dd>
          <dt>{say(t.license)}</dt>
          <dd>{OVERKUBE.license}</dd>
          <dt>{say(t.source)}</dt>
          <dd>
            {OVERKUBE.url && (
              <a href={OVERKUBE.url} target="_blank" rel="noreferrer">
                {OVERKUBE.url.replace(/^https:\/\//, '')}
              </a>
            )}
          </dd>
        </dl>
      </Part>
      <Part title={say(t.libraries)} count={LIBRARIES.length}>
        <dl class="uk-board-facts">
          {LIBRARIES.map((l) => (
            <Fragment key={`${l.name}@${l.version}`}>
              <dt>
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noreferrer">
                    {l.name}
                  </a>
                ) : (
                  l.name
                )}
              </dt>
              <dd>
                <span class="uk-mono">{l.version}</span> <Badge>{l.license}</Badge>
              </dd>
            </Fragment>
          ))}
        </dl>
      </Part>
    </>
  );
}

/** The parts, by key. */
const PARTS = {
  interface: () => <Interface />,
  addons: () => <AddonsPart />,
  changes: (changes: readonly Change[]) => <Changes changes={changes} />,
  about: () => <About />,
};

/** The page: its parts down the side (a panel of its own), the one chosen beside them. */
export function SettingsPage() {
  const say = useSay();
  const [shown, show] = useState<keyof typeof PARTS>('interface');
  const addons = useAddons()?.statuses.value;
  const changes = useChanges();
  const item = (key: keyof typeof PARTS, label: (typeof t)['about'], icon: string, extra?: number) => ({
    key,
    label: say(label),
    href: `#${SETTINGS_PATH}`,
    icon,
    ...(extra ? { extra: String(extra) } : {}),
  });
  return (
    <Board>
      <BoardAside
        side={
          <Panel header={<PanelHead title={say(t.title)} />}>
            <PanelBody>
              <NavList
                label={say(t.title)}
                current={shown}
                onOpen={(item, e) => {
                  e.preventDefault();
                  show(item.key as typeof shown);
                }}
                groups={[
                  { key: 'general', title: say(t.general), items: [item('interface', t.interface, 'eye')] },
                  { key: 'extensions', title: say(t.extensions), items: [item('addons', t.addons, 'puzzle', addons?.length)] },
                  { key: 'you', title: say(t.you), items: [item('changes', t.changes, 'user', changes.length), item('about', t.about, 'help')] },
                ]}
              />
            </PanelBody>
          </Panel>
        }
      >
        {PARTS[shown](changes)}
      </BoardAside>
    </Board>
  );
}
