import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { AddonHost } from '../host/addons.ts';

/** What the frame's own components are drawn with: the host (an addon's failure told as its own). */
export const HostContext = createContext<AddonHost | null>(null);

export function useHost(): AddonHost {
  const host = useContext(HostContext);
  if (!host) throw new Error('no host above: the page is mounted with mount()');
  return host;
}
