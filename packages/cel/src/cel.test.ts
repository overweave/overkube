import { describe, expect, it } from 'vitest';
import { CelError, createCel, layer, parseQuantity, prepareCatalog, versionOf } from './index.ts';

const cel = createCel();
const run = (expression: string, self: unknown = {}, c = cel) => c.compile(expression)(self);
const error = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof CelError ? e.code : `not a CelError: ${e}`;
  }
  return 'no error';
};

describe('a quantity, as apimachinery has it (ParseQuantity, AsInt64, AsApproximateFloat64: quantity.go, math.go)', () => {
  it.each([
    // AsInt64: the int64 kept at a scale of 0 or more — not a negative scale (1000m), not a decimal (1.5Gi).
    ['1Gi', 1073741824n, 1073741824],
    ['1k', 1000n, 1000],
    ['1.', 1n, 1],
    ['0', 0n, 0],
    ['0e100000000', 0n, 0],
    ['1000m', undefined, 1],
    ['500m', undefined, 0.5],
    ['-.5m', undefined, -0.0005],
    ['1.5Gi', undefined, 1610612736],
    ['0.1Ki', undefined, 102.4],
    // A decimal rounded up to nano; a binary one capped at the int64 max; a big exponent, no int64.
    ['0.1n', undefined, 1e-9],
    ['1e-100000000', undefined, 1e-9],
    ['100Ei', undefined, 2 ** 63],
    ['9Ei', undefined, 2 ** 63],
    // Go's decimal: at nano's scale (×10^9), then × Pow10(-9).
    ['12345678901234567890', undefined, Number(12345678901234567890n * 10n ** 9n) * 1e-9],
    ['1e100000000', undefined, Number.POSITIVE_INFINITY],
  ])('%s: an int64 %s, about %s', (text, integer, approximate) => {
    const q = parseQuantity(text);
    expect([q?.integer(), q?.approximate()]).toEqual([integer, approximate]);
  });

  it.each(['1e', 'abc', '', '1Kix', '--1', '1constructor', '1toString', '1e99999999999999999999', 'x'.repeat(300)])('%j is none', (text) => {
    expect(parseQuantity(text)).toBeUndefined();
  });

  it('works out a huge exponent at once (a scale, not a number of so many digits)', () => {
    const t = performance.now();
    for (const q of ['1e100000000', '0e100000000', '1e-100000000', `${'9'.repeat(200)}e2000000000`]) parseQuantity(q)?.approximate();
    expect(performance.now() - t).toBeLessThan(50);
  });
});

describe('an expression', () => {
  it('has integers as integers: JSON’s whole numbers within a double’s integers ints, the rest doubles', () => {
    expect([run('self.n + 1', { n: 1 }), run('self.x / 2', { x: 7 }), run('self.f * 2.0', { f: 1.5 }), run('self.n * 2.0', { n: 1e21 })]).toEqual([2, 3, 3, 2e21]);
  });

  it('has a missing value none (a null too), any other error an error', () => {
    expect([run('self.a.b'), run('self.l[3]', { l: [] }), run('self.a.b', { a: null })]).toEqual([undefined, undefined, undefined]);
    expect(error(() => run('self.s + 1', { s: 'x' }))).toBe('no_such_overload');
    expect(error(() => run('1 / 0'))).toBe('division_by_zero');
    expect(error(() => run('[1].slice(0, 5)'))).toBe('invalid_argument');
    expect(error(() => run('quantity(self.cpu).asInteger()', { cpu: '250m' }))).toBe('invalid_argument');
  });

  it('gives data: numbers, strings, bools, lists of them; a map or a list of lists is no answer of a field', () => {
    expect([run('[1, "a", true]'), run('timestamp("2026-01-01T00:00:00Z")'), run('9007199254740993')]).toEqual([[1, 'a', true], Date.UTC(2026, 0, 1), 9007199254740992]);
    expect([error(() => cel.compile('{"a": 1}')), error(() => cel.compile('[[1]]')), error(() => run('self.l', { l: [[1]] }))]).toEqual(['bad_shape', 'bad_shape', 'bad_shape']);
  });

  it('knows no name but self', () => {
    expect(error(() => cel.compile('slef.x'))).toBe('bad_cel');
  });

  it.each([
    ['self.l.map(c, c.n).sum()', { l: [{ n: 2 }, { n: 5 }] }, 7],
    ['[1.5, 2.0].sum()', {}, 3.5],
    ['[1, 2, 3, 2].indexOf(2)', {}, 1],
    ['[1, 2, 3, 2].lastIndexOf(2)', {}, 3],
    ['[[1], [2]].indexOf([2])', {}, 1],
    ['[1, 2, 3].slice(1, 3)', {}, [2, 3]],
    ['[[1, 2], [3], 4].flatten()', {}, [1, 2, 3, 4]],
    ['quantity(self.cpu).asApproximateFloat()', { cpu: '250m' }, 0.25],
    ['quantity(self.mem).asInteger()', { mem: '1Gi' }, 1073741824],
    ['quantity("1.5").isInteger()', {}, false],
    ['isQuantity("1Ki") && !isQuantity("1e") && !isQuantity("1constructor")', {}, true],
    ['cel.bind(m, self.m, m.map(k, k + "=" + m[k]))', { m: { a: 'x', b: 'y' } }, ['a=x', 'b=y']],
  ])('%s: %j', (expression, self, want) => {
    expect(run(expression, self)).toEqual(want);
  });

  it('sums ints or doubles, nothing else', () => {
    expect(error(() => run('[true, false].sum()'))).toBe('no_such_overload');
  });

  it('is none if it is not one, or too big', () => {
    expect(error(() => cel.compile('self.('))).toBe('bad_cel');
    expect(error(() => cel.compile(Array.from({ length: 2000 }, () => '1').join(' + ')))).toBe('bad_cel');
  });

  it('is made into values of self only where it reads it', () => {
    let read = 0;
    const o = {
      status: { phase: 'Running' },
      get spec() {
        read++;
        return { big: 'x' };
      },
    };
    expect([run('self.status.phase', o), read]).toEqual(['Running', 0]);
  });
});

describe('given by anyone (bound)', () => {
  const bound = createCel({ bound: { size: 1000, cost: 1_000_000 } });
  const doubled = `cel.bind(a, "aaaa", ${'abcdefghijklmnopqrstuvw'
    .split('')
    .slice(1)
    .map((v, i) => `cel.bind(${v}, ${'abcdefghijklmnopqrstuvw'[i]} + ${'abcdefghijklmnopqrstuvw'[i]}, `)
    .join('')}w${')'.repeat(23)}`;
  it.each([
    ['comprehensions three deep', 'self.l.map(a, self.l.map(b, self.l.map(c, 1))).size()', 'too_costly'],
    ['a string doubled again and again', doubled, 'too_costly'],
    ['a regex (JS backtracks)', 'self.s.matches("^(a+)+$")', 'bad_cel'],
  ])('refuses what may cost too much: %s', (_, expression, code) => {
    expect(error(() => bound.compile(expression))).toBe(code);
  });

  it('holds its input to the bound: a longer list of self, too_big', () => {
    expect(error(() => run('size(self.l)', { l: Array.from({ length: 2000 }, () => 1) }, bound))).toBe('too_big');
    expect(run('size(self.l)', { l: [1, 2] }, bound)).toBe(2);
  });
});

describe('a function of CEL', () => {
  it('is worked out once for each object, however many expressions ask it (its error too)', () => {
    let worked = 0;
    const counting = createCel({ functions: { twice: 'self.n * 2', broken: 'self.n / 0' } });
    const o = {
      get n() {
        worked++;
        return 5;
      },
    };
    expect([counting.compile('twice(self) + 1')(o), counting.compile('twice(self) - 1')(o), worked]).toEqual([11, 9, 1]);
    const p = {
      get n() {
        worked++;
        return 5;
      },
    };
    expect([error(() => counting.compile('broken(self)')(p)), error(() => counting.compile('broken(self) + 1')(p)), worked]).toEqual(['division_by_zero', 'division_by_zero', 2]);
  });

  it('calls another, never round; a name of CEL’s own or one that is none, refused', () => {
    expect(run('two(self)', { n: 3 }, createCel({ functions: { one: 'self.n + 1', two: 'one(self) * 2' } }))).toBe(8);
    expect(error(() => createCel({ functions: { a: 'b(self)', b: 'a(self)' } }))).toBe('bad_function');
    expect(error(() => createCel({ functions: { size: 'self.n' } }))).toBe('bad_function');
    expect(error(() => createCel({ functions: { bad: 'self.(' } }))).toBe('bad_function');
  });
});

describe('a field’s version', () => {
  const v = (def: Parameters<typeof versionOf>[0], c = cel) => versionOf(def, c).version;
  it('is of what its values are: not its spaces, its kinds, its unit', () => {
    expect(v({ type: 'string', value: { cel: 'self.status.phase' } })).toBe(v({ type: 'string', kinds: ['pods.v1'], value: { cel: '  self . status.phase ' } }));
    expect(v({ type: 'number', value: '.n' })).toBe(v({ type: 'number', unit: 'bytes', value: '.n' }));
    expect(v({ type: 'string', value: '.a' })).not.toBe(v({ type: 'number', value: '.a' }));
  });

  it('is of the functions it calls, and those they call: one changed, it changed', () => {
    const of = (body: string) => v({ type: 'number', value: { cel: 'two(self)' } }, createCel({ functions: { one: body, two: 'one(self) * 2' } }));
    expect(of('self.n + 1')).not.toBe(of('self.n + 2'));
    expect(v({ type: 'number', value: { cel: 'one(self)' } }, createCel({ functions: { one: '1', other: '1' } }))).toBe(
      v({ type: 'number', value: { cel: 'one(self)' } }, createCel({ functions: { one: '1', other: '2' } })),
    );
  });
});

describe('a catalog', () => {
  it('versions a joined field by what it reads: the field it joins changed, its version too', () => {
    const joined = (a: string) =>
      prepareCatalog({ fields: { 'acme.size': { type: 'number', value: { from: 'things.v1', field: 'acme.n' } }, 'acme.n': { kinds: ['things.v1'], type: 'number', value: a } } })
        .catalog.fields['acme.size']?.version;
    expect(joined('.a')).toMatch(/^[0-9a-f]{16}$/);
    expect(joined('.a')).not.toBe(joined('.b'));
  });

  it('is checked (anything may be given), versioned anew, laid over another, frozen', () => {
    const base = { fields: { a: { type: 'string' as const, value: '.a' as const }, b: { type: 'number' as const, value: { cel: 'one(self)' } } }, functions: { one: '1' } };
    const { catalog, rejected } = prepareCatalog(
      layer(base, {
        fields: { a: { type: 'string', value: '.b' }, bad: { type: 'nope', value: '.x' }, broken: { type: 'number', value: { cel: 'slef' } } },
        functions: {},
      } as never),
    );
    expect([catalog.fields.a.value, Object.keys(catalog.fields).sort(), Object.keys(rejected).sort(), Object.isFrozen(catalog.fields)]).toEqual([
      '.b',
      ['a', 'b'],
      ['bad', 'broken'],
      true,
    ]);
    expect(catalog.fields.b.version).toBe(versionOf({ type: 'number', value: { cel: 'one(self)' } }, createCel({ functions: { one: '1' } })).version);
    expect(() => prepareCatalog({ fields: { x: null } })).not.toThrow();
    expect(prepareCatalog('nope').rejected).toEqual({ '': 'a catalog is { fields: { name: definition }, functions? }' });
  });
});

describe('what the last review found', () => {
  it('gives a function a value of CEL as it is (a uint, a timestamp: not made into values again)', () => {
    const c = createCel({ functions: { leaf: 'self.a', at: 'self.t' } });
    expect([run('leaf({"a": 1u})', {}, c), run('at({"t": timestamp("2026-01-01T00:00:00Z")})', {}, c)]).toEqual([1, Date.UTC(2026, 0, 1)]);
  });

  it('checks a function’s body as it is made: a name it does not know, a type that is none, too deep — bad_function, nothing thrown else', () => {
    for (const body of ['nope', '1 + true', Array.from({ length: 3000 }, () => '1').join(' + '), `${'!'.repeat(3000)}true`]) {
      expect(error(() => createCel({ functions: { f: body } }))).toBe('bad_function');
    }
  });

  it('holds a function of CEL to the bound too: its regex, its input', () => {
    const bounded = createCel({ functions: { rx: 'self.s.matches("^(a+)+$")', n: 'size(self.l)' }, bound: { size: 10, cost: 1_000_000 } });
    expect(error(() => bounded.compile('rx(self)'))).toBe('bad_cel');
    expect(error(() => run('n(self)', { l: Array.from({ length: 100 }, () => 1) }, bounded))).toBe('too_big');
  });

  it('holds what is read to the bound, whatever was made of it before (by one not bounded), a map’s keys too', () => {
    const o = { spec: { l: Array.from({ length: 100 }, () => 1) } };
    expect(run('size(self.spec)', o)).toBe(1);
    const bounded = createCel({ bound: { size: 10, cost: 1_000_000 } });
    expect(error(() => run('cel.bind(s, self.spec, s.l.size())', o, bounded))).toBe('too_big');
    expect(error(() => run('size(self.m)', { m: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, i])) }, bounded))).toBe('too_big');
  });

  it('reads a key named __proto__ as any, read in part or whole', () => {
    const o = JSON.parse('{"__proto__": {"x": 7}}');
    expect([run('self["__proto__"].x', o), run('size(self)', o)]).toEqual([7, 1]);
  });

  it('compares numbers exactly (ints past a double’s integers, uints), sums within an int64, has distinct and sort', () => {
    expect(run('[9007199254740992, 9007199254740993].indexOf(9007199254740993)')).toBe(1);
    expect(run('[1u, 2u].indexOf(2u)')).toBe(1);
    expect(error(() => run('[9223372036854775807, 1].sum()'))).toBe('numeric_overflow');
    expect([run('["b", "a", "b"].distinct().sort()'), run('[3, 1, 2].sort()')]).toEqual([
      ['a', 'b'],
      [1, 2, 3],
    ]);
    expect(error(() => run('[1, "a"].sort()'))).toBe('no_such_overload');
  });

  it('has functions’ versions of 64 bits', () => {
    expect(createCel({ functions: { f: '1' } }).functionVersion('f')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('prepares a catalog without throwing (functions that are none: under ""), its input left as it was, any name a name, trusted fields not bound', () => {
    const input = { fields: { ['__proto__']: { type: 'string', kinds: ['k'], value: '.a' }, f: { type: 'number', value: { cel: 'f(self)' } } }, functions: { f: 'nope' } };
    const { catalog, rejected } = prepareCatalog(JSON.parse(JSON.stringify(input)));
    expect([Object.keys(catalog.fields), Object.keys(rejected).sort()]).toEqual([['__proto__'], ['', 'f']]);
    const given = { fields: { a: { type: 'string', kinds: ['k'], value: '.a' } } };
    prepareCatalog(given);
    expect(Object.isFrozen(given.fields.a.kinds)).toBe(false);
    const costly = { fields: { big: { type: 'number', value: { cel: 'self.l.map(a, self.l.map(b, self.l.map(c, 1))).size()' } } } };
    expect([Object.keys(prepareCatalog(costly, { bound: DEFAULT }).rejected), Object.keys(prepareCatalog(costly, { bound: DEFAULT, trusted: ['big'] }).rejected)]).toEqual([
      ['big'],
      [],
    ]);
  });

  it('reads a quantity of 19 digits as apimachinery v0.35 does: no int64 (18 at most)', () => {
    expect([parseQuantity('9223372036854775807')?.integer(), parseQuantity('999999999999999999')?.integer()]).toEqual([undefined, 999999999999999999n]);
  });
});

const DEFAULT = { size: 1000, cost: 1_000_000 };
