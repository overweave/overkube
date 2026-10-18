import { t } from '@overkube/sdk';

/*
 * What the Trivy addon says, by key — its English beside each
 * (Messages <locale>:trivy). Its terms are Trivy's and trivy-operator's
 * own (its reports' fields, its CRDs' columns); severities as Trivy says
 * them (CRITICAL on a badge, Critical over a count).
 */
export const T = {
  category: t('trivy.category', 'Security'),
  severities: {
    critical: t('trivy.severity.critical', 'Critical'),
    high: t('trivy.severity.high', 'High'),
    medium: t('trivy.severity.medium', 'Medium'),
    low: t('trivy.severity.low', 'Low'),
    unknown: t('trivy.severity.unknown', 'Unknown'),
  },
  columns: {
    vulnerabilities: t('trivy.column.vulnerabilities', 'Vulnerabilities'),
    repository: t('trivy.column.repository', 'Repository'),
    tag: t('trivy.column.tag', 'Tag'),
    scanner: t('trivy.column.scanner', 'Scanner'),
    resource: t('trivy.column.resource', 'Resource'),
    severity: t('trivy.column.severity', 'Severity'),
    found: t('trivy.column.found', 'Found'),
    os: t('trivy.column.os', 'OS'),
    components: t('trivy.column.components', 'Components'),
    dependencies: t('trivy.column.dependencies', 'Dependencies'),
    result: t('trivy.column.result', 'Result'),
    fail: t('trivy.column.fail', 'Fail'),
    pass: t('trivy.column.pass', 'Pass'),
  },
  /** A report's own view: what it found. */
  report: {
    noneFound: t('trivy.report.none-found', 'None found'),
    failed: t('trivy.report.failed', '{count} failed'),
    passed: t('trivy.report.passed', 'Passed'),
    checks: t('trivy.report.checks', 'Checks'),
    noChecks: t('trivy.report.no-checks', 'No failed checks.'),
    secrets: t('trivy.report.secrets', 'Secrets'),
    noSecrets: t('trivy.report.no-secrets', 'No secrets in its image.'),
    noComponents: t('trivy.report.no-components', 'No components.'),
    noControls: t('trivy.report.no-controls', 'A detailed report (reportType: all): its checks are in its YAML.'),
    components: t('trivy.report.components', 'Components'),
    name: t('trivy.report.name', 'Name'),
    version: t('trivy.report.version', 'Version'),
    type: t('trivy.report.type', 'Type'),
    license: t('trivy.report.license', 'License'),
    id: t('trivy.report.id', 'ID'),
    control: t('trivy.report.control', 'Control'),
    pass: t('trivy.report.pass', 'Pass'),
  },
  state: {
    scanning: t('trivy.state.scanning', 'Scanning'),
    notScanned: t('trivy.state.not-scanned', 'Not scanned'),
    /** Why there may be no report: trivy-operator says why a scan failed in its log only. */
    notScannedWhy: t('trivy.state.not-scanned-why', 'No report and no scan Job: why a scan failed is in trivy-operator’s log only.'),
    none: t('trivy.state.none', 'No vulnerabilities'),
    open: t('trivy.state.open', '{severity}: open Vulnerabilities'),
  },
  vulnerabilities: {
    title: t('trivy.vulnerabilities.title', 'Vulnerabilities'),
    scanned: t('trivy.vulnerabilities.scanned', '{scanner} {version}'),
    eosl: t('trivy.vulnerabilities.eosl', 'EOSL'),
    eoslTip: t('trivy.vulnerabilities.eosl-tip', '{os}: end of service life, its packages get no more fixes'),
    init: t('trivy.vulnerabilities.init', 'init'),
    noneIn: t('trivy.vulnerabilities.none-in', 'No vulnerabilities in its image.'),
    severity: t('trivy.vulnerabilities.severity', 'Severity'),
    id: t('trivy.vulnerabilities.id', 'Vulnerability ID'),
    resource: t('trivy.vulnerabilities.resource', 'Resource'),
    fixed: t('trivy.vulnerabilities.fixed', 'Fixed Version'),
  },
  audit: {
    title: t('trivy.audit.title', 'Config Audit'),
    rbac: t('trivy.audit.rbac', 'RBAC Assessment'),
    failed: t('trivy.audit.failed', 'Failed checks'),
    showAll: t('trivy.audit.show-all', 'Show all {count}'),
  },
  overview: {
    title: t('trivy.overview.title', 'Vulnerabilities'),
    scans: t('trivy.overview.scans', { one: '{count} scan Job', other: '{count} scan Jobs' }),
    workload: t('trivy.overview.workload', 'Workload'),
  },
  images: {
    title: t('trivy.images.title', 'Images'),
    images: t('trivy.images.count', { one: '{count} image', other: '{count} images' }),
    filter: t('trivy.images.filter', 'Filter'),
    placeholder: t('trivy.images.placeholder', 'Filter: repository, os = alpine, critical > 0'),
    image: t('trivy.images.image', 'Image'),
    os: t('trivy.images.os', 'OS'),
    workloads: t('trivy.images.workloads', 'Workloads'),
    registry: t('trivy.images.registry', 'Registry'),
    digest: t('trivy.images.digest', 'Digest'),
    scanned: t('trivy.images.scanned', 'Scanned'),
    usedBy: t('trivy.images.used-by', 'Used By'),
    namespace: t('trivy.images.namespace', 'Namespace'),
    containers: t('trivy.images.containers', 'Containers'),
    none: t('trivy.images.none', 'No images scanned yet.'),
    noneFound: t('trivy.images.none-found', 'No images found.'),
  },
  actions: {
    rescan: t('trivy.action.rescan', 'Rescan'),
  },
} as const;
