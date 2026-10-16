import { type ComponentChildren, createContext, h } from 'preact';
import { useContext } from 'preact/hooks';
import type { Addons } from '../addon.ts';

/* The addons the page runs, in a component: given by the page (AddonsProvider), asked for with useAddons — none where nothing runs them (a test's page). */

const AddonsContext = createContext<Addons | null>(null);

export function AddonsProvider({ addons, children }: { addons: Addons; children?: ComponentChildren }) {
  return h(AddonsContext.Provider, { value: addons }, children);
}
AddonsProvider.displayName = 'Overkube.AddonsProvider';

/** The addons the page runs; none: nothing runs them here. */
export function useAddons(): Addons | undefined {
  return useContext(AddonsContext) ?? undefined;
}
