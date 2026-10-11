/**
 * overkube's frame, drawn wherever the page is: the page itself (Shell), a
 * test or a story (ShellProvider and Frame under their own providers). The
 * path — a hash's (hashRouter) or one in memory (memoryRouter) — names the
 * Route drawn; what the user is told is kept by notifications(). It draws
 * nothing of its own: what fills its slots and routes is the addons'.
 */

export { Frame, Outlet } from './Frame.tsx';
export { type Matched, matchPath, matchRoute } from './match.ts';
export { type Notifications, notifications } from './notifications.ts';
export { hashRouter, memoryRouter, pathOf, type Router } from './router.ts';
export { failureField, type OnFailure, Shell, type ShellOptions, type ShellProps, ShellProvider } from './Shell.tsx';
