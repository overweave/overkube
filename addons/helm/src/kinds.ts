import type { FieldSpec } from '@overkube/sdk';

/*
 * The fields the addon asks by: a release's Secret's (helm's labels: its
 * release's name, status, revision, when it changed — helm's own, every
 * revision's Secret owner=helm); what helm made, by its annotations
 * (meta.helm.sh/release-name, -namespace: helm sets them on each object
 * it makes): its release, namespace/name.
 */

export const SECRETS = 'secrets.v1';

export const F = {
  owner: '.metadata.labels.owner',
  name: '.metadata.labels.name',
  status: '.metadata.labels.status',
  /** A release's Secret's, by short names in a filter: release, status, revision (helm's labels). */
  release: 'secrets.v1.release',
  state: 'secrets.v1.status',
  version: 'secrets.v1.revision',
  modified: 'helm.secrets.modified',
  /** What helm made: its release (namespace/name; none: ''). */
  made: 'helm.release',
} as const;

/** One of helm's labels, of a release's Secret alone (owner=helm; another's: none). */
const label = (name: string) => `self.?metadata.?labels[?"owner"].orValue("") == "helm" ? self.?metadata.?labels[?"${name}"].orValue("") : ""`;

export const FIELDS: Record<string, FieldSpec> = {
  [F.release]: { kinds: [SECRETS], type: 'string', value: { cel: label('name') } },
  [F.state]: { kinds: [SECRETS], type: 'string', value: { cel: label('status') } },
  [F.version]: { kinds: [SECRETS], type: 'number', value: { cel: `cel.bind(v, ${label('version')}, v == "" ? 0 : int(v))` } },
  // helm's modifiedAt: seconds since the epoch.
  [F.modified]: { kinds: [SECRETS], type: 'number', value: { cel: `cel.bind(v, ${label('modifiedAt')}, v == "" ? 0 : int(v) * 1000)` } },
  [F.made]: {
    type: 'string',
    value: {
      cel: 'cel.bind(a, self.?metadata.?annotations.orValue({}), cel.bind(n, a[?"meta.helm.sh/release-name"].orValue(""), n == "" ? "" : a[?"meta.helm.sh/release-namespace"].orValue("") + "/" + n))',
    },
  },
};
