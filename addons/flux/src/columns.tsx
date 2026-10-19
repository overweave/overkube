import { column, type KubeContributor } from '@overkube/sdk';
import { useSay } from '@overkube/sdk/preact';
import { Badge, Status } from '@overkube/uikit';
import { APPLIERS, Bucket, ExternalArtifact, F, FLUX, HelmChart, own, SOURCES, STATE, usedBy } from './kinds.ts';
import { ago, FluxState, Revision, stateOf, text } from './state.tsx';
import { T } from './texts.ts';

/*
 * Flux's kinds' tables: its state in kstatus's place (its CRD's Ready and
 * Status columns not drawn beside it; its own columns taking the places of
 * its CRD's, whether it can be read or not). A source's URL and ref (a Bucket's
 * endpoint and bucket, a HelmChart's chart and version), its artifact — a
 * fetch failing, the last one still served, marked so — what uses it (how
 * many, of each kind that names it). A Kustomization's, a HelmRelease's
 * source and path (its chart), the revision applied → attempted, Flux's
 * words.
 */

function Artifact({ artifact, ready, fetched }: { artifact: string; ready: string; fetched: unknown }) {
  const say = useSay();
  if (!artifact) return <span class="uk-quiet">—</span>;
  if (ready !== 'False') return <span class="uk-mono">{artifact}</span>;
  return (
    <Status tone="warn" icon="warning" title={say(T.stale, { duration: ago(fetched) })}>
      <span class="uk-mono">{artifact}</span>
    </Status>
  );
}

/** A source's key (Kind/namespace/name) as a table says it: Kind/name. */
const short = (key: string) => {
  const [kind, , name] = key.split('/');
  return name ? `${kind}/${name}` : key;
};

export function addColumns(c: KubeContributor): void {
  for (const k of FLUX) {
    c.add(
      'Column',
      `core.${k.id}.status`,
      column({ kinds: [k], header: T.columns.status, order: 60, width: 190, sort: F.ready, values: STATE, format: (v) => <FluxState {...stateOf(v)} /> }),
    );
    // Its CRD's Ready (its condition's status) and Status (its message): said by the state and the message.
    c.add('Column', `core.${k.id}.ready`, column({ kinds: [k], header: T.columns.status, values: [F.ready], when: () => false }));
  }
  // HelmChart's CRD's Version, Source Kind, Source Name: said by its Chart (its version) and what uses it.
  for (const slug of ['version', 'source-kind', 'source-name'])
    c.add('Column', `core.${HelmChart.id}.${slug}`, column({ kinds: [HelmChart], header: T.columns.chart, values: [F.ready], when: () => false }));
  for (const k of SOURCES) {
    // In the place of its CRD's URL (a HelmChart's Chart, a Bucket's Endpoint, an ExternalArtifact's Source).
    const [slug, header] =
      k === HelmChart
        ? ['chart', T.columns.chart]
        : k === Bucket
          ? ['endpoint', T.columns.endpoint]
          : k === ExternalArtifact
            ? ['source', T.columns.source]
            : ['url', T.columns.url];
    c.add(
      'Column',
      `core.${k.id}.${slug}`,
      column({
        kinds: [k],
        header,
        order: 100,
        width: 320,
        sort: own(F.url, k),
        // An ExternalArtifact has no ref of its own (a field not of its kind: no answer at all).
        values: k === ExternalArtifact ? [own(F.url, k)] : [own(F.url, k), own(F.ref, k)],
        format: ([url, ref]) => (
          <span class="uk-line">
            <span class="uk-mono uk-quiet">{text(url)}</span>
            {text(ref) && <Badge>{text(ref)}</Badge>}
          </span>
        ),
      }),
    );
    c.add(
      'Column',
      `flux.${k.plural}.artifact`,
      column({
        kinds: [k],
        header: T.columns.artifact,
        order: 110,
        width: 220,
        sort: F.artifact,
        values: [F.artifact, F.ready, F.fetched],
        format: ([artifact, ready, fetched]) => <Artifact artifact={text(artifact)} ready={text(ready)} fetched={fetched} />,
      }),
    );
    c.add(
      'Column',
      `flux.${k.plural}.used-by`,
      column({
        kinds: [k],
        header: T.columns.usedBy,
        order: 120,
        width: 90,
        values: usedBy(k),
        format: (v) => <span class="uk-num">{v.reduce<number>((n, x) => n + (typeof x === 'number' ? x : 0), 0)}</span>,
      }),
    );
  }
  for (const k of APPLIERS) {
    c.add(
      'Column',
      `flux.${k.plural}.source`,
      column({
        kinds: [k],
        header: T.columns.source,
        order: 100,
        width: 300,
        sort: own(F.uses, k),
        values: [own(F.uses, k), own(F.path, k)],
        format: ([uses, path]) => (
          <span class="uk-line">
            <span>{short(text(uses))}</span>
            <span class="uk-mono uk-quiet">{text(path)}</span>
          </span>
        ),
      }),
    );
    c.add(
      'Column',
      `flux.${k.plural}.revision`,
      column({
        kinds: [k],
        header: T.columns.revision,
        order: 110,
        width: 260,
        sort: own(F.applied, k),
        values: [own(F.applied, k), F.attempted, F.ready],
        format: ([applied, attempted, ready]) => <Revision applied={text(applied)} attempted={text(attempted)} failed={ready === 'False'} />,
      }),
    );
    c.add(
      'Column',
      `flux.${k.plural}.message`,
      column({ kinds: [k], header: T.columns.message, order: 130, width: 420, values: [F.message], format: ([m]) => <span class="uk-quiet">{text(m)}</span> }),
    );
  }
}
