/*
 * A certificate read (as a TLS secret holds it: PEM, its chain after it):
 * when it is valid from and till, whom it is of and by (their names as RFC
 * 4514 writes them: the last part first, each value escaped; its common
 * name as it is), the names it is good for (its subject alternative names,
 * by their type; an IP address as ipOf writes it), its key (its algorithm,
 * its size or curve), its serial. A certificate signing request (PKCS #10)
 * alike: whom it asks for, the names it asks for, its key. DER read as far
 * as these need, its structure checked (each element's tag where these
 * are, lengths within their element, dates that are dates) — nothing else
 * (no signature, no chain). Not one: undefined.
 */

/** Subject alternative names, by their type. */
export interface AltNames {
  dns: string[];
  ip: string[];
  email: string[];
  uri: string[];
}

export interface Certificate {
  notBefore: number;
  notAfter: number;
  subject: string;
  /** Its subject's common name (CN), as it is; none: undefined. */
  commonName: string | undefined;
  issuer: string;
  names: AltNames;
  key: string;
  serial: string;
  /** How many more certificates follow it (its chain). */
  chain: number;
}

interface Node {
  tag: number;
  /** Its content's bytes. */
  body: Uint8Array;
}

const SEQUENCE = 0x30;
const SET = 0x31;
const INTEGER = 0x02;
const BIT_STRING = 0x03;
const OCTET_STRING = 0x04;
const OID = 0x06;

/** The DER elements in bytes, one after another: short tags, definite lengths within the bytes. */
function read(bytes: Uint8Array): Node[] {
  const nodes: Node[] = [];
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i++] as number;
    if ((tag & 0x1f) === 0x1f || i >= bytes.length) throw new Error('tag');
    let length = bytes[i++] as number;
    if (length & 0x80) {
      const n = length & 0x7f;
      if (n === 0 || n > 4 || i + n > bytes.length) throw new Error('length');
      length = 0;
      for (let j = 0; j < n; j++) length = length * 256 + (bytes[i++] as number);
    }
    if (i + length > bytes.length) throw new Error('truncated');
    nodes.push({ tag, body: bytes.subarray(i, i + length) });
    i += length;
  }
  return nodes;
}

/** An element of this tag (none, or another: not one). */
function must(node: Node | undefined, tag: number): Node {
  if (node?.tag !== tag) throw new Error(`expected tag ${tag}`);
  return node;
}

/** A constructed element's elements. */
const inside = (node: Node | undefined) => (node ? read(node.body) : []);

function oid(node: Node | undefined): string {
  const body = must(node, OID).body;
  if (!body.length || (body[body.length - 1] as number) & 0x80) throw new Error('oid');
  const first = body[0] as number;
  const parts = [Math.min(Math.floor(first / 40), 2), first - Math.min(Math.floor(first / 40), 2) * 40];
  let v = 0;
  for (const b of body.subarray(1)) {
    v = v * 128 + (b & 0x7f);
    if (!(b & 0x80)) {
      parts.push(v);
      v = 0;
    }
  }
  return parts.join('.');
}

const utf8 = new TextDecoder('utf-8');
const latin1 = new TextDecoder('latin1');

/** A string element's text, by its type: UTF-8; BMP (UTF-16), Universal (UTF-32), big-endian; the others' bytes as they are. */
function text(node: Node | undefined): string {
  const body = node?.body ?? new Uint8Array();
  if (node?.tag === 0x1e) {
    let s = '';
    for (let i = 0; i + 1 < body.length; i += 2) s += String.fromCharCode(((body[i] as number) << 8) | (body[i + 1] as number));
    return s;
  }
  if (node?.tag === 0x1c) {
    let s = '';
    for (let i = 0; i + 3 < body.length; i += 4)
      s += String.fromCodePoint(((body[i] as number) << 24) | ((body[i + 1] as number) << 16) | ((body[i + 2] as number) << 8) | (body[i + 3] as number));
    return s;
  }
  return node?.tag === 0x0c ? utf8.decode(body) : latin1.decode(body);
}

/** A UTCTime's or a GeneralizedTime's instant (ms); not a date (a 13th month, a 31st of April): NaN. */
function time(node: Node | undefined): number {
  const s = text(node);
  const m = node?.tag === 0x17 ? /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(s) : node?.tag === 0x18 ? /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?(\.\d+)?Z$/.exec(s) : null;
  if (!m) return Number.NaN;
  const [y, mo, d, h, mi, sec] = m.slice(1, 7).map((v) => Number(v ?? 0)) as [number, number, number, number, number, number];
  const year = node?.tag === 0x17 ? (y < 50 ? 2000 : 1900) + y : y;
  // Its year as it is (Date.UTC reads 0–99 as 1900–1999).
  const at = new Date(Date.UTC(2000, 0, 1, h, mi, sec));
  at.setUTCFullYear(year, mo - 1, d);
  const ms = at.getTime() + Math.round(Number(`0${m[7] ?? ''}`) * 1000);
  // Date.UTC carries what is too much into what is next: a date that is none is not the same once made.
  if (at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d || h > 23 || mi > 59 || sec > 59) return Number.NaN;
  return ms;
}

const ATTRIBUTES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.9': 'STREET',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.5': 'serialNumber',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.1': 'UID',
  '0.9.2342.19200300.100.1.25': 'DC',
};

/** A value as RFC 4514 writes it: its specials escaped (a comma in it is never taken for a part's end). */
const escaped = (value: string) =>
  value
    .replace(/[\\"+,;<>=]/g, (c) => `\\${c}`)
    .replace(/\0/g, '\\00')
    .replace(/^[ #]/, (c) => `\\${c}`)
    .replace(/ $/, '\\ ');

/** A name's parts: each relative name's attributes (type, value as it is). */
function parts(node: Node | undefined): { type: string; value: string }[][] {
  return inside(must(node, SEQUENCE)).map((set) =>
    inside(must(set, SET)).map((pair) => {
      const [type, value] = inside(must(pair, SEQUENCE));
      const id = oid(type);
      return { type: ATTRIBUTES[id] ?? id, value: text(value) };
    }),
  );
}

/** A name as RFC 4514 writes it: its parts, the last first (CN=…, O=…), a part's attributes joined by +. */
const nameOf = (rdns: { type: string; value: string }[][]) =>
  rdns
    .map((rdn) => rdn.map((a) => `${a.type}=${escaped(a.value)}`).join('+'))
    .reverse()
    .join(', ');

const commonNameOf = (rdns: { type: string; value: string }[][]) =>
  rdns
    .flat()
    .filter((a) => a.type === 'CN')
    .at(-1)?.value;

const CURVES: Record<string, string> = { '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521' };

/** A key's algorithm and its size (RSA: its modulus's bits) or curve. */
function key(info: Node | undefined): string {
  const [algorithm, bits] = inside(must(info, SEQUENCE));
  const [id, params] = inside(must(algorithm, SEQUENCE));
  const alg = oid(id);
  const value = must(bits, BIT_STRING).body;
  if (value.length < 2) throw new Error('key');
  if (alg === '1.2.840.113549.1.1.1') {
    // Its bit string: a byte of unused bits, then RSAPublicKey { modulus, exponent }.
    const [modulus] = inside(must(read(value.subarray(1))[0], SEQUENCE));
    const n = must(modulus, INTEGER).body;
    let start = 0;
    while (start < n.length && n[start] === 0) start++;
    if (start === n.length) throw new Error('modulus');
    const top = n[start] as number;
    return `RSA ${(n.length - start - 1) * 8 + Math.floor(Math.log2(top)) + 1}`;
  }
  if (alg === '1.2.840.10045.2.1') {
    const curve = oid(params);
    return `ECDSA ${CURVES[curve] ?? curve}`;
  }
  if (alg === '1.3.101.112') return 'Ed25519';
  if (alg === '1.3.101.113') return 'Ed448';
  return alg;
}

/** An IPv4 address (four bytes) or IPv6 one (sixteen) as text: IPv6 as RFC 5952 writes it (lower case, the longest run of zeros ::). */
function ipText(bytes: readonly number[]): string {
  if (bytes.length === 4) return bytes.join('.');
  const groups = Array.from({ length: 8 }, (_, i) => ((bytes[2 * i] as number) << 8) | (bytes[2 * i + 1] as number));
  let best = [-1, 0];
  for (let i = 0; i < 8; ) {
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > (best[1] as number) && j - i > 1) best = [i, j - i];
    i = j === i ? i + 1 : j;
  }
  const hex = groups.map((g) => g.toString(16));
  if ((best[0] as number) < 0) return hex.join(':');
  const [at, length] = best as [number, number];
  return `${hex.slice(0, at).join(':')}::${hex.slice(at + length).join(':')}`;
}

/** An IP address written as one is (192.168.0.1, 2001:db8:0:0::1, ::ffff:10.0.0.1), as this reads them: one way each; not one: undefined. */
export function ipOf(address: string): string | undefined {
  const v4 = (s: string) => {
    const p = s.split('.');
    return p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x) && Number(x) < 256) ? p.map(Number) : undefined;
  };
  const four = v4(address);
  if (four) return ipText(four);
  if (!address.includes(':') || address.split('::').length > 2) return undefined;
  const [head = '', tail] = address.split('::');
  const side = (s: string) => (s ? s.split(':') : []);
  const groups = [...side(head), ...(tail === undefined ? [] : side(tail))];
  // An IPv4 address last: its two groups.
  const last = groups.at(-1) ?? '';
  const embedded = last.includes('.') ? v4(last) : undefined;
  // Only last of all (none after ::, nor :: after it).
  if (last.includes('.') && (!embedded || (tail !== undefined && !side(tail).length))) return undefined;
  const words = embedded ? groups.slice(0, -1) : groups;
  if (!words.every((g) => /^[\da-f]{1,4}$/i.test(g))) return undefined;
  const count = words.length + (embedded ? 2 : 0);
  if (tail === undefined ? count !== 8 : count > 7) return undefined;
  const values = words.map((g) => Number.parseInt(g, 16));
  if (embedded) values.push(((embedded[0] as number) << 8) | (embedded[1] as number), ((embedded[2] as number) << 8) | (embedded[3] as number));
  const headCount = tail === undefined ? values.length : side(head).length;
  const full = [...values.slice(0, headCount), ...Array(8 - values.length).fill(0), ...values.slice(headCount)];
  return ipText(full.flatMap((g) => [g >> 8, g & 0xff]));
}

/** Its subject alternative names (an extensions' element, or a list of extensions), by their type. */
function names(extensions: readonly Node[]): AltNames {
  const out: AltNames = { dns: [], ip: [], email: [], uri: [] };
  for (const ext of extensions) {
    const parts = inside(must(ext, SEQUENCE));
    if (oid(parts[0]) !== '2.5.29.17') continue;
    for (const n of inside(must(read(must(parts.at(-1), OCTET_STRING).body)[0], SEQUENCE))) {
      if (n.tag === 0x82) out.dns.push(latin1.decode(n.body));
      else if (n.tag === 0x81) out.email.push(latin1.decode(n.body));
      else if (n.tag === 0x86) out.uri.push(latin1.decode(n.body));
      else if (n.tag === 0x87 && (n.body.length === 4 || n.body.length === 16)) out.ip.push(ipText([...n.body]));
    }
  }
  return out;
}

/**
 * The blocks of a label in PEM (CERTIFICATE, CERTIFICATE REQUEST), as DER.
 * A block's body has no dash (base64 has none): read in one pass, however
 * many BEGINs without an END it is given (a lazy match over anything would
 * be read again from each — a megabyte of them, seconds).
 */
function blocks(pem: string, label = 'CERTIFICATE'): Uint8Array[] {
  return [...pem.matchAll(new RegExp(`-----BEGIN ${label}-----([^-]*)-----END ${label}-----`, 'g'))].map((m) =>
    Uint8Array.from(atob((m[1] ?? '').replace(/\s+/g, '')), (c) => c.charCodeAt(0)),
  );
}

/** A signed thing's three parts (what is signed, the algorithm, the signature), checked; what is signed. */
function signed(der: Uint8Array): Node {
  const all = read(der);
  if (all.length !== 1) throw new Error('trailing');
  const [body, algorithm, signature] = inside(must(all[0], SEQUENCE));
  must(algorithm, SEQUENCE);
  must(signature, BIT_STRING);
  return must(body, SEQUENCE);
}

/** The first certificate in PEM (its chain counted); none, or not read: undefined. */
export function parseCertificate(pem: string): Certificate | undefined {
  try {
    const all = blocks(pem);
    const der = all[0];
    if (!der) return undefined;
    const fields = inside(signed(der));
    // Its version, where said ([0]), comes first.
    const at = fields[0]?.tag === 0xa0 ? 1 : 0;
    const [serial, , issuer, validity, subject, info] = fields.slice(at);
    const [from, till] = inside(must(validity, SEQUENCE));
    const notBefore = time(from);
    const notAfter = time(till);
    if (Number.isNaN(notBefore) || Number.isNaN(notAfter)) return undefined;
    let s = must(serial, INTEGER).body;
    while (s.length > 1 && s[0] === 0) s = s.subarray(1);
    const subjectParts = parts(subject);
    const extensions = fields.find((f) => f.tag === 0xa3);
    return {
      notBefore,
      notAfter,
      subject: nameOf(subjectParts),
      commonName: commonNameOf(subjectParts),
      issuer: nameOf(parts(issuer)),
      names: names(extensions ? inside(must(inside(extensions)[0], SEQUENCE)) : []),
      key: key(info),
      serial: [...s].map((b) => b.toString(16).padStart(2, '0')).join(':'),
      chain: all.length - 1,
    };
  } catch {
    return undefined;
  }
}

export interface Request {
  subject: string;
  commonName: string | undefined;
  names: AltNames;
  key: string;
}

/** What a certificate signing request (PEM) asks for: its subject, names (its extension request's), key; not read: undefined. */
export function parseRequest(pem: string): Request | undefined {
  try {
    const der = blocks(pem, 'CERTIFICATE REQUEST')[0];
    if (!der) return undefined;
    const [version, subject, info, attributes] = inside(signed(der));
    must(version, INTEGER);
    const subjectParts = parts(subject);
    // Its attributes ([0]): the extension request's value (a set holding its extensions) read as a certificate's extensions are.
    const asked = inside(attributes).find((a) => oid(inside(must(a, SEQUENCE))[0]) === '1.2.840.113549.1.9.14');
    const extensions = asked ? inside(must(inside(must(inside(asked)[1], SET))[0], SEQUENCE)) : [];
    return { subject: nameOf(subjectParts), commonName: commonNameOf(subjectParts), names: names(extensions), key: key(info) };
  } catch {
    return undefined;
  }
}
