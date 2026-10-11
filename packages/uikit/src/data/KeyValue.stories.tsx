import type { Meta, StoryObj } from '@storybook/preact-vite';
import type { ComponentChildren } from 'preact';
import { Chips } from './Chips';
import { KeyValue } from './KeyValue';

const meta = {
  title: 'Data/KeyValue',
  component: KeyValue,
  args: {
    rows: [
      ['Name', 'web'],
      ['Namespace', 'media'],
      ['Missing', undefined],
    ],
  },
} satisfies Meta<typeof KeyValue>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Fields: Story = {};

/** As an object's overview has it: long values, chips, an id with no spaces, a long name. */
const OBJECT: [string, ComponentChildren][] = [
  ['Name', 'ingress-nginx-controller-7d9c5f8b6d-xk2lp'],
  ['Namespace', 'ingress-nginx'],
  ['Created', '3d ago (2026-10-06T09:14:22Z)'],
  ['Owners', 'ReplicaSet ingress-nginx-controller-7d9c5f8b6d'],
  [
    'Labels',
    <Chips
      key="labels"
      items={{
        'app.kubernetes.io/name': 'ingress-nginx',
        'app.kubernetes.io/component': 'controller',
        'app.kubernetes.io/instance': 'ingress-nginx',
        'pod-template-hash': '7d9c5f8b6d',
      }}
    />,
  ],
  ['Annotations', undefined],
  [
    'UID',
    <span key="uid" class="uk-mono">
      3f1c9a2e-8b47-4d0e-9f6a-2c5b8e1d7a43
    </span>,
  ],
  ['Termination message path', '/dev/termination-log'],
  [
    'Digest',
    <span key="d" class="uk-mono">
      sha256:4e5c6a9b1f2d3e8c7b6a5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a
    </span>,
  ],
];

/** The same rows in three widths: a narrow panel, a card, a page. */
export const Widths: Story = {
  args: { rows: OBJECT },
  render: (args) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start', padding: '24px' }}>
      {[300, 520, 900].map((w) => (
        <div key={w} style={{ width: `${w}px` }}>
          <div style={{ color: 'var(--uk-muted)', fontSize: '11px', marginBottom: '8px' }}>{w}px</div>
          <div class="uk-panel" style={{ padding: '14px 16px' }}>
            <KeyValue {...args} />
          </div>
        </div>
      ))}
    </div>
  ),
};
