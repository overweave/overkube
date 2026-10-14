import { describe, expect, it } from 'vitest';
import { compilePath, isPath, PathError, PathEvalError, valuesAt } from './index.ts';
import { PATHS_KEPT } from './path.ts';

// What kubectl (client-go's jsonpath, missing keys allowed) gives of these, read from its parser and evaluator.
const object = {
  metadata: {
    name: 'web',
    labels: { 'a.b': 'literal', a: { b: 'nested' }, app: 'web' },
    annotations: { 'kubectl.kubernetes.io/last-applied': 'A' },
    ownerReferences: [{ uid: 'a' }, { uid: 'b' }],
  },
  list: [0, 1, 2, 3, 4, 5],
  map: { x: 1, y: 2 },
  none: null,
  conditions: [
    { type: 'Ready', status: 'True', n: 1, f: 0.5 },
    { type: 'Issuing', status: 'False', n: 2, f: 2.5, reason: 'Renewing' },
    { type: 'Odd', status: 'a\nb', n: 3, f: 3.5 },
  ],
  mixed: [{ v: 'x' }, { v: 2 }],
  odd: [{ v: '}' }, { v: 'é' }, { v: '😀' }, { v: '！' }],
  arrays: [{ a: [1] }, { a: [] }, { b: 1 }],
  lone: '\ud800',
  big: Array.from({ length: 200_000 }, (_, i) => i),
};

describe('a path', () => {
  it.each([
    ['.metadata.name', ['web']],
    ['{.metadata.name}', ['web']],
    ['{\t.metadata.name}', ['web']],
    ['$.metadata.name', ['web']],
    ['.metadata.nope', []],
    ['.metadata.name.more', []],
    ['.metadata.name*', []],
    ['.none.a', []],
    ['.metadata.__proto__', []],
    ['.metadata.toString', []],
    ['.metadata.labels.a\\.b', ['literal']],
    [".metadata.labels['a.b']", ['nested']],
    ['.metadata.annotations.kubectl\\.kubernetes\\.io/last-applied', ['A']],
    ['.metadata.labels.*', ['literal', { b: 'nested' }, 'web']],
    ['.map.*', [1, 2]],
    ['.metadata.name.*', [119, 101, 98]],
    ['.metadata.ownerReferences[*].uid', ['a', 'b']],
    ['.list[-1]', [5]],
    ['.list[1:3]', [1, 2]],
    ['.list[0:5:2]', [0, 2, 4]],
    ['.list[::2]', [0, 2, 4]],
    ['.list[0:0]', []],
    ['.conditions[?(@.type=="Ready")].status', ['True']],
    [".conditions[?(@.type == 'Issuing')].status", ['False']],
    ['.conditions[?(@.status=="a\\nb")].type', ['Odd']],
    ['.conditions[?(@.reason)].type', ['Issuing']],
    ['.conditions[?(@.constructor)].type', []],
    ['.conditions[?(@.n > +2)].type', ['Odd']],
    ['.conditions[?(@.f >= 2.)].type', ['Issuing', 'Odd']],
    ['.conditions[?(@.n == @.n)].type', ['Ready', 'Issuing', 'Odd']],
    ['.conditions[?(2 < @.n)].type', ['Odd']],
    ['.conditions[?(@.type != "Odd")].n', [1, 2]],
    ['{.odd[?(@.v=="}")].v}', ['}']],
    ['.odd[?(@.v=="\\xc3\\xa9")].v', ['é']],
    ['.odd[?(@.v=="\\303\\251")].v', ['é']],
    ['.odd[?(@.v > "\\uE000")].v', ['😀', '！']],
    ['.odd[?(@.v > "！")].v', ['😀']],
    ['.arrays[?(@.a[0])].a', [[1], []]],
    ['.lone.*', [239, 191, 189]],
    ['.odd[?(@.v == "\\xff")].v', []],
    ['.odd[?(@.v < "\\xff")].v', ['}', 'é', '😀', '！']],
    ['.odd[?(@.v == "\\uFFFD")].v', []],
    ['.arrays[?(@.b)].b', [1]],
  ])('%s reaches %j', (path, values) => {
    expect(valuesAt(object, path)).toEqual(values);
  });

  it('reaches every element of a big array', () => {
    expect(valuesAt(object, '.big[*]')).toHaveLength(200_000);
  });

  it('reads a number after a dot as a name, not a number, as kubectl does: == .5 is a field 5', () => {
    expect(valuesAt({ a: [{ 5: 'x', v: 'x' }, { v: 'x' }] }, '.a[?(@.v == .5)].v')).toEqual(['x']);
  });

  it.each([
    ['.list[9]', 'array index out of bounds: index 9, length 6'],
    ['.list[2:100]', 'array index out of bounds: index 99, length 6'],
    ['.map[*]', 'object is not array or slice'],
    ['.map[?(@.x)]', 'object is not array or slice and cannot be filtered'],
    ['.none[?(@.x)]', 'null is not array or slice and cannot be filtered'],
    ['.mixed[?(@.v == "x")]', 'int and string do not compare by =='],
    ['.conditions[?(@.status < true)]', 'string and boolean do not compare by <'],
    ['.conditions[?(@.n > 2.5)]', 'int and float do not compare by >'],
    ['.conditions[?(@.f >= 1)]', 'float and int do not compare by >='],
    ['.metadata.ownerReferences[?(@ == "a")]', 'object and string do not compare by =='],
  ])('%s cannot be worked out: %s', (path, why) => {
    expect(() => valuesAt(object, path)).toThrow(new PathEvalError(why));
  });

  it.each([
    ['status', 0, 'a path starts with ., [, $ or @'],
    ['..a', 0, '.. (all the way down) is not taken'],
    ['.a[', 2, 'an array not closed'],
    ['.a[0,1]', 2, 'unions ([a,b]) are not taken'],
    ['.a[1.8]', 3, 'no index 1.8'],
    ['.a["b"]', 3, 'no index "b"'],
    ['.a[::0]', 3, 'a step is above 0'],
    ['.a[-]', 3, 'array index - is not a number'],
    ['.a[1:-]', 3, 'array index - is not a number'],
    ['.a[99999999999999999999]', 3, 'array index 99999999999999999999 is not a number'],
    ['.a.b,c', 4, '"," not wanted'],
    ['{.a}{.b}', 4, 'one action, nothing after it'],
    ['{.a', 3, 'a brace not closed'],
    ['{.a[?(@.b=="}")]', 16, 'a brace not closed'],
    ['.a[?(@.b == "c"', 2, 'a filter not closed'],
    ['.a[?(@.b == "c")', 16, '"]" wanted'],
    ['.a[?(@.b =~ "c")]', 9, 'no operator ='],
    [".a[?(@.b == '\\q')]", 11, 'no escape \\q'],
    ['.a[?(@.b == 1.2.3)]', 11, 'no number 1.2.3'],
  ])('%s is not one: at %i, %s', (path, at, why) => {
    const error = (() => {
      try {
        valuesAt(object, path);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(PathError);
    expect(error).toMatchObject({ path, at, message: `${why} at ${at} of ${path}` });
  });

  it('is made once while it is asked: the last of them kept, the oldest let go', () => {
    const made = compilePath('.kept.first');
    expect(compilePath('.kept.first')).toBe(made);
    for (let i = 0; i < PATHS_KEPT; i++) compilePath(`.kept.n${i}`);
    expect(compilePath('.kept.first')).not.toBe(made);
  });

  it('is told from a declared field by its start: a dot', () => {
    expect([isPath('.status.phase'), isPath('{.status.phase}'), isPath('core.ready')]).toEqual([true, false, false]);
  });
});
