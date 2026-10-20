import type { KubeKinds } from '@overkube/sdk';
import type { KindsByName, Registry } from '@overweave/core';
import { boot as start } from './boot.ts';
import type { BootOptions } from './options.ts';

/**
 * overkube's page, for a host that draws it into a page of its own (a
 * platform's plugin): boot it into an element, with its gateway where the
 * host serves it. Its addons are those of addons.ts — and the host's own,
 * given to boot (BootOptions.addons). Published as @overkube/web: its
 * own packages bundled in, those a host's addons are written with (the
 * SDK, the kit, overweave, Preact) the host's, one of each. The page
 * around it: @overkube/web/styles (the fonts, page.css), if the host
 * wants it.
 */

export type { BootOptions };

/** The page started: the registry of its kinds, and its end (a host's page left). */
export interface Booted {
  registry: Registry<KindsByName<KubeKinds>>;
  close(): void;
}

/** The page started into its element; none (the sign-in screen in its place, or the server not answering): undefined. */
export async function boot(options: BootOptions): Promise<Booted | undefined> {
  const page = await start(options);
  return page ? { registry: page.registry, close: page.close } : undefined;
}
