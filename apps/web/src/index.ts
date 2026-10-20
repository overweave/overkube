/**
 * overkube's page, for a host that draws it into a page of its own (a
 * platform's plugin): boot it into an element, with its gateway where the
 * host serves it. Its addons are those of addons.ts — and the host's own,
 * given to boot (BootOptions.addons) — in the host's bundle;
 * the page around it (page.css, the fonts) is the host's.
 */

export { type BootOptions, boot } from './boot.ts';
