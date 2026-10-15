import { type ComponentChildren, createContext, h } from 'preact';
import { useContext } from 'preact/hooks';
import type { UserChanges } from '../user.ts';

/* The user's changes in an addon's components: given by the page (UserProvider), asked for with useUser. */

const UserContext = createContext<UserChanges | null>(null);

/** Where the components below make the user's changes: the page's, or one in memory in a test or a story. */
export function UserProvider({ user, children }: { user: UserChanges; children?: ComponentChildren }) {
  return h(UserContext.Provider, { value: user }, children);
}
UserProvider.displayName = 'Overkube.UserProvider';

/** The user's changes: made here, kept by the page. */
export function useUser(): UserChanges {
  const user = useContext(UserContext);
  if (!user) throw new Error('no UserProvider above: the user’s changes are kept by the page');
  return user;
}
