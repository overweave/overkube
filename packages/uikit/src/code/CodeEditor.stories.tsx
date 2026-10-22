import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { CodeEditor, type CodeEditorProps } from './CodeEditor';
import { DEPLOYMENT, GOOD } from './schema.fixture';

/** A text edited: YAML highlighted; against a schema (a Deployment's), what is wrong underlined, its fields offered as one types (Ctrl+Space), a key's description on hover. */
const meta = {
  title: 'Data/CodeEditor',
  component: CodeEditor,
  args: { value: GOOD, schema: DEPLOYMENT, height: '420px', label: 'deployment.yaml' },
  render: (args: CodeEditorProps) => {
    const [value, setValue] = useState(args.value);
    return <CodeEditor {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof CodeEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A good one: type a new line under spec, its fields offered. */
export const Editing: Story = {};

/** What is wrong: a wrong type, an unknown field, an enum not kept, a required field missing — and what a server's dry run told, at its path. */
export const Problems: Story = {
  args: {
    value: GOOD.replace('replicas: 2', 'replicas: two\n  replica: 2\n  strategy:\n    type: Fast').replace('        - name: api\n', '        - nam: api\n'),
    problems: [{ path: ['spec', 'selector'], message: 'spec.selector: Invalid value: field is immutable', severity: 'error' }],
  },
};

/** Its YAML broken: the parser's error where it is. */
export const BrokenYaml: Story = { args: { value: 'spec:\n  replicas: [2\n  paused: true\n' } };

/** Read only: highlighted, folded, nothing typed. */
export const ReadOnly: Story = { args: { readOnly: true } };

/** JSON: highlighted alone. */
export const Json: Story = { args: { language: 'json', schema: undefined, value: JSON.stringify({ apiVersion: 'v1', kind: 'ConfigMap', data: { a: '1', b: 'two' } }, null, 2) } };
