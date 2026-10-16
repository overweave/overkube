import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

/* The scale the page is drawn at (the kit's --uk-u, in px of its own: 1 as given): for what the kit sizes in its code (a table's rows). Given by the page's frame. */

export const ScaleContext = createContext(1);

/** One px of the kit's, now. */
export const useScale = (): number => useContext(ScaleContext);
