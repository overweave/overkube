import { describe, expect, it } from 'vitest';
import { CSR_PEM, EC_PEM as EC, RSA_PEM as RSA } from './certs.fixture.ts';
import { parseCertificate, parseRequest } from './x509.ts';

describe('a certificate', () => {
  it('is read: valid from and till, whom it is of and by (the last part first), its names, its key, its serial', () => {
    expect(parseCertificate(EC)).toEqual({
      notBefore: Date.parse('2026-10-15T01:09:53Z'),
      notAfter: Date.parse('2036-10-12T01:09:53Z'),
      subject: 'CN=shop.example.com, O=Acme Test, C=US',
      issuer: 'CN=shop.example.com, O=Acme Test, C=US',
      names: ['shop.example.com', 'www.shop.example.com', '10.0.0.1'],
      key: 'ECDSA P-256',
      serial: '04:a1:9c:3e',
      chain: 0,
    });
  });

  it('reads an RSA key’s size, a certificate with no names, the chain after it', () => {
    expect(parseCertificate(`${RSA}\n${EC}`)).toMatchObject({ subject: 'CN=rsa.test', names: [], key: 'RSA 2048', chain: 1 });
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
      { subject: 'CN=system:node:kube-3, O=system:nodes', names: ['kube-3', '192.168.1.23'], key: 'ECDSA P-256' },
      undefined,
    ]);
  });
});
