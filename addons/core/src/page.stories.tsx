import { kinds } from '@overkube/kube-types';
import { column, defineAddon, slots } from '@overkube/sdk';
import { tipField } from '@overkube/sdk/preact';
import { KubeStory, make } from '@overkube/storybook/preact';
import { Button } from '@overkube/uikit';
import { fill } from '@overweave/ui/preact';
import { useEffect } from 'preact/hooks';
import core from './index.tsx';
import { shop } from './shop.fixture.tsx';

/*
 * A kind's page, as the core draws it: its table (its rows, on their way,
 * coming in; refused by the cluster) — and an addon's column in it; its
 * columns' settings open, more than kubectl says shown; a condition's
 * tip, two addons' fields in it beside the core's.
 */

export default { title: 'core/Kind page' };

const { Pod } = kinds.core.v1;

/** Pods: the core's columns, its rows. */
export const Pods = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={shop} />;

/** Its rows on their way: as the table will be, its rows waiting. */
export const Loading = () => <KubeStory addons={[core]} path="/k/pods.v1" cluster={(c) => c.state(Pod, 'loading')} />;

/** Loading, then its rows: they come in where the placeholders were, the placeholders more than them fold away. Again: reload the story. */
export const Arriving = () => (
  <KubeStory
    addons={[core]}
    path="/k/pods.v1"
    cluster={(c) => {
      c.state(Pod, 'loading');
      setTimeout(() => {
        shop(c);
        c.state(Pod, 'live');
      }, 1500);
    }}
  />
);

/** Refused by the cluster: said why. */
export const Forbidden = () => (
  <KubeStory addons={[core]} path="/k/pods.v1" cluster={(c) => c.state(Pod, 'error', { status: 403, code: 'Forbidden', message: 'pods is forbidden' })} />
);

/** An addon's own field and column: a pod's first image, its tag. */
const images = defineAddon({
  id: 'images',
  title: 'Images',
  setup: ({ contributor }) => {
    contributor.add('Field', 'images.image', { kinds: ['pods.v1'], type: 'string', value: '.spec.containers[0].image' });
    contributor.add('Column', 'images.tag', column({ kinds: [Pod], header: 'Tag', order: 20, sort: 'images.image', format: ([image]) => String(image ?? '').split(':')[1] ?? '' }));
  },
});
export const AnAddonsColumn = () => <KubeStory addons={[core, images]} path="/k/pods.v1" cluster={shop} />;

/** Its columns' settings opened (by their button, once drawn): kubectl's, -o wide, More, the addon's; Labels, Controlled By and Container States turned on by the user. */
function Opened() {
  useEffect(() => {
    const t = setInterval(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Columns');
      if (button) clearInterval(t);
      button?.click();
    }, 100);
    return () => clearInterval(t);
  }, []);
  return (
    <KubeStory
      addons={[core, images]}
      path="/k/pods.v1"
      cluster={shop}
      user={(user) => user.patch('TableView', Pod.id, { hidden: { 'core.labels': false, 'core.controlled-by': false, 'core.v1/Pod.container-states': false } })}
    />
  );
}
export const ColumnsSettings = () => <Opened />;

/** An addon's field in a condition's tip: a pod's readiness probe, beside its Ready. */
const probes = defineAddon({
  id: 'probes',
  title: 'Probes',
  setup: ({ contributor }) => {
    contributor.add(
      'Fill',
      'probes.readiness',
      tipField(slots.tip.condition.fields, {
        kinds: [Pod],
        order: 250,
        label: 'Readiness Probe',
        when: ({ condition }) => condition.type === 'Ready',
        value: ({ object }) => {
          const get = (object as { spec?: { containers?: { readinessProbe?: { httpGet?: { path?: string; port?: number } } }[] } }).spec?.containers?.[0]?.readinessProbe?.httpGet;
          return get ? `GET :${get.port}${get.path}` : undefined;
        },
      }),
    );
  },
});
/** Another's: a runbook for each condition, a field and an action. */
const runbooks = defineAddon({
  id: 'runbooks',
  title: 'Runbooks',
  setup: ({ contributor }) => {
    contributor.add('Fill', 'runbooks.field', tipField(slots.tip.condition.fields, { order: 900, label: 'Runbook', value: ({ condition }) => `runbooks/${condition.type}.md` }));
    contributor.add(
      'Fill',
      'runbooks.open',
      fill(slots.tip.condition.actions, {
        render: () => (
          <Button size="sm" variant="ghost" icon="external-link">
            Open runbook
          </Button>
        ),
      }),
    );
  },
});
/** A condition's tip (the first mark's, shown once drawn): the core's title, fields and message, the two addons' fields among them, one's action. A container's tip beside it (its marks: hovered). */
function Tipped() {
  useEffect(() => {
    const t = setInterval(() => {
      const mark = document.querySelector<HTMLElement>('.uk-table-row .uk-tip-at');
      if (!mark) return;
      clearInterval(t);
      mark.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    }, 100);
    return () => clearInterval(t);
  }, []);
  const since = new Date(Date.now() - 4 * 60_000).toISOString();
  return (
    <KubeStory
      addons={[core, probes, runbooks]}
      path="/k/pods.v1"
      cluster={(c) => {
        c.add(
          Pod,
          make(Pod, {
            metadata: { name: 'api-0', namespace: 'shop' },
            spec: {
              containers: [
                { name: 'api', image: 'api:2', readinessProbe: { httpGet: { path: '/healthz', port: 8080 } } },
                { name: 'proxy', image: 'envoy:1.31' },
              ],
            },
            status: {
              phase: 'Running',
              containerStatuses: [
                {
                  name: 'api',
                  image: 'api:2',
                  imageID: '',
                  ready: false,
                  restartCount: 7,
                  state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off 5m0s restarting failed container=api' } },
                },
                { name: 'proxy', image: 'envoy:1.31', imageID: '', ready: true, restartCount: 0, started: true, state: { running: { startedAt: since } } },
              ],
              conditions: [
                { type: 'Ready', status: 'False', reason: 'ContainersNotReady', message: 'containers with unready status: [api]', lastTransitionTime: since },
                { type: 'PodScheduled', status: 'True', lastTransitionTime: since },
              ],
            },
          }),
        );
      }}
      user={(user) => user.patch('TableView', Pod.id, { hidden: { 'core.conditions': false, 'core.v1/Pod.container-states': false } })}
    />
  );
}
export const ConditionTips = () => <Tipped />;

Pods.storyName = 'Pods';
Loading.storyName = 'Pods - loading';
Arriving.storyName = 'Pods - arriving';
Forbidden.storyName = 'Pods - refused';
AnAddonsColumn.storyName = 'Pods - an addon’s column';
ColumnsSettings.storyName = 'Pods - columns’ settings';
ConditionTips.storyName = 'Pods - tips';
