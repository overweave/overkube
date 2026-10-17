/**
 * One way to run an overkube addon, wherever it runs — the page's host
 * (which adds its lifecycle: requirements, retries, safe mode), the
 * testkit's world, a story: runAddon(addon, contributor, env). Scope: what
 * a run took, let go of together.
 */

export { type AddonRun, type ClusterRun, type RunEnv, runAddon, type Services } from './run.ts';
export { Scope } from './scope.ts';
