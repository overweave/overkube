import type { KindInfo } from '@overkube/kube-types';
import type { FieldSpec } from '@overkube/sdk';

/*
 * Flux's kinds (source.toolkit.fluxcd.io, kustomize.toolkit.fluxcd.io,
 * helm.toolkit.fluxcd.io) and the fields the addon asks by — each of an
 * object alone (CEL, a path), but what uses a source (joined: counted by
 * its key). A state as Flux leaves it: its Ready condition (status,
 * reason, message, since when), spec.suspend. A source's URL and ref, its
 * artifact; what a Kustomization, a HelmRelease, a HelmChart uses (its
 * source's key, Kind/namespace/name), the revision applied and the one
 * attempted. What Flux applied: its labels (kustomize.toolkit.fluxcd.io,
 * helm.toolkit.fluxcd.io).
 */

const kind = (group: string, version: string, name: string, plural: string): KindInfo => ({
  id: `${group}/${version}/${name}`,
  group,
  version,
  kind: name,
  plural,
  singular: name.toLowerCase(),
  namespaced: true,
  verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
});

export const SOURCE_GROUP = 'source.toolkit.fluxcd.io';
export const GitRepository = kind(SOURCE_GROUP, 'v1', 'GitRepository', 'gitrepositories');
export const OCIRepository = kind(SOURCE_GROUP, 'v1', 'OCIRepository', 'ocirepositories');
export const HelmRepository = kind(SOURCE_GROUP, 'v1', 'HelmRepository', 'helmrepositories');
export const HelmChart = kind(SOURCE_GROUP, 'v1', 'HelmChart', 'helmcharts');
export const Bucket = kind(SOURCE_GROUP, 'v1', 'Bucket', 'buckets');
export const ExternalArtifact = kind(SOURCE_GROUP, 'v1', 'ExternalArtifact', 'externalartifacts');
export const Kustomization = kind('kustomize.toolkit.fluxcd.io', 'v1', 'Kustomization', 'kustomizations');
export const HelmRelease = kind('helm.toolkit.fluxcd.io', 'v2', 'HelmRelease', 'helmreleases');

export const SOURCES = [GitRepository, OCIRepository, HelmRepository, HelmChart, Bucket, ExternalArtifact];
/** Those that apply what a source has: a Kustomization, a HelmRelease. */
export const APPLIERS = [Kustomization, HelmRelease];
/** Those that use a source (a HelmChart: a HelmRepository's, a GitRepository's). */
export const USERS = [Kustomization, HelmChart, HelmRelease];
export const FLUX = [...APPLIERS, ...SOURCES];

/** A reference to another of its objects, as Flux's specs have them (sourceRef, chartRef). */
export type Ref = { kind: string; name: string; namespace?: string };

/** What it is delivered from, as its user would name it: its sourceRef; a HelmRelease's chartRef, or its chart's sourceRef (not the HelmChart Flux makes of it). */
export function sourceRefOf(object: { spec?: unknown }): Ref | undefined {
  const spec = object.spec as { sourceRef?: Ref; chartRef?: Ref; chart?: { spec?: { sourceRef?: Ref } } } | undefined;
  return spec?.sourceRef ?? spec?.chartRef ?? spec?.chart?.spec?.sourceRef;
}

/** A kind's ref, as queries name it. */
export const ref = (k: KindInfo) => `${k.plural}.${k.version}.${k.group}`;
/** One of Flux's kinds by its name (Kustomization, GitRepository…). */
export const byName = (name: string) => FLUX.find((k) => k.kind === name);

export const F = {
  ready: 'flux.ready',
  reason: 'flux.reason',
  message: 'flux.message',
  since: 'flux.since',
  suspended: 'flux.suspended',
  url: 'flux.url',
  ref: 'flux.ref',
  artifact: 'flux.artifact',
  fetched: 'flux.fetched',
  /** A source's key: Kind/namespace/name. */
  key: 'flux.key',
  /** What it uses: its source's key (a HelmRelease's: its HelmChart's, or its chartRef's). */
  uses: 'flux.uses',
  /** What it is delivered from, as sourceRefOf says it: a Kustomization's, what it uses; a HelmRelease's, its chart's source (or its chartRef). */
  source: 'flux.source',
  path: 'flux.path',
  applied: 'flux.applied',
  attempted: 'flux.attempted',
  /** How many of a kind use a source. */
  usedBy: (by: KindInfo) => `flux.used-by.${by.plural}`,
  /** What applied it: Kustomization or HelmRelease, namespace/name (Flux's labels on it). */
  by: 'flux.by',
} as const;

/** The state's fields, in this order (stateOf takes them so). */
export const STATE = [F.ready, F.reason, F.message, F.since, F.suspended] as const;

const condition = (type: string) => `self.?status.?conditions.orValue([]).filter(c, c.type == "${type}")`;
const ready = (what: string) => `cel.bind(c, ${condition('Ready')}, c.size() > 0 ? c[0].?${what}.orValue("") : "")`;
const label = (key: string) => `self.?metadata.?labels[?"${key}"].orValue("")`;
const of = (...ks: KindInfo[]) => ks.map(ref);
const sourceRef = (at: string) => `${at}.kind + "/" + ${at}.?namespace.orValue(self.metadata.namespace) + "/" + ${at}.name`;

/** A kind's own field of these (a Bucket's URL, a HelmRelease's path…): its name, else the field's. */
const OWN: Record<string, Record<string, string>> = {
  [F.url]: { Bucket: `${F.url}.bucket`, HelmChart: `${F.url}.chart`, ExternalArtifact: `${F.url}.artifact` },
  [F.ref]: { HelmRepository: `${F.ref}.helm`, Bucket: `${F.ref}.bucket`, HelmChart: `${F.ref}.chart` },
  [F.key]: Object.fromEntries(SOURCES.map((k) => [k.kind, `${F.key}.${k.plural}`])),
  [F.uses]: { HelmRelease: `${F.uses}.release` },
  [F.path]: { HelmRelease: `${F.path}.release` },
  [F.applied]: { HelmRelease: `${F.applied}.release` },
};
export const own = (field: string, k: KindInfo) => OWN[field]?.[k.kind] ?? field;

export const FIELDS: Record<string, FieldSpec> = {
  [F.ready]: { kinds: of(...FLUX), type: 'string', value: { cel: ready('status') } },
  [F.reason]: { kinds: of(...FLUX), type: 'string', value: { cel: ready('reason') } },
  [F.message]: { kinds: of(...FLUX), type: 'string', value: { cel: ready('message') } },
  [F.since]: { kinds: of(...FLUX), type: 'time', value: { cel: ready('lastTransitionTime') } },
  [F.suspended]: { kinds: of(...FLUX), type: 'string', value: { cel: 'self.?spec.?suspend.orValue(false) ? "Suspended" : ""' } },
  [F.url]: { kinds: of(GitRepository, OCIRepository, HelmRepository), type: 'string', value: '.spec.url' },
  [own(F.url, Bucket)]: { kinds: of(Bucket), type: 'string', value: { cel: 'self.spec.?provider.orValue("generic") + " " + self.spec.endpoint' } },
  [own(F.url, HelmChart)]: { kinds: of(HelmChart), type: 'string', value: '.spec.chart' },
  [own(F.url, ExternalArtifact)]: {
    kinds: of(ExternalArtifact),
    type: 'string',
    value: { cel: 'self.?spec.?sourceRef.hasValue() ? self.spec.sourceRef.kind + "/" + self.spec.sourceRef.name : ""' },
  },
  [F.ref]: {
    kinds: of(GitRepository, OCIRepository),
    type: 'string',
    value: {
      cel: `cel.bind(r, self.?spec.?ref.orValue({}), r.?commit.hasValue() ? "commit " + r.commit : r.?name.hasValue() ? "name " + r.name
        : r.?digest.hasValue() ? "digest " + r.digest : r.?semver.hasValue() ? "semver " + r.semver : r.?tag.hasValue() ? "tag " + r.tag
        : r.?branch.hasValue() ? "branch " + r.branch : "")`,
    },
  },
  [own(F.ref, HelmRepository)]: { kinds: of(HelmRepository), type: 'string', value: { cel: 'self.?spec.?type.orValue("default")' } },
  [own(F.ref, Bucket)]: { kinds: of(Bucket), type: 'string', value: { cel: '"bucket " + self.spec.bucketName' } },
  [own(F.ref, HelmChart)]: { kinds: of(HelmChart), type: 'string', value: { cel: '"version " + self.?spec.?version.orValue("*")' } },
  [F.artifact]: { kinds: of(...SOURCES), type: 'string', value: '.status.artifact.revision' },
  [F.fetched]: { kinds: of(...SOURCES), type: 'time', value: '.status.artifact.lastUpdateTime' },
  ...Object.fromEntries(
    SOURCES.map((k): [string, FieldSpec] => [own(F.key, k), { kinds: of(k), type: 'string', value: { cel: `"${k.kind}/" + self.metadata.namespace + "/" + self.metadata.name` } }]),
  ),
  [F.uses]: { kinds: of(Kustomization, HelmChart), type: 'string', value: { cel: sourceRef('self.spec.sourceRef') } },
  [own(F.uses, HelmRelease)]: {
    kinds: of(HelmRelease),
    type: 'string',
    // Its chart's: a chartRef's (an OCIRepository, a HelmChart); a chart template's, the HelmChart Flux makes of it (<namespace>-<name>, in its source's namespace).
    value: {
      cel: `self.?spec.?chartRef.hasValue() ? ${sourceRef('self.spec.chartRef')}
        : "HelmChart/" + self.spec.chart.spec.sourceRef.?namespace.orValue(self.metadata.namespace) + "/" + self.metadata.namespace + "-" + self.metadata.name`,
    },
  },
  [F.source]: {
    kinds: of(...APPLIERS),
    type: 'string',
    value: {
      cel: `self.?spec.?sourceRef.hasValue() ? ${sourceRef('self.spec.sourceRef')} : self.?spec.?chartRef.hasValue() ? ${sourceRef('self.spec.chartRef')} : ${sourceRef('self.spec.chart.spec.sourceRef')}`,
    },
  },
  [F.path]: { kinds: of(Kustomization), type: 'string', value: { cel: 'self.?spec.?path.orValue("./")' } },
  [own(F.path, HelmRelease)]: { kinds: of(HelmRelease), type: 'string', value: { cel: 'self.?spec.?chart.?spec.?chart.orValue("")' } },
  [F.applied]: { kinds: of(Kustomization), type: 'string', value: '.status.lastAppliedRevision' },
  [own(F.applied, HelmRelease)]: {
    kinds: of(HelmRelease),
    type: 'string',
    // Its history's latest deployed (or superseded) snapshot: the latest of all may be an attempt that failed.
    value: {
      cel: 'cel.bind(h, self.?status.?history.orValue([]).filter(s, s.?status.orValue("") in ["deployed", "superseded"]), h.size() > 0 ? h[0].?chartVersion.orValue("") : "")',
    },
  },
  [F.attempted]: { kinds: of(...APPLIERS), type: 'string', value: '.status.lastAttemptedRevision' },
  [F.by]: {
    type: 'string',
    value: {
      cel: `${label('kustomize.toolkit.fluxcd.io/name')} != "" ? "Kustomization " + ${label('kustomize.toolkit.fluxcd.io/namespace')} + "/" + ${label('kustomize.toolkit.fluxcd.io/name')}
        : ${label('helm.toolkit.fluxcd.io/name')} != "" ? "HelmRelease " + ${label('helm.toolkit.fluxcd.io/namespace')} + "/" + ${label('helm.toolkit.fluxcd.io/name')} : ""`,
    },
  },
};
// What uses a source, counted: of each kind that names one, joined by its key — of every namespace (a HelmRelease's HelmChart is in its source's, a Kustomization may use another namespace's source).
for (const k of SOURCES)
  for (const by of USERS)
    FIELDS[`${F.usedBy(by)}.${k.plural}`] = {
      kinds: of(k),
      type: 'number',
      value: { from: ref(by), field: 'core.name', by: own(F.key, k), to: own(F.uses, by), reduce: 'count', across: true },
    };
/** A source's counts of what uses it, by each kind. */
export const usedBy = (k: KindInfo) => USERS.map((by) => `${F.usedBy(by)}.${k.plural}`);
