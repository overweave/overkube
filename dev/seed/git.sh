#!/bin/sh
# The SSH keys of the seed's git server and of Flux, made anew each time the seed is applied (ssh-keygen;
# none of them kept in the repository), written as YAML to stdout for make dev-seed:
#   - git-keys: the server's host key, and Flux's public key as the one it lets in (authorized_keys);
#   - flux-git: Flux's own key and the server's host key it knows (GitRepository seed's secretRef).
set -eu
cd "$(mktemp -d)"

HOST=git.seed-flux.svc.cluster.local

ssh-keygen -q -t ed25519 -N '' -C "$HOST" -f host
ssh-keygen -q -t ed25519 -N '' -C flux -f flux

b64() { base64 < "$1" | tr -d '\n'; }
printf '%s %s\n' "$HOST" "$(cut -d' ' -f1,2 host.pub)" > known_hosts

cat <<YAML
apiVersion: v1
kind: Secret
metadata:
  name: git-keys
  namespace: seed-flux
  labels: { overkube.dev/seed: "true" }
data:
  ssh_host_ed25519_key: $(b64 host)
  authorized_keys: $(b64 flux.pub)
---
apiVersion: v1
kind: Secret
metadata:
  name: flux-git
  namespace: seed-flux
  labels: { overkube.dev/seed: "true" }
data:
  identity: $(b64 flux)
  identity.pub: $(b64 flux.pub)
  known_hosts: $(b64 known_hosts)
YAML
