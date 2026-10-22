import { describe, expect, it } from 'vitest';
import { completions, fieldAt, placeAt, problems, rangeOfPath, schemaAt, typeName } from './schema';
import { DEPLOYMENT, GOOD } from './schema.fixture';

/*
 * A YAML text against a kind's schema, as the cluster's OpenAPI says it
 * ($ref to its components, allOf of one): what is wrong where, what may be
 * typed where, what a key is.
 */

describe('a YAML text against its schema', () => {
  it('finds nothing wrong in a good one', () => {
    expect(problems(GOOD, DEPLOYMENT)).toEqual([]);
  });

  it('says its YAML wrong, first (where the parser says)', () => {
    const p = problems('spec:\n  replicas: [2\n', DEPLOYMENT);
    expect(p[0]?.severity).toBe('error');
  });

  it('says an unknown field (a warning, at its key), a value of the wrong type, an enum not kept, a required field missing', () => {
    const text = GOOD.replace('replicas: 2', 'replicas: two\n  replica: 2\n  strategy:\n    type: Fast').replace('        - name: api\n', '        - nam: api\n');
    const p = problems(text, DEPLOYMENT).map((x) => [text.slice(x.from, x.to), x.message, x.severity]);
    expect(p).toEqual([
      ['two', 'Expected integer, got a string', 'error'],
      ['replica', 'Unknown field "replica"', 'warning'],
      ['Fast', 'One of: Recreate, RollingUpdate', 'error'],
      ['nam', 'Unknown field "nam"', 'warning'],
      ['nam', 'Missing required field: name', 'error'],
    ]);
  });

  it('reads documents (---) as YAML has them: each one’s errors, none for being many', () => {
    expect(problems('a: 1\n---\nb: 2\n', DEPLOYMENT)).toEqual([]);
    expect(problems('a: 1\n---\nb: [\n', DEPLOYMENT).length).toBeGreaterThan(0);
  });

  it('takes a map of anything (labels), and what keeps unknown fields (a selector)', () => {
    expect(problems(GOOD.replace('app: api\nspec', 'app: api\n    tier: web\nspec').replace('matchLabels:', 'matchExpressions: []\n    matchLabels:'), DEPLOYMENT)).toEqual([]);
  });

  it('takes an allOf’s parts together: their properties and required fields merged (a CRD’s)', () => {
    const crd = {
      allOf: [
        { type: 'object', properties: { size: { type: 'integer' } }, required: ['size'] },
        { properties: { tier: { type: 'string', enum: ['a', 'b'] } }, required: ['tier'] },
      ],
    } as never;
    expect(problems('size: 1\ntier: c\n', crd).map((p) => p.message)).toEqual(['One of: a, b']);
    expect(problems('size: 1\n', crd).map((p) => p.message)).toEqual(['Missing required field: tier']);
  });

  it('knows a field: its schema, its type said', () => {
    expect(schemaAt(DEPLOYMENT, ['spec', 'replicas'])?.description).toBe('Number of desired pods.');
    expect(typeName(DEPLOYMENT, schemaAt(DEPLOYMENT, ['spec', 'template', 'spec', 'containers']))).toBe('[]object');
    expect(typeName(DEPLOYMENT, schemaAt(DEPLOYMENT, ['metadata', 'labels']))).toBe('map[string]string');
  });

  it('finds the field at an offset, and where a path is', () => {
    const at = GOOD.indexOf('replicas') + 3;
    expect(fieldAt(GOOD, at)?.path).toEqual(['spec', 'replicas']);
    const r = rangeOfPath(GOOD, ['spec', 'template', 'spec', 'containers', 0, 'image']);
    expect(r && GOOD.slice(r.from, r.to)).toBe('image');
  });
});

describe('what may be typed', () => {
  const at = (text: string) => ({ text: text.replace('|', ''), offset: text.indexOf('|') });

  it('knows its place by the lines above, while the text does not parse', () => {
    const { text, offset } = at('spec:\n  template:\n    spec:\n      containers:\n        - name: api\n          im|');
    expect(placeAt(text, offset)).toMatchObject({ path: ['spec', 'template', 'spec', 'containers', '*'], typing: 'key', prefix: 'im' });
  });

  it('offers the fields of the object it is in, but those there already: each its type, its description; an object’s opening the next line', () => {
    const { text, offset } = at('spec:\n  replicas: 2\n  |');
    const c = completions(text, offset, DEPLOYMENT);
    expect(c?.options.map((o) => o.label)).toEqual(['paused', 'selector', 'strategy', 'template']);
    expect(c?.options.find((o) => o.label === 'template')).toMatchObject({ detail: 'object', apply: 'template:\n    ' });
  });

  it('offers a field’s values: its enum, true or false', () => {
    const { text, offset } = at('spec:\n  strategy:\n    type: R|');
    expect(completions(text, offset, DEPLOYMENT)?.options.map((o) => o.label)).toEqual(['Recreate', 'RollingUpdate']);
    const b = at('spec:\n  paused: |');
    expect(completions(b.text, b.offset, DEPLOYMENT)?.options.map((o) => o.label)).toEqual(['true', 'false']);
  });

  it('offers an item’s fields after its "- "', () => {
    const { text, offset } = at('spec:\n  template:\n    spec:\n      containers:\n        - |');
    expect(completions(text, offset, DEPLOYMENT)?.options.map((o) => o.label)).toEqual(['name', 'image', 'ports']);
  });
});
