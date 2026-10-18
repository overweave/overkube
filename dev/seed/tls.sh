#!/bin/sh
# What the seed needs made by hand, made anew each time it is applied (openssl; nothing of it kept in the
# repository), written as YAML to stdout for make dev-seed:
#   secrets  to apply (made anew each time):
#            - seed-partner-ca: a CA Secret no Certificate manages, ending in 25 days (Issuer seed-partner-ca signs with it);
#            - partner-tls: a TLS Secret no Certificate manages, ending in 12 days (Ingress partner serves it);
#   request  to make anew (replaced: a CertificateRequest's spec is not changed once made):
#            - pending-1: of an issuer cert-manager does not approve for — it waits for approval again.
set -eu
cd "$(mktemp -d)"

b64() { base64 < "$1" | tr -d '\n'; }

if [ "${1:-}" = request ]; then
  openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout pending.key -out pending.csr \
    -subj "/CN=pending.seed.test" -addext "subjectAltName=DNS:pending.seed.test" 2>/dev/null
  cat <<YAML
apiVersion: cert-manager.io/v1
kind: CertificateRequest
metadata:
  name: pending-1
  namespace: seed-shop
  labels: { overkube.dev/seed: "true" }
spec:
  request: $(b64 pending.csr)
  duration: 2160h
  usages: [digital signature, key encipherment, server auth]
  issuerRef: { name: partner, kind: PartnerIssuer, group: issuers.example.com }
YAML
  exit 0
fi

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout ca.key -out ca.crt -days 25 \
  -subj "/CN=seed partner CA/O=Seed Partner" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout partner.key -out partner.crt -days 12 \
  -subj "/CN=partner.seed.test" -addext "subjectAltName=DNS:partner.seed.test" 2>/dev/null

cat <<YAML
apiVersion: v1
kind: Secret
type: kubernetes.io/tls
metadata:
  name: seed-partner-ca
  namespace: seed-shop
  labels: { overkube.dev/seed: "true" }
data:
  tls.crt: $(b64 ca.crt)
  tls.key: $(b64 ca.key)
---
apiVersion: v1
kind: Secret
type: kubernetes.io/tls
metadata:
  name: partner-tls
  namespace: seed-shop
  labels: { overkube.dev/seed: "true" }
data:
  tls.crt: $(b64 partner.crt)
  tls.key: $(b64 partner.key)
YAML
