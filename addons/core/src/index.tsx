import type { KubeObject } from '@overkube/kube-types';
import { column, defineAddon } from '@overkube/sdk';
import { Age } from '@overkube/uikit';

/*
 * The core: what every kind's table has, whatever the kind — its objects'
 * names, their namespaces (none for a kind of the whole cluster), their
 * ages. Everything else is for others to add over it.
 */

const AgeCell = ({ object }: { object: KubeObject }) => <Age since={object.metadata?.creationTimestamp} />;

export default defineAddon({
  id: 'core',
  title: 'Core',
  layer: 'core',
  setup({ contributor }) {
    contributor.add('Column', 'core.name', column({ header: 'Name', order: 0, value: (o) => o.metadata?.name }));
    contributor.add('Column', 'core.namespace', column({ header: 'Namespace', order: 10, value: (o) => o.metadata?.namespace }));
    contributor.add('Column', 'core.age', column({ header: 'Age', order: 900, width: 90, value: (o) => o.metadata?.creationTimestamp, render: AgeCell }));
  },
});
