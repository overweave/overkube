/*
 * A certificate read (as a TLS secret holds it: PEM, its chain after it):
 * when it is valid from and till, whom it is of and by (their names as RFC
 * 4514 writes them: the last part first), the names it is good for (its
 * subject alternative names), its key (its algorithm, its size or curve),
 * its serial — DER read as far as these need, nothing checked (no
 * signature, no chain). A certificate signing request (PKCS #10) alike:
 * whom it asks for, the names it asks for, its key. Not one: undefined.
 */

export interface Certificate {
  notBefore: number;
  notAfter: number;
  subject: string;
  issuer: string;
  names: string[];
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

/** The DER elements in bytes, one after another. */
function read(bytes: Uint8Array): Node[] {
  const nodes: Node[] = [];
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i++] as number;
    let length = bytes[i++] as number;
    if (length & 0x80) {
      const n = length & 0x7f;
      if (n === 0 || n > 4) throw new Error('length');
      length = 0;
      for (let j = 0; j < n; j++) length = length * 256 + (bytes[i++] as number);
    }
    if (i + length > bytes.length) throw new Error('truncated');
    nodes.push({ tag, body: bytes.subarray(i, i + length) });
    i += length;
  }
  return nodes;
}

/** A constructed element's elements. */
const inside = (node: Node | undefined) => (node ? read(node.body) : []);

function oid(body: Uint8Array): string {
  const first = body[0] as number;
  const parts = [Math.floor(first / 40), first % 40];
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

const text = (body: Uint8Array) => new TextDecoder().decode(body);

/** A UTCTime's or a GeneralizedTime's instant (ms). */
function time(node: Node | undefined): number {
  const s = text(node?.body ?? new Uint8Array());
  const m = node?.tag === 0x17 ? /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(s) : /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(s);
  if (!m) return Number.NaN;
  const [, y, mo, d, h, mi, sec] = m.map(Number) as number[];
  const year = node?.tag === 0x17 ? ((y as number) < 50 ? 2000 : 1900) + (y as number) : (y as number);
  return Date.UTC(year, (mo as number) - 1, d, h, mi, sec || 0);
}

const ATTRIBUTES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.5': 'serialNumber',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.25': 'DC',
};

/** A name as RFC 4514 writes it: its parts, the last first (CN=…, O=…). */
function name(node: Node | undefined): string {
  return inside(node)
    .flatMap((set) =>
      inside(set).map((pair) => {
        const [type, value] = inside(pair);
        const id = oid(type?.body ?? new Uint8Array());
        return `${ATTRIBUTES[id] ?? id}=${text(value?.body ?? new Uint8Array())}`;
      }),
    )
    .reverse()
    .join(', ');
}

const CURVES: Record<string, string> = { '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521' };

/** A key's algorithm and its size (RSA: its modulus's bits) or curve. */
function key(info: Node | undefined): string {
  const [algorithm, bits] = inside(info);
  const [id, params] = inside(algorithm);
  const alg = oid(id?.body ?? new Uint8Array());
  if (alg === '1.2.840.113549.1.1.1') {
    // Its bit string: a byte of unused bits, then RSAPublicKey { modulus, exponent }.
    const [modulus] = inside(read(bits?.body.subarray(1) ?? new Uint8Array())[0]);
    const n = modulus?.body ?? new Uint8Array();
    let start = 0;
    while (start < n.length && n[start] === 0) start++;
    const top = n[start] ?? 0;
    return `RSA ${(n.length - start - 1) * 8 + (top ? Math.floor(Math.log2(top)) + 1 : 0)}`;
  }
  if (alg === '1.2.840.10045.2.1') {
    const curve = params?.tag === 0x06 ? oid(params.body) : '';
    return `ECDSA ${CURVES[curve] ?? curve}`;
  }
  if (alg === '1.3.101.112') return 'Ed25519';
  if (alg === '1.3.101.113') return 'Ed448';
  return alg;
}

/** Its subject alternative names: DNS names, IP addresses, emails, URIs. */
function names(extensions: Node | undefined): string[] {
  for (const ext of inside(inside(extensions)[0])) {
    const parts = inside(ext);
    if (oid(parts[0]?.body ?? new Uint8Array()) !== '2.5.29.17') continue;
    const value = parts.at(-1);
    return inside(read(value?.body ?? new Uint8Array())[0]).flatMap((n) => {
      if (n.tag === 0x82 || n.tag === 0x81 || n.tag === 0x86) return [text(n.body)];
      if (n.tag === 0x87 && n.body.length === 4) return [[...n.body].join('.')];
      if (n.tag === 0x87 && n.body.length === 16) {
        const groups = [];
        for (let i = 0; i < 16; i += 2) groups.push((((n.body[i] as number) << 8) | (n.body[i + 1] as number)).toString(16));
        return [groups.join(':')];
      }
      return [];
    });
  }
  return [];
}

/** The blocks of a label in PEM (CERTIFICATE, CERTIFICATE REQUEST), as DER. */
function blocks(pem: string, label = 'CERTIFICATE'): Uint8Array[] {
  return [...pem.matchAll(new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`, 'g'))].map((m) =>
    Uint8Array.from(atob((m[1] ?? '').replace(/\s+/g, '')), (c) => c.charCodeAt(0)),
  );
}

/** The first certificate in PEM (its chain counted); none, or not read: undefined. */
export function parseCertificate(pem: string): Certificate | undefined {
  try {
    const all = blocks(pem);
    const der = all[0];
    if (!der) return undefined;
    const [tbs] = inside(read(der)[0]);
    const fields = inside(tbs);
    // Its version, where said ([0]), comes first.
    const at = fields[0]?.tag === 0xa0 ? 1 : 0;
    const [serial, , issuer, validity, subject, info] = fields.slice(at);
    const [from, till] = inside(validity);
    if (Number.isNaN(time(from)) || Number.isNaN(time(till))) return undefined;
    let s = serial?.body ?? new Uint8Array();
    while (s.length > 1 && s[0] === 0) s = s.subarray(1);
    return {
      notBefore: time(from),
      notAfter: time(till),
      subject: name(subject),
      issuer: name(issuer),
      names: names(fields.find((f) => f.tag === 0xa3)),
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
  names: string[];
  key: string;
}

/** What a certificate signing request (PEM) asks for: its subject, names (its extension request's), key; not read: undefined. */
export function parseRequest(pem: string): Request | undefined {
  try {
    const der = blocks(pem, 'CERTIFICATE REQUEST')[0];
    if (!der) return undefined;
    const [info] = inside(read(der)[0]);
    const [, subject, key_, attributes] = inside(info);
    if (!subject || !key_) return undefined;
    // Its attributes ([0]): the extension request's value (a set holding its extensions) read as a certificate's extensions are.
    const asked = inside(attributes).find((a) => oid(inside(a)[0]?.body ?? new Uint8Array()) === '1.2.840.113549.1.9.14');
    return { subject: name(subject), names: names(inside(asked)[1]), key: key(key_) };
  } catch {
    return undefined;
  }
}
