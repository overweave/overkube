# Security

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Report it privately through GitHub:
[Report a vulnerability](https://github.com/overweave/overkube/security/advisories/new) (the
repository's Security tab → Advisories). Say what is affected (the version, how it runs — the image, the
Helm chart, from source), how to reproduce it, and what an attacker gains.

You will get an answer within a week. Once a fix is released, the advisory is published, crediting you
unless you ask not to be.

## Supported versions

overkube is 0.x: only the latest release gets fixes. Update to it before reporting, if you can.

## What is in scope

- The server: signing in (tokens, OpenID Connect, sessions), the gateway to the cluster — acting as the
  one signed in, never as more — and the port proxy.
- The page, as the server serves it (its Content-Security-Policy included).
- The image (`ghcr.io/overweave/overkube`) and the Helm chart (`charts/overkube`): what they run, as whom,
  with which rights.

Out of scope: the dev stand (`dev/`, `make dev` — a local cluster with known passwords, never to be
exposed), and what the cluster's own RBAC allows a signed-in user.

## Verifying a release

Every image is built by this repository's release workflow, for the commit its tag names, with its SBOM
and provenance:

```sh
gh attestation verify oci://ghcr.io/overweave/overkube:<version> --owner overweave
```
