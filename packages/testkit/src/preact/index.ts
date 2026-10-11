/**
 * An addon's drawing, tested: the whole page at a path (renderRoute: the
 * shell's frame, the addons' routes and fills, read as its user sees it),
 * overweave's mount and renderSlot with the
 * dashboard's own — its kinds' matcher (a fill for some kinds in a slot about
 * one of them), the world's cluster given (KubeProvider) — and the rest of
 * overweave's (act, renderCounts, cleanup).
 */

export { act, cleanup, type Mounted, type RenderCounts, type RenderedSlot, renderCounts } from '@overweave/testkit/preact';
export { mount, type RenderedPage, type Reported, renderRoute, renderSlot } from './draw.ts';
