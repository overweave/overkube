import { CSR_PEM, EC_PEM as EC, RSA_PEM as RSA } from '@overkube/testkit';
import { describe, expect, it } from 'vitest';
import { covers, ipOf, parseCertificate, parseRequest } from './x509.ts';

describe('a certificate', () => {
  it('is read: valid from and till, whom it is of and by (the last part first), its names, its key, its serial', () => {
    expect(parseCertificate(EC)).toEqual({
      notBefore: Date.parse('2026-10-15T01:09:53Z'),
      notAfter: Date.parse('2036-10-12T01:09:53Z'),
      subject: 'CN=shop.example.com, O=Acme Test, C=US',
      commonName: 'shop.example.com',
      issuer: 'CN=shop.example.com, O=Acme Test, C=US',
      names: { dns: ['shop.example.com', 'www.shop.example.com'], ip: ['10.0.0.1'], email: [], uri: [] },
      key: 'ECDSA P-256',
      serial: '04:a1:9c:3e',
      chain: 0,
    });
  });

  it('reads an RSA key’s size, a certificate with no names, the chain after it', () => {
    expect(parseCertificate(`${RSA}\n${EC}`)).toMatchObject({ subject: 'CN=rsa.test', names: { dns: [], ip: [], email: [], uri: [] }, key: 'RSA 2048', chain: 1 });
  });

  it('is none where a date of it cannot be read (its not-before broken)', () => {
    const der = atob(EC.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
    const broken = der.replace('261015', 'XX1015');
    expect([broken === der, parseCertificate(`-----BEGIN CERTIFICATE-----\n${btoa(broken)}\n-----END CERTIFICATE-----`)]).toEqual([false, undefined]);
  });

  it('is none where there is no certificate, or it cannot be read', () => {
    expect([parseCertificate(''), parseCertificate('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----')]).toEqual([undefined, undefined]);
  });
});

describe('a certificate signing request', () => {
  it('is read: whom it asks for, the names it asks for, its key; not one, none', () => {
    expect([parseRequest(CSR_PEM), parseRequest(EC)]).toEqual([
      {
        subject: 'CN=system:node:kube-3, O=system:nodes',
        commonName: 'system:node:kube-3',
        names: { dns: ['kube-3'], ip: ['192.168.1.23'], email: [], uri: [] },
        key: 'ECDSA P-256',
      },
      undefined,
    ]);
  });
});

/* Certificates made here, element by element (DER): what the kit's own do not have. */

const der = (tag: number, ...body: (number[] | Uint8Array)[]): number[] => {
  const bytes = body.flatMap((b) => [...b]);
  const n = bytes.length;
  const length = n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff];
  return [tag, ...length, ...bytes];
};
const ascii = (s: string) => [...new TextEncoder().encode(s)];
const oidOf = (s: string) => {
  const [a = 0, b = 0, ...rest] = s.split('.').map(Number);
  const out = [a * 40 + b];
  for (const v of rest) {
    const groups = [v & 0x7f];
    for (let x = v >> 7; x; x >>= 7) groups.unshift((x & 0x7f) | 0x80);
    out.push(...groups);
  }
  return der(0x06, out);
};
const attribute = (oid: string, value: number[]) => der(0x31, der(0x30, oidOf(oid), value));
const P256 = der(0x30, der(0x30, oidOf('1.2.840.10045.2.1'), oidOf('1.2.840.10045.3.1.7')), der(0x03, [0, 4, ...Array(64).fill(1)]));
const ALGORITHM = der(0x30, oidOf('1.2.840.10045.4.3.2'));

function certificate({
  subject = attribute('2.5.4.3', der(0x0c, ascii('a.test'))),
  from = der(0x17, ascii('261015010953Z')),
  till = der(0x17, ascii('361012010953Z')),
  sans = [] as number[][],
  key = P256,
} = {}) {
  const ext = sans.length ? [der(0xa3, der(0x30, der(0x30, oidOf('2.5.29.17'), der(0x04, der(0x30, ...sans)))))] : [];
  const tbs = der(0x30, der(0xa0, der(0x02, [2])), der(0x02, [1]), ALGORITHM, der(0x30, subject), der(0x30, from, till), der(0x30, subject), key, ...ext);
  return pem(der(0x30, tbs, ALGORITHM, der(0x03, [0, 1])), 'CERTIFICATE');
}
const pem = (bytes: number[], label: string) => `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...bytes))}\n-----END ${label}-----`;

describe('what a certificate says, as it says it', () => {
  it('its names by their type — emails and URIs are none of its DNS names or IP addresses; an IPv6 address as RFC 5952 writes it', () => {
    const ip6 = [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
    const sans = [der(0x82, ascii('a.test')), der(0x81, ascii('ops@a.test')), der(0x86, ascii('spiffe://a.test/web')), der(0x87, ip6)];
    expect(parseCertificate(certificate({ sans }))?.names).toEqual({ dns: ['a.test'], ip: ['2001:db8::1'], email: ['ops@a.test'], uri: ['spiffe://a.test/web'] });
  });

  it('its common name its own: a comma in another part is escaped, never taken for one', () => {
    const subject = attribute('2.5.4.10', der(0x0c, ascii('Acme, CN=trusted.example')));
    expect(parseCertificate(certificate({ subject }))).toMatchObject({ subject: 'O=Acme\\, CN\\=trusted.example', commonName: undefined });
  });

  it('reads a name in UTF-16 (BMPString) and a GeneralizedTime with a fraction of a second', () => {
    const subject = attribute('2.5.4.3', der(0x1e, [0, 0x77, 0, 0x65, 0x04, 0x31]));
    const from = der(0x18, ascii('20261015010953.5Z'));
    expect(parseCertificate(certificate({ subject, from }))).toMatchObject({ commonName: 'weб', notBefore: Date.parse('2026-10-15T01:09:53.500Z') });
  });

  it('is none where a date is none (a 13th month, a 31st of April) or its key cannot be read', () => {
    expect(parseCertificate(certificate({ from: der(0x17, ascii('261315010953Z')) }))).toBeUndefined();
    expect(parseCertificate(certificate({ till: der(0x17, ascii('270431010953Z')) }))).toBeUndefined();
    expect(parseCertificate(certificate({ key: der(0x30) }))).toBeUndefined();
  });
});

describe('what is not one, however much of it', () => {
  it('is read in one pass: a megabyte of BEGINs with no END, at once', () => {
    const many = '-----BEGIN CERTIFICATE-----\n'.repeat(40_000);
    const started = performance.now();
    expect([parseCertificate(many), parseRequest(many.replaceAll('CERTIFICATE', 'CERTIFICATE REQUEST'))]).toEqual([undefined, undefined]);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('keeps a year under 100 as it is', () => {
    expect(parseCertificate(certificate({ from: der(0x18, ascii('00500101000000Z')) }))?.notBefore).toBe(Date.parse('0050-01-01T00:00:00Z'));
  });
});

describe('a signing request not one', () => {
  it('is none with no key or no signature', () => {
    const subject = der(0x30, attribute('2.5.4.3', der(0x0c, ascii('a.test'))));
    const info = (key: number[]) => der(0x30, der(0x02, [0]), subject, key, der(0xa0));
    expect(parseRequest(pem(der(0x30, info(P256), ALGORITHM, der(0x03, [0, 1])), 'CERTIFICATE REQUEST'))).toMatchObject({ commonName: 'a.test', key: 'ECDSA P-256' });
    expect(parseRequest(pem(der(0x30, info(der(0x30)), ALGORITHM, der(0x03, [0, 1])), 'CERTIFICATE REQUEST'))).toBeUndefined();
    expect(parseRequest(pem(der(0x30, info(P256)), 'CERTIFICATE REQUEST'))).toBeUndefined();
  });
});

describe('an IP address', () => {
  it('is written one way, as a certificate’s is: IPv6 compressed, lower case; not one, none', () => {
    expect(['10.0.0.1', '2001:DB8:0:0:0:0:0:1', '2001:db8::1', '::ffff:10.0.0.1', '1:0:0:2:0:0:0:3', '::'].map(ipOf)).toEqual([
      '10.0.0.1',
      '2001:db8::1',
      '2001:db8::1',
      '::ffff:a00:1',
      '1:0:0:2::3',
      '::',
    ]);
    expect(['10.0.0.256', 'a.test', '1::2::3', '1:2:3:4:5:6:7:8:9', '1.2.3.4::'].map(ipOf)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe('a TLS host', () => {
  it('covers its own (case aside), and a wildcard its one label', () => {
    expect([covers('Shop.test', 'shop.test'), covers('*.shop.test', 'www.shop.test'), covers('*.shop.test', 'a.b.shop.test'), covers('*.shop.test', 'shop.test')]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});
