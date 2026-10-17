/*
 * The kit's styles, for the page's shadow root (where the host page's own
 * styles do not reach). Every colour, corner and font is a token (theme.ts):
 * the defaults' two variants, dark by default, light with
 * data-theme='light' on the root — a theme sets its own over them.
 */
import { COLOR_TOKENS, DEFAULT_TOKENS, HUE_TRACK, scaled, tokenCss } from './theme';

/** The light variant's colours (its corners and fonts are the dark's: they are not a colour scheme's). */
const LIGHT_COLORS = Object.fromEntries(COLOR_TOKENS.map((t) => [t, DEFAULT_TOKENS.light[t]]));

/*
 * The tokens (a theme's as it says them: not scaled, its own or the
 * kit's), the scale (--uk-u) and the host's padding around the page
 * (--uk-shell-inset: 16px each way, the host's, not the kit's to scale);
 * then the kit's own styles, at the scale.
 */
export const css = `
:host, .uk-root {
  ${tokenCss(DEFAULT_TOKENS.dark)}
  --uk-u: 1px;
  --uk-shell-inset: 32px;
}
.uk-root[data-theme='light'] {
  ${tokenCss(LIGHT_COLORS)}
}
${scaled(`
:host, .uk-root {
  --uk-row: 34px;
  color: var(--uk-text); font-family: var(--uk-font); font-size: 13px; line-height: 1.4;
}
.uk-root *, .uk-root *::before, .uk-root *::after { box-sizing: border-box; }
.uk-root a:not([class]) { color: var(--uk-accent); text-decoration: none; }
.uk-root a:not([class]):hover { text-decoration: underline; }
.uk-muted { color: var(--uk-muted); }
.uk-mono { font-family: var(--uk-mono); }
.uk-icon { width: 16px; height: 16px; flex: none; vertical-align: -3px; stroke: currentColor; fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.uk-icon[data-filled] { fill: currentColor; stroke: none; }
.uk-icon[data-icon='denied'] { color: var(--uk-error); }

.uk-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 32px; padding: 0 14px; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); background: var(--uk-panel-2); color: var(--uk-text); font: inherit; font-weight: 500; line-height: 1; white-space: nowrap; text-decoration: none; cursor: pointer; user-select: none; box-shadow: 0 1px 0 color-mix(in srgb, var(--uk-shadow) 12%, transparent); transition: background .12s, border-color .12s, color .12s, box-shadow .12s, transform .08s; }
.uk-button > .uk-icon { width: 15px; height: 15px; margin-left: -2px; }
.uk-button:not(:disabled):hover { background: color-mix(in srgb, var(--uk-panel-2), var(--uk-text) 7%); border-color: color-mix(in srgb, var(--uk-border), var(--uk-text) 12%); }
.uk-button:active:not(:disabled) { transform: translateY(.5px) scale(.98); box-shadow: none; }
.uk-button:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: 2px; }
.uk-input:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: 1px; }
/* Primary: framed in the accent, its words in capitals, spaced; filled a little under the pointer. */
.uk-button[data-variant='primary'] { background: transparent; border-color: var(--uk-accent); color: var(--uk-accent); font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; box-shadow: none; }
.uk-button[data-variant='primary'] > .uk-icon { width: 13px; height: 13px; }
.uk-button[data-variant='primary'][data-size='sm'] { font-size: 10px; letter-spacing: .14em; }
.uk-button[data-variant='primary']:not(:disabled):hover { background: color-mix(in srgb, var(--uk-accent) 12%, transparent); border-color: color-mix(in srgb, var(--uk-accent), var(--uk-text) 15%); color: color-mix(in srgb, var(--uk-accent), var(--uk-text) 15%); }
.uk-button[data-variant='danger'] { background: color-mix(in srgb, var(--uk-error) 14%, transparent); border-color: color-mix(in srgb, var(--uk-error) 35%, transparent); color: var(--uk-error); box-shadow: none; }
.uk-button[data-variant='danger']:not(:disabled):hover { background: color-mix(in srgb, var(--uk-error) 22%, transparent); border-color: color-mix(in srgb, var(--uk-error) 55%, transparent); }
.uk-button[data-variant='ghost'] { background: transparent; border-color: transparent; box-shadow: none; color: var(--uk-muted); }
.uk-button[data-variant='ghost']:not(:disabled):hover { background: var(--uk-panel-2); color: var(--uk-text); }
.uk-button[data-variant='ghost'][aria-current='page'] { color: var(--uk-accent); }
.uk-button[data-variant='field'] { min-width: 240px; justify-content: flex-start; background: var(--uk-bg); color: var(--uk-muted); font-weight: 400; box-shadow: none; }
.uk-button[data-variant='field']:not(:disabled):hover { color: var(--uk-text); }
.uk-button[data-size='sm'] { height: 26px; padding: 0 10px; gap: 5px; font-size: 12px; border-radius: var(--uk-radius); }
.uk-button[data-size='sm'] > .uk-icon { width: 13px; height: 13px; }
.uk-button[data-square] { width: 32px; padding: 0; }
.uk-button[data-square][data-size='sm'] { width: 26px; }
/* An icon alone is the whole button: as large as anywhere else. */
.uk-button[data-square][data-size='sm'] > .uk-icon { width: 16px; height: 16px; }
.uk-button[data-square] > .uk-icon { margin: 0; }
.uk-button:disabled { opacity: .45; cursor: default; }
.uk-button[data-busy] { opacity: .8; cursor: progress; }
.uk-spinner { width: 13px; height: 13px; flex: none; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: uk-spin .7s linear infinite; }
@keyframes uk-spin { to { transform: rotate(1turn); } }
.uk-input { height: 30px; padding: 0 10px; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); background: var(--uk-bg); color: var(--uk-text); font: inherit; width: 100%; }

.uk-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--uk-muted); flex: none; }
.uk-dot[data-level='ok'] { background: var(--uk-ok); }
.uk-dot[data-level='warn'] { background: var(--uk-warn); }
.uk-dot[data-level='error'] { background: var(--uk-error); }
/* A badge: a soft tint of its level's colour, its words in that colour (darker on a light page, to be read); none: grey. */
.uk-badge { --uk-badge-c: var(--uk-muted); display: inline-flex; align-items: center; justify-self: start; align-self: center; gap: 5px; max-width: 100%; height: 20px; padding: 0 7px; border-radius: var(--uk-radius); background: color-mix(in srgb, var(--uk-badge-c) 16%, transparent); color: var(--uk-badge-c); font-size: 11px; font-weight: 600; line-height: 1; white-space: nowrap; vertical-align: middle; font-variant-numeric: tabular-nums; }
.uk-badge:not([data-level]) { background: var(--uk-panel-2); color: var(--uk-muted); }
.uk-badge[data-level='ok'] { --uk-badge-c: var(--uk-ok); }
.uk-badge[data-level='warn'] { --uk-badge-c: var(--uk-warn); }
.uk-badge[data-level='error'] { --uk-badge-c: var(--uk-error); }
.uk-root[data-theme='light'] .uk-badge[data-level] { color: color-mix(in srgb, var(--uk-badge-c), var(--uk-text) 38%); background: color-mix(in srgb, var(--uk-badge-c) 20%, transparent); }
/* Cut short by clip, not hidden: its words keep their baseline (one hidden is said to sit on its foot), so it lines up with the words beside it. */
.uk-badge-text { min-width: 0; overflow: clip; text-overflow: ellipsis; }
.uk-badge-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--uk-badge-c); }
.uk-chips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
/* A chip: its key quieter, its value plain, a hairline between; cut short when long. */
.uk-chip { all: unset; position: relative; display: inline-flex; align-items: stretch; max-width: min(420px, 100%); height: 22px; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); overflow: hidden; background: var(--uk-panel-2); font-family: var(--uk-mono); font-size: 11px; line-height: 20px; cursor: pointer; transition: border-color .12s, background .12s; }
.uk-chip:hover { border-color: color-mix(in srgb, var(--uk-border), var(--uk-text) 20%); }
/* One leading somewhere (a label: its kind's page, those of it): its name the link's colour under the pointer. */
a.uk-chip:hover .uk-chip-name, .uk-badge-link:hover .uk-badge { color: var(--uk-accent); }
.uk-badge-link { text-decoration: none; color: inherit; }
.uk-chip:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: 1px; }
.uk-chip-key { color: var(--uk-muted); white-space: nowrap; }
.uk-chip-value[data-long] { flex: 0 1 auto; min-width: 6ch; }
/* Short of room, a key's prefix gives way first (to a letter); its name stays whole; its value, after. */
.uk-chip-prefix { flex: 0 50 auto; min-width: 1ch; padding-left: 7px; opacity: .6; overflow: hidden; text-overflow: ellipsis; }
.uk-chip-name { flex: none; padding-right: 7px; }
.uk-chip-name:first-child { padding-left: 7px; }
.uk-chip-value { flex: none; padding: 0 7px; border-left: 1px solid var(--uk-border); background: var(--uk-panel); color: var(--uk-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Copied: it glows green a moment, then fades back. */
/* Copied: said over it a moment ("✓ Copied"), as wide as it is — fading in and out, nothing else of it changing. */
.uk-chip:not(.uk-chip-more)::after { content: attr(data-copied-label); position: absolute; inset: 0; display: grid; place-items: center; background: var(--uk-panel-2); color: var(--uk-ok); font-family: var(--uk-font); font-weight: 500; opacity: 0; pointer-events: none; transition: opacity .25s; }
.uk-chip[data-copied]::after { opacity: 1; transition-duration: .1s; }
.uk-chip-more { padding: 0 8px; color: var(--uk-muted); font-family: inherit; }
.uk-chip-more:hover { color: var(--uk-text); }

.uk-panel { background: var(--uk-panel); border: 1px solid var(--uk-border); border-radius: var(--uk-radius); }
/* A panel's header on top; a table in it framed by the panel alone (a line over it); a notice in it kept off its edges. */
.uk-panel-head { padding: 10px 10px 10px 16px; }
.uk-panel .uk-table { border: 0; border-radius: 0; border-top: 1px solid var(--uk-border); background: transparent; }
.uk-panel > .uk-region > .uk-notice, .uk-panel > .uk-notice { margin: 0 12px; }
.uk-panel-head:empty { display: none; }
/* A board (layout/Board): its parts one under another, then two columns (one when narrow); a panel's head 48px (its title, count, tools, link), its body at the same inset, its rows' first line 20px (their marks centred on it). */
.uk-board { --uk-board-gap: 16px; --uk-board-pad: 20px; display: flex; flex-direction: column; gap: var(--uk-board-gap); container-type: inline-size; }
.uk-board-cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--uk-board-gap); align-items: start; }
@container (max-width: 760px) { .uk-board-cols { grid-template-columns: minmax(0, 1fr); } }
.uk-board-col { display: flex; flex-direction: column; gap: var(--uk-board-gap); min-width: 0; }
.uk-board-col:empty { display: none; }
.uk-board-aside { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--uk-board-gap); align-items: start; }
@container (max-width: 760px) { .uk-board-aside { grid-template-columns: minmax(0, 1fr); } }
.uk-board-side { position: sticky; top: 12px; min-width: 0; }
.uk-board-side .uk-panel-body { padding: 8px; }
.uk-board .uk-panel { overflow: hidden; }
/* A table in a board's panel: its head and rows at the panel's inset (its title's). */
.uk-board .uk-panel .uk-table :is(.uk-table-head, .uk-table-row) { padding: 0 var(--uk-board-pad); }
.uk-board .uk-panel-head { display: flex; align-items: center; min-height: 48px; padding: 0 var(--uk-board-pad); box-sizing: border-box; border-bottom: 1px solid var(--uk-border); }
.uk-panel-title { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.uk-panel-title h2 { margin: 0; font-size: 13px; font-weight: 600; }
.uk-panel-tools { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.uk-panel-more { margin-left: auto; color: var(--uk-muted); font-size: 12px; text-decoration: none; white-space: nowrap; }
.uk-panel-tools + .uk-panel-more { margin-left: 12px; }
.uk-panel-more:hover { color: var(--uk-text); }
.uk-panel-body { padding: 0 var(--uk-board-pad, 16px); }
.uk-panel-body > .uk-rows > .uk-row { padding: 12px 0; line-height: 20px; row-gap: 2px; }
.uk-panel-body > .uk-rows > .uk-row:first-child { border-top: 0; }
.uk-panel-body .uk-row-mark { align-self: start; height: 20px; align-items: center; }
.uk-panel-body .uk-row-mark > * { display: flex; align-items: center; height: 20px; }
.uk-panel-body .uk-row-under { line-height: 18px; }
/* Under its lead only: not under what ends it (a count, a time). */
.uk-panel-body .uk-row > .uk-row-under { grid-column: 1 / 2; }
.uk-panel-body .uk-row[data-mark] > .uk-row-under { grid-column: 2 / 3; }
.uk-panel-body > .uk-nothing { padding: 16px 0; }
.uk-panel-body > .uk-accordion { padding: 16px 0; }
.uk-panel-body .uk-accordion-body .uk-board-facts { margin-top: 4px; }
.uk-panel-body > .uk-board-loading { display: grid; gap: 12px; padding: 16px 0; }
.uk-board-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 24px; margin: 0; padding: 4px 0; }
.uk-board-facts > dt, .uk-board-facts > dd { margin: 0; padding: 8px 0; border-top: 1px solid color-mix(in srgb, var(--uk-border) 70%, transparent); min-width: 0; overflow-wrap: anywhere; }
.uk-board-facts > :is(dt, dd):nth-child(-n + 2) { border-top: 0; }
.uk-board-facts > dt { color: var(--uk-muted); }
.uk-board-object { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; min-width: 0; }
.uk-board-object a { color: var(--uk-text); font-weight: 500; text-decoration: none; }
.uk-board-object a:hover { color: var(--uk-accent); }
.uk-board-name { color: var(--uk-text); font-weight: 500; text-decoration: none; }
.uk-board-name:hover { color: var(--uk-accent); }
.uk-board-refusals { display: flex; flex-direction: column; gap: 4px; padding: 10px var(--uk-board-pad, 16px); border-bottom: 1px solid var(--uk-border); }
.uk-board-bad { color: var(--uk-error); font-weight: 500; }
/* When: how often apart, how long ago in a box of its own (not moving the rest as it changes). */
.uk-board-when { display: inline-flex; gap: 8px; justify-content: flex-end; font-variant-numeric: tabular-nums; }
.uk-board-age { display: inline-block; min-width: 6ch; text-align: right; }
.uk-board-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; column-gap: 16px; align-items: baseline; }
.uk-board-th { padding: 12px 0 8px; color: var(--uk-muted); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.uk-board-td { padding: 10px 0; border-top: 1px solid color-mix(in srgb, var(--uk-border) 70%, transparent); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-board-td a { color: var(--uk-text); text-decoration: none; }
.uk-board-td a:hover { color: var(--uk-accent); }
.uk-board-num { text-align: right; font-variant-numeric: tabular-nums; }
/* Tiles (layout/Board): as many in a row as there is room for (all eight on a wide page), each 170px at least; ruled between them (their own right and bottom edges, the last ones' under the panel's frame: none left over drawn). */
.uk-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); margin: 0 -1px -1px 0; }
.uk-tile { all: unset; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto auto; column-gap: 12px; row-gap: 4px; padding: 14px 16px; background: var(--uk-panel); border-right: 1px solid var(--uk-border); border-bottom: 1px solid var(--uk-border); }
button.uk-tile { cursor: pointer; }
button.uk-tile:hover { background: var(--uk-panel-2); }
button.uk-tile:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
.uk-tile-title { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--uk-muted); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.uk-tile-title > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-tile-title .uk-icon { flex: none; width: 14px; height: 14px; }
button.uk-tile:hover .uk-tile-title { color: var(--uk-text); }
.uk-tile-value { grid-column: 1; display: flex; align-items: baseline; min-height: 26px; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.3; }
.uk-tile-value small { margin-left: 3px; font-size: 12px; font-weight: 400; color: var(--uk-muted); }
.uk-tile-value[data-level='warn'], .uk-tile-note[data-level='warn'] { color: var(--uk-warn); }
.uk-tile-value[data-level='error'], .uk-tile-note[data-level='error'] { color: var(--uk-error); }
.uk-tile-note { grid-column: 1; min-width: 0; color: var(--uk-muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uk-tile > .uk-tip-at { grid-column: 2; grid-row: 2 / 4; align-self: center; display: flex; }
.uk-tile-shimmer { align-self: center; width: 46px; height: 16px; border-radius: var(--uk-radius-sm); background: linear-gradient(90deg, var(--uk-panel-2) 25%, color-mix(in srgb, var(--uk-panel-2), var(--uk-text) 8%) 50%, var(--uk-panel-2) 75%); background-size: 200% 100%; animation: uk-shimmer 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .uk-tile-shimmer { animation: none; } }
/* A split (data/Split): a ring of its parts, a little gap between them; under the pointer it grows a little. */
.uk-split { width: 36px; height: 36px; cursor: pointer; transition: transform .18s cubic-bezier(.2, .8, .2, 1); }
.uk-split:hover { transform: scale(1.12); }
@media (prefers-reduced-motion: reduce) { .uk-split { transition: none; } }
.uk-split circle { fill: none; stroke-width: 5; }
.uk-split .uk-split-whole { stroke: var(--uk-panel-2); }
.uk-split [data-tone='ok'] { stroke: var(--uk-ok); }
.uk-split :is([data-tone='waiting'], [data-tone='unknown']) { stroke: var(--uk-muted); }
.uk-split :is([data-tone='warn'], [data-tone='progress']) { stroke: var(--uk-warn); }
.uk-split [data-tone='error'] { stroke: var(--uk-error); }
.uk-split :is([data-tone='done'], [data-tone='gone']) { stroke: color-mix(in srgb, var(--uk-muted) 45%, transparent); }
.uk-split-parts { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 8px; align-items: center; min-width: 140px; }
.uk-split-parts > div { display: contents; }
.uk-split-parts i { width: 8px; height: 8px; border-radius: 50%; }
.uk-split-parts b { font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
.uk-split-parts [data-tone='ok'] { background: var(--uk-ok); }
.uk-split-parts :is([data-tone='waiting'], [data-tone='unknown']) { background: var(--uk-muted); }
.uk-split-parts :is([data-tone='warn'], [data-tone='progress']) { background: var(--uk-warn); }
.uk-split-parts [data-tone='error'] { background: var(--uk-error); }
.uk-split-parts :is([data-tone='done'], [data-tone='gone']) { background: color-mix(in srgb, var(--uk-muted) 45%, transparent); }
.uk-gauges { display: grid; gap: 16px; margin: 0; padding: 16px var(--uk-board-pad, 16px); }
.uk-gauges + .uk-gauges, .uk-gauges + * > .uk-gauges { border-top: 1px solid var(--uk-border); }
.uk-gauge { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; align-items: baseline; }
.uk-gauge > span:first-child { color: var(--uk-muted); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.uk-gauge > span:nth-child(2) { font-size: 12px; font-variant-numeric: tabular-nums; }
.uk-gauge > .uk-meter-track { grid-column: 1 / -1; }
.uk-tokens { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px var(--uk-board-pad, 16px); border-bottom: 1px solid var(--uk-border); }
.uk-token { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 4px 0 8px; border-radius: var(--uk-radius-sm); background: var(--uk-panel-2); font-size: 12px; }
.uk-token > button { all: unset; display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 3px; color: var(--uk-muted); cursor: pointer; }
.uk-token > button:hover { color: var(--uk-text); background: var(--uk-border); }
.uk-token > button:focus-visible { outline: 2px solid var(--uk-focus); }
.uk-panel > .uk-notice:last-child, .uk-panel > .uk-region:has(> .uk-notice:last-child) { margin-bottom: 12px; }
/* Names and values: two columns, the names' at most a third or so (a long name wraps; --uk-kv-names: as wide as told, so
   that lists one under another line up); narrow (its own width, not the page's: a side panel too), each name over its value. */
.uk-kv { container: uk-kv / inline-size; display: grid; grid-template-columns: var(--uk-kv-names, fit-content(35%)) minmax(0, 1fr); gap: 12px 24px; align-items: baseline; margin: 0; }
.uk-kv > dt { color: var(--uk-muted); overflow-wrap: break-word; }
.uk-kv > dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
@container uk-kv (max-width: 380px) {
  .uk-kv > dt, .uk-kv > dd { grid-column: 1 / -1; }
  .uk-kv > dt { margin-top: 8px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
  .uk-kv > dt:first-child { margin-top: 0; }
  .uk-kv > dd { margin-top: -6px; }
}
/* A plain list: one under another, no marks. */
.uk-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
/* Conditions, one under another, ruled between: its status, its type, when it changed (on the right); why under its type, quieter. */
.uk-code { margin: 0; padding: 10px 12px; background: var(--uk-bg); border: 1px solid var(--uk-border); border-radius: var(--uk-radius); font-family: var(--uk-mono); font-size: 12px; white-space: pre; overflow: auto; max-height: 60vh; }
/* A notice: a soft tint of its level's colour (none: grey), its icon and title in that colour, its words plain. */
.uk-notice { --uk-notice-c: var(--uk-muted); display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); background: var(--uk-panel); color: var(--uk-text); line-height: 1.45; }
.uk-notice[data-level] { border-color: color-mix(in srgb, var(--uk-notice-c) 30%, transparent); background: color-mix(in srgb, var(--uk-notice-c) 10%, var(--uk-panel)); }
.uk-notice[data-level='ok'] { --uk-notice-c: var(--uk-ok); }
.uk-notice[data-level='warn'] { --uk-notice-c: var(--uk-warn); }
.uk-notice[data-level='error'] { --uk-notice-c: var(--uk-error); }
.uk-notice:not([data-level]) .uk-notice-text { color: var(--uk-muted); }
.uk-notice-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 16px; height: 19px; color: var(--uk-notice-c); }
.uk-notice-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
.uk-notice-title { font-weight: 600; color: var(--uk-notice-c); }
.uk-notice:not([data-level]) .uk-notice-title { color: var(--uk-text); }
.uk-root[data-theme='light'] .uk-notice[data-level] .uk-notice-title, .uk-root[data-theme='light'] .uk-notice[data-level] .uk-notice-icon { color: color-mix(in srgb, var(--uk-notice-c), var(--uk-text) 35%); }
.uk-notice-action { flex: none; align-self: center; margin: -4px -4px -4px 0; }

/* A modal: a layer over all the page, dimmed behind it; its panel in the middle (high up), from an edge, or from the bottom — coming in from there, going back there. */
.uk-modal { position: fixed; inset: 0; color: var(--uk-text); background: var(--uk-overlay); animation: uk-fade-in .2s ease-out both; }
.uk-modal[data-state='closing'] { animation: uk-fade-out .18s ease-in forwards; pointer-events: none; }
.uk-modal:focus { outline: none; }
.uk-modal-frame { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding: 6vh 16px; box-sizing: border-box; overflow: hidden; }
.uk-modal-panel { position: relative; display: flex; animation: uk-modal-in .24s cubic-bezier(.2, .8, .2, 1) both; flex-direction: column; width: min(960px, 100%); max-height: 88vh; background: var(--uk-panel); border: 1px solid var(--uk-border); border-radius: var(--uk-radius-lg); box-shadow: 0 24px 60px color-mix(in srgb, var(--uk-shadow) 45%, transparent), 0 2px 8px color-mix(in srgb, var(--uk-shadow) 20%, transparent); overflow: hidden; }
.uk-modal-panel > header { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 18px; border-bottom: 1px solid var(--uk-border); }
.uk-modal-panel > header h2 { margin: 0; font-size: 15px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A view's tabs (TabBar): under its header, over what they show; the one shown underlined. */
.uk-tabbar { display: flex; flex: none; gap: 4px; padding: 0 10px; border-bottom: 1px solid var(--uk-border); overflow-x: auto; scrollbar-width: none; }
.uk-tabbar-tab { all: unset; position: relative; flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 10px 8px; color: var(--uk-muted); font-size: 13px; cursor: pointer; transition: color .15s; }
.uk-tabbar-tab:hover, .uk-tabbar-tab[aria-selected='true'] { color: var(--uk-text); }
.uk-tabbar-tab::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--uk-accent); scale: 0 1; transition: scale .2s cubic-bezier(.2, 0, 0, 1); }
.uk-tabbar-tab[aria-selected='true']::after { scale: 1 1; }
.uk-tabbar-tab:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -4px; border-radius: 6px; }
.uk-tabbar-tab .uk-icon { width: 14px; height: 14px; }
.uk-modal-panel > header:has(+ .uk-tabbar) { border-bottom: 0; padding-bottom: 6px; }
/* A title's quiet part (a resource's namespace). */
.uk-modal-panel > header h2 small { margin-left: 4px; color: var(--uk-muted); font-size: 13px; font-weight: 400; }
.uk-modal-body { container: uk-modal-body / inline-size; flex: 1; min-height: 0; padding: 16px 18px; overflow: auto; display: flex; flex-direction: column; gap: 18px; }
/* Its footer: what can be done, at its end, under a hairline; it stays while the body scrolls. */
.uk-modal-footer:empty { display: none; }
.uk-modal-footer { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--uk-border); background: color-mix(in srgb, var(--uk-panel), var(--uk-bg) 40%); }
/* From the left edge: all its height, its right corners rounded. */
.uk-modal[data-state='closing'] .uk-modal-panel { animation: uk-modal-out .18s ease-in forwards; }
.uk-modal-frame[data-placement='left'] { padding: 0; align-items: stretch; justify-content: flex-start; }
.uk-modal-frame[data-placement='left'] .uk-modal-panel { --uk-modal-from: translateX(-100%);  width: min(560px, 92vw); max-height: none; border-width: 0 1px 0 0; border-radius: 0 var(--uk-radius-lg) var(--uk-radius-lg) 0; }
/* From the right edge: the same, mirrored. */
.uk-modal-frame[data-placement='right'] { padding: 0; align-items: stretch; justify-content: flex-end; }
.uk-modal-frame[data-placement='right'] .uk-modal-panel { --uk-modal-from: translateX(100%);  width: min(560px, 92vw); max-height: none; border-width: 0 0 0 1px; border-radius: var(--uk-radius-lg) 0 0 var(--uk-radius-lg); }
/* From the bottom: a sheet, its top corners rounded, a grip over its header. */
.uk-modal-frame[data-placement='bottom'] { padding: 0; align-items: flex-end; justify-content: center; }
.uk-modal-frame[data-placement='bottom'] .uk-modal-panel { --uk-modal-from: translateY(100%);  width: min(1100px, 100%); max-height: 85vh; border-width: 1px 1px 0; border-radius: var(--uk-radius-lg) var(--uk-radius-lg) 0 0; }
.uk-modal-grip { align-self: center; width: 36px; height: 4px; margin-top: 8px; border-radius: 2px; background: var(--uk-border); }
.uk-modal-frame[data-placement='bottom'] .uk-modal-panel > header { padding-top: 6px; }
/* All the window: no edge, no corners. */
.uk-modal-frame[data-placement='full'] { padding: 0; align-items: stretch; justify-content: stretch; }
.uk-modal-frame[data-placement='full'] .uk-modal-panel { width: 100%; max-height: none; border: 0; border-radius: 0; --uk-modal-from: scale(.985); }
/* In: from its edge (the middle's: a little below, a little smaller); out: back there, faster. */
@keyframes uk-modal-in { from { transform: var(--uk-modal-from, translateY(10px) scale(.98)); opacity: var(--uk-modal-fade, 0); } }
@keyframes uk-modal-out { to { transform: var(--uk-modal-from, translateY(6px) scale(.985)); opacity: var(--uk-modal-fade, 0); } }
.uk-modal-frame:not([data-placement='center'], [data-placement='full']) .uk-modal-panel { --uk-modal-fade: 1; }
@keyframes uk-fade-out { to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .uk-modal, .uk-modal-panel, .uk-modal[data-state='closing'] .uk-modal-panel { animation: none; } }
/* While a modal layer is open: the page not scrolled (nor bounced). */
html.uk-locked { overflow: hidden; overscroll-behavior: none; }
/* The layers: at the page's origin, moving with it; a layer by something on the page placed in it (absolute), one over all of it fixed. */
.uk-layers { position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 900; }
.uk-layer:focus { outline: none; }
.uk-layers > .uk-popover, .uk-layers > .uk-menu { position: absolute; visibility: hidden; }
.uk-above { position: relative; z-index: 10000; }
/* A part of a view: a card of its own, its heading over it. */
.uk-section { padding: 14px 16px 16px; border: 1px solid var(--uk-border); border-radius: var(--uk-radius-lg); background: var(--uk-bg); }
/* A section of a list with nothing in it (its fills drew none): not drawn. */
.uk-section:has(> .uk-kv:empty) { display: none; }
.uk-section > h3 { margin: 0 0 12px; font-size: 13px; font-weight: 600; color: var(--uk-text); }
/* A container's image (Image): its registry and path quiet, cut short first; its name; its tag apart. */
.uk-image { display: inline-flex; align-items: baseline; min-width: 0; max-width: 100%; font-family: var(--uk-mono); font-size: 12px; white-space: nowrap; }
.uk-image-from { flex: 0 1000 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--uk-muted); }
.uk-image-name { flex: 0 1 auto; min-width: 2ch; margin-right: 8px; overflow: hidden; text-overflow: ellipsis; }
.uk-image > .uk-badge { flex: none; align-self: baseline; }
/* Words of a machine (an IP, a path, a port), and words said quietly beside others. */
.uk-mono { font-family: var(--uk-mono); font-size: 12px; }
.uk-quiet { color: var(--uk-muted); font-size: 12px; font-weight: 400; }
/* Words in a line (a name, what is said of it quiet, badges): on one baseline, wrapping — in a table's cell, not. */
.uk-line { display: inline-flex; align-items: baseline; gap: 6px 10px; flex-wrap: wrap; min-width: 0; }
.uk-table-row .uk-line { max-width: 100%; }
/* In a cell: never wider than it — its words cut short with dots (what is said quietly first, its name last), its badges whole. */
.uk-table-row .uk-line > :is(span, a, b) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-table-row .uk-line > :first-child { flex-shrink: .001; }
.uk-table-row .uk-line > .uk-quiet { flex-shrink: 1000; }
.uk-table-row .uk-line > .uk-badge { flex: none; }
.uk-line > .uk-badge { align-self: baseline; }
/* Some badges (ports), some refs (what a pod uses): side by side, wrapping. */
.uk-badges { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.uk-refs { display: flex; flex-wrap: wrap; gap: 4px 16px; }
/* A chain (a controller's controllers, to the root): the root first, a › between, those after it quiet. */
.uk-chain { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; min-width: 0; }
.uk-chain-next { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; opacity: .65; }
.uk-chain-sep { color: var(--uk-muted); }
/* How many of a kind (a link), a dot for each one's state, whose they are — on one line, the dots by its middle. */
.uk-owned { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0; }
.uk-dots { display: inline-flex; align-items: center; gap: 4px; }
.uk-dots > .uk-dot { width: 7px; height: 7px; box-shadow: 0 0 0 1px color-mix(in srgb, var(--uk-muted) 55%, transparent); }
/* A list in a line opened (an accordion's): short, unruled, lined up with its line's title. */
.uk-accordion-body .uk-kv { --uk-kv-names: 72px; }
.uk-section .uk-accordion-body .uk-kv > :is(dt, dd) { padding: 3px 0; border-top: 0; }
.uk-accordion-body .uk-kv > dt { font-size: 12px; }
/* A file (File): its head (its name, its size, its actions), its text under a line, edge to edge and to its foot; or what stands in for it. */
.uk-section.uk-file { padding: 0; overflow: hidden; }
.uk-file-head { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 6px 8px 6px 16px; }
.uk-file-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.uk-file-title > b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-file-title > .uk-quiet { flex: none; }
.uk-file-actions { margin-left: auto; display: flex; gap: 4px; }
.uk-file > .uk-code { border: 0; border-top: 1px solid var(--uk-border); border-radius: 0; padding: 12px 16px; max-height: 360px; overflow: auto; }
/* Cut short: its last lines shown fading out; the rest a click away, under it. */
.uk-file[data-cut] > .uk-code { overflow: hidden; mask-image: linear-gradient(to bottom, currentColor calc(100% - 48px), transparent); }
.uk-file-more { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 8px 16px; border-top: 1px solid var(--uk-border); color: var(--uk-muted); font-size: 12px; cursor: pointer; }
.uk-file-more:hover { color: var(--uk-text); background: var(--uk-panel-2); }
.uk-file-more:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
.uk-file-more .uk-icon { width: 14px; height: 14px; transition: rotate .18s cubic-bezier(.2, 0, 0, 1); }
.uk-file-more[aria-expanded='true'] .uk-icon { rotate: 180deg; }
.uk-file-instead { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--uk-border); color: var(--uk-muted); font-size: 12px; }
/* A grid of fields and a list after it (an autoscaler's metrics: meters, then values): apart. */
.uk-fields + .uk-kv { margin-top: 16px; }
/* A card (Card): its head — its mark, name, badges, what is said quiet, its end (counts, buttons) — then what is in it, each part apart. */
.uk-card-head { display: flex; align-items: baseline; gap: 10px; min-width: 0; margin-bottom: 14px; }
.uk-card-head > :is(.uk-status, .uk-icon) { align-self: center; }
.uk-card-head > b { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-card-head > .uk-badge { align-self: baseline; }
.uk-card-end { margin-left: auto; display: flex; align-items: baseline; gap: 10px; color: var(--uk-muted); font-size: 12px; white-space: nowrap; }
.uk-card-end > .uk-button { align-self: center; }
.uk-card > :not(.uk-card-head) + * { margin-top: 18px; }
/* A meter (Meter): a field, its bar filled as far (nearly all: a warning; more than all: an error), what that is in words under it. */
.uk-meter > dd { display: grid; gap: 4px; }
.uk-meter-track { display: block; height: 6px; border-radius: 3px; background: var(--uk-panel-2); overflow: hidden; }
.uk-meter-track > i { display: block; height: 100%; border-radius: 3px; background: var(--uk-ok); transition: width .3s cubic-bezier(.2, 0, 0, 1); }
.uk-meter-track[data-level='warn'] > i { background: var(--uk-warn); }
.uk-meter-track[data-level='error'] > i { background: var(--uk-error); }
.uk-meter-said { color: var(--uk-muted); font-size: 12px; font-weight: 400; }
/* A view's title's marks (an addon's badges), after its words. */
.uk-modal-panel > header h2 .uk-badge { margin-left: 8px; vertical-align: 1px; }
/* Rows (Rows, Row): ruled, a line each (its lead, its end quiet); what is under it after (quiet, smaller). Marked: its mark apart on its first line, what leads it and what is under it in one column beside it. */
.uk-rows { display: grid; }
.uk-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 4px 12px; padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--uk-border) 70%, transparent); }
.uk-row:first-child { padding-top: 0; border-top: 0; }
.uk-row:last-child { padding-bottom: 0; }
.uk-row[data-mark] { grid-template-columns: auto minmax(0, 1fr) auto; column-gap: 10px; }
/* Its mark on the edge for the eye: an icon's circle sits 2px inside its box (on a 24 grid), so its box 2px outside. */
.uk-row-mark { grid-row: 1; align-self: center; display: inline-flex; margin-left: -2px; }
.uk-row-lead { display: flex; align-items: baseline; gap: 12px; min-width: 0; flex-wrap: wrap; }
.uk-row-end { grid-column: -2; grid-row: 1; display: flex; align-items: baseline; gap: 8px; color: var(--uk-muted); font-size: 12px; white-space: nowrap; }
.uk-row-under { grid-column: 1 / -1; color: var(--uk-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.uk-row[data-mark] > .uk-row-under { grid-column: 2 / -1; }
/* More under it (a row's children): its width, under what is under it. */
.uk-row > :not(.uk-row-mark, .uk-row-lead, .uk-row-end, .uk-row-under) { grid-column: 1 / -1; margin-top: 8px; }
.uk-row[data-mark] > :not(.uk-row-mark, .uk-row-lead, .uk-row-end, .uk-row-under) { grid-column: 2 / -1; }
:is(.uk-row-lead, .uk-row-end) > :is(.uk-icon, .uk-button, .uk-ratio, .uk-switch) { align-self: center; }
/* Nothing in a part of a view: its icon quiet, what that means beside it. */
.uk-nothing { display: flex; align-items: baseline; gap: 8px; color: var(--uk-muted); font-size: 13px; }
.uk-nothing > .uk-icon { align-self: center; flex: none; width: 16px; height: 16px; }
/* Another thing (Ref): its icon, its sort quiet, its name — cut short, never wider than where it is. */
.uk-ref { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; max-width: 100%; white-space: nowrap; }
.uk-ref > .uk-icon { align-self: center; flex: none; width: 14px; height: 14px; color: var(--uk-muted); }
.uk-ref > small { flex: none; color: var(--uk-muted); font-size: 12px; }
.uk-ref > :is(a, span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.uk-ref > a { color: var(--uk-accent); text-decoration: none; }
.uk-ref > a:hover { text-decoration: underline; }
/* Accordion: lines, ruled; a mark apart (what is under it lined up with its title); the whole line opens it (but what is at its end), its chevron turned once open; what is more slid open under its title. */
.uk-accordion { display: grid; }
.uk-accordion-item { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: 10px; padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--uk-border) 70%, transparent); }
.uk-accordion-item:first-child { padding-top: 0; border-top: 0; }
.uk-accordion-item:last-child { padding-bottom: 0; }
.uk-accordion-item:has(> .uk-accordion-mark) { grid-template-columns: auto minmax(0, 1fr); }
.uk-accordion-mark { grid-row: 1; align-self: center; display: inline-flex; margin-left: -2px; }
.uk-accordion-mark > :is(.uk-tip-at, .uk-status) { display: flex; align-items: center; }
.uk-accordion-line { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: baseline; column-gap: 12px; }
.uk-accordion-head { all: unset; display: flex; align-items: baseline; gap: 10px; min-width: 0; overflow: hidden; white-space: nowrap; cursor: pointer; }
.uk-accordion-head > * { min-width: 0; overflow: clip; text-overflow: ellipsis; }
.uk-accordion-head > :first-child { flex: none; font-weight: 600; }
.uk-accordion-head > :not(:first-child) { color: var(--uk-muted); font-size: 12px; }
.uk-accordion-head::after { content: ''; position: absolute; inset: -6px -4px; border-radius: 6px; }
.uk-accordion-head:focus-visible { outline: none; }
.uk-accordion-head:focus-visible::after { outline: 2px solid var(--uk-focus); }
.uk-accordion-end { position: relative; z-index: 1; display: flex; align-items: baseline; gap: 8px; color: var(--uk-muted); font-size: 12px; white-space: nowrap; }
.uk-accordion-end > :is(.uk-button, .uk-icon) { align-self: center; }
.uk-accordion-line:has(> .uk-accordion-end > .uk-switch) { align-items: center; }
.uk-accordion-chevron { align-self: center; display: inline-flex; color: var(--uk-muted); pointer-events: none; transition: rotate .18s cubic-bezier(.2, 0, 0, 1); }
.uk-accordion-item[data-open] .uk-accordion-chevron { rotate: 180deg; }
.uk-accordion-body { grid-column: -2; display: grid; grid-template-rows: 0fr; transition: grid-template-rows .2s cubic-bezier(.2, 0, 0, 1); }
.uk-accordion-item[data-open] > .uk-accordion-body { grid-template-rows: 1fr; }
.uk-accordion-body > div { min-height: 0; overflow: hidden; }
.uk-accordion-body > div > :first-child { margin-top: 8px; }
@media (prefers-reduced-motion: reduce) { .uk-accordion-body, .uk-accordion-chevron { transition: none; } }
/* In a section, a list of names and values ruled between its rows. */
.uk-section .uk-kv { gap: 0; }
.uk-section .uk-kv > :is(dt, dd) { padding: 9px 0; border-top: 1px solid color-mix(in srgb, var(--uk-border) 70%, transparent); }
.uk-section .uk-kv > dt { padding-right: 24px; }
.uk-section .uk-kv > :is(dt, dd):nth-child(-n + 2) { padding-top: 0; border-top: 0; }
/* Narrow (each name over its value): a rule between rows only, not between a name and its value. */
@container uk-kv (max-width: 380px) {
  .uk-section .uk-kv > dt { padding-right: 0; }
  .uk-section .uk-kv > dd { padding-top: 0; border-top: 0; margin-top: 0; }
  .uk-section .uk-kv > dt:first-child { padding-top: 0; }
}
/* A resource's view: its parts apart, its lists of names and values one under another lined up (a section of another's too) —
   their names no wider than they need be. Wide (its own width: a window, all the window): its summary across the top, its
   metadata beside the rest (its modal's body as wide as that; each part in its row; rows with nothing in them nothing high, so no gaps between rows: margins). */
.uk-details { gap: 16px; --uk-kv-names: min(30%, 180px); }
@container uk-modal-body (min-width: 1000px) {
  .uk-region.uk-details { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 400px); grid-template-rows: repeat(12, auto); align-items: start; gap: 0 16px; }
  .uk-details > * { grid-column: 1; margin-bottom: 16px; }
  .uk-details > :is([data-part='summary'], .uk-notice) { grid-column: 1 / -1; }
  .uk-details > [data-part='metadata'] { grid-column: 2; grid-row: 2 / -1; }
}
/* Fields at a glance: a grid of them, each its name (small, quiet) over its value. */
.uk-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 16px 20px; margin: 0; }
.uk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.uk-field > dt { color: var(--uk-muted); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
.uk-field > dd { margin: 0; font-weight: 500; overflow-wrap: anywhere; }
/* A state among fields: its words wrap (a long one, NotReady,SchedulingDisabled), not cut short. */
.uk-field > dd .uk-status { white-space: normal; }
.uk-field > dd .uk-status-text { overflow: visible; }

/* Things dragged into another order (useSortable): the one held lifted (a little larger, leaning as it moves, following the pointer a moment behind), the others moving aside on springs; dropped, it settles where it lands. */
[data-sorting] { user-select: none; cursor: grabbing; --uk-sort-ease: linear(0, 0.104, 0.314, 0.533, 0.715, 0.847, 0.934, 0.984, 1.009, 1.019, 1.02, 1.016, 1.012, 1.008, 1.004, 1.002, 1.001, 1); --uk-sort-follow: 70ms; --uk-lift: 1.03; }
[data-sort-drop] { --uk-lift: 1; }
[data-sorting] [data-sort-id] { transition: translate var(--uk-sort-ms, 200ms) var(--uk-sort-ease); }
[data-sorting='x'] [data-sort-id] { translate: var(--uk-sort-shift) 0; }
[data-sorting='y'] [data-sort-id] { translate: 0 var(--uk-sort-shift); }
[data-sorting] [data-sort-active] { position: relative; z-index: 3; scale: var(--uk-lift); rotate: var(--uk-sort-tilt, 0deg); transition: translate var(--uk-sort-follow) linear, scale .18s ease-out, rotate .2s ease-out, box-shadow .2s ease-out; }
[data-sort-drop] [data-sort-active] { transition: translate var(--uk-sort-ms) var(--uk-sort-ease), scale var(--uk-sort-ms) ease-out, rotate .2s ease-out, box-shadow var(--uk-sort-ms) ease-out; }
@media (prefers-reduced-motion: reduce) { [data-sorting], .uk-table[data-sorting] { --uk-sort-follow: 0s; --uk-lift: 1; } }
.uk-table { border: 1px solid var(--uk-border); border-radius: var(--uk-radius); overflow: hidden; background: var(--uk-panel); }
.uk-table[data-resizing] { cursor: col-resize; user-select: none; }
.uk-table-body { overflow: auto; position: relative; }
.uk-table-head, .uk-table-row { display: grid; align-items: center; column-gap: 24px; padding: 0 16px; }
.uk-table-head { position: sticky; top: 0; z-index: 1; height: 32px; background: var(--uk-panel); border-bottom: 1px solid var(--uk-border); color: var(--uk-muted); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; user-select: none; }
.uk-table-th { position: relative; height: 100%; display: flex; align-items: center; min-width: 0; }
.uk-table-th > button { all: unset; display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; cursor: pointer; }
.uk-table-th > button:disabled { cursor: default; }
.uk-table-th > button:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: 2px; border-radius: 2px; }
.uk-table-th > button[data-sorted] { color: var(--uk-text); }
.uk-table-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A column dragged: lifted on a card (leaning as it moves), its cap over the head, a slot where it lands; the rest moving aside on springs. */
.uk-table[data-sorting] { --uk-lift: 1.02; }
.uk-table[data-sort-drop] { --uk-lift: 1; }
.uk-table-inner { position: relative; }
.uk-table-card, .uk-table-card-cap { position: absolute; pointer-events: none; background: var(--uk-panel); translate: var(--uk-drag-x) 0; scale: var(--uk-lift, 1); rotate: var(--uk-sort-tilt, 0deg); transition: translate var(--uk-sort-follow) linear, scale .18s ease-out, rotate .2s ease-out, box-shadow .2s ease-out; }
.uk-table[data-sort-drop] .uk-table-card, .uk-table[data-sort-drop] .uk-table-card-cap { transition: translate var(--uk-sort-ms) var(--uk-sort-ease), scale var(--uk-sort-ms) ease-out, rotate .2s ease-out, box-shadow var(--uk-sort-ms) ease-out; }
.uk-table .uk-table-row > [data-sort-active] { background: none; }
.uk-table .uk-table-th[data-sort-active] > button > * { opacity: 0; }
.uk-table .uk-table-th > button { transition: translate .1s ease-out, color .1s; }
.uk-table .uk-table-th > button[data-sort-pressing] { translate: 0 -1px; color: var(--uk-text); cursor: grabbing; }
.uk-table-card { z-index: 2; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); box-shadow: 0 18px 40px color-mix(in srgb, var(--uk-shadow) 40%, transparent), 0 2px 6px color-mix(in srgb, var(--uk-shadow) 20%, transparent); animation: uk-card-lift .18s ease-out; }
.uk-table[data-sort-drop] .uk-table-card { box-shadow: 0 0 0 transparent, 0 0 0 transparent; }
.uk-table-card-cap { z-index: 4; display: flex; align-items: center; padding: 0 10px; box-sizing: border-box; border: 1px solid var(--uk-border); border-radius: var(--uk-radius) var(--uk-radius) 0 0; color: var(--uk-text); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.uk-table-slot { position: absolute; z-index: 0; pointer-events: none; border-radius: var(--uk-radius-sm); background: color-mix(in srgb, var(--uk-bg) 70%, var(--uk-panel)); box-shadow: inset 0 1px 3px color-mix(in srgb, var(--uk-shadow) 35%, transparent); translate: var(--uk-sort-land, 0px) 0; transition: translate var(--uk-sort-ms) var(--uk-sort-ease); animation: uk-fade-in .15s ease-out; }
@keyframes uk-card-lift { from { scale: 1; box-shadow: 0 0 0 transparent, 0 0 0 transparent; } }
@media (prefers-reduced-motion: reduce) { .uk-table-card, .uk-table-slot { animation: none; } }
.uk-table-sort { display: inline-flex; color: var(--uk-accent); }
.uk-table-sort .uk-icon { width: 12px; height: 12px; stroke-width: 2.5; }
.uk-table-sort[data-dir='asc'] .uk-icon { transform: rotate(180deg); }
.uk-table-resize { position: absolute; top: 0; bottom: 0; right: -20px; width: 16px; z-index: 2; cursor: col-resize; touch-action: none; outline: none; }
.uk-table-resize::after { content: ''; position: absolute; left: 7.5px; top: 8px; bottom: 8px; width: 1px; background: var(--uk-border); transition: background .12s, top .12s, bottom .12s; }
.uk-table-resize:hover::after, .uk-table-resize:focus-visible::after, .uk-table-th[data-resizing] .uk-table-resize::after { top: 4px; bottom: 4px; width: 2px; left: 7px; background: var(--uk-accent); }
.uk-table-row { min-height: var(--uk-row); border-bottom: 1px solid var(--uk-border); cursor: default; }
.uk-table-row[data-clickable] { cursor: pointer; }
/* Plain (in a section, a card): no frame, no ground; its head and rows from its edges, the last row unruled — what holds it frames it. */
.uk-table[data-plain] { border: 0; border-radius: 0; background: transparent; }
.uk-table[data-plain] :is(.uk-table-head, .uk-table-row) { padding: 0; }
.uk-table[data-plain] .uk-table-head { background: transparent; }
.uk-table[data-plain] .uk-table-row:hover { background: transparent; }
.uk-table[data-plain] .uk-table-row:last-child { border-bottom: 0; }
.uk-table-row:hover, .uk-table-row[aria-selected='true'] { background: var(--uk-panel-2); }
.uk-table-row[data-clickable]:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
.uk-table-row > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.uk-table-row > :not([data-wrap]) wbr { display: none; }
/* A cell is one line (unless it wraps): nothing in it laid out onto another (chips, a line's parts), cut at its edge as its text is. */
.uk-table-row > :not([data-wrap]) * { flex-wrap: nowrap; }
.uk-table-row > :not([data-wrap]) .uk-chips > * { flex: none; }
/* A cell cut short, under the pointer a while: slid along to its end, its edges fading where more is hidden (lib/slide). */
@property --uk-fade-l { syntax: '<length>'; inherits: false; initial-value: 0px; }
@property --uk-fade-r { syntax: '<length>'; inherits: false; initial-value: 10px; }
.uk-table-row > [data-slide] { text-overflow: clip; mask-image: linear-gradient(to right, transparent, currentColor var(--uk-fade-l), currentColor calc(100% - var(--uk-fade-r)), transparent); transition: --uk-fade-l 60ms linear, --uk-fade-r 60ms linear; }
.uk-table-row > :is([data-slide='go'], [data-slide='back']) { --uk-fade-l: 10px; }
.uk-table-row > [data-slide='end'] { --uk-fade-l: 10px; --uk-fade-r: 0px; }
.uk-table-row > [data-slide] > .uk-cell-in { display: inline-block; width: max-content; will-change: transform; }
.uk-table-row > [data-wrap] { white-space: normal; overflow-wrap: anywhere; padding: 8px 0; }
.uk-table-empty { padding: 16px; color: var(--uk-muted); }
.uk-table-empty:has(> .uk-empty) { padding: 0; }
/* What the data changed: a row new to the list fades in; a row gone fades and folds, the rows under it rising. */
.uk-table-row[data-enter] { animation: uk-row-enter .22s cubic-bezier(.2, 0, 0, 1) both; }
.uk-table-row[data-leaving] { overflow: hidden; pointer-events: none; animation: uk-row-leave .22s ease-in forwards; }
@keyframes uk-row-enter { from { opacity: 0; } }
@keyframes uk-row-leave { from { height: var(--uk-row-h); min-height: 0; } to { height: 0; min-height: 0; opacity: 0; border-bottom-width: 0; } }
@media (prefers-reduced-motion: reduce) { .uk-table-row[data-enter], .uk-table-row[data-leaving] { animation: none; } }

.uk-catalog { display: flex; flex-direction: column; min-width: 0; }
.uk-catalog-top { display: flex; align-items: center; gap: 12px; padding: 0 14px 0 16px; height: 48px; flex: none; border-bottom: 1px solid var(--uk-border); }
.uk-catalog-search { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; color: var(--uk-muted); }
.uk-catalog-search:focus-within { color: var(--uk-text); }
.uk-catalog-search input { all: unset; flex: 1; min-width: 0; color: var(--uk-text); font: inherit; font-size: 14px; }
.uk-catalog-search input::placeholder { color: var(--uk-muted); }
/* Two panes: the sections down the side, the chosen one's rows beside them — as tall as the rows need, up to its own height. */
.uk-catalog-body { display: flex; min-height: 0; height: min(400px, 60vh); }
.uk-catalog-side { position: relative; flex: none; width: 220px; padding: 6px; border-right: 1px solid var(--uk-border); overflow: auto; display: flex; flex-direction: column; }
.uk-catalog-mark { position: absolute; top: 0; left: 6px; right: 6px; border-radius: 8px; background: var(--uk-panel-2); transition: transform .22s cubic-bezier(.3, .9, .3, 1), height .22s; }
.uk-catalog-section { all: unset; position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; flex: none; height: 34px; padding: 0 12px; border-radius: 8px; cursor: pointer; color: var(--uk-text); }
.uk-catalog-section:not([aria-current='true']):hover { background: color-mix(in srgb, var(--uk-panel-2) 55%, transparent); }
.uk-catalog-section:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
.uk-catalog-section .uk-icon, .uk-catalog-name .uk-icon { color: var(--uk-muted); transition: color .2s; }
.uk-catalog-section[aria-current='true'] .uk-icon { color: var(--uk-accent); }
.uk-catalog-section[data-empty] { color: var(--uk-muted); }
.uk-catalog-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-catalog-count { min-width: 24px; text-align: right; color: var(--uk-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.uk-catalog-pane { flex: 1; min-width: 0; overflow: auto; padding: 6px 0; animation: uk-catalog-fade .18s ease-out both; }
.uk-catalog-heading { padding: 12px 18px 4px; color: var(--uk-muted); font-size: 11px; font-weight: 600; letter-spacing: .04em; }
.uk-catalog-row { display: flex; align-items: center; gap: 6px; height: 34px; margin: 0 6px; padding: 0 6px 0 0; border-radius: 8px; transition: background .12s; animation: uk-catalog-row .24s cubic-bezier(.2, .8, .2, 1) both; animation-delay: calc(var(--uk-catalog-i, 0) * 14ms); }
.uk-catalog-row:hover, .uk-catalog-row:focus-within { background: var(--uk-panel-2); }
.uk-catalog-name { flex: 1; min-width: 0; align-self: stretch; display: flex; align-items: center; gap: 10px; padding-left: 12px; color: var(--uk-text); text-decoration: none; cursor: pointer; outline: none; }
.uk-catalog-row[data-muted] .uk-catalog-name { color: var(--uk-muted); }
.uk-catalog-row:has(.uk-catalog-name:focus-visible) { box-shadow: inset 0 0 0 2px var(--uk-focus); }
/* Its pin: under the pointer, kept while on (the accent's); a click on it as a click is felt. */
.uk-catalog-pin { all: unset; display: grid; place-items: center; width: 24px; height: 24px; flex: none; border-radius: 6px; color: var(--uk-muted); cursor: pointer; opacity: 0; transition: opacity .12s, background .12s, color .12s; }
.uk-catalog-row:hover .uk-catalog-pin, .uk-catalog-pin:focus-visible, .uk-catalog-pin[aria-pressed='true'] { opacity: 1; }
.uk-catalog-pin[aria-pressed='true'] { color: var(--uk-accent); }
.uk-catalog-pin:hover { background: var(--uk-panel); color: var(--uk-text); }
.uk-catalog-pin:focus-visible { outline: 2px solid var(--uk-focus); }
.uk-catalog-pin .uk-icon { transition: scale .1s; }
.uk-catalog-pin:active .uk-icon { scale: .8; }
.uk-catalog-pin[aria-pressed='true'] .uk-icon { animation: uk-catalog-pop .3s cubic-bezier(.3, 1.6, .5, 1); }
.uk-catalog-pane > .uk-empty { height: 100%; }
.uk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 24px 32px; text-align: center; color: var(--uk-muted); font-size: 12px; line-height: 1.5; animation: uk-catalog-fade .25s ease-out both; }
.uk-empty b { color: var(--uk-text); font-size: 14px; font-weight: 600; }
.uk-empty > span:not(.uk-empty-icon) { max-width: 300px; }
.uk-empty .uk-button { margin-top: 8px; }
.uk-empty-icon { display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: 6px; border-radius: 50%; background: var(--uk-panel-2); border: 1px solid var(--uk-border); animation: uk-empty-float .4s cubic-bezier(.2, .8, .2, 1) .05s both; }
.uk-empty-icon .uk-icon { width: 20px; height: 20px; }
@keyframes uk-catalog-fade { from { opacity: 0; } }
@keyframes uk-catalog-row { from { opacity: 0; transform: translateY(4px); } }
@keyframes uk-catalog-pop { 0% { scale: .6; } 60% { scale: 1.2; } }
@keyframes uk-empty-float { from { opacity: 0; transform: translateY(6px) scale(.9); } }
@media (prefers-reduced-motion: reduce) {
  .uk-catalog-pane, .uk-catalog-row, .uk-empty, .uk-empty-icon, .uk-catalog-pin[aria-pressed='true'] .uk-icon { animation: none; }
  .uk-catalog-mark { transition: none; }
}
/* Spotlight: a panel floating high in the middle, frosted; the page dimmed a little behind it. */
.uk-spot { position: fixed; inset: 0; padding: 18vh 16px 16px; color: var(--uk-text); overflow: auto; box-sizing: border-box; }
/* Its backdrop: the page dimmed behind it (under its panel), fading in and out. */
.uk-spot::before { content: ''; position: fixed; inset: 0; z-index: -1; background: color-mix(in srgb, var(--uk-overlay) 56%, transparent); animation: uk-fade-in .22s ease-out; pointer-events: none; }
.uk-spot[data-state='closing']::before { animation: uk-spot-fade-out .14s ease-in forwards; }
.uk-spot-panel { width: min(680px, 100%); margin: 0 auto; display: flex; flex-direction: column; border-radius: var(--uk-radius-lg); overflow: hidden; background: color-mix(in srgb, var(--uk-panel) 84%, transparent); -webkit-backdrop-filter: blur(28px) saturate(1.6); backdrop-filter: blur(28px) saturate(1.6); border: 1px solid color-mix(in srgb, var(--uk-border) 80%, transparent); box-shadow: 0 28px 70px color-mix(in srgb, var(--uk-shadow) 45%, transparent), 0 2px 8px color-mix(in srgb, var(--uk-shadow) 20%, transparent), inset 0 1px 0 color-mix(in srgb, var(--uk-text) 5%, transparent); transform-origin: 50% 0; animation: uk-spot-in .42s cubic-bezier(.34, 1.36, .64, 1); }
.uk-spot[data-state='closing'] .uk-spot-panel { animation: uk-spot-out .14s ease-in forwards; }
.uk-spot [data-enter] { animation: uk-spot-row .3s cubic-bezier(.2, 0, 0, 1) both; animation-delay: calc(var(--uk-spot-i, 0) * 18ms); }
.uk-spot[data-phase='opening'] [data-enter] { animation-delay: calc(60ms + var(--uk-spot-i, 0) * 22ms); }
.uk-spot-field { position: relative; display: flex; align-items: center; gap: 12px; height: 58px; padding: 0 20px; color: var(--uk-muted); }
.uk-spot-field .uk-icon { width: 20px; height: 20px; flex: none; }
.uk-spot-field input { all: unset; flex: 1; min-width: 0; font: inherit; font-size: 20px; font-weight: 300; letter-spacing: -.01em; color: var(--uk-text); }
.uk-spot-field input::placeholder { color: var(--uk-muted); opacity: .8; }
.uk-spot-field[data-busy]::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: linear-gradient(90deg, transparent, var(--uk-accent), transparent); background-size: 40% 100%; background-repeat: no-repeat; animation: uk-spot-busy 1.1s linear infinite; }
.uk-spot-results { position: relative; max-height: 48vh; overflow: auto; padding: 6px 8px 8px; border-top: 1px solid color-mix(in srgb, var(--uk-border) 70%, transparent); }
.uk-spot-results[data-empty]:not(:has(.uk-spot-empty)) { display: none; }
.uk-spot-group { padding: 10px 12px 4px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--uk-muted); }
.uk-spot-item { display: flex; align-items: center; gap: 12px; height: 42px; padding: 0 10px; border-radius: 9px; cursor: default; color: var(--uk-text); }
.uk-spot-item[aria-selected='true'] { background: color-mix(in srgb, var(--uk-accent) 24%, transparent); }
.uk-spot-icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex: none; border-radius: var(--uk-radius); background: var(--uk-panel-2); color: var(--uk-muted); }
.uk-spot-item[aria-selected='true'] .uk-spot-icon { background: var(--uk-accent); color: var(--uk-on-accent); }
.uk-spot-icon .uk-icon { width: 15px; height: 15px; }
.uk-spot-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.uk-spot-subtitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--uk-muted); font-size: 12px; }
.uk-spot-enter { display: inline-flex; margin-left: auto; color: var(--uk-muted); opacity: 0; }
.uk-spot-enter .uk-icon { width: 14px; height: 14px; }
.uk-spot-item[aria-selected='true'] .uk-spot-enter { opacity: 1; }
.uk-spot-empty { padding: 18px 12px; color: var(--uk-muted); text-align: center; }
.uk-spot-footer { display: flex; align-items: center; gap: 14px; padding: 8px 16px; border-top: 1px solid color-mix(in srgb, var(--uk-border) 70%, transparent); color: var(--uk-muted); font-size: 11px; }
@keyframes uk-spot-in { 0% { opacity: 0; transform: translateY(-14px) scale(.94); filter: blur(6px); } 45% { opacity: 1; filter: blur(0); } }
@keyframes uk-spot-out { to { opacity: 0; transform: translateY(-6px) scale(.97); filter: blur(2px); } }
@keyframes uk-spot-fade-out { to { opacity: 0; } }
@keyframes uk-spot-row { from { opacity: 0; transform: translateY(6px); } }
@keyframes uk-spot-busy { from { background-position: -40% 0; } to { background-position: 140% 0; } }
@media (prefers-reduced-motion: reduce) { .uk-spot-panel, .uk-spot [data-enter], .uk-spot::before, .uk-spot[data-state] .uk-spot-panel { animation: none; } .uk-spot-field[data-busy]::after { animation: none; } }
.uk-select { position: relative; display: inline-block; }
.uk-select-trigger { min-width: 180px; max-width: 300px; height: var(--uk-row); padding: 0 10px 0 14px; gap: 12px; }
.uk-select-value { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-select-value[data-empty] { color: var(--uk-muted); }
.uk-select-trigger > .uk-icon:last-child { color: var(--uk-muted); transition: transform .15s; }
.uk-select-trigger[aria-expanded='true'] { border-color: var(--uk-muted); }
.uk-select-trigger[aria-expanded='true'] > .uk-icon:last-child { transform: rotate(180deg); }
.uk-select-popup { max-width: 360px; padding: 0; overflow: hidden; }

/* A query: its text an input's, over a copy of it coloured (both one font, one padding: the copy scrolls as the input does). */
.uk-query { display: flex; align-items: center; gap: 4px; height: 32px; padding: 0 4px 0 10px; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); background: var(--uk-bg); transition: border-color .12s; }
.uk-query:focus-within { border-color: color-mix(in srgb, var(--uk-accent) 70%, var(--uk-border)); }
.uk-query > .uk-icon { width: 15px; height: 15px; color: var(--uk-muted); }
.uk-query-line { position: relative; flex: 1; min-width: 0; height: 100%; overflow: hidden; }
.uk-query-copy, .uk-query-input { padding: 0 4px; font: inherit; font-size: 13px; letter-spacing: normal; white-space: pre; line-height: 30px; }
.uk-query[data-code] .uk-query-copy, .uk-query[data-code] .uk-query-input { font-family: var(--uk-mono); font-size: 12px; }
.uk-query-copy { position: absolute; inset: 0 auto 0 0; color: var(--uk-text); pointer-events: none; }
.uk-query-input { position: relative; width: 100%; height: 100%; border: 0; outline: 0; background: transparent; color: transparent; caret-color: var(--uk-text); }
.uk-query-input::placeholder { color: var(--uk-muted); }
.uk-query-input::selection { background: color-mix(in srgb, var(--uk-accent) 35%, transparent); color: transparent; }
.uk-query-at { display: inline-block; width: 0; height: 30px; vertical-align: top; }
/* One colour: what joins and compares dim; what is wrong, a straight line under it (no frame of the whole: the card under it says what). */
.uk-query-copy [data-kind='op'], .uk-query-copy [data-kind='keyword'], .uk-query-copy [data-kind='punct'] { color: var(--uk-muted); }
.uk-query-copy [data-current] { border-radius: 3px; background: color-mix(in srgb, var(--uk-text) 8%, transparent); }
.uk-query-copy [data-problem] { text-decoration: underline solid var(--uk-error) 2px; text-decoration-skip-ink: none; text-underline-offset: 5px; }
.uk-query-copy [data-problem='warn'] { text-decoration-color: var(--uk-warn); }
.uk-query-tool { display: inline-grid; place-items: center; width: 24px; height: 24px; flex: none; padding: 0; border: 0; border-radius: var(--uk-radius-sm); background: none; color: var(--uk-muted); cursor: pointer; }
.uk-query-tool:hover { background: var(--uk-panel-2); color: var(--uk-text); }
.uk-query-tool .uk-icon { width: 14px; height: 14px; }

/* Under the part being typed: what is wrong with it, what may go there — small, as wide as what it says. */
.uk-layers > .uk-query-card { position: absolute; visibility: hidden; }
.uk-query-card { display: flex; flex-direction: column; width: max-content; min-width: 180px; max-width: 360px; max-height: min(260px, var(--uk-placed-room, 260px)); background: var(--uk-panel); border: 1px solid var(--uk-border); border-radius: var(--uk-radius); box-shadow: 0 8px 24px color-mix(in srgb, var(--uk-shadow) 40%, transparent); overflow: hidden; font-size: 12px; animation: uk-pop-in .12s cubic-bezier(.2, .8, .2, 1); transform-origin: top left; }
.uk-query-card[data-side='top'] { transform-origin: bottom left; }
.uk-query-note { display: flex; align-items: flex-start; gap: 6px; padding: 6px 10px; color: var(--uk-error); line-height: 1.35; }
.uk-query-note[data-tone='warn'] { color: var(--uk-warn); }
.uk-query-note .uk-icon { width: 14px; height: 14px; margin-top: 1px; }
.uk-query-note + .uk-query-list { border-top: 1px solid var(--uk-border); }
.uk-query-list { overflow: auto; padding: 3px; }
.uk-query-option { display: flex; align-items: baseline; gap: 12px; padding: 4px 8px; border-radius: var(--uk-radius-sm); cursor: pointer; white-space: nowrap; }
.uk-query-option:hover { background: var(--uk-panel-2); }
/* The one Tab takes: plainly so (the accent's tint). */
.uk-query-option[aria-selected='true'] { background: color-mix(in srgb, var(--uk-accent) 16%, transparent); }
.uk-query-option[aria-selected='true'] .uk-query-option-title { color: var(--uk-text); }
.uk-query-option-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-family: var(--uk-mono); }
.uk-query-option-hint { color: var(--uk-muted); font-variant-numeric: tabular-nums; }
.uk-select-list { position: relative; max-height: 320px; overflow: auto; display: flex; flex-direction: column; gap: 2px; padding: 6px; outline: none; }
.uk-select-option { display: flex; align-items: center; gap: 12px; min-height: var(--uk-row); padding: 0 10px 0 12px; border-radius: var(--uk-radius-sm); cursor: pointer; color: var(--uk-text); }
.uk-select-option[data-active] { background: var(--uk-panel-2); }
.uk-select-list:focus-visible .uk-select-option[data-active] { box-shadow: inset 0 0 0 1px var(--uk-focus); }
.uk-select-option[aria-selected='true'] { font-weight: 600; }
.uk-select-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-select-hint { color: var(--uk-muted); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
.uk-select-mark { width: 16px; flex: none; display: inline-flex; justify-content: center; color: var(--uk-accent); }
.uk-select-mark .uk-icon { width: 15px; height: 15px; stroke-width: 2.5; }
.uk-ms { position: relative; }
.uk-ms-trigger { min-width: 180px; max-width: 280px; }
.uk-ms-summary { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-ms-popup { width: 280px; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.uk-ms-search { display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 38px; border-bottom: 1px solid var(--uk-border); color: var(--uk-muted); }
.uk-ms-search input { all: unset; flex: 1; min-width: 0; color: var(--uk-text); font: inherit; }
.uk-ms-search input::placeholder { color: var(--uk-muted); }
.uk-ms-search:focus-within { color: var(--uk-text); }
.uk-ms-all { all: unset; box-sizing: border-box; margin: 6px 6px 0; border-bottom: 1px solid var(--uk-border); border-radius: var(--uk-radius-sm) var(--uk-radius-sm) 0 0; padding-bottom: 8px !important; }
.uk-ms-list { max-height: 300px; overflow: auto; display: flex; flex-direction: column; padding: 6px; }
.uk-ms-option { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 8px; border-radius: var(--uk-radius-sm); cursor: pointer; color: var(--uk-text); }
.uk-ms-option[data-active], .uk-ms-all:hover { background: var(--uk-panel-2); }
.uk-ms-all:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
/* One typed, to be added: the options' last row, in the accent. */
.uk-ms-add { color: var(--uk-accent); }
.uk-ms-add .uk-check { border-color: transparent; }
.uk-ms-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-ms-hint { color: var(--uk-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.uk-ms-empty { padding: 10px 8px; color: var(--uk-muted); }
.uk-ms-note { padding: 8px 10px; color: var(--uk-muted); font-size: 12px; border-bottom: 1px solid var(--uk-border); max-width: 280px; }
.uk-ms-foot { display: flex; justify-content: flex-end; padding: 8px 12px; border-top: 1px solid var(--uk-border); color: var(--uk-muted); font-size: 12px; }
.uk-check { width: 16px; height: 16px; flex: none; border: 1.5px solid var(--uk-muted); border-radius: var(--uk-radius-sm); display: inline-flex; align-items: center; justify-content: center; color: var(--uk-on-accent); transition: background .12s, border-color .12s; }
.uk-check .uk-icon { width: 12px; height: 12px; stroke-width: 3; }
.uk-ms-option[aria-selected='true'] .uk-check, .uk-ms-all[aria-pressed='true'] .uk-check { background: var(--uk-accent); border-color: var(--uk-accent); }
.uk-checklist-pop { width: 320px; max-height: min(560px, var(--uk-placed-room, calc(100vh - 48px))); padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.uk-checklist { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.uk-checklist > .uk-ms-search, .uk-checklist-foot { flex: none; }
.uk-checklist-body { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 4px 6px 6px; }
.uk-checklist-group { all: unset; display: block; }
.uk-checklist-group + .uk-checklist-group { border-top: 1px solid var(--uk-border); margin-top: 4px; padding-top: 4px; }
.uk-checklist-row { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; height: 30px; padding: 0 8px; border-radius: var(--uk-radius-sm); cursor: pointer; color: var(--uk-text); }
.uk-checklist-row:hover:not(:disabled, [aria-disabled='true']) { background: var(--uk-panel-2); }
.uk-checklist-row:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
.uk-checklist-row:is(:disabled, [aria-disabled='true']) { cursor: default; color: var(--uk-muted); }
.uk-checklist-row[aria-pressed='true'] .uk-check, .uk-checklist-row[aria-pressed='mixed'] .uk-check { background: var(--uk-accent); border-color: var(--uk-accent); }
.uk-checklist-row:is(:disabled, [aria-disabled='true']) .uk-check { opacity: .5; }
.uk-checklist-head { font-weight: 600; }
.uk-checklist-item { padding-left: 34px; }
.uk-checklist-label { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-checklist-note { font-weight: 400; }
.uk-checklist-note, .uk-checklist-count { color: var(--uk-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.uk-checklist-count { margin-left: auto; }
.uk-check-mixed { width: 8px; height: 2px; border-radius: 1px; background: var(--uk-on-accent); }
.uk-checklist-foot { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-top: 1px solid var(--uk-border); color: var(--uk-muted); font-size: 12px; }
.uk-link { all: unset; cursor: pointer; color: var(--uk-accent); font-size: 12px; }
.uk-link:disabled { color: var(--uk-muted); cursor: default; }
.uk-link:focus-visible { outline: 2px solid var(--uk-focus); border-radius: 3px; }
.uk-tabs { display: flex; align-items: stretch; border-bottom: 1px solid var(--uk-border); }
/* One line, scrolled sideways when it does not fit (its scrollbar hidden: the wheel, a drag near its edge, the keyboard scroll it). */
.uk-tab-list { display: flex; align-items: stretch; gap: 2px; position: relative; min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.uk-tab-list::-webkit-scrollbar { display: none; }
.uk-tab { flex: none; }
.uk-tab { all: unset; position: relative; isolation: isolate; display: inline-flex; align-items: center; gap: 6px; padding: 10px 12px; cursor: pointer; user-select: none; text-transform: uppercase; letter-spacing: .08em; font-size: 12px; font-weight: 600; color: var(--uk-muted); transition: color .15s; }
.uk-tab::before { content: ''; position: absolute; inset: 5px 2px; z-index: -1; border-radius: var(--uk-radius); transition: background .15s, box-shadow .15s; }
.uk-tab:hover, .uk-tab[aria-selected='true'], .uk-tab[aria-current='page'] { color: var(--uk-text); }
.uk-tab:hover::before { background: var(--uk-panel-2); }
.uk-tab:focus-visible { outline: none; }
.uk-tab:focus-visible::before { box-shadow: inset 0 0 0 2px var(--uk-focus); }
.uk-tab[data-transient] .uk-tab-label { font-style: italic; }
/* A tab with a tool keeps room for it: it comes without the tab growing. */
.uk-tab[data-tool] { padding-right: 30px; }
.uk-tab-close { position: absolute; right: 7px; top: 50%; margin-top: -10px; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--uk-radius-sm); color: var(--uk-muted); opacity: 0; pointer-events: none; transition: opacity .12s, color .12s, background .12s; }
.uk-tab:hover .uk-tab-close, .uk-tab:focus-visible .uk-tab-close, .uk-tab[aria-selected='true'] .uk-tab-close, .uk-tab[aria-current='page'] .uk-tab-close, .uk-tab[data-sort-active] .uk-tab-close { opacity: 1; pointer-events: auto; }
.uk-tab-close:hover { color: var(--uk-text); background: var(--uk-border); }
.uk-tab-close .uk-icon { width: 13px; height: 13px; }
.uk-tab-sep { flex: none; width: 1px; align-self: center; height: 16px; margin: 0 10px; border-radius: 1px; background: var(--uk-muted); opacity: .4; }
.uk-tab-sep[data-quiet] { visibility: hidden; }
.uk-tab-list[data-sorting] .uk-tab-sep { visibility: visible; }
/* The tab dragged: lifted. The bar waits for it to land. */
.uk-tab[data-sort-active] { color: var(--uk-text); cursor: grabbing; }
.uk-tab[data-sort-active]::before { background: var(--uk-panel-2); box-shadow: 0 8px 22px color-mix(in srgb, var(--uk-shadow) 40%, transparent), 0 1px 3px color-mix(in srgb, var(--uk-shadow) 25%, transparent); transition: box-shadow .2s ease-out, background .15s; }
[data-sort-drop] .uk-tab[data-sort-active]::before { box-shadow: 0 0 0 transparent, 0 0 0 transparent; }
.uk-tab-list[data-sorting] .uk-tab-bar { opacity: 0; }
/* The tab dragged into another section: as it will be there at once — its × appearing, or going. */
.uk-tab[data-into] .uk-tab-close { animation: uk-tab-tool-in .18s cubic-bezier(.2, 0, 0, 1); }
@keyframes uk-tab-tool-in { from { opacity: 0; scale: .4; } }
@media (prefers-reduced-motion: reduce) { .uk-tab[data-into] .uk-tab-close { animation: none; } }
.uk-tab-bar[data-instant] { transition: none; }
.uk-tab-bar { position: absolute; left: 0; top: -1px; height: 2px; background: var(--uk-text); border-radius: 2px; transition: transform .28s cubic-bezier(.4, 0, .2, 1), width .28s cubic-bezier(.4, 0, .2, 1), opacity .15s; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .uk-tab-bar { transition: none; } }
/* Down a side: a column, each tab its whole width (its mark, its name, its tool at its end), the bar at its start. */
.uk-tabs[data-orientation='vertical'] { flex-direction: column; border-bottom: 0; gap: 2px; flex: 0 1 auto; min-height: 0; }
.uk-tab-list[data-orientation='vertical'] { flex-direction: column; overflow-x: hidden; overflow-y: auto; }
.uk-tab-list[data-orientation='vertical'] .uk-tab, .uk-tabs[data-orientation='vertical'] > .uk-tab { display: flex; padding: 8px 10px; text-transform: none; letter-spacing: 0; font-size: 13px; font-weight: 500; white-space: nowrap; }
.uk-tab-list[data-orientation='vertical'] .uk-tab::before, .uk-tabs[data-orientation='vertical'] > .uk-tab::before { inset: 1px 0; }
.uk-tab-list[data-orientation='vertical'] .uk-tab-label { overflow: hidden; text-overflow: ellipsis; }
.uk-tab-list[data-orientation='vertical'] .uk-tab-sep { width: auto; height: 1px; align-self: stretch; margin: 6px 10px; }
.uk-tab-list[data-orientation='vertical'] .uk-tab-bar { top: 0; width: 2px; height: 0; transition: transform .28s cubic-bezier(.4, 0, .2, 1), height .28s cubic-bezier(.4, 0, .2, 1), opacity .15s; }
.uk-tab-mark { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; font-size: 11px; font-weight: 700; }
.uk-tab-mark .uk-icon { width: 16px; height: 16px; }
/* A page's side: narrow (icons), wide over the page (peeking), or wide beside it (pinned). What is in it is always as wide as it opens: the panel only shows more or less of it (nothing laid out again as it moves — its marks stay where they are). */
.uk-rail { --uk-rail-narrow: 52px; --uk-rail-wide: 240px; --uk-rail-ease: cubic-bezier(.3, 0, 0, 1); --uk-rail-ms: 180ms; position: relative; flex: none; align-self: stretch; width: var(--uk-rail-narrow); transition: width var(--uk-rail-ms) var(--uk-rail-ease); }
.uk-rail[data-state='pinned'] { width: var(--uk-rail-wide); }
.uk-rail-panel { position: absolute; inset: 0 auto 0 0; z-index: 50; display: flex; flex-direction: column; width: var(--uk-rail-narrow); overflow: hidden; background: var(--uk-panel); border-right: 1px solid var(--uk-border); transition: width var(--uk-rail-ms) var(--uk-rail-ease), box-shadow var(--uk-rail-ms) ease-out; }
.uk-rail:not([data-state='collapsed']) .uk-rail-panel { width: var(--uk-rail-wide); }
/* Closing is quicker than opening. */
.uk-rail[data-state='collapsed'], .uk-rail[data-state='collapsed'] .uk-rail-panel { --uk-rail-ms: 130ms; }
.uk-rail[data-state='peek'] .uk-rail-panel { box-shadow: 0 12px 32px color-mix(in srgb, var(--uk-shadow) 35%, transparent), 0 1px 3px color-mix(in srgb, var(--uk-shadow) 20%, transparent); }
/* What is in it in a column: tabs down it scroll in their list (a tab dragged to its foot scrolls it), what follows them stays in view. */
.uk-rail-body { flex: 1; min-height: 0; box-sizing: border-box; width: var(--uk-rail-wide); display: flex; flex-direction: column; overflow-x: hidden; overflow-y: auto; padding: 8px 6px; }
.uk-rail-pin { all: unset; flex: none; margin: 0 12px 8px; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--uk-radius-sm); color: var(--uk-muted); cursor: pointer; transition: color .12s, background .12s; }
.uk-rail-pin:hover { color: var(--uk-text); background: var(--uk-panel-2); }
.uk-rail-pin:focus-visible { outline: 2px solid var(--uk-focus); }
.uk-rail-pin[aria-pressed='true'] { color: var(--uk-text); }
.uk-rail-pin .uk-icon { width: 16px; height: 16px; }
/* What it opened from its side: beside its wide panel, its whole height — part of it (kept in view with it as the page scrolls). */
.uk-popover.uk-rail-flyout { position: absolute; top: 0; bottom: 0; left: var(--uk-rail-wide); z-index: 49; display: flex; flex-direction: column; width: min(520px, calc(100vw - var(--uk-rail-wide) - var(--uk-shell-inset))); max-height: none; overflow: hidden; border-left: 0; border-radius: 0 var(--uk-radius) var(--uk-radius) 0; transform-origin: left; animation-name: uk-flyout-in; }
/* A catalog in it: its whole height, what it lists scrolling under its search. */
.uk-rail-flyout > .uk-catalog { flex: 1; min-height: 0; }
.uk-rail-flyout .uk-catalog-body { flex: 1; height: auto; }
.uk-rail-flyout .uk-catalog-side { width: 180px; }
.uk-popover.uk-rail-flyout[data-state='closing'] { animation-name: uk-flyout-out; }
@keyframes uk-flyout-in { from { opacity: 0; transform: translateX(-8px); } }
@keyframes uk-flyout-out { to { opacity: 0; transform: translateX(-8px); } }
/* Narrow: marks only — names and tools fading as it narrows, a tab's highlight and the divider as wide as a mark's place. */
.uk-rail .uk-tab-label { transition: opacity var(--uk-rail-ms) ease-out; }
.uk-rail .uk-tab::before, .uk-rail .uk-tab-sep { transition: right var(--uk-rail-ms) var(--uk-rail-ease), margin var(--uk-rail-ms) var(--uk-rail-ease), background .15s, box-shadow .15s; }
.uk-rail[data-state='collapsed'] .uk-tab-label, .uk-rail[data-state='collapsed'] .uk-tab-close { opacity: 0; pointer-events: none; }
.uk-rail[data-state='collapsed'] .uk-tab::before { right: calc(100% - (var(--uk-rail-narrow) - 12px)); }
.uk-rail[data-state='collapsed'] .uk-tab-sep { margin-right: calc(100% - (var(--uk-rail-narrow) - 22px)); }
@media (prefers-reduced-motion: reduce) { .uk-rail, .uk-rail[data-state='collapsed'], .uk-rail[data-state='collapsed'] .uk-rail-panel { --uk-rail-ms: 0ms; } }
.uk-switch { all: unset; display: inline-flex; align-items: center; gap: 10px; min-height: 24px; cursor: pointer; font-size: 13px; color: var(--uk-text); }
.uk-switch:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: 2px; border-radius: var(--uk-radius); }
/* Off: a track that shows on its panel (not the border's colour); on: the accent. Its label is the same either way. */
.uk-switch-track { position: relative; flex: none; width: 32px; height: 18px; border-radius: 9px; background: color-mix(in srgb, var(--uk-panel-2), var(--uk-text) 18%); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--uk-border), var(--uk-text) 10%); transition: background .18s, box-shadow .18s; }
.uk-switch-thumb { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 7px; background: var(--uk-knob); box-shadow: 0 1px 2px color-mix(in srgb, var(--uk-shadow) 35%, transparent); transition: transform .18s cubic-bezier(.4, 0, .2, 1), width .12s; }
.uk-switch:not(:disabled):hover .uk-switch-track { background: color-mix(in srgb, var(--uk-panel-2), var(--uk-text) 26%); }
.uk-switch[aria-checked='true'] .uk-switch-track { background: var(--uk-accent); box-shadow: none; }
.uk-switch[aria-checked='true']:not(:disabled):hover .uk-switch-track { background: color-mix(in srgb, var(--uk-accent), var(--uk-text) 12%); }
.uk-switch[aria-checked='true'] .uk-switch-thumb { transform: translateX(14px); }
/* Pressed: the thumb stretches toward where it goes. */
.uk-switch:not(:disabled):active .uk-switch-thumb { width: 17px; }
.uk-switch[aria-checked='true']:not(:disabled):active .uk-switch-thumb { transform: translateX(11px); }
.uk-switch:disabled { opacity: .45; cursor: default; }
.uk-mark { background: none; color: var(--uk-accent); font-weight: 600; }
@keyframes uk-pop-in { from { opacity: 0; transform: translateY(-4px) scale(.985); } }
@keyframes uk-pop-out { to { opacity: 0; transform: translateY(-4px) scale(.985); } }
@keyframes uk-fade-in { from { opacity: 0; } }
.uk-region { display: flex; flex-direction: column; gap: 12px; }
.uk-region-title { margin: 0; font-size: 15px; font-weight: 600; }
.uk-region[data-layout="row"] { flex-direction: row; flex-wrap: wrap; }
.uk-region[data-layout="row"] > .uk-region-title { flex-basis: 100%; }
.uk-region[data-layout="grid"] { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.uk-region[data-layout="grid"] > .uk-region-title { grid-column: 1 / -1; }
.uk-bar { display: flex; align-items: center; gap: 10px; }
.uk-form { display: flex; flex-direction: column; gap: 12px; }
.uk-form-row { display: grid; grid-template-columns: 160px 1fr; align-items: center; gap: 12px; }
.uk-form-row > .uk-switch { grid-column: 1 / -1; }
.uk-form-row label { color: var(--uk-muted); }
@keyframes uk-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
/* A key cap: a raised key, its lower edge a little deeper; a combination's caps side by side. */
.uk-kbd { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 20px; height: 20px; padding: 0 5px; border: 1px solid var(--uk-border); border-bottom-width: 2px; border-radius: var(--uk-radius-sm); background: var(--uk-panel-2); color: var(--uk-muted); font-family: inherit; font-size: 11px; font-weight: 500; line-height: 1; vertical-align: middle; white-space: nowrap; }
.uk-kbds { display: inline-flex; align-items: center; gap: 3px; vertical-align: middle; font: inherit; }
/* In a field's button, the key goes to its end. */
.uk-button[data-variant='field'] > .uk-kbd, .uk-button[data-variant='field'] > .uk-kbds { margin-left: auto; }
.uk-page-header { display: flex; align-items: baseline; gap: 6px 14px; flex-wrap: wrap; min-width: 0; }
/* Its title and the line beside it on one baseline; the icon centred on the title. */
.uk-page-header :is(h1, h2) { margin: 0; font-weight: 700; letter-spacing: -.01em; line-height: 1.2; display: flex; align-items: baseline; gap: 10px; }
.uk-page-header :is(h1, h2) > .uk-icon { align-self: center; }
.uk-page-header h1 { font-size: 20px; line-height: 28px; }
.uk-page-header h1 .uk-icon { width: 28px; height: 28px; color: var(--uk-accent); }
.uk-page-header :is(h1, h2) > .uk-logo { align-self: center; }
.uk-page-header h1 .uk-logo { width: 24px; height: 27px; }
/* overkube's mark, of the accent (lighter and darker of it, whatever it is): its top the accent itself, the left face lighter, the right darker, the tile over it lighter still. */
.uk-logo { flex: none; }
.uk-logo { shape-rendering: geometricPrecision; }
.uk-logo-left-0 { stop-color: oklch(from var(--uk-accent) calc(l + .1) c h); }
.uk-logo-left-1 { stop-color: oklch(from var(--uk-accent) calc(l + .06) c h); }
.uk-logo-right-0 { stop-color: oklch(from var(--uk-accent) calc(l - .2) c h); }
.uk-logo-right-1 { stop-color: oklch(from var(--uk-accent) calc(l - .17) c h); }
.uk-logo-top { fill: var(--uk-accent); stroke: var(--uk-accent); }
.uk-logo-over { fill: oklch(from var(--uk-accent) calc(l + .18) c h); stroke: oklch(from var(--uk-accent) calc(l + .18) c h); opacity: .82; }
.uk-page-header h2 { font-size: 16px; font-weight: 600; gap: 8px; }
.uk-page-header h2 .uk-icon { color: var(--uk-muted); }
.uk-page-header-sub { color: var(--uk-muted); font-family: var(--uk-mono); font-size: 12px; display: flex; align-items: baseline; gap: 8px; }
.uk-page-header-sub:empty, .uk-page-header-end:empty { display: none; }
/* What is said beside it, one thing after another: a dot between. */
.uk-page-header-sub > * + *::before { content: '·'; margin-right: 8px; opacity: .6; }
.uk-page-header-end { margin-left: auto; align-self: center; display: flex; align-items: center; gap: 8px; }
/* A query at its end (a kind's filter): room to type in, not all of it. */
.uk-page-header-end > .uk-query { width: min(440px, 50vw); }
.uk-popover { animation: uk-pop-in .14s cubic-bezier(.2, .8, .2, 1); transform-origin: top; }
.uk-popover[data-side='top'] { transform-origin: bottom; }
.uk-popover[data-state='closing'] { animation: uk-pop-out .13s ease-in forwards; pointer-events: none; }
.uk-input, .uk-table-row, .uk-ms-option, .uk-chip { transition: background .12s, border-color .12s, color .12s, box-shadow .12s; }
.uk-dot { transition: background .3s; }
/* One of a few ways, side by side: small square buttons in a quiet track, the chosen one raised. */
.uk-segmented { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: var(--uk-radius); background: var(--uk-panel-2); border: 1px solid var(--uk-border); }
.uk-segmented-option { all: unset; display: inline-grid; place-items: center; min-width: 26px; height: 24px; padding: 0 6px; box-sizing: border-box; border-radius: calc(var(--uk-radius) - 2px); color: var(--uk-muted); font-size: 12px; cursor: pointer; transition: background .12s, color .12s, box-shadow .12s; }
.uk-segmented-option .uk-icon { width: 15px; height: 15px; }
.uk-segmented-option:hover { color: var(--uk-text); }
.uk-segmented-option[aria-pressed='true'] { color: var(--uk-text); background: var(--uk-panel); box-shadow: 0 1px 2px color-mix(in srgb, var(--uk-shadow) 30%, transparent); }
.uk-segmented-option:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
/* A part of a whole: a small ring filled as far in its tone, its words beside; filled anew as it changes. */
.uk-ratio { --uk-ratio-c: var(--uk-muted); display: inline-flex; align-items: baseline; gap: 8px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.uk-ratio[data-tone='ok'] { --uk-ratio-c: var(--uk-ok); }
.uk-ratio[data-tone='warn'] { --uk-ratio-c: var(--uk-warn); }
.uk-ratio[data-tone='error'] { --uk-ratio-c: var(--uk-error); }
.uk-ratio-circle { width: 16px; height: 16px; flex: none; align-self: center; rotate: -90deg; }
.uk-ratio-whole { fill: none; stroke: color-mix(in srgb, var(--uk-ratio-c) 25%, var(--uk-border)); stroke-width: 1.9; }
.uk-ratio-part { fill: none; stroke: var(--uk-ratio-c); stroke-width: 1.9; stroke-linecap: round; transition: stroke-dasharray .4s cubic-bezier(.3, .9, .3, 1); }
.uk-ratio[data-tone='error'] .uk-ratio-text, .uk-ratio[data-tone='warn'] .uk-ratio-text { color: var(--uk-ratio-c); }
@media (prefers-reduced-motion: reduce) { .uk-ratio-part { transition: none; } }
/* A state: its icon in its tone's colour, its words (in it too when it needs a look or fails; quieter when done, going, not known). */
/* Its words on the baseline of the words around it (its icon by their middle): a state among words lines up with them. */
.uk-status { --uk-status-c: var(--uk-muted); display: inline-flex; align-items: baseline; gap: 8px; min-width: 0; max-width: 100%; color: var(--uk-text); white-space: nowrap; }
.uk-status[data-tone='ok'] { --uk-status-c: var(--uk-ok); }
.uk-status[data-tone='progress'] { --uk-status-c: var(--uk-info); }
.uk-status[data-tone='waiting'] { --uk-status-c: color-mix(in srgb, var(--uk-info) 55%, var(--uk-muted)); }
.uk-status[data-tone='warn'] { --uk-status-c: var(--uk-warn); }
.uk-status[data-tone='error'] { --uk-status-c: var(--uk-error); }
.uk-status > .uk-icon { align-self: center; color: var(--uk-status-c); stroke-width: 2.1; }
.uk-status:is([data-tone='warn'], [data-tone='error']) { color: var(--uk-status-c); }
.uk-status:is([data-tone='done'], [data-tone='gone'], [data-tone='unknown']) { color: var(--uk-muted); }
.uk-status-text { min-width: 0; overflow: clip; text-overflow: ellipsis; }
.uk-status[data-tone='progress'] > .uk-icon { animation: uk-status-turn 1.1s linear infinite; }
.uk-status[data-tone='gone'] { animation: uk-status-fade 1.6s ease-in-out infinite; }
@keyframes uk-status-turn { to { rotate: 360deg; } }
@keyframes uk-status-fade { 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .uk-status, .uk-status > .uk-icon { animation: none; } }
@media (prefers-reduced-motion: reduce) {
  .uk-popover, .uk-popover[data-state='closing'], .uk-query-card { animation: none !important; }
  .uk-switch-thumb, .uk-switch-track, .uk-tab-bar { transition: none; }
}
/* A context menu: a pane of glass over everything, growing from where it was asked for; its items as a system's. */
.uk-menu { box-sizing: border-box; min-width: 200px; max-width: 320px; max-height: calc(100vh - 16px); overflow-y: auto; padding: 5px; border: 1px solid color-mix(in srgb, var(--uk-border) 80%, transparent); border-radius: var(--uk-radius-lg); background: color-mix(in srgb, var(--uk-panel) 86%, transparent); -webkit-backdrop-filter: blur(24px) saturate(1.6); backdrop-filter: blur(24px) saturate(1.6); box-shadow: 0 16px 40px color-mix(in srgb, var(--uk-shadow) 42%, transparent), 0 2px 8px color-mix(in srgb, var(--uk-shadow) 22%, transparent), inset 0 1px 0 color-mix(in srgb, var(--uk-text) 5%, transparent); color: var(--uk-text); font-size: 13px; outline: none; transform-origin: var(--uk-menu-origin, 0 0); animation: uk-menu-in .14s cubic-bezier(.2, .9, .3, 1.1); }
.uk-menu[data-state='closing'] { animation: uk-menu-out .1s ease-in forwards; pointer-events: none; }
.uk-menu-title { padding: 6px 9px 5px; color: var(--uk-muted); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uk-menu-group { display: flex; flex-direction: column; gap: 1px; }
.uk-menu-sep { height: 1px; margin: 5px 4px; border: 0; background: var(--uk-border); }
.uk-menu-item { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 10px 0 8px; border-radius: var(--uk-radius); cursor: default; user-select: none; outline: none; transition: background .08s, color .08s; }
.uk-menu-item:focus { background: var(--uk-panel-2); }
.uk-menu-item:active { scale: .985; }
.uk-menu-icon { display: inline-flex; flex: none; width: 15px; color: var(--uk-muted); transition: color .08s; }
.uk-menu-icon .uk-icon { width: 15px; height: 15px; }
.uk-menu-item:focus .uk-menu-icon { color: var(--uk-text); }
.uk-menu-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uk-menu-keys { margin-left: 16px; color: var(--uk-muted); font-size: 12px; letter-spacing: .02em; white-space: nowrap; }
.uk-menu-item[data-danger], .uk-menu-item[data-danger] .uk-menu-icon { color: var(--uk-error); }
.uk-menu-item[data-danger]:focus { background: color-mix(in srgb, var(--uk-error) 14%, transparent); }
.uk-menu-item[aria-disabled='true'] { opacity: .45; }
.uk-menu-item[aria-disabled='true']:focus { background: none; }
/* Chosen: a blink, then done. */
.uk-menu-item[data-chosen] { animation: uk-menu-blink .11s steps(2, jump-none); }
@keyframes uk-menu-in { from { opacity: 0; scale: .94; } }
@keyframes uk-menu-out { to { opacity: 0; scale: .98; } }
@keyframes uk-menu-blink { 50% { background: none; } }
@media (prefers-reduced-motion: reduce) { .uk-menu, .uk-menu[data-state='closing'], .uk-menu-item[data-chosen] { animation: none; } .uk-menu-item:active { scale: none; } }
/* A tip (overlays/Tip): beside what it is about, placed by it; a hint never in the pointer's way, a card taken into. Its parts only where there is something in them. */
/* Its anchor's wrapper: as what is in it is (inline — text in it cut short with "…" where a cell's is); a flex item where it is one (a cell's line, chips). */
.uk-tip-at { display: inline; min-width: 0; max-width: 100%; }
.uk-checklist-group > .uk-tip-at { display: flex; }
.uk-checklist-group > .uk-tip-at > * { flex: 1; min-width: 0; }
.uk-tip { position: absolute; visibility: hidden; width: max-content; max-width: 320px; padding: 4px 8px; border: 1px solid var(--uk-border); border-radius: var(--uk-radius-sm); background: var(--uk-panel-2); box-shadow: 0 6px 18px color-mix(in srgb, var(--uk-shadow) 35%, transparent); color: var(--uk-text); font-size: 12px; line-height: 1.4; white-space: normal; overflow-wrap: anywhere; pointer-events: none; animation: uk-fade-in .1s ease-out; }
.uk-tip[data-card] { max-width: 380px; max-height: min(420px, var(--uk-placed-room, 420px)); overflow: auto; padding: 10px 12px; border-radius: var(--uk-radius); background: var(--uk-panel); pointer-events: auto; }
.uk-tip-card { display: flex; flex-direction: column; gap: 8px; min-width: 200px; }
.uk-tip-title { font-weight: 600; }
.uk-tip-fields { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; }
.uk-tip-field { display: contents; }
.uk-tip-field > dt { color: var(--uk-muted); }
.uk-tip-field > dd { margin: 0; min-width: 0; }
.uk-tip-sections { display: flex; flex-direction: column; gap: 6px; }
.uk-tip-actions { display: flex; gap: 6px; padding-top: 8px; border-top: 1px solid var(--uk-border); }
:is(.uk-tip, .uk-tip-title, .uk-tip-fields, .uk-tip-sections, .uk-tip-actions):empty { display: none; }
@media (prefers-reduced-motion: reduce) { .uk-tip { animation: none; } }
.uk-popover { background: var(--uk-panel); border: 1px solid var(--uk-border); border-radius: var(--uk-radius); box-shadow: 0 10px 30px color-mix(in srgb, var(--uk-shadow) 45%, transparent); padding: 12px; }
/* As tall as the window (but what is around it: --uk-shell-inset, the host's padding): the side (if any) down its edge, the page beside it. */
.uk-shell { display: flex; align-items: flex-start; gap: 16px; min-height: calc(100dvh - var(--uk-shell-inset)); }
.uk-shell-page { flex: 1; min-width: 0; align-self: stretch; display: flex; flex-direction: column; gap: 12px; }
/* The header close over the navigation under it; what is on the page a little further down. */
.uk-shell-header { display: flex; align-items: center; gap: 12px; min-height: 40px; margin-bottom: -4px; }
.uk-shell-header-end { margin-left: auto; display: flex; align-items: center; gap: 8px; }
/* At the window's edge, as tall as it (the host's padding crossed), kept there as the page scrolls; over the page (a rail peeking over it — what opens from it, a popover, stays within this layer). */
.uk-shell-side { flex: none; position: sticky; top: 0; z-index: 20; display: flex; height: 100dvh; margin: calc(var(--uk-shell-inset) / -2) 0 calc(var(--uk-shell-inset) / -2) calc(var(--uk-shell-inset) / -2); }
.uk-shell-side:empty { display: none; }
.uk-shell-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; padding-top: 8px; }
.uk-shell-notifications { position: fixed; inset: auto 16px 16px auto; display: flex; flex-direction: column; gap: 8px; width: min(420px, calc(100vw - 32px)); }
.uk-shell-notifications:not(:has(> :not(.uk-shell-live))) { pointer-events: none; }
.uk-shell-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.uk-skeleton { display: block; width: 100%; height: .8em; border-radius: var(--uk-radius-sm); background: linear-gradient(90deg, var(--uk-panel-2) 25%, color-mix(in srgb, var(--uk-panel-2), var(--uk-text) 8%) 50%, var(--uk-panel-2) 75%); background-size: 200% 100%; animation: uk-shimmer 1.4s ease-in-out infinite; }
.uk-skeleton[data-shape='block'] { height: 64px; border-radius: var(--uk-radius); }
@media (prefers-reduced-motion: reduce) { .uk-skeleton { animation: none; } }
.uk-table-row[data-skeleton] { cursor: default; }
.uk-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.uk-navlist { display: flex; flex-direction: column; gap: 2px; }
.uk-navlist ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.uk-navlist-group { margin: 12px 8px 4px; line-height: inherit; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--uk-muted); }
.uk-navlist-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--uk-radius); color: var(--uk-text); text-decoration: none; }
.uk-navlist-item:hover { background: var(--uk-panel-2); }
.uk-navlist-item[aria-current='page'] { background: var(--uk-panel-2); color: var(--uk-accent); }
.uk-navlist-item:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
.uk-picker { width: min(720px, calc(100vw - 32px)); padding: 0; overflow: hidden; border-radius: 12px; }
.uk-navlist-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-navlist-extra { color: var(--uk-muted); font-size: 11px; font-variant-numeric: tabular-nums; }

.uk-themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 12px; padding: 16px 0; }
.uk-theme { all: unset; display: flex; flex-direction: column; gap: 6px; cursor: pointer; font-size: 12px; color: var(--uk-muted); }
.uk-theme[aria-pressed='true'] { color: var(--uk-text); }
.uk-theme-small { height: 72px; border: 1px solid; padding: 8px; display: grid; grid-template-columns: 14px 1fr; gap: 6px; }
.uk-theme[aria-pressed='true'] > .uk-theme-small { outline: 2px solid var(--uk-accent); outline-offset: 1px; }
.uk-theme:focus-visible > .uk-theme-small { outline: 2px solid var(--uk-focus); outline-offset: 1px; }
.uk-theme-small > i { border-radius: 2px; }
.uk-theme-small > b { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 3px; }
.uk-theme-small > b > i { height: 4px; border-radius: 2px; }
.uk-theme-more { place-items: center; grid-template-columns: 1fr; border-style: dashed; border-color: var(--uk-border); border-radius: var(--uk-radius); color: var(--uk-muted); }
.uk-theme:hover > .uk-theme-more { color: var(--uk-text); border-color: var(--uk-muted); }
.uk-slider { display: flex; align-items: center; gap: 12px; }
.uk-slider input { flex: 1; max-width: 280px; margin: 0; accent-color: var(--uk-accent); }
.uk-slider[data-hue] input { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 3px; background: ${HUE_TRACK}; }
.uk-slider output { min-width: 44px; color: var(--uk-muted); font-family: var(--uk-mono); font-size: 12px; }
.uk-swatches { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.uk-swatch { all: unset; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--uk-shadow) 25%, transparent); }
.uk-swatch[aria-pressed='true'] { outline: 2px solid var(--uk-text); outline-offset: 2px; }
.uk-swatch:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: 2px; }
.uk-swatches input[type='color'] { width: 24px; height: 24px; padding: 0; border: 0; background: none; cursor: pointer; }
.uk-gp-trigger { min-width: 200px; max-width: 300px; }
.uk-gp-dots { display: inline-flex; flex: none; }
.uk-gp-dots > i { width: 9px; height: 9px; border-radius: 50%; background: var(--uk-gp-c); box-shadow: 0 0 0 2px var(--uk-panel-2); }
.uk-gp-dots > i + i { margin-left: -3px; }
.uk-gp-popup { width: 340px; }
.uk-gp-popup .uk-ms-list { max-height: 360px; }
.uk-gp-group + .uk-gp-group { margin-top: 4px; }
.uk-gp-row[data-head] .uk-ms-label { font-weight: 600; }
.uk-gp-row[data-child] { padding-left: 34px; }
.uk-gp-row:hover, .uk-gp-row:focus-visible { background: var(--uk-panel-2); }
.uk-gp-row > i { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--uk-gp-c); }
.uk-gp-tag { flex: none; padding: 0 5px; border: 1px solid var(--uk-border); border-radius: var(--uk-radius-sm); color: var(--uk-muted); font-size: 11px; line-height: 16px; }
.uk-log-pane { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.uk-log-bar { display: flex; align-items: center; gap: 8px; min-width: 0; }
.uk-log-bar > .uk-query { flex: 1; min-width: 0; }
.uk-log-bar-end { margin-left: auto; display: flex; align-items: center; gap: 8px; flex: none; }
.uk-query > .uk-query-plain { flex: 1; min-width: 0; height: 100%; padding: 0 4px; border: 0; outline: 0; background: none; color: var(--uk-text); font-family: var(--uk-mono); font-size: 12px; }
.uk-query > .uk-query-plain::placeholder { color: var(--uk-muted); font-family: var(--uk-font); font-size: 13px; }
.uk-query-count { flex: none; padding: 0 8px; color: var(--uk-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.uk-button[data-variant='ghost'][aria-pressed='true'] { background: var(--uk-panel-2); color: var(--uk-text); }
.uk-log { --uk-log-c: var(--uk-muted); position: relative; height: max(320px, calc(100dvh - 260px)); border: 1px solid var(--uk-border); border-radius: var(--uk-radius); background: var(--uk-bg); overflow: hidden; }
.uk-log-scroll { position: absolute; inset: 0; overflow: auto; font-family: var(--uk-mono); font-size: 12px; line-height: 18px; overflow-anchor: none; }
.uk-log-scroll:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
.uk-log-rows { position: relative; min-width: 100%; }
.uk-log-line { position: absolute; left: 0; min-width: 100%; box-sizing: border-box; display: grid; grid-template-columns: 3px max-content max-content minmax(0, 1fr); column-gap: 12px; padding-right: 12px; white-space: pre; }
.uk-log:not([data-times]) .uk-log-line > time, .uk-log:not([data-sources]) .uk-log-line > em { display: none; }
.uk-log:not([data-times]) .uk-log-line, .uk-log:not([data-sources]) .uk-log-line { grid-template-columns: 3px max-content minmax(0, 1fr); }
.uk-log:not([data-times]):not([data-sources]) .uk-log-line { grid-template-columns: 3px minmax(0, 1fr); }
.uk-log[data-wrap] .uk-log-line { right: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.uk-log-line > b { background: var(--uk-log-c); opacity: .75; }
.uk-log-line > time { color: var(--uk-muted); user-select: none; }
.uk-log-line > em { min-width: 14ch; max-width: 22ch; overflow: hidden; text-overflow: ellipsis; font-style: normal; color: var(--uk-log-c); user-select: none; }
.uk-log-line:hover { background: var(--uk-panel-2); }
.uk-log-line[data-level='warn'] > span { color: var(--uk-warn); }
.uk-log-line[data-level='error'] > span { color: var(--uk-error); }
.uk-log-line mark { background: color-mix(in srgb, var(--uk-accent) 30%, transparent); color: inherit; border-radius: 2px; }
.uk-log-scroll > .uk-nothing { padding: 16px; font-family: var(--uk-font); }
.uk-log-note { position: absolute; left: 50%; translate: -50% 0; z-index: 1; display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border: 1px solid var(--uk-border); border-radius: 999px; background: var(--uk-panel); color: var(--uk-muted); font: inherit; font-size: 12px; box-shadow: 0 4px 14px color-mix(in srgb, var(--uk-shadow) 30%, transparent); }
.uk-log-note[data-at='top'] { top: 8px; }
.uk-log-note[data-at='foot'] { bottom: 10px; cursor: pointer; color: var(--uk-text); }
.uk-log-note .uk-icon { width: 14px; height: 14px; }
.uk-yaml { display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); background: var(--uk-bg); overflow: hidden; }
.uk-yaml-bar { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-bottom: 1px solid var(--uk-border); background: var(--uk-panel); }
.uk-yaml-size { color: var(--uk-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.uk-yaml-tools { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.uk-yaml-body { overflow: auto; max-height: max(320px, calc(100dvh - 300px)); padding: 6px 0; font-family: var(--uk-mono); font-size: 12px; line-height: 19px; }
.uk-yaml-line { all: unset; box-sizing: border-box; display: grid; grid-template-columns: 6ch minmax(0, 1fr); column-gap: 14px; min-width: 100%; width: max-content; padding-right: 14px; white-space: pre; }
.uk-yaml[data-wrap] .uk-yaml-line { width: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.uk-yaml-line:hover { background: var(--uk-panel-2); }
.uk-yaml-line > code { font: inherit; }
.uk-yaml-n { position: relative; padding-right: 6px; text-align: right; color: color-mix(in srgb, var(--uk-muted) 70%, transparent); user-select: none; }
.uk-yaml-fold { all: unset; position: absolute; left: 2px; top: 2px; width: 15px; height: 15px; display: inline-flex; align-items: center; justify-content: center; border-radius: 3px; color: var(--uk-muted); cursor: pointer; opacity: 0; transition: opacity .12s, rotate .15s; }
.uk-yaml-fold .uk-icon { width: 12px; height: 12px; }
.uk-yaml-fold[aria-expanded='false'] { opacity: 1; rotate: -90deg; }
.uk-yaml-line:hover .uk-yaml-fold, .uk-yaml-fold:focus-visible { opacity: 1; }
.uk-yaml-fold:hover { color: var(--uk-text); background: var(--uk-panel-2); }
.uk-yaml-skip { cursor: pointer; color: var(--uk-muted); font-style: italic; }
.uk-yaml-skip > span:last-child { border-radius: 3px; }
.uk-yaml-skip:hover > span:last-child { color: var(--uk-text); }
.uk-yaml [data-k='key'] { color: var(--uk-info); }
.uk-yaml [data-k='string'] { color: var(--uk-ok); }
.uk-yaml [data-k='block'] { color: color-mix(in srgb, var(--uk-ok) 80%, var(--uk-text)); }
.uk-yaml [data-k='number'] { color: var(--uk-warn); }
.uk-yaml [data-k='word'] { color: var(--uk-accent); }
.uk-yaml [data-k='mark'] { color: var(--uk-muted); }
.uk-yaml [data-k='comment'] { color: var(--uk-muted); font-style: italic; }
`)}
`;
