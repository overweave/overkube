import type { Meta, StoryObj } from '@storybook/preact-vite';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Image } from '../display/Image';
import { Badge } from '../status/Badge';
import { Status } from '../status/Status';
import { Field, Fields } from './Fields';
import { Meter } from './Meter';

/*
 * Fields laid out by what they hold — a DaemonSet's summary, a pod's, two
 * containers', a node's meters — their width one of the buttons, or
 * dragged by a card's corner.
 */

type Row = [label: string, value: ComponentChildren];

const DAEMONSET: Row[] = [
  [
    'Status',
    <Status key="s" tone="unknown" icon="server-off">
      No nodes
    </Status>,
  ],
  ['Desired', '0'],
  ['Current', '0'],
  ['Ready', '0'],
  ['Up-to-date', '0'],
  ['Available', '0'],
  ['Node selector', 'overkube.dev/role=logging'],
  ['Misscheduled', '0'],
  ['Max unavailable', '1'],
  ['Containers', 'shipper'],
  ['Images', 'busybox:1.37'],
  ['Selector', 'app=log-shipper'],
  [
    'Vulnerabilities',
    <Status key="v" tone="ok" icon="circle-check">
      No vulnerabilities
    </Status>,
  ],
  ['Age', '7d8h'],
];

const POD: Row[] = [
  ['Ready', '1/1'],
  [
    'Status',
    <Status key="s" tone="ok" icon="circle-play">
      Running
    </Status>,
  ],
  ['Restarts', '2'],
  ['Age', '3d11h'],
  ['IP', <span class="uk-mono">10.42.0.35</span>],
  ['Node', 'ip-10-0-142-17.eu-central-1.compute.internal'],
  ['QoS', 'Burstable'],
  ['Controlled by', 'ReplicaSet ingress-nginx-controller-7d9c5f8b6d'],
  ['Service account', 'ingress-nginx'],
];

const image = (ref: string, policy: string) => (
  <span class="uk-line">
    <Image image={ref} />
    <span class="uk-quiet">{policy}</span>
  </span>
);

const COREDNS: Row[] = [
  ['Image', image('registry.k8s.io/coredns/coredns:v1.14.4', 'IfNotPresent')],
  ['CPU req / lim', <span class="uk-mono">50m / —</span>],
  ['Memory req / lim', <span class="uk-mono">20Mi / —</span>],
  [
    'Last state',
    <span>
      Unknown · exit code 255 <span class="uk-quiet">· 12h</span>
    </span>,
  ],
  ['Ports', <span class="uk-mono">53/UDP dns, 53/TCP dns-tcp, 9153/TCP metrics</span>],
  ['Command', <span class="uk-mono">-conf /etc/coredns/Corefile</span>],
];

const MIGRATE: Row[] = [
  [
    'Image',
    <span class="uk-line">
      <Image image="busybox:1.37" />
      <Badge>init 1</Badge>
    </span>,
  ],
  ['CPU req / lim', <span class="uk-mono">5m / —</span>],
  ['Memory req / lim', <span class="uk-mono">8Mi / —</span>],
  [
    'Command',
    <span class="uk-mono">
      sh -c echo migrating; sleep 5; for t in users orders payments invoices audit_log sessions; do echo "migrating $t"; psql "$DATABASE_URL" -f /migrations/$t.sql || exit 1; done;
      echo done
    </span>,
  ],
];

const WIDTHS = [1560, 1140, 910, 620, 420, 320];

function Cards() {
  const [width, setWidth] = useState(910);
  const card = {
    resize: 'horizontal',
    overflow: 'hidden',
    width: `${width}px`,
    minWidth: '200px',
    maxWidth: '100%',
    border: '1px solid var(--uk-border)',
    borderRadius: 'var(--uk-radius)',
    padding: '16px',
    background: 'var(--uk-panel)',
  } as const;
  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div class="uk-bar">
        {WIDTHS.map((w) => (
          <button key={w} type="button" class="uk-button" data-variant={w === width ? 'primary' : undefined} onClick={() => setWidth(w)}>
            {w}px
          </button>
        ))}
      </div>
      {[DAEMONSET, POD, COREDNS, MIGRATE].map((rows, i) => (
        <div key={`${i}:${width}`} style={card}>
          <Fields>
            {rows.map(([label, value]) => (
              <Field key={label} label={label}>
                {value}
              </Field>
            ))}
          </Fields>
        </div>
      ))}
      <div key={`meters:${width}`} style={card}>
        <Fields>
          <Meter label="CPU requested" value={1.2} of={4}>
            1.2 of 4 cores
          </Meter>
          <Meter label="Memory requested" value={2.1} of={7.6}>
            2.1 of 7.6 GiB
          </Meter>
          <Meter label="Pods" value={18} of={110}>
            18 of 110
          </Meter>
        </Fields>
      </div>
    </div>
  );
}

const meta = { title: 'Data/Fields', component: Fields } satisfies Meta<typeof Fields>;
export default meta;

/** Its width: a button, or a card's corner dragged. */
export const Widths: StoryObj = { render: () => <Cards /> };
