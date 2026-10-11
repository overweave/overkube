/*
 * The kit's styles, for the page's shadow root (where the host page's own
 * styles do not reach). Every colour, corner and font is a token (theme.ts):
 * the defaults' two variants, dark by default, light with
 * data-theme='light' on the root — a theme sets its own over them.
 */
import { COLOR_TOKENS, DEFAULT_TOKENS, tokenCss } from './theme';

/** The light variant's colours (its corners and fonts are the dark's: they are not a colour scheme's). */
const LIGHT_COLORS = Object.fromEntries(COLOR_TOKENS.map((t) => [t, DEFAULT_TOKENS.light[t]]));

export const css = `
:host, .uk-root {
  ${tokenCss(DEFAULT_TOKENS.dark)}
  --uk-row: 34px;
  color: var(--uk-text); font-family: var(--uk-font); font-size: 13px; line-height: 1.4;
}
.uk-root[data-theme='light'] {
  ${tokenCss(LIGHT_COLORS)}
}
.uk-root *, .uk-root *::before, .uk-root *::after { box-sizing: border-box; }
.uk-root a:not([class]) { color: var(--uk-accent); text-decoration: none; }
.uk-root a:not([class]):hover { text-decoration: underline; }
.uk-muted { color: var(--uk-muted); }
.uk-mono { font-family: var(--uk-mono); }
.uk-icon { width: 16px; height: 16px; flex: none; vertical-align: -3px; stroke: currentColor; fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.uk-icon[data-filled] { fill: currentColor; stroke: none; }

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
.uk-button[data-variant='field'] { min-width: 240px; justify-content: flex-start; background: var(--uk-bg); color: var(--uk-muted); font-weight: 400; box-shadow: none; }
.uk-button[data-variant='field']:not(:disabled):hover { color: var(--uk-text); }
.uk-button[data-size='sm'] { height: 26px; padding: 0 10px; gap: 5px; font-size: 12px; border-radius: var(--uk-radius); }
.uk-button[data-size='sm'] > .uk-icon { width: 13px; height: 13px; }
.uk-button[data-square] { width: 32px; padding: 0; }
.uk-button[data-square][data-size='sm'] { width: 26px; }
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
.uk-badge-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.uk-badge-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--uk-badge-c); }
.uk-chips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
/* A chip: its key quieter, its value plain, a hairline between; cut short when long. */
.uk-chip { all: unset; position: relative; display: inline-flex; align-items: stretch; max-width: min(420px, 100%); height: 22px; border: 1px solid var(--uk-border); border-radius: var(--uk-radius); overflow: hidden; background: var(--uk-panel-2); font-family: var(--uk-mono); font-size: 11px; line-height: 20px; cursor: pointer; transition: border-color .12s, background .12s; }
.uk-chip:hover { border-color: color-mix(in srgb, var(--uk-border), var(--uk-text) 20%); }
.uk-chip:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: 1px; }
.uk-chip-key { color: var(--uk-muted); white-space: nowrap; }
.uk-chip-value[data-long] { flex: 0 1 auto; min-width: 6ch; }
/* Short of room, a key's prefix gives way first (to a letter); its name stays whole; its value, after. */
.uk-chip-prefix { flex: 0 50 auto; min-width: 1ch; padding-left: 7px; opacity: .6; overflow: hidden; text-overflow: ellipsis; }
.uk-chip-name { flex: none; padding-right: 7px; }
.uk-chip-name:first-child { padding-left: 7px; }
.uk-chip-value { flex: none; padding: 0 7px; border-left: 1px solid var(--uk-border); background: var(--uk-panel); color: var(--uk-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Copied: it glows green a moment, then fades back. */
.uk-chip, .uk-chip-key, .uk-chip-value { transition: border-color .4s, background .4s, color .4s; }
.uk-chip[data-copied], .uk-chip[data-copied] .uk-chip-value { border-color: color-mix(in srgb, var(--uk-ok) 70%, transparent); background: color-mix(in srgb, var(--uk-ok) 14%, var(--uk-panel)); transition-duration: .08s; }
.uk-chip[data-copied] .uk-chip-value { color: var(--uk-ok); }
.uk-chip-more { padding: 0 8px; color: var(--uk-muted); font-family: inherit; }
.uk-chip-more:hover { color: var(--uk-text); }

.uk-panel { background: var(--uk-panel); border: 1px solid var(--uk-border); border-radius: var(--uk-radius); }
/* Names and values: two columns, the names' at most a third or so (a long name wraps); narrow (its own width, not the
   page's: a side panel too), each name over its value. */
.uk-kv { container: uk-kv / inline-size; display: grid; grid-template-columns: fit-content(35%) minmax(0, 1fr); gap: 12px 24px; align-items: baseline; margin: 0; }
.uk-kv > dt { color: var(--uk-muted); overflow-wrap: break-word; }
.uk-kv > dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
@container uk-kv (max-width: 380px) {
  .uk-kv > dt, .uk-kv > dd { grid-column: 1 / -1; }
  .uk-kv > dt { margin-top: 8px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
  .uk-kv > dt:first-child { margin-top: 0; }
  .uk-kv > dd { margin-top: -6px; }
}
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

/* A modal: a native dialog over all the page, its panel in the middle (high up), from the left edge, or from the bottom. */
.uk-modal { position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 6vh 16px; border: 0; background: transparent; color: var(--uk-text); box-sizing: border-box; overflow: hidden; }
.uk-modal[open] { display: flex; align-items: flex-start; justify-content: center; }
.uk-modal:focus { outline: none; }
.uk-modal::backdrop { background: var(--uk-overlay); animation: uk-fade-in .2s ease-out; }
.uk-modal[data-state='closing']::backdrop { animation: uk-spot-fade-out .18s ease-in forwards; }
.uk-modal-panel { position: relative; display: flex; flex-direction: column; width: min(960px, 100%); max-height: 88vh; background: var(--uk-panel); border: 1px solid var(--uk-border); border-radius: var(--uk-radius-lg); box-shadow: 0 24px 60px color-mix(in srgb, var(--uk-shadow) 45%, transparent), 0 2px 8px color-mix(in srgb, var(--uk-shadow) 20%, transparent); overflow: hidden; animation: uk-modal-in .22s cubic-bezier(.2, .8, .2, 1); }
.uk-modal[data-state='closing'] .uk-modal-panel { animation: uk-modal-out .18s ease-in forwards; }
.uk-modal-panel > header { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 18px; border-bottom: 1px solid var(--uk-border); }
.uk-modal-panel > header h2 { margin: 0; font-size: 15px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-modal-body { padding: 16px 18px; overflow: auto; display: flex; flex-direction: column; gap: 18px; }
/* Its footer: what can be done, at its end, under a hairline; it stays while the body scrolls. */
.uk-modal-footer { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--uk-border); background: color-mix(in srgb, var(--uk-panel), var(--uk-bg) 40%); }
/* From the left edge: all its height, its right corners rounded. */
.uk-modal[data-placement='left'] { padding: 0; }
.uk-modal[data-placement='left'][open] { align-items: stretch; justify-content: flex-start; }
.uk-modal[data-placement='left'] .uk-modal-panel { width: min(560px, 92vw); max-height: none; border-width: 0 1px 0 0; border-radius: 0 var(--uk-radius-lg) var(--uk-radius-lg) 0; animation: uk-modal-from-left .28s cubic-bezier(.2, .8, .2, 1); }
.uk-modal[data-placement='left'][data-state='closing'] .uk-modal-panel { animation: uk-modal-to-left .2s ease-in forwards; }
/* From the right edge: the same, mirrored. */
.uk-modal[data-placement='right'] { padding: 0; }
.uk-modal[data-placement='right'][open] { align-items: stretch; justify-content: flex-end; }
.uk-modal[data-placement='right'] .uk-modal-panel { width: min(560px, 92vw); max-height: none; border-width: 0 0 0 1px; border-radius: var(--uk-radius-lg) 0 0 var(--uk-radius-lg); animation: uk-modal-from-right .28s cubic-bezier(.2, .8, .2, 1); }
.uk-modal[data-placement='right'][data-state='closing'] .uk-modal-panel { animation: uk-modal-to-right .2s ease-in forwards; }
/* From the bottom: a sheet, its top corners rounded, a grip over its header. */
.uk-modal[data-placement='bottom'] { padding: 0; }
.uk-modal[data-placement='bottom'][open] { align-items: flex-end; justify-content: center; }
.uk-modal[data-placement='bottom'] .uk-modal-panel { width: min(1100px, 100%); max-height: 85vh; border-width: 1px 1px 0; border-radius: var(--uk-radius-lg) var(--uk-radius-lg) 0 0; animation: uk-modal-from-bottom .3s cubic-bezier(.2, .8, .2, 1); }
.uk-modal[data-placement='bottom'][data-state='closing'] .uk-modal-panel { animation: uk-modal-to-bottom .2s ease-in forwards; }
.uk-modal-grip { align-self: center; width: 36px; height: 4px; margin-top: 8px; border-radius: 2px; background: var(--uk-border); }
.uk-modal[data-placement='bottom'] .uk-modal-panel > header { padding-top: 6px; }
@keyframes uk-modal-out { to { opacity: 0; transform: translateY(6px) scale(.98); } }
@keyframes uk-modal-from-left { from { transform: translateX(-100%); } }
@keyframes uk-modal-to-left { to { transform: translateX(-100%); } }
@keyframes uk-modal-from-right { from { transform: translateX(100%); } }
@keyframes uk-modal-to-right { to { transform: translateX(100%); } }
@keyframes uk-modal-from-bottom { from { transform: translateY(100%); } }
@keyframes uk-modal-to-bottom { to { transform: translateY(100%); } }
.uk-section > h3 { margin: 0 0 8px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--uk-muted); font-weight: 600; }

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
.uk-table-row:hover, .uk-table-row[aria-selected='true'] { background: var(--uk-panel-2); }
.uk-table-row[data-clickable]:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: -2px; }
.uk-table-row > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.uk-table-row > [data-wrap] { white-space: normal; overflow-wrap: anywhere; padding: 8px 0; }
.uk-table-pick { display: flex; align-items: center; justify-content: center; }
.uk-table-pick input { margin: 0; width: 14px; height: 14px; accent-color: var(--uk-accent); cursor: pointer; }
.uk-table-empty { padding: 16px; color: var(--uk-muted); }
/* What the data changed: a row new to the list fades in; a row gone fades and folds, the rows under it rising. */
.uk-table-row[data-enter] { animation: uk-row-enter .22s cubic-bezier(.2, 0, 0, 1) both; }
.uk-table-row[data-leaving] { overflow: hidden; pointer-events: none; animation: uk-row-leave .22s ease-in forwards; }
@keyframes uk-row-enter { from { opacity: 0; } }
@keyframes uk-row-leave { from { height: var(--uk-row-h); min-height: 0; } to { height: 0; min-height: 0; opacity: 0; border-bottom-width: 0; } }
@media (prefers-reduced-motion: reduce) { .uk-table-row[data-enter], .uk-table-row[data-leaving] { animation: none; } }

.uk-catalog { display: flex; flex-direction: column; min-width: 0; }
.uk-catalog-top { display: flex; align-items: center; gap: 16px; padding: 0 14px 0 12px; height: 42px; border-bottom: 1px solid var(--uk-border); }
.uk-catalog-search { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--uk-muted); }
.uk-catalog-search:focus-within { color: var(--uk-text); }
.uk-catalog-search input { all: unset; flex: 1; min-width: 0; color: var(--uk-text); font: inherit; }
.uk-catalog-search input::placeholder { color: var(--uk-muted); }
.uk-catalog-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px 20px; padding: 12px; max-height: 55vh; overflow: auto; align-content: start; }
.uk-catalog-group { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.uk-catalog-group h4 { margin: 0 0 4px; padding: 0 8px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--uk-muted); }
.uk-catalog-row { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 6px 0 8px; border-radius: var(--uk-radius-sm); transition: background .12s; }
.uk-catalog-row:hover, .uk-catalog-row:focus-within { background: var(--uk-panel-2); }
.uk-catalog-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--uk-text); text-decoration: none; cursor: pointer; outline: none; }
.uk-catalog-row[data-muted] .uk-catalog-name { color: var(--uk-muted); }
.uk-catalog-row:has(.uk-catalog-name:focus-visible) { box-shadow: inset 0 0 0 2px var(--uk-focus); }
.uk-catalog-extra { color: var(--uk-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.uk-catalog-toggle { all: unset; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--uk-radius-sm); color: var(--uk-muted); cursor: pointer; opacity: 0; transition: opacity .12s, color .12s, background .12s; }
.uk-catalog-toggle .uk-icon { width: 11px; height: 11px; transform: rotate(35deg); }
.uk-catalog-row:hover .uk-catalog-toggle, .uk-catalog-toggle:focus-visible, .uk-catalog-toggle[aria-pressed='true'] { opacity: 1; }
.uk-catalog-toggle:hover { color: var(--uk-text); background: var(--uk-border); }
.uk-catalog-toggle:focus-visible { outline: 2px solid var(--uk-focus); }
.uk-catalog-empty { padding: 8px; color: var(--uk-muted); }
/* Spotlight: a panel floating high in the middle, frosted; the page dimmed a little behind it. */
.uk-spot { position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 18vh 16px 16px; border: 0; background: transparent; color: var(--uk-text); overflow: auto; box-sizing: border-box; }
.uk-spot::backdrop { background: color-mix(in srgb, var(--uk-overlay) 56%, transparent); animation: uk-fade-in .22s ease-out; }
.uk-spot[data-state='closing']::backdrop { animation: uk-spot-fade-out .14s ease-in forwards; }
.uk-spot-panel { width: min(680px, 100%); margin: 0 auto; display: flex; flex-direction: column; border-radius: var(--uk-radius-lg); overflow: hidden; background: color-mix(in srgb, var(--uk-panel) 84%, transparent); -webkit-backdrop-filter: blur(28px) saturate(1.6); backdrop-filter: blur(28px) saturate(1.6); border: 1px solid color-mix(in srgb, var(--uk-border) 80%, transparent); box-shadow: 0 28px 70px color-mix(in srgb, var(--uk-shadow) 45%, transparent), 0 2px 8px color-mix(in srgb, var(--uk-shadow) 20%, transparent), inset 0 1px 0 color-mix(in srgb, var(--uk-text) 5%, transparent); transform-origin: 50% 0; animation: uk-spot-in .42s cubic-bezier(.34, 1.36, .64, 1); }
.uk-spot[data-state='closing'] .uk-spot-panel { animation: uk-spot-out .14s ease-in forwards; }
.uk-spot [data-enter] { animation: uk-spot-row .3s cubic-bezier(.2, 0, 0, 1) both; animation-delay: calc(var(--uk-spot-i, 0) * 18ms); }
.uk-spot[data-state='opening'] [data-enter] { animation-delay: calc(60ms + var(--uk-spot-i, 0) * 22ms); }
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
@media (prefers-reduced-motion: reduce) { .uk-spot-panel, .uk-spot [data-enter], .uk-spot::backdrop, .uk-spot[data-state] .uk-spot-panel { animation: none; } .uk-spot-field[data-busy]::after { animation: none; } }
.uk-select { position: relative; display: inline-block; }
.uk-select-trigger { min-width: 180px; max-width: 300px; height: var(--uk-row); padding: 0 10px 0 14px; gap: 12px; }
.uk-select-value { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-select-value[data-empty] { color: var(--uk-muted); }
.uk-select-trigger > .uk-icon:last-child { color: var(--uk-muted); transition: transform .15s; }
.uk-select-trigger[aria-expanded='true'] { border-color: var(--uk-muted); }
.uk-select-trigger[aria-expanded='true'] > .uk-icon:last-child { transform: rotate(180deg); }
.uk-select-popup { max-width: 360px; padding: 0; overflow: hidden; }
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
.uk-ms-count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: var(--uk-accent); color: var(--uk-on-accent); font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
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
.uk-ms-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-ms-hint { color: var(--uk-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.uk-ms-empty { padding: 10px 8px; color: var(--uk-muted); }
.uk-ms-foot { display: flex; justify-content: flex-end; padding: 8px 12px; border-top: 1px solid var(--uk-border); color: var(--uk-muted); font-size: 12px; }
.uk-check { width: 16px; height: 16px; flex: none; border: 1.5px solid var(--uk-muted); border-radius: var(--uk-radius-sm); display: inline-flex; align-items: center; justify-content: center; color: var(--uk-on-accent); transition: background .12s, border-color .12s; }
.uk-check .uk-icon { width: 12px; height: 12px; stroke-width: 3; }
.uk-ms-option[aria-selected='true'] .uk-check, .uk-ms-all[aria-pressed='true'] .uk-check { background: var(--uk-accent); border-color: var(--uk-accent); }
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
/* A tab with a tool keeps room for it (it comes without the tab growing), as much as a pin takes: dragged from the open to the pinned (or back), it keeps its width. */
.uk-tab[data-tool] { padding-right: 28.5px; }
.uk-tab-close { position: absolute; right: 7px; top: 50%; margin-top: -10px; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--uk-radius-sm); color: var(--uk-muted); opacity: 0; pointer-events: none; transition: opacity .12s, color .12s, background .12s; }
.uk-tab:hover .uk-tab-close, .uk-tab:focus-visible .uk-tab-close, .uk-tab[aria-selected='true'] .uk-tab-close, .uk-tab[aria-current='page'] .uk-tab-close, .uk-tab[data-sort-active] .uk-tab-close { opacity: 1; pointer-events: auto; }
.uk-tab-close:hover { color: var(--uk-text); background: var(--uk-border); }
.uk-tab-close .uk-icon { width: 13px; height: 13px; }
/* A tab the user pinned: a small pin before its name, always there; a click unpins it. */
.uk-tab-pin { display: inline-flex; margin: 0 -.5px 0 -4px; padding: 2px; border-radius: 3px; color: var(--uk-muted); transition: color .12s, background .12s; }
.uk-tab-pin .uk-icon { width: 11px; height: 11px; transform: rotate(35deg); }
.uk-tab-pin:hover { color: var(--uk-text); background: var(--uk-border); }
.uk-tab-sep { flex: none; width: 1px; align-self: center; height: 16px; margin: 0 10px; border-radius: 1px; background: var(--uk-muted); opacity: .4; }
.uk-tab-sep[data-quiet] { visibility: hidden; }
.uk-tab-list[data-sorting] .uk-tab-sep { visibility: visible; }
/* The tab dragged: lifted. The bar waits for it to land. */
.uk-tab[data-sort-active] { color: var(--uk-text); cursor: grabbing; }
.uk-tab[data-sort-active]::before { background: var(--uk-panel-2); box-shadow: 0 8px 22px color-mix(in srgb, var(--uk-shadow) 40%, transparent), 0 1px 3px color-mix(in srgb, var(--uk-shadow) 25%, transparent); transition: box-shadow .2s ease-out, background .15s; }
[data-sort-drop] .uk-tab[data-sort-active]::before { box-shadow: 0 0 0 transparent, 0 0 0 transparent; }
.uk-tab-list[data-sorting] .uk-tab-bar { opacity: 0; }
/* The tab dragged into another section: as it will be there at once — its pin, its × appearing. */
.uk-tab[data-into] .uk-tab-pin, .uk-tab[data-into] .uk-tab-close { animation: uk-tab-tool-in .18s cubic-bezier(.2, 0, 0, 1); }
@keyframes uk-tab-tool-in { from { opacity: 0; scale: .4; } }
@media (prefers-reduced-motion: reduce) { .uk-tab[data-into] .uk-tab-pin, .uk-tab[data-into] .uk-tab-close { animation: none; } }
.uk-tab-bar[data-instant] { transition: none; }
.uk-tab-bar { position: absolute; left: 0; top: -1px; height: 2px; background: var(--uk-text); border-radius: 2px; transition: transform .28s cubic-bezier(.4, 0, .2, 1), width .28s cubic-bezier(.4, 0, .2, 1), opacity .15s; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .uk-tab-bar { transition: none; } }
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
@keyframes uk-modal-in { from { opacity: 0; transform: translateY(8px) scale(.98); } }
.uk-region { display: flex; flex-direction: column; gap: 12px; }
.uk-bar { display: flex; align-items: center; gap: 10px; }
.uk-form { display: flex; flex-direction: column; gap: 12px; }
.uk-form-row { display: grid; grid-template-columns: 160px 1fr; align-items: center; gap: 12px; }
.uk-form-row > .uk-switch { grid-column: 1 / -1; }
.uk-form-row label { color: var(--uk-muted); }
.uk-slot:empty { display: none; }
.uk-slot-empty { border: 1px dashed var(--uk-border); border-radius: var(--uk-radius); padding: 6px 10px; color: var(--uk-muted); font-size: 11px; font-family: var(--uk-mono); }
.uk-value { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; }
.uk-value-open { all: unset; cursor: pointer; border-bottom: 1px dotted var(--uk-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-value-open:focus-visible { outline: 2px solid var(--uk-focus); border-radius: 3px; }
/* A number at a glance. Clickable: its title brightens and an arrow comes under the pointer; it gives a little, pressed. */
.uk-stat { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; width: 100%; height: 100%; cursor: default; transition: transform .08s; }
button.uk-stat { cursor: pointer; }
button.uk-stat:active { transform: scale(.985); }
button.uk-stat:focus-visible { outline: 2px solid var(--uk-focus); outline-offset: 2px; border-radius: var(--uk-radius-sm); }
.uk-stat-title { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--uk-muted); transition: color .12s; }
.uk-stat-title > span:not(.uk-stat-go) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-stat-go { display: inline-flex; margin-left: -2px; opacity: 0; transform: translateX(-3px); transition: opacity .12s, transform .12s; }
.uk-stat-go .uk-icon { width: 13px; height: 13px; transform: rotate(-90deg); }
button.uk-stat:hover .uk-stat-title, button.uk-stat:focus-visible .uk-stat-title { color: var(--uk-text); }
button.uk-stat:hover .uk-stat-go, button.uk-stat:focus-visible .uk-stat-go { opacity: 1; transform: none; }
.uk-stat-value { display: flex; align-items: baseline; min-height: 30px; margin-top: 2px; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.3; }
.uk-stat-value small { margin-left: 4px; font-size: 13px; color: var(--uk-muted); font-weight: 400; }
.uk-stat-value[data-level='warn'] { color: var(--uk-warn); }
.uk-stat-value[data-level='error'] { color: var(--uk-error); }
.uk-stat-note { color: var(--uk-muted); font-size: 12px; }
.uk-stat-note[data-level='warn'] { color: var(--uk-warn); }
.uk-stat-note[data-level='error'] { color: var(--uk-error); }
/* Loading: a shimmer where the number goes. */
.uk-stat-shimmer { align-self: center; width: 46px; height: 16px; border-radius: var(--uk-radius-sm); background: linear-gradient(90deg, var(--uk-panel-2) 25%, color-mix(in srgb, var(--uk-panel-2), var(--uk-text) 10%) 50%, var(--uk-panel-2) 75%); background-size: 200% 100%; animation: uk-shimmer 1.2s linear infinite; }
@keyframes uk-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .uk-stat-shimmer { animation: none; } button.uk-stat:active { transform: none; } }
/* A key cap: a raised key, its lower edge a little deeper; a combination's caps side by side. */
.uk-kbd { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 20px; height: 20px; padding: 0 5px; border: 1px solid var(--uk-border); border-bottom-width: 2px; border-radius: var(--uk-radius-sm); background: var(--uk-panel-2); color: var(--uk-muted); font-family: inherit; font-size: 11px; font-weight: 500; line-height: 1; vertical-align: middle; white-space: nowrap; }
.uk-kbds { display: inline-flex; align-items: center; gap: 3px; vertical-align: middle; font: inherit; }
/* In a field's button, the key goes to its end. */
.uk-button[data-variant='field'] > .uk-kbd, .uk-button[data-variant='field'] > .uk-kbds { margin-left: auto; }
.uk-page-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.uk-page-header h1 { margin: 0; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
.uk-page-header-sub { color: var(--uk-muted); font-family: var(--uk-mono); font-size: 12px; display: flex; align-items: center; gap: 8px; }
.uk-popover { animation: uk-pop-in .14s cubic-bezier(.2, .8, .2, 1); transform-origin: top; }
.uk-popover[data-state='closing'] { animation: uk-pop-out .13s ease-in forwards; pointer-events: none; }
.uk-input, .uk-table-row, .uk-ms-option, .uk-chip { transition: background .12s, border-color .12s, color .12s, box-shadow .12s; }
.uk-dot { transition: background .3s; }
@media (prefers-reduced-motion: reduce) {
  .uk-popover, .uk-popover[data-state='closing'], .uk-modal::backdrop, .uk-modal .uk-modal-panel, .uk-modal[data-state] .uk-modal-panel { animation: none !important; }
  .uk-switch-thumb, .uk-switch-track, .uk-tab-bar { transition: none; }
}
.uk-popover { position: fixed; z-index: 900; background: var(--uk-panel); border: 1px solid var(--uk-border); border-radius: var(--uk-radius); box-shadow: 0 10px 30px color-mix(in srgb, var(--uk-shadow) 45%, transparent); padding: 12px; }
.uk-shell { display: flex; flex-direction: column; gap: 12px; min-height: 100%; }
.uk-shell-header { display: flex; align-items: center; gap: 8px; }
.uk-shell-header-end { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.uk-shell-body { display: flex; align-items: flex-start; gap: 16px; min-width: 0; }
.uk-shell-side { flex: 0 0 220px; position: sticky; top: 16px; }
.uk-shell-side:empty { display: none; }
.uk-shell-main { flex: 1; min-width: 0; }
.uk-shell-notifications { position: fixed; inset: auto 16px 16px auto; margin: 0; padding: 0; border: 0; background: transparent; overflow: visible; display: flex; flex-direction: column; gap: 8px; width: min(420px, calc(100vw - 32px)); z-index: 800; }
.uk-shell-notifications:not(:popover-open):not(:has(> :not(.uk-shell-live))) { display: none; }
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
.uk-picker { width: min(760px, calc(100vw - 32px)); max-height: min(70vh, 640px); overflow: auto; }
.uk-navlist-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uk-navlist-extra { color: var(--uk-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
`;
