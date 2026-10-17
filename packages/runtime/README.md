# @overkube/runtime

One way to run an overkube addon, wherever it runs — the page's host (which adds its lifecycle: requirements, retries, safe mode), the [testkit](../testkit/README.md)'s world, a story: `runAddon(addon, contributor, env)` makes its `Ctx`, runs its `setup` (async too), and lets go of everything it took when it stops or fails to start. `Scope` is that: what a run took, let go of together.

Built with `npm run build -w @overkube/runtime` (`dist/`); in the workspace read from `src/`. Addons themselves are written with the [sdk](../sdk/README.md).
