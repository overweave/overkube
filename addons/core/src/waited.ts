import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

/** The next kind's placeholders shown at once: the page has waited for its objects already (the last kind shown meanwhile). */
export const Waited = createContext(false);

export const useWaited = () => useContext(Waited);
