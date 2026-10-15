/**
 * overkube's frame, drawn wherever the page is: the page itself (Shell), a
 * test or a story (ShellProvider and Frame under their own providers). The
 * path — a hash's (hashRouter) or one in memory (memoryRouter) — names the
 * Page drawn; what the user is told is kept by notifications(); the user's
 * changes, by a UserService (in localStorage, or in memory). It draws
 * nothing of its own but where nothing is (no page at a path, nothing to
 * open): what fills its slots and pages is the addons'.
 */

export { Frame, Outlet } from './Frame.tsx';
export { type Matched, matchPage, matchPath } from './match.ts';
export { type Notifications, notifications } from './notifications.ts';
export { hashRouter, memoryRouter, pathOf, type Router } from './router.ts';
export { failureField, type OnFailure, Shell, type ShellOptions, type ShellProps, ShellProvider } from './Shell.tsx';
export { localStore, memoryStore, merged, type SavedUser, type UserOptions, UserService, type UserStore } from './user.ts';
