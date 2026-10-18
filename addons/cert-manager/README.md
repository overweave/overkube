# @overkube/addon-cert-manager

overkube's [cert-manager](https://cert-manager.io) addon: certificates — when they end, how they are issued and where that stops, their issuers, where they are used — in cert-manager's and Kubernetes' own words, as `kubectl describe` and `cmctl status` say them.

Off until the user turns it on (Settings, or the start's suggestion): it answers to `cert-manager.io` served ([src/index.tsx](src/index.tsx)).

What it adds:

- **its kinds** among Network's — Certificates, Issuers, ClusterIssuers, CertificateRequests, Orders, Challenges ([src/kinds.ts](src/kinds.ts): its fields, in CEL — a Certificate's state, as `cmctl status` works it out: Issuing, Ready, Failed, else its Ready condition's reason);
- **their tables** — each CRD's own columns, in its place and order, whether the CRD can be read or not (a `view` user cannot), its Ready or State drawn as cert-manager says it; a Certificate's Expires (its lifetime as a bar, the soonest end first as it is sorted; its renewal past, a warning; a week left or ended, an error); an issuer's Type ([src/columns.tsx](src/columns.tsx));
- **a Certificate's view** — its Validity (Not Before, Renewal Time, Not After); its current revision as it goes: its CertificateRequest, the ACME Order of it, the Order's Challenges, its Secret — each its state, and where it stops what cert-manager says of it (a self check's failure, with what it usually means); its spec against what its Secret holds (DNS names, IP addresses, common name, key, duration); its failed issuance attempts and when cert-manager tries again (an hour, doubled each time, 32 at most) ([src/certificate.tsx](src/certificate.tsx));
- **a CertificateRequest's** — its request (subject, names, key, usages, who asked), and one cert-manager does not approve (another's issuer) said so ([src/request.tsx](src/request.tsx)); **an Order's, a Challenge's** — its reason, its solver ([src/acme.tsx](src/acme.tsx));
- **an issuer's** — a CA's own end (and that nothing renews it, where no Certificate manages its Secret), an ACME issuer's server, account and solvers, the certificates it issues ([src/issuer.tsx](src/issuer.tsx));
- **where they are used** — an Ingress's table: when its certificates end, beside the core's TLS (the soonest; one not issued yet, its state); its TLS in the place of the core's section: each entry's Certificate and its lifetime, a host no entry covers, the issuer its `cert-manager.io/(cluster-)issuer` annotation names not there; a Secret's Certificate ([src/ingress.tsx](src/ingress.tsx));
- **related** — each kind's issuer, Secret, request, solver, what uses it, in the core's Related section;
- **the start** — its certificates as a table, those not issued first, then the soonest end first: each its state, its lifetime, its issuer — set out and sorted as the user sets it, kept ([src/overview.tsx](src/overview.tsx)).

Its actions, each shown only to one who may (its `needs`, against what RBAC allows the one signed in):

- **Renew** a Certificate — its `Issuing` condition set, as `cmctl renew` does: its status updated (`update` on `certificates/status`: `cert-manager-edit` has it, not `patch`); not while it is issuing;
- **Approve**, **Deny** a CertificateRequest not yet decided — its `Approved` or `Denied` condition set, as `cmctl approve` and `cmctl deny` do: its status updated, and `approve` on `signers` (`cert-manager.io`) — cert-manager's webhook checks it, for the request's issuer.

Its stories (`make storybook`, under *cert-manager*) and tests draw it over [a cluster in memory](src/cluster.fixture.ts). The dev stand's seed has cert-manager and what goes through it, with no real domain asked for (`make dev-seed`: [dev/seed/65-acme.yaml](../../dev/seed/65-acme.yaml) — Pebble, Let's Encrypt's ACME test server; certificates made anew each time by [dev/seed/tls.sh](../../dev/seed/tls.sh), none kept in the repository).

Private: in the page's bundle ([apps/web](../../apps/web/README.md)), not published.
