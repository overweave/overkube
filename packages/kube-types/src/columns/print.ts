import type { KubeObject } from '../object.js';

/*
 * How kubectl shows a kind: its columns, in its order, each as kubectl
 * heads it and fills it — ported, by hand, from the Kubernetes API server's
 * printers (pkg/printers/internalversion/printers.go, v1.37.1) and the
 * helpers they use. Not generated: written once per kind, typed by the
 * kind's generated type. As the API server prints for kubectl: always as
 * -o wide (GenerateOptions{Wide: true} — nothing clipped), kubectl hiding
 * the columns of priority 1 unless asked. What kubectl counts from the time
 * it prints (an age, "5m ago") is counted from the context's now (live).
 * Each column has two sides: its value, what it is sorted by (a count, a
 * time in ms, bytes — none: undefined), and its display, its cell's text as
 * kubectl prints it. A time is its value as is (when): what is shown of it
 * (how long ago) changes as now does, the order of the rows does not.
 */

/** What a column's cell is drawn with: when it is (what an age is counted to), and every object of its kind listed with it (a default among them — as kubectl lists them, not only those shown). */
export interface PrintContext<O> {
  now: number;
  objects: readonly O[];
}

/** A column as kubectl has it: its header, its type, its priority (1: only with -o wide), its value and its cell. */
export interface PrinterColumn<O> {
  /** As kubectl heads it: "Ready", "Port(s)". */
  name: string;
  type: 'string' | 'integer' | 'number' | 'boolean' | 'date';
  /** 'name': the object's name (kubectl's own mark of it). */
  format?: 'name';
  /** 0 (none): shown; 1: only with -o wide. */
  priority?: number;
  /** What it is sorted by: a number (a count, a time in ms, bytes), a string; none: undefined. */
  value: (object: O, context: PrintContext<O>) => string | number | boolean | undefined;
  /** Its cell, as kubectl prints it. */
  display: (object: O, context: PrintContext<O>) => string;
}

/** The object's name: kubectl's first column of almost every kind. */
export const nameColumn: PrinterColumn<KubeObject> = { name: 'Name', type: 'string', format: 'name', value: (o) => o.metadata?.name, display: (o) => o.metadata?.name ?? '' };

/** How long ago the object was made: kubectl's Age of almost every kind. */
export const ageColumn: PrinterColumn<KubeObject> = {
  name: 'Age',
  type: 'string',
  value: (o) => time(o.metadata?.creationTimestamp),
  display: (o, { now }) => since(o.metadata?.creationTimestamp, now),
};

/**
 * What kubectl shows of a kind with no printer of its own (the API server's
 * default table): its name, when it was made (RFC 3339; never made: Go's
 * zero time).
 */
export const createdAtColumn: PrinterColumn<KubeObject> = {
  name: 'Created At',
  type: 'date',
  value: (o) => time(o.metadata?.creationTimestamp),
  display: (o) => {
    const at = time(o.metadata?.creationTimestamp);
    return at === undefined ? '0001-01-01T00:00:00Z' : new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
  },
};

/** The default table's columns: Name, Created At (kubectl get roles, and every kind with no printer). */
export const defaultColumns: PrinterColumn<KubeObject>[] = [nameColumn, createdAtColumn];

/** The first max of a list, "+ n more..." past them (n: all but max); none: "<unset>" (listWithMoreString). */
export function listWithMore(all: readonly string[], max = 3): string {
  if (all.length > max) return `${all.slice(0, max).join(',')} + ${all.length - max} more...`;
  return all.join(',') || '<unset>';
}

/** A host and a port, an IPv6 host in brackets (net.JoinHostPort). */
export function hostPort(host: string, port: number | string): string {
  return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}

/** A span of time as kubectl says it ("45s", "3m20s", "5h12m", "3d4h", "2y10d"): duration.HumanDuration. */
export function humanDuration(ms: number): string {
  const seconds = Math.trunc(ms / 1000);
  // A machine's clock off by up to 2s is now.
  if (seconds < -1) return '<invalid>';
  if (seconds < 0) return '0s';
  if (seconds < 60 * 2) return `${seconds}s`;
  const minutes = Math.trunc(ms / 60_000);
  if (minutes < 10) {
    const s = seconds % 60;
    return s === 0 ? `${minutes}m` : `${minutes}m${s}s`;
  }
  if (minutes < 60 * 3) return `${minutes}m`;
  const hours = Math.trunc(ms / 3_600_000);
  if (hours < 8) {
    const m = minutes % 60;
    return m === 0 ? `${hours}h` : `${hours}h${m}m`;
  }
  if (hours < 48) return `${hours}h`;
  if (hours < 24 * 8) {
    const h = hours % 24;
    return h === 0 ? `${Math.trunc(hours / 24)}d` : `${Math.trunc(hours / 24)}d${h}h`;
  }
  if (hours < 24 * 365 * 2) return `${Math.trunc(hours / 24)}d`;
  if (hours < 24 * 365 * 8) {
    const d = Math.trunc(hours / 24) % 365;
    return d === 0 ? `${Math.trunc(hours / 24 / 365)}y` : `${Math.trunc(hours / 24 / 365)}y${d}d`;
  }
  return `${Math.trunc(hours / 24 / 365)}y`;
}

/** A time as its value: ms since the epoch; none (or not to be read): undefined. */
export function time(at: string | undefined): number | undefined {
  const ms = at ? Date.parse(at) : Number.NaN;
  return Number.isNaN(ms) ? undefined : ms;
}

/** How long ago a time was, as kubectl says it; none: "<unknown>" (translateTimestampSince). */
export function since(at: string | undefined, now: number): string {
  const ms = time(at);
  return ms === undefined ? '<unknown>' : humanDuration(now - ms);
}

/** Labels as kubectl writes them: k=v, sorted, comma-joined; none: "<none>" (labels.FormatLabels). */
export function formatLabels(labels: Readonly<Record<string, string>> | undefined): string {
  const text = Object.entries(labels ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join(',');
  return text || '<none>';
}

interface LabelSelector {
  matchLabels?: Readonly<Record<string, string>>;
  matchExpressions?: readonly { key: string; operator: string; values?: readonly string[] }[];
}

/**
 * A label selector as a selector's string (labels.Selector.String): its
 * requirements sorted by key — k=v, k in (a,b), k notin (a,b), k, !k; none
 * (or nothing in it): "". An operator it does not know: undefined.
 */
export function selectorString(selector: LabelSelector | undefined): string | undefined {
  if (!selector) return '';
  const requirements: [string, string][] = Object.entries(selector.matchLabels ?? {}).map(([k, v]) => [k, `${k}=${v}`]);
  for (const e of selector.matchExpressions ?? []) {
    const values = [...(e.values ?? [])];
    const listed = values.length === 1 ? values[0] : values.sort().join(',');
    if (e.operator === 'In') requirements.push([e.key, `${e.key} in (${listed})`]);
    else if (e.operator === 'NotIn') requirements.push([e.key, `${e.key} notin (${listed})`]);
    else if (e.operator === 'Exists') requirements.push([e.key, e.key]);
    else if (e.operator === 'DoesNotExist') requirements.push([e.key, `!${e.key}`]);
    else return undefined;
  }
  return requirements
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, text]) => text)
    .join(',');
}

/** A label selector as kubectl prints it: its string; none: "<none>"; not to be read: "<error>" (metav1.FormatLabelSelector). */
export function formatLabelSelector(selector: LabelSelector | undefined): string {
  const text = selectorString(selector);
  return text === undefined ? '<error>' : text || '<none>';
}

/** Containers' names and images, comma-joined each (layoutContainerCells). */
export function containerCells(containers: readonly { name: string; image?: string }[] | undefined): { names: string; images: string } {
  const list = containers ?? [];
  return { names: list.map((c) => c.name).join(','), images: list.map((c) => c.image ?? '').join(',') };
}

/** A flag that may be unset: "True", "False", "<unset>" (printBoolPtr). */
export function boolPtr(value: boolean | undefined): string {
  return value === undefined ? '<unset>' : value ? 'True' : 'False';
}

/** A volume's access modes, short, in kubectl's order: RWO,ROX,RWX,RWOP (GetAccessModesAsString). */
export function accessModes(modes: readonly string[] | undefined): string {
  const given = new Set(modes ?? []);
  return [
    ['ReadWriteOnce', 'RWO'],
    ['ReadOnlyMany', 'ROX'],
    ['ReadWriteMany', 'RWX'],
    ['ReadWriteOncePod', 'RWOP'],
  ]
    .filter(([mode]) => given.has(mode))
    .map(([, short]) => short)
    .join(',');
}

/** The annotation a storage class was named by before spec.storageClassName (still read first). */
export const BETA_STORAGE_CLASS = 'volume.beta.kubernetes.io/storage-class';

/** A quantity's suffixes: decimal SI, binary (an exponent, e3, is a suffix of its own). */
const SUFFIXES = new Map<string, number>([
  ['n', 1e-9],
  ['u', 1e-6],
  ['m', 1e-3],
  ['', 1],
  ['k', 1e3],
  ['M', 1e6],
  ['G', 1e9],
  ['T', 1e12],
  ['P', 1e15],
  ['E', 1e18],
  ['Ki', 2 ** 10],
  ['Mi', 2 ** 20],
  ['Gi', 2 ** 30],
  ['Ti', 2 ** 40],
  ['Pi', 2 ** 50],
  ['Ei', 2 ** 60],
]);

/** A quantity as its value: a number ("10Gi": bytes, "500m": 0.5, "1e3": 1000); none (or not to be read): undefined. */
export function quantityValue(value: string | number | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const m = value?.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(?:[eE]([+-]?\d+)|([a-zA-Z]*))$/);
  if (!m) return undefined;
  const scale = m[2] !== undefined ? 10 ** Number(m[2]) : SUFFIXES.get(m[3]);
  const n = scale === undefined ? Number.NaN : Number(m[1]) * scale;
  return Number.isFinite(n) ? n : undefined;
}

/** A part of a whole ("1/3": 1 of 3) as its value: the share of it, sorted so; no whole: 0. */
export function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

/** kubectl's text as a value: its placeholders (none, empty) undefined — sorted last. */
export function known(text: string | undefined): string | undefined {
  return text === undefined || text === '' || /^<[a-z ]+>$/.test(text) ? undefined : text;
}

/** A quantity as kubectl prints it (as the API gives it); none: "0". */
export function quantity(value: string | number | undefined): string {
  return value === undefined ? '0' : String(value);
}
