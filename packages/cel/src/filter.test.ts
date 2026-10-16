import { type Fields, matches } from '@overkube/query';
import { describe, expect, it } from 'vitest';
import { desugar } from './filter.ts';
import { CelError, createCel, declared, filterCaret, filterParts, filterVariables, planFilter, resugar } from './index.ts';

const VARIABLES = filterVariables('pods.v1', {
  'core.name': { type: 'string' },
  'core.ready': { type: 'string' },
  'core.created': { type: 'time' },
  'core.namespace': { type: 'string' },
  'core.labels': { type: 'string', many: true },
  'core.label.keys': { type: 'string', many: true },
  'pods.v1.status': { type: 'string' },
  'pods.v1.restarts': { type: 'number' },
  'pods.v1.node': { type: 'string' },
  'pods.v1.ready': { type: 'bool' },
  'pods.v1.images': { type: 'string', many: true },
  'pods.v1.cpu-requests': { type: 'number' },
  'nodes.v1.roles': { type: 'string', many: true },
  '.spec.nodeName': { type: 'string' },
});
const LABEL = (k: string) => `labels[?"${k}"].orValue("")`;
const cel = createCel();
const plan = (text: string) => planFilter(text, VARIABLES, cel);

describe('filterVariables', () => {
  it('names a kind’s fields and every kind’s by their short names (one name of both: the kind’s); paths, labels, other kinds’ aside', () => {
    expect(VARIABLES.map((v) => `${v.name}:${v.field}`)).toEqual([
      'name:core.name',
      'ready:pods.v1.ready',
      'created:core.created',
      'namespace_:core.namespace',
      'status:pods.v1.status',
      'restarts:pods.v1.restarts',
      'node:pods.v1.node',
      'images:pods.v1.images',
      'cpu_requests:pods.v1.cpu-requests',
    ]);
  });
});

describe('desugar', () => {
  it.each([
    ['status = Running', 'status == "Running"'],
    ['restarts > 3 and node = kube-1', 'restarts > 3 && node == "kube-1"'],
    ['status in (Error, CrashLoopBackOff)', 'status in ["Error", "CrashLoopBackOff"]'],
    ['labels.app = web', `${LABEL('app')} == "web"`],
    ['labels.app.kubernetes.io/name = web', `${LABEL('app.kubernetes.io/name')} == "web"`],
    ['labels.size() > 2', 'labels.size() > 2'],
    ['images = nginx', '"nginx" in images'],
    ['images != "nginx:1" or ready', '!("nginx:1" in images) || ready'],
    ['restarts > -1', 'restarts > -1'],
    ['name = 2nd-node', 'name == "2nd-node"'],
    ['self.metadata.namespace = shop', 'self.metadata.namespace == "shop"'],
    ['not status = Running or ready', '!( status == "Running" )|| ready'],
    ['not (status = Running)', '!( (status == "Running"))'],
    ['status == "Running" && restarts >= 1', 'status == "Running" && restarts >= 1'],
    ['ready = true', 'ready == true'],
    ['namespace = shop', 'namespace_ == "shop"'],
    ['web Api', 'name.lowerAscii().contains("web") && name.lowerAscii().contains("api")'],
    ['"my pod" web.shop', 'name.lowerAscii().contains("my pod") && name.lowerAscii().contains("web.shop")'],
    ['app=web,tier in (a, b),!canary', `${LABEL('app')} == "web" && ${LABEL('tier')} in ["a","b"] && !("canary" in labels)`],
    ['app!=web,env notin (dev)', `${LABEL('app')} != "web" && !(${LABEL('env')} in ["dev"])`],
    ['node.kubernetes.io/role=master', `${LABEL('node.kubernetes.io/role')} == "master"`],
    ['images == images', 'images == images'],
    ['images == ["nginx"]', 'images == ["nginx"]'],
    ['images in (nginx, envoy)', 'images.exists(it, it in ["nginx", "envoy"])'],
    ['status IN (a)', 'status in ["a"]'],
    ['node = selfhosted', 'node == "selfhosted"'],
    ['created > 2026-01-01T00:00:00Z', 'created > timestamp("2026-01-01T00:00:00Z")'],
    ['created <= "2026-01-01T00:00:00Z"', 'created <= timestamp("2026-01-01T00:00:00Z")'],
  ])('%s', (text, expected) => {
    expect(desugar(text, VARIABLES).cel).toBe(expected);
  });

  it('takes a variable’s name, not a selector’s key: status=Running is the field', () => {
    expect(desugar('status=Running', VARIABLES).cel).toBe('status=="Running"');
  });
});

describe('planFilter', () => {
  it('asks a query what a where says', () => {
    expect(plan('status = Running and restarts > 3')).toEqual({
      cel: 'status == "Running" && restarts > 3',
      where: {
        op: 'and',
        args: [
          { field: 'pods.v1.status', op: 'eq', value: 'Running' },
          { field: 'pods.v1.restarts', op: 'range', gt: 3 },
        ],
      },
    });
  });

  it.each([
    ['3 < restarts', { field: 'pods.v1.restarts', op: 'range', gt: 3 }],
    ['status != Running', { field: 'pods.v1.status', op: 'ne', value: 'Running' }],
    ['status in (Error, Unknown)', { field: 'pods.v1.status', op: 'in', values: ['Error', 'Unknown'] }],
    ['labels.app = web', { field: 'core.labels', op: 'eq', value: 'app=web' }],
    ['labels.tier in (a, b)', { field: 'core.labels', op: 'in', values: ['tier=a', 'tier=b'] }],
    ['"app" in labels', { field: 'core.label.keys', op: 'eq', value: 'app' }],
    ['"nginx" in images', { field: 'pods.v1.images', op: 'eq', value: 'nginx' }],
    ['ready', { field: 'pods.v1.ready', op: 'eq', value: true }],
    ['web', { field: 'core.name', op: 'contains', value: 'web' }],
    ['images = nginx', { field: 'pods.v1.images', op: 'eq', value: 'nginx' }],
    ['restarts >= -1', { field: 'pods.v1.restarts', op: 'range', gte: -1 }],
    ['created > 2026-01-01T00:00:00Z', { field: 'core.created', op: 'range', gt: '2026-01-01T00:00:00Z' }],
    ['app!=web', { op: 'not', arg: { field: 'core.labels', op: 'eq', value: 'app=web' } }],
    ['not ready', { field: 'pods.v1.ready', op: 'eq', value: false }],
    [
      'status = Error or restarts > 3',
      {
        op: 'or',
        args: [
          { field: 'pods.v1.status', op: 'eq', value: 'Error' },
          { field: 'pods.v1.restarts', op: 'range', gt: 3 },
        ],
      },
    ],
  ])('%s', (text, where) => {
    expect(plan(text)).toMatchObject({ where });
    expect(plan(text).rest).toBeUndefined();
  });

  it('leaves as CEL what a where cannot say, to work out of each object', () => {
    const p = plan('status = Running and self.spec.containers.size() > 1 and (ready or restarts + 1 > 2)');
    expect(p.where).toEqual({ field: 'pods.v1.status', op: 'eq', value: 'Running' });
    expect(p.rest).toBe('(self.spec.containers.size() > 1) && (ready || restarts + 1 > 2)');
    expect(plan('ready and not (self.a == 1)').rest).toBe('(!(self.a == 1))');
    expect(plan('ready and (restarts + 1) * 2 > 4').rest).toBe('((restarts + 1) * 2 > 4)');
    const rest = cel.withVariables(declared(VARIABLES)).compile(p.rest as string);
    const pod = { spec: { containers: [{}, {}] } };
    expect(rest(pod, { ready: false, restarts: 2 })).toBe(true);
    expect(rest(pod, { ready: false, restarts: 1 })).toBe(false);
  });

  it('says where an error is in what was typed', () => {
    const wrong = (text: string) => {
      try {
        plan(text);
      } catch (e) {
        expect(e).toBeInstanceOf(CelError);
        const at = (e as CelError).at as { start: number; end: number };
        return text.slice(at.start, at.end);
      }
      throw new Error('no error');
    };
    expect(wrong('status = Running and phase = x')).toBe('phase');
    expect(wrong('restarts > 3 and')).toBe('');
    expect(wrong('1 + 2')).toBe('1 + 2');
    expect(wrong('status = 3')).toBe('status = 3');
    expect(wrong('ready and labels.app')).toBe('labels.app');
    expect(wrong('restarts or ready')).toBe('restarts');
  });

  it.each([
    ['a time compared to a time not CEL’s (a where’s: RFC 3339 alike)', 'self.metadata.creationTimestamp == "x"'],
    ['a string’s range (a where orders strings as names are)', 'status > a'],
    ['a list compared as a value', '["a"] == images'],
    ['a label’s having none', 'labels.app = ""'],
  ])('leaves %s as CEL', (_, text) => {
    expect(plan(text).where).toBeUndefined();
  });

  it('keeps a where’s contains (ASCII’s case aside) as CEL too, and no not of it', () => {
    expect(plan('name.contains("Web")')).toMatchObject({ where: { field: 'core.name', op: 'contains', value: 'Web' }, rest: '(name.contains("Web"))' });
    expect(plan('web').rest).toBeUndefined();
    expect(plan('not name.contains("web")')).toEqual({ cel: '!( name.contains("web"))', rest: '(!name.contains("web"))' });
  });
});

/** Pods as a filter's variables have them, and as fields: a where asked of them, what is left worked out — just what all of it, as CEL, is. */
describe('a plan, as its CEL', () => {
  type Pod = { name: string; status?: string; restarts?: number; ready?: boolean; created?: string; images: string[]; labels: Record<string, string> };
  const pods: Pod[] = [
    { name: 'web-1', status: 'Running', restarts: 0, ready: true, created: '2026-01-01T00:00:00Z', images: ['nginx'], labels: { app: 'web', tier: 'a' } },
    { name: 'Web-2', status: 'Pending', restarts: 4, ready: false, images: ['nginx', 'envoy'], labels: { app: 'web' } },
    { name: 'db-0', status: 'Running', restarts: 9, ready: true, images: ['postgres'], labels: { app: 'db', tier: 'b' } },
    { name: 'job', images: [], labels: {} },
  ];
  const fields: Fields = new Map([
    ['core.name', { type: 'string', value: (p: Pod) => p.name }],
    ['pods.v1.status', { type: 'string', value: (p: Pod) => p.status }],
    ['pods.v1.restarts', { type: 'number', value: (p: Pod) => p.restarts }],
    ['pods.v1.ready', { type: 'bool', value: (p: Pod) => p.ready }],
    ['core.created', { type: 'time', value: (p: Pod) => p.created }],
    ['pods.v1.images', { type: 'string', many: true, value: (p: Pod) => p.images }],
    ['core.labels', { type: 'string', many: true, value: (p: Pod) => Object.entries(p.labels).map(([k, v]) => `${k}=${v}`) }],
    ['core.label.keys', { type: 'string', many: true, value: (p: Pod) => Object.keys(p.labels) }],
  ] as const);
  const env = cel.withVariables(declared(VARIABLES));
  const run = (expression: string, p: Pod) => env.compile(expression)(p, { ...p, namespace_: 'shop', created: p.created ? new Date(p.created) : null }) === true;

  it.each([
    'status = Running and restarts > 3',
    'status != Running',
    'not ready',
    'not (ready and status = Running)',
    'not status in (Running)',
    'not restarts > 3',
    'not (status = Running or labels.app = db)',
    'images = nginx',
    'images != nginx',
    'labels.app = web',
    'labels.app != web',
    'not labels.tier in (a)',
    'app!=web,tier notin (b)',
    '"tier" in labels',
    'web',
    'name.contains("Web")',
    'not name.contains("Web")',
    'restarts > 3 or self.name == "job"',
    'not not ready',
    '!!ready or self.name == "x"',
    'created = 2026-01-01T00:00:00Z',
    'created = 2026-01-01T00:00:00Z or self.name == "other"',
    'created > 2025-06-01T00:00:00Z',
    'images in (envoy, postgres)',
  ])('%s', (text) => {
    const p = plan(text);
    for (const pod of pods) expect([pod.name, matches(pod, p.where, fields) && (!p.rest || run(p.rest, pod))]).toEqual([pod.name, run(p.cel, pod)]);
  });
});

describe('resugar', () => {
  it.each([
    'status = Running and restarts > 3',
    'status in (Error, CrashLoopBackOff)',
    'labels.app = web',
    'labels.app.kubernetes.io/name != web',
    'images = nginx',
    'images != "nginx:1"',
    'not ready or status = "two words"',
    'not (status = Running or restarts > 3)',
    '(status = a or status = b) and ready',
    'namespace = shop',
    'web api',
    'status = "and"',
    'self.spec.containers.size() > 1 and status = Running',
    '"app" in labels',
    'restarts > -1',
    'status = Running or "kube-1" == node',
  ])('%s: typed back as it was, the same CEL', (text) => {
    const { cel: expression } = desugar(text, VARIABLES);
    const back = resugar(expression, VARIABLES, cel);
    expect(desugar(back, VARIABLES).cel.replace(/\s+/g, '')).toBe(expression.replace(/\s+/g, ''));
  });

  it('says it as a user types it', () => {
    const back = (text: string) => resugar(desugar(text, VARIABLES).cel, VARIABLES, cel);
    expect(back('app=web,tier in (a,b)')).toBe('labels.app = web and labels.tier in (a, b)');
    expect(back('namespace = shop and images = nginx')).toBe('namespace = shop and images = nginx');
    expect(back('Web')).toBe('web');
    expect(back('status == "Running" && !ready')).toBe('status = Running and not ready');
    expect(resugar('not CEL at all (', VARIABLES, cel)).toBe('not CEL at all (');
  });
});

describe('filterParts', () => {
  it('says what each part is: a field, an operator, a value', () => {
    const text = 'status = Running and labels.app in (web, "a b") or restarts > 3 or self.x.size() == 1';
    const kinds = filterParts(text, VARIABLES).map((p) => `${text.slice(p.start, p.end)}:${p.kind}`);
    expect(kinds).toEqual([
      'status:field',
      '=:op',
      'Running:value',
      'and:keyword',
      'labels.app:field',
      'in:keyword',
      '(:punct',
      'web:value',
      ',:punct',
      '"a b":string',
      '):punct',
      'or:keyword',
      'restarts:field',
      '>:op',
      '3:number',
      'or:keyword',
      'self:field',
      '.:punct',
      'x:field',
      '.:punct',
      'size:function',
      '(:punct',
      '):punct',
      '==:op',
      '1:number',
    ]);
  });
});

describe('filterCaret', () => {
  const at = (marked: string) => {
    const caret = marked.indexOf('|');
    const text = marked.replace('|', '');
    const c = filterCaret(text, caret, VARIABLES);
    return (
      c && {
        want: c.want,
        typed: c.typed,
        ...(c.variable ? { variable: c.variable.name } : {}),
        ...(c.label !== undefined ? { label: c.label } : {}),
        ...(c.field !== undefined ? { field: c.field } : {}),
      }
    );
  };
  it.each([
    ['|', { want: 'field', typed: '' }],
    ['sta|', { want: 'field', typed: 'sta' }],
    ['status |', { want: 'op', typed: '', variable: 'status', field: 'status' }],
    ['(labels.app |', { want: 'op', typed: '', label: 'app', field: 'labels.app' }],
    ['status = Ru|', { want: 'value', typed: 'Ru', variable: 'status', field: 'status' }],
    ['namespace = |', { want: 'value', typed: '', variable: 'namespace_', field: 'namespace' }],
    ['status in (a, |', { want: 'value', typed: '', variable: 'status', field: 'status' }],
    ['age > |', { want: 'value', typed: '', field: 'age' }],
    ['status = Running |', { want: 'join', typed: '' }],
    ['status = Running and (re|', { want: 'field', typed: 're' }],
    ['labels.a|', { want: 'label', typed: 'a' }],
    ['ready and labels.|', { want: 'label', typed: '' }],
    ['labels.app = w|', { want: 'value', typed: 'w', label: 'app', field: 'labels.app' }],
  ])('%s', (marked, expected) => {
    expect(at(marked)).toEqual(expected);
  });

  it('none in a string', () => {
    expect(at('status = "Ru|nning"')).toBeUndefined();
  });
});

/** Times as a user says them: of the page's clock, now's, an age. */
describe('times', () => {
  const stamp = (cel: string) => /timestamp\("([^"]+)"\)/.exec(cel)?.[1] ?? '';
  const midnight = (days: number) => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
  };

  it.each([
    ['age > 2h', '(now - created) > duration("7200s")'],
    ['age <= 1d12h', '(now - created) <= duration("129600s")'],
    ['created > now-2h', 'created > now - duration("7200s")'],
    ['created < now', 'created < now'],
    ['created > 2026-01-01T00:00:00Z', 'created > timestamp("2026-01-01T00:00:00Z")'],
    ['created > now - 2h', 'created > now - duration("7200s")'],
    ['age > 2h and restarts in (1, 2)', '(now - created) > duration("7200s") && restarts in [1, 2]'],
    ['created > today and status in (Running)', ''],
  ])('%s', (text, expected) => {
    const { cel } = desugar(text, VARIABLES);
    if (expected) expect(cel).toBe(expected);
    else expect(cel).toMatch(/&& status in \["Running"\]$/);
  });

  it('takes a day, a day and time, today, yesterday as the page’s clock has them', () => {
    expect(new Date(stamp(desugar('created > 2026-10-01', VARIABLES).cel)).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(stamp(desugar('created < "2026-10-01 14:30"', VARIABLES).cel)).getTime()).toBe(new Date(2026, 9, 1, 14, 30).getTime());
    expect(new Date(stamp(desugar('created >= today', VARIABLES).cel)).getTime()).toBe(midnight(0));
    expect(new Date(stamp(desugar('created >= yesterday', VARIABLES).cel)).getTime()).toBe(midnight(-1));
  });

  it('says what a time is, an age, where one is not', () => {
    const wrong = (text: string) => {
      try {
        plan(text);
      } catch (e) {
        const at = (e as CelError).at as { start: number; end: number };
        return [text.slice(at.start, at.end), (e as Error).message];
      }
      throw new Error('no error');
    };
    expect(wrong('created > 594')).toEqual(['594', 'created is a time: 2026-10-01, "2026-10-01 14:00", today, now-2h — or age > 2h']);
    expect(wrong('ready and created > soon')).toEqual(['soon', 'created is a time: 2026-10-01, "2026-10-01 14:00", today, now-2h — or age > 2h']);
    expect(wrong('age > 5')).toEqual(['5', 'age is a duration: 30m, 2h, 7d, 1w']);
    expect(wrong('created > 2026-02-30')).toEqual(['2026-02-30', 'created is a time: 2026-10-01, "2026-10-01 14:00", today, now-2h — or age > 2h']);
  });

  it('works out an age, now’s, as of now; leaves them to CEL (now is the answer’s)', () => {
    expect([plan('age > 2h').now, plan('self.metadata.name == "now"').now, plan('status = Running').now]).toEqual([true, undefined, undefined]);
    const p = plan('age > 2h and created > now-1d');
    expect([p.where, p.rest]).toEqual([undefined, '(now - created > duration("7200s")) && (created > now - duration("86400s"))']);
    const run = cel.withVariables(declared(VARIABLES)).compile(p.rest as string);
    const now = new Date('2026-10-16T12:00:00Z');
    expect(run({}, { now, created: new Date('2026-10-16T09:00:00Z') })).toBe(true);
    expect(run({}, { now, created: new Date('2026-10-16T11:00:00Z') })).toBe(false);
    expect(run({}, { now, created: new Date('2026-10-14T11:00:00Z') })).toBe(false);
  });

  it.each(['age > 2h', 'age <= 1d1h and ready', 'created > now-2h', 'created > 2026-10-01', 'created < "2026-10-01 14:30"', 'created > 2026-01-01T00:00:00Z'])(
    '%s: typed back as it was',
    (text) => {
      expect(resugar(desugar(text, VARIABLES).cel, VARIABLES, cel)).toBe(text);
    },
  );
});
