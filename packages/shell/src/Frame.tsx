import { Appearance, accessOf, closeIn, openedIn, Page, type PageProps, type PageSpec, slots, Theme, t } from '@overkube/sdk';
import { OpenedProvider, PagePropsProvider, useCluster, useKind, usePage, useSay } from '@overkube/sdk/preact';
import { Above, Notice, ScaleContext, SHAPE_TOKENS, SIZES, tokenStyle } from '@overkube/uikit';
import type { Definition } from '@overweave/core';
import { Guarded, slotElement, useDefinition, useDefinitions, useSlotView } from '@overweave/ui/preact';
import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { matchPage } from './match.ts';
import { linkPath } from './router.ts';

/**
 * The page's frame, and nothing of its own in it: its header's slots, the
 * navigation's (across the top, down the side), the Page the path names in
 * the middle (a resource opened over it), the overlay over it all. Whatever
 * fills them is the addons' (the core's, or another's in its place). A link
 * to a path of the page (#/…, or the page's own URL and #/…) goes through
 * the router, wherever the path is kept.
 */
export function Frame() {
  const page = usePage();
  const frame = useRef<HTMLDivElement>(null);
  const scale = useTheme(frame);
  // The language said in, on the page's root: read out as it is written.
  const say = useSay();
  useLayoutEffect(() => {
    const root = frame.current?.closest('.uk-root') as HTMLElement | null;
    if (!root) return;
    root.lang = say.locale;
    return () => root.removeAttribute('lang');
  }, [say.locale]);
  // A link within the page (#/…, /<page>#/…) goes through the router: the same for a hash's and one in memory (a story, a test) — on the
  // page's root, the layers over it too (a picker's, a dialog's: drawn at its end, not in the frame).
  const navigate = useRef(page.navigate);
  navigate.current = page.navigate;
  useEffect(() => {
    const root = frame.current?.closest('.uk-root') ?? frame.current;
    const follow = (e: Event) => {
      const m = e as MouseEvent;
      if (m.defaultPrevented || m.button !== 0 || m.metaKey || m.ctrlKey || m.shiftKey || m.altKey) return;
      const link = (m.target as Element | null)?.closest?.('a[href]');
      if (!link || (link as HTMLAnchorElement).target) return;
      const to = linkPath(link.getAttribute('href') as string);
      if (to === null) return;
      m.preventDefault();
      navigate.current(to);
    };
    root?.addEventListener('click', follow);
    return () => root?.removeEventListener('click', follow);
  }, []);
  return (
    <ScaleContext.Provider value={scale}>
      <div class="uk-shell" ref={frame}>
        <div class="uk-shell-side">{slotElement(slots.nav.side, NO_PROPS)}</div>
        <div class="uk-shell-page">
          {slotElement(slots.header.above, NO_PROPS)}
          <header class="uk-shell-header">
            {slotElement(slots.header.start, NO_PROPS)}
            <div class="uk-shell-header-end">{slotElement(slots.header.end, NO_PROPS)}</div>
          </header>
          {slotElement(slots.nav.tabs, NO_PROPS)}
          <main class="uk-shell-main">
            <Outlet />
          </main>
        </div>
        {slotElement(slots.overlay, NO_PROPS)}
        {slotElement(slots.menu, NO_PROPS)}
        <Notifications />
      </div>
    </ScaleContext.Provider>
  );
}

/**
 * What the user is told, over everything — a modal layer too (the kit's
 * layers: Above, never inert, never closed by a press). Its live regions
 * are there from the start (a region made with its first message is often
 * not read out).
 */
function Notifications() {
  const page = usePage();
  const polite = useRef<HTMLDivElement>(null);
  const assertive = useRef<HTMLDivElement>(null);
  const said = useRef(new Set<string>());
  const list = page.notifications.value;
  // Each new one read out once, in the region its level asks (an error at once); those gone, forgotten.
  useEffect(() => {
    for (const n of list) {
      if (said.current.has(n.id)) continue;
      const region = n.level === 'error' ? assertive.current : polite.current;
      if (region) region.textContent = [n.title, n.text].filter(Boolean).join(': ');
    }
    said.current = new Set(list.map((n) => n.id));
  }, [list]);
  return (
    <Above class="uk-shell-notifications">
      <div class="uk-shell-live" ref={polite} role="status" aria-live="polite" />
      <div class="uk-shell-live" ref={assertive} role="alert" aria-live="assertive" />
      {slotElement(slots.notifications, NO_PROPS)}
    </Above>
  );
}

/**
 * How the page looks, as its Appearance says: its Theme's tokens set on the
 * page's root (.uk-root: where the kit's defaults are, under them) — its
 * colours in the variant asked for (dark, light, or as the system is), its
 * corners and fonts as it says them in either; drawn as big as it says
 * (the kit's --uk-u: its scale, given back for what is sized in code).
 */
function useTheme(frame: RefObject<HTMLElement>): number {
  const appearance = useDefinition(Appearance, 'default')?.spec;
  const theme = useDefinition(Theme, appearance?.theme ?? 'default')?.spec;
  const mode = appearance?.mode ?? 'system';
  const [systemLight, setSystemLight] = useState(() => globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ?? false);
  useEffect(() => {
    if (mode !== 'system') return;
    const query = globalThis.matchMedia?.('(prefers-color-scheme: light)');
    if (!query) return;
    const follow = () => setSystemLight(query.matches);
    follow();
    query.addEventListener?.('change', follow);
    return () => query.removeEventListener?.('change', follow);
  }, [mode]);
  const variant = mode === 'light' || (mode === 'system' && systemLight) ? 'light' : 'dark';
  useLayoutEffect(() => {
    const root = frame.current?.closest('.uk-root') as HTMLElement | null;
    if (!root) return;
    if (variant === 'light') root.dataset.theme = 'light';
    else delete root.dataset.theme;
    const other = variant === 'light' ? theme?.dark : theme?.light;
    const shapes = Object.fromEntries(Object.entries(other ?? {}).filter(([name]) => (SHAPE_TOKENS as readonly string[]).includes(name)));
    const set = tokenStyle({ ...shapes, ...theme?.[variant] });
    for (const [name, value] of Object.entries(set)) root.style.setProperty(name, value);
    return () => {
      for (const name of Object.keys(set)) root.style.removeProperty(name);
      delete root.dataset.theme;
    };
  }, [variant, theme]);
  const scale = SIZES[appearance?.size ?? 'compact'] ?? 1;
  useLayoutEffect(() => {
    const root = frame.current?.closest('.uk-root') as HTMLElement | null;
    if (!root || scale === 1) return;
    root.style.setProperty('--uk-u', `${scale}px`);
    return () => root.style.removeProperty('--uk-u');
  }, [scale]);
  return scale;
}

// What the shell says while it runs (said in the page's language); what it says when no addon runs is as it is.
const NOTHING_HERE = t('shell.nothing-here', 'Nothing here');
const NO_PAGE = t('shell.no-page', 'No page at {path}.');
const TO_START = t('shell.to-start', 'To the start');
/** The frame's own slots' props: none, the same each time. */
const NO_PROPS = {} as Record<string, never>;

const NOTHING_TO_OPEN = t('shell.nothing-to-open', 'Nothing to open at {what}.');
const EMPTY_PAGE = t('shell.empty-page', 'Nothing is on this page.');
const FAILED = t('shell.failed', 'This page failed to draw.');
const FORBIDDEN = t('shell.forbidden', 'Forbidden');
const FORBIDDEN_PAGE = t('shell.forbidden-page', 'The cluster does not allow you what this page needs.');

/**
 * The Page at the path, drawn apart (what it throws is its own; tried again
 * on another path); none: said so; not for the one signed in (its access):
 * said so in its place (marked: over it). Over it, the resource the path opens
 * (?open=: resource.view), whatever the page.
 */
export function Outlet() {
  const page = usePage();
  const say = useSay();
  const pages = useDefinitions(Page);
  const path = page.path.value;
  // The page's own path: what is opened over it is the frame's, not the page's (opening, closing, the page as it was).
  const own = closeIn(path);
  const matched = useMemo(() => matchPage(pages, own), [pages, own]);
  // Where the page was before this path: a resource opened from the page it is over is closed by going back there.
  const last = useRef(path);
  useEffect(() => {
    last.current = path;
  }, [path]);
  const opened = openedIn(path);
  return (
    <>
      {!matched ? (
        pages.length ? (
          <Notice icon="puzzle" title={say(NOTHING_HERE)}>
            {say(NO_PAGE, { path: own })} <a href={page.href('/')}>{say(TO_START)}</a>
          </Notice>
        ) : (
          <Notice icon="puzzle" title="No pages">
            No addon draws a page: none that does is running.
          </Notice>
        )
      ) : (
        <Guarded
          key={matched.page.name}
          definition={matched.page}
          retryKey={own}
          fallback={
            <Notice level="error" icon="warning">
              {say(FAILED)}
            </Notice>
          }
        >
          {matched.props.params.kind === undefined ? <Filled page={matched.page} props={matched.props} /> : <OfKind page={matched.page} props={matched.props} />}
        </Guarded>
      )}
      {opened && <Opened key={`${opened.kind}/${opened.namespace ?? ''}/${opened.name}`} opened={opened} from={last.current} />}
    </>
  );
}

/** A page whose path names a kind (:kind): drawn with it, found — not found (not served, not known yet), without: what fills the page says so. */
function OfKind({ page, props }: { page: Definition<PageSpec>; props: Omit<PageProps, 'kind'> }) {
  const kind = useKind(props.params.kind);
  return <Filled page={page} props={kind ? { ...props, kind } : props} />;
}

/** What fills a page (page.<name>), in order — nothing (and no regions), said so; then its regions, each a slot of its own — drawn when something fills it. */
function Filled({ page, props }: { page: Definition<PageSpec>; props: PageProps }) {
  const say = useSay();
  // Not for the one signed in (of its kind, if it is a kind's): said so in its place — marked, over it.
  const access = accessOf(page, props.kind ? { kind: props.kind } : {});
  // The same props while the page is the same (its slots not drawn again for nothing).
  const given = useMemo(() => props, [props.path, props.kind]);
  const regions = [...(page.spec.regions ?? [])].sort((a, b) => (a.order ?? 500) - (b.order ?? 500));
  // Nothing on it (and no regions): said so — the same element while it is (the slot not drawn again for it).
  const empty = useMemo(() => (regions.length ? null : <Notice icon="puzzle">{say(EMPTY_PAGE)}</Notice>), [regions.length, say]);
  const forbidden = access !== 'allowed' && (
    <Notice level="error" icon="denied" title={say(FORBIDDEN)}>
      {say(FORBIDDEN_PAGE)}
    </Notice>
  );
  if (access === 'denied') return forbidden;
  return (
    <PagePropsProvider value={given}>
      {forbidden}
      {slotElement(slots.page(page.name), given, { retryKey: given.path, children: empty })}
      {regions.map((r) => (
        <Region key={r.name} page={page.name} region={r} props={given} />
      ))}
    </PagePropsProvider>
  );
}

/** A page's region: its title over what fills it, laid out as it says; nothing fills it, nothing drawn. */
function Region({ page, region, props }: { page: string; region: NonNullable<PageSpec['regions']>[number]; props: PageProps }) {
  const say = useSay();
  const where = slots.page(page, region.name);
  if (!useSlotView(where, props).selected.length) return null;
  return (
    <section class="uk-region" data-layout={region.layout ?? 'stack'}>
      {region.title && <h2 class="uk-region-title">{say(region.title)}</h2>}
      {slotElement(where, props)}
    </section>
  );
}

/**
 * The resource the path opens over the page (?open=): resource.view's, one
 * drawn — closing it (useOpened) goes back to the page it was opened from,
 * else to the page with nothing open. Its kind not served (or the scope not
 * the kind's: a namespace for one of the whole cluster, or none), said so,
 * and nothing left open.
 */
function Opened({ opened, from }: { opened: { kind: string; namespace?: string; name: string }; from: string }) {
  const page = usePage();
  const say = useSay();
  // What the cluster serves known — or not to be had (refused): a kind not found then is not coming.
  const discovery = useCluster().discovery;
  const known = !!discovery.kinds.value || discovery.state.value === 'error';
  const found = useKind(opened.kind);
  const kind = found && found.namespaced === (opened.namespace !== undefined) ? found : undefined;
  const [cameFrom] = useState(from);
  const value = useMemo(
    () => ({
      close() {
        const now = page.path.peek();
        const still = openedIn(now);
        if (still?.kind !== opened.kind || still.namespace !== opened.namespace || still.name !== opened.name) return;
        if (cameFrom === closeIn(now)) page.back();
        else page.navigate(closeIn(now), { replace: true });
      },
    }),
    [page, cameFrom],
  );
  const props = useMemo(() => kind && { kind, namespace: opened.namespace, name: opened.name }, [kind]);
  const wrong = !kind && (known || !!found);
  useEffect(() => {
    if (!wrong) return;
    page.notify({ level: 'warn', text: say(NOTHING_TO_OPEN, { what: [opened.kind, opened.namespace, opened.name].filter(Boolean).join('/') }) });
    page.navigate(closeIn(page.path.peek()), { replace: true });
  }, [wrong]);
  if (!props) return null;
  return <OpenedProvider value={value}>{slotElement(slots.resource.view, props, { limit: 1 })}</OpenedProvider>;
}
