import { describe, expect, it } from 'vitest';
import { checkFieldDef, fieldsOf, fieldVersion, fnv1a64, scan, scanCount } from './index.ts';

describe('a field definition, from anyone', () => {
  it.each<[string, unknown, string]>([
    ['not one', null, 'a field is { type, value, kinds?, many?, unit?, version? }'],
    ['a part it has not', { type: 'string', value: '.a', other: 1 }, 'a field has no other'],
    ['no type', { type: 'nonsense', value: '.a' }, 'no type "nonsense"'],
    ['many not a bool', { type: 'string', many: 'yes', value: '.a' }, 'many is true or false'],
    ['no unit', { type: 'number', unit: 'parsecs', value: '.a' }, 'no unit "parsecs"'],
    ['kinds not refs', { type: 'string', kinds: [1], value: '.a' }, "kinds are at most 64 kinds' refs"],
    ['a path not one', { type: 'string', value: 'a' }, 'a path starts with . and is at most 1024 long'],
    [
      'a value neither',
      { type: 'string', value: { cel: 'x', more: 1 } },
      'a value is a path, { cel }, { from, field } or { from, field, by, to, reduce: min | max | sum | count }',
    ],
  ])('is none: %s', (_, def, message) => {
    expect(checkFieldDef(def)).toEqual({ code: 'bad_field', message });
  });

  it('is made into what a scan takes, or left out with why — anything given, nothing thrown', () => {
    const { fields, rejected } = fieldsOf({
      ok: { type: 'string', value: '.a' },
      x: null,
      bad: { type: 'string', value: '.a[' },
      cel: { type: 'string', value: { cel: 'self.a' } },
    });
    expect([[...fields.keys()], rejected]).toEqual([['ok'], { x: expect.any(String), bad: 'an array not closed at 2 of .a[', cel: 'no CEL here' }]);
    expect(fieldsOf('nope').rejected).toEqual({ '': 'fields are { name: definition }' });
  });

  it('is joined (another kind’s object’s field) only where a join is made — else left out, with why', () => {
    const def = { joined: { type: 'number', value: { from: 'things.v1', field: 'size' } } };
    expect(checkFieldDef(def.joined)).toBeUndefined();
    const said = 'a value is a path, { cel }, { from, field } or { from, field, by, to, reduce: min | max | sum | count }';
    expect(checkFieldDef({ type: 'number', value: { from: '', field: 'size' } })?.message).toBe(said);
    // Keyed: of those whose `to` is its `by`, reduced — all three said, a reduce of these.
    expect(checkFieldDef({ type: 'number', value: { from: 'things.v1', field: 'size', by: 'mine', to: 'owner', reduce: 'max' } })).toBeUndefined();
    expect(
      [{ by: 'mine' }, { by: 'mine', to: 'owner', reduce: 'avg' }, { by: 'mine', to: 'owner', reduce: 'max', extra: 1 }].map(
        (keyed) => checkFieldDef({ type: 'number', value: { from: 'things.v1', field: 'size', ...keyed } })?.message,
      ),
    ).toEqual([said, said, said]);
    expect(fieldsOf(def).rejected).toEqual({ joined: 'no joined fields here' });
    const made = fieldsOf(
      def,
      undefined,
      ({ from, field }) =>
        () =>
          `${from}:${field}`,
    ).fields.get('joined');
    const read = made?.value as unknown as (o: unknown) => unknown;
    expect(read({})).toBe('things.v1:size');
  });
});

describe('a field’s version', () => {
  it('is of what its values are (type, many, value, salt), not of its kinds or unit — 64 bits', () => {
    const v = fieldVersion({ type: 'number', value: '.n' });
    expect(v).toMatch(/^[0-9a-f]{16}$/);
    expect(fieldVersion({ type: 'number', value: '.n', kinds: ['a'], unit: 'bytes' } as never)).toBe(v);
    expect([fieldVersion({ type: 'number', many: true, value: '.n' }), fieldVersion({ type: 'number', value: '.n' }, 'salt')]).not.toContain(v);
    expect(fnv1a64('')).toBe('cbf29ce484222325');
  });
});

describe('a field that cannot be worked out of some objects', () => {
  const boom = (o: { n?: number }) => {
    if (o.n === 0) throw Object.assign(new Error('no luck'), { code: 'nope' });
    return o.n;
  };
  const fields = new Map([
    ['f', { type: 'number' as const, value: boom }],
    ['p', { type: 'string' as const, value: '.l[5]' as const }],
  ]);
  const objects = [0, 1, 0, 2].map((n, i) => ({ metadata: { name: `o${i}` }, n, l: [] }));

  it('is told by the answers asking by it: how many, the first error — those objects none of it', () => {
    const found = scan(objects, { kind: 'x', page: { limit: 10 }, sort: [{ field: 'f' }] }, fields);
    expect([found.items.map((i) => i.key), found.fieldErrors]).toEqual([['o1', 'o3', 'o0', 'o2'], { f: { count: 2, code: 'nope', message: 'no luck' } }]);
    expect(scanCount(objects, { kind: 'x', groupBy: 'f' }, fields).fieldErrors).toEqual({ f: { count: 2, code: 'nope', message: 'no luck' } });
  });

  it('is not one if its path cannot be (kubectl’s: none, as the apiserver’s tables have it), nor if it is not asked by', () => {
    expect(scan(objects, { kind: 'x', page: { limit: 10 }, sort: [{ field: 'p' }] }, fields).fieldErrors).toBeUndefined();
    expect(scan(objects, { kind: 'x', page: { limit: 10 } }, fields).fieldErrors).toBeUndefined();
  });
});

describe('what the last review found', () => {
  it('tells the errors of the objects of this query only, not of those before', () => {
    const zero = (o: { n: number }) => {
      if (o.n === 0) throw Object.assign(new Error('zero'), { code: 'zero' });
      return 1 / o.n;
    };
    const fields = new Map([['f', { type: 'number' as const, value: zero }]]);
    const bad = { metadata: { name: 'bad' }, n: 0 };
    const good = { metadata: { name: 'good' }, n: 1 };
    const q = { kind: 'x', page: { limit: 5 }, sort: [{ field: 'f' }] };
    expect(scan([bad, good], q, fields).fieldErrors).toEqual({ f: { count: 1, code: 'zero', message: 'zero' } });
    expect(scan([good], q, fields).fieldErrors).toBeUndefined();
    expect(scan([], q, fields).fieldErrors).toBeUndefined();
    expect(scan([bad, bad], q, fields).fieldErrors).toEqual({ f: { count: 1, code: 'zero', message: 'zero' } });
    expect(scanCount([good], { kind: 'x', groupBy: 'f' }, fields).fieldErrors).toBeUndefined();
  });

  it('checks anything as a definition, a bigint too; keeps a copy of its kinds', () => {
    expect(checkFieldDef({ type: 1n, value: '.x' })).toEqual({ code: 'bad_field', message: 'no type 1n' });
    const kinds = ['a'];
    const { fields } = fieldsOf({ f: { type: 'string', kinds, value: '.x' } });
    kinds.push('b');
    expect(fields.get('f')?.kinds).toEqual(['a']);
  });
});
