/*
 * JSON as YAML, for showing an object (not for writing one: the page sends
 * JSON). Block style; strings quoted when YAML would read them otherwise.
 */

const PLAIN = /^[A-Za-z_./][\w ./:@-]*$/;
const SPECIAL = /^(true|false|yes|no|on|off|null|~|y|n)$/i;

function scalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const s = String(value);
  if (s.includes('\n')) return `|-\n${s}`; // indented by the caller
  if (s === '' || !PLAIN.test(s) || SPECIAL.test(s) || /^[\d.+-]/.test(s) || s.endsWith(' ') || s.includes(': ') || s.includes(' #')) return JSON.stringify(s);
  return s;
}

function key(k: string): string {
  return PLAIN.test(k) && !SPECIAL.test(k) && !k.includes(': ') ? k : JSON.stringify(k);
}

function block(text: string, indent: string): string {
  // A multi-line string: its lines under the key, indented.
  const [head, ...lines] = text.split('\n');
  return lines.length ? `${head}\n${lines.map((l) => `${indent}${l}`).join('\n')}` : head;
}

function dump(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value
      .map((item) => {
        if (item && typeof item === 'object' && !(Array.isArray(item) && !item.length) && Object.keys(item).length) {
          const inner = dump(item, `${indent}  `);
          return `${indent}- ${inner.slice(indent.length + 2)}`;
        }
        return `${indent}- ${block(scalarOrEmpty(item), `${indent}  `)}`;
      })
      .join('\n');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return '{}';
    return entries
      .map(([k, v]) => {
        if (v && typeof v === 'object' && Object.keys(v).length) return `${indent}${key(k)}:\n${dump(v, `${indent}  `)}`;
        return `${indent}${key(k)}: ${block(scalarOrEmpty(v), `${indent}  `)}`;
      })
      .join('\n');
  }
  return `${indent}${scalar(value)}`;
}

function scalarOrEmpty(value: unknown): string {
  if (Array.isArray(value)) return '[]';
  if (value && typeof value === 'object') return '{}';
  return scalar(value);
}

export function toYaml(value: unknown): string {
  return `${dump(value, '')}\n`;
}
