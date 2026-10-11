import { Appearance, Route, slots, Theme, t } from '@overkube/sdk';
import { RouteProvider, usePage, useSay } from '@overkube/sdk/preact';
import { Notice, SHAPE_TOKENS, tokenStyle } from '@overkube/uikit';
import { Guarded, slotElement, useDefinition, useDefinitions } from '@overweave/ui/preact';
import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { matchRoute } from './match.ts';

/**
 * The page's frame, and nothing of its own in it: its header's slots, the
 * navigation's (across the top, down the side), the Route the path names in
 * the middle, the overlay over it all. Whatever fills them is the addons'
 * (the core's, or another's in its place). A link to a path of the page
 * (#/…) goes through the router, wherever the path is kept.
 */
export function Frame() {
  const page = usePage();
  const frame = useRef<HTMLDivElement>(null);
  useTheme(frame);
  // The language said in, on the page's root: read out as it is written.
  const say = useSay();
  useLayoutEffect(() => {
    const root = frame.current?.closest('.uk-root') as HTMLElement | null;
    if (!root) return;
    root.lang = say.locale;
    return () => root.removeAttribute('lang');
  }, [say.locale]);
  // A link within the page (#/…) goes through the router: the same for a hash's and one in memory (a story, a test).
  const follow = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as Element | null)?.closest?.('a[href^="#/"]');
    if (!link || (link as HTMLAnchorElement).target) return;
    e.preventDefault();
    page.navigate((link.getAttribute('href') as string).slice(1));
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: links are followed here, not clicks made of it (a link's Enter is a click).
    <div class="uk-shell" ref={frame} onClick={follow}>
      {slotElement(slots.header.above, {})}
      <header class="uk-shell-header">
        {slotElement(slots.header.start, {})}
        <div class="uk-shell-header-end">{slotElement(slots.header.end, {})}</div>
      </header>
      {slotElement(slots.nav.top, {})}
      <div class="uk-shell-body">
        <aside class="uk-shell-side">{slotElement(slots.nav.side, {})}</aside>
        <main class="uk-shell-main">
          <Outlet />
        </main>
      </div>
      {slotElement(slots.overlay, {})}
      <Notifications />
    </div>
  );
}

/**
 * What the user is told, over everything — a dialog too: in the top layer
 * (a manual popover), shown again on top whenever what is told changes (a
 * dialog opened since would be over it). Its live regions are there from
 * the start (a region made with its first message is often not read out).
 */
function Notifications() {
  const page = usePage();
  const box = useRef<HTMLDivElement>(null);
  const polite = useRef<HTMLDivElement>(null);
  const assertive = useRef<HTMLDivElement>(null);
  const said = useRef(new Set<string>());
  const list = page.notifications.value;
  // Each new one read out once, in the region its level asks (an error at once).
  useEffect(() => {
    for (const n of list) {
      if (said.current.has(n.id)) continue;
      said.current.add(n.id);
      const region = n.level === 'error' ? assertive.current : polite.current;
      if (region) region.textContent = [n.title, n.text].filter(Boolean).join(': ');
    }
  }, [list]);
  useEffect(() => {
    const el = box.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el?.showPopover || !el.hidePopover) return;
    try {
      if (el.matches(':popover-open')) el.hidePopover();
      if (list.length) el.showPopover();
    } catch {
      // A browser without popovers: shown where it is.
    }
  }, [list]);
  return (
    <div class="uk-shell-notifications" ref={box} popover="manual">
      <div class="uk-shell-live" ref={polite} role="status" aria-live="polite" />
      <div class="uk-shell-live" ref={assertive} role="alert" aria-live="assertive" />
      {slotElement(slots.notifications, {})}
    </div>
  );
}

/**
 * How the page looks, as its Appearance says: its Theme's tokens set on the
 * page's root (.uk-root: where the kit's defaults are, under them) — its
 * colours in the variant asked for (dark, light, or as the system is), its
 * corners and fonts as it says them in either.
 */
function useTheme(frame: RefObject<HTMLElement>) {
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
}

// What the shell says while it runs (said in the page's language); what it says when no addon runs is as it is.
const NOTHING_HERE = t('shell.nothing-here', 'Nothing here');
const NO_PAGE = t('shell.no-page', 'No page at {path}.');
const TO_START = t('shell.to-start', 'To the start');

/** The Route at the path, drawn apart (what it throws is its own); none: said so. */
export function Outlet() {
  const page = usePage();
  const say = useSay();
  const routes = useDefinitions(Route);
  const path = page.path.value;
  const matched = useMemo(() => matchRoute(routes, path), [routes, path]);
  if (!matched)
    return routes.length ? (
      <Notice icon="puzzle" title={say(NOTHING_HERE)}>
        {say(NO_PAGE, { path })} <a href={page.href('/')}>{say(TO_START)}</a>
      </Notice>
    ) : (
      <Notice icon="puzzle" title="No pages">
        No addon draws a page: none that does is running.
      </Notice>
    );
  const Render = matched.route.spec.render;
  return (
    <RouteProvider value={matched.props}>
      {/* Tried again on another path: a page that failed for one object is not failed for the next. */}
      <Guarded
        key={matched.route.name}
        definition={matched.route}
        retryKey={path}
        fallback={
          <Notice level="error" icon="warning">
            This page failed to draw.
          </Notice>
        }
      >
        <Render {...matched.props} />
      </Guarded>
    </RouteProvider>
  );
}
