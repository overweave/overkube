# Contributing

Thanks for wanting to help. Issues and pull requests are welcome; for anything larger than a fix, open an
issue first, so the design can be agreed before the work.

## Setting up

Only Docker is needed: `make` runs Node in a container, with the repository mounted. The dev stand — a
cluster, the server, the page with live reload — is one command:

```sh
make dev        # http://localhost:5173
make check      # what CI checks: lint and format, types, tests
```

Everything else (signing in on the stand, Storybook, working on overweave beside it) is in
[docs/development.md](docs/development.md).

## A change

- **Tests with it.** A fix comes with the test that failed before it; a feature, with tests of what it
  promises. Tests sit beside the code (`*.test.ts`, `*.test.tsx`).
- **Kubernetes' words.** What the page says is what kubectl and Kubernetes say (Running, Ready, Restarts),
  never a paraphrase.
- **No new runtime dependencies** without an issue agreeing to it; a new dependency is MIT-licensed (CI
  checks it).
- **Formatting** is Biome's: `make format`.
- **Commits** say what changed and why, as the history does: `feat(core): …`, `fix(server): …`,
  `docs: …`, `ci: …`.

A pull request runs the checks (lint, types, tests and their coverage, the Helm chart) and an audit of
the dependencies; they have to pass.

## Releases

Maintainers release: the server's version (`apps/server/package.json`) and the chart's
(`charts/overkube/Chart.yaml`, version and appVersion) are the same, and a `v<version>` tag builds the
image for amd64 and arm64, pushes it and the chart to GitHub's registry, and makes a GitHub release. Its
notes are made from the pull requests' titles — so a title says what changed for those who use it; what
breaks, and how to move on, is added to the release by hand.

## Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues are reported
privately: see [SECURITY.md](SECURITY.md).

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
