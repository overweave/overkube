import { defineAddon, lazySetup } from '@overkube/sdk';

/*
 * Trivy, as trivy-operator reports it: a workload's vulnerabilities (its
 * Overview: a container a row, a severity a column; its Vulnerabilities
 * tab: each, an image a card), what its spec does that it should not
 * (Config Audit), a role's RBAC Assessment; the workloads' tables a
 * column (not shown till turned on: the worst severity found — sorted and
 * filtered by it); the start's panel (the scans going on, the cluster's
 * totals, the most vulnerable); the images the cluster runs (a page:
 * filtered, sorted; one opened, where it runs). Its reports' kinds under
 * Security: each what it is of, how bad; one opened, what it found
 * (vulnerabilities, checks, secrets, an SBOM's components, compliance's
 * controls). Rescan: its reports deleted — trivy-operator scans it again.
 *
 *   kinds.ts     its kinds, the fields asked by        reports.tsx   a workload's reports, its containers
 *   sections.tsx a workload's, a role's sections       tab.tsx       a workload's Vulnerabilities
 *   columns.tsx  the tables' columns                   images.tsx    the Images page
 *   overview.tsx the start's panel                     views.tsx     a report's own view
 *
 * Off until turned on (an addon): suggested where trivy-operator's reports are served.
 */

export default defineAddon({
  id: 'trivy',
  title: 'Trivy',
  description: 'trivy-operator’s reports: vulnerabilities, config audits, exposed secrets, SBOMs, RBAC and infra assessments, compliance; the images the cluster runs; Rescan.',
  requires: { served: 'aquasecurity.github.io' },
  answers: [{ title: 'trivy-operator', when: { served: 'aquasecurity.github.io' } }],
  setup: lazySetup(() => import('./setup.tsx')),
});
