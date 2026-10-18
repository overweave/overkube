import { mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configOf, isLoopback } from './config.ts';
import { testCertificate } from './testing.ts';

describe('configOf', () => {
  it('listens on this machine only, at 8080, the gateway at /kube (always: where the page asks it), unless told otherwise', () => {
    expect(configOf({}, '/home/me')).toEqual({
      host: '127.0.0.1',
      port: 8080,
      prefix: '/kube',
      readOnly: false,
      ui: undefined,
      cluster: { from: 'kubeconfig', path: '/home/me/.kube/config' },
      hosts: ['localhost', '127.0.0.1', '::1'],
      local: true,
      auth: { mode: 'loopback' },
    });
    const told = configOf(
      {
        OVERKUBE_HOST: '0.0.0.0',
        OVERKUBE_PORT: '9000',
        OVERKUBE_READ_ONLY: 'TRUE',
        OVERKUBE_HOSTS: 'dash.example.org',
        OVERKUBE_LOCAL_NETWORK: 'true',
      },
      '/h',
    );
    expect([told.host, told.port, told.prefix, told.readOnly]).toEqual(['0.0.0.0', 9000, '/kube', true]);
  });

  it('finds the cluster as kubectl does: KUBECONFIG (its first file), else the pod’s ServiceAccount, else ~/.kube/config', () => {
    expect(configOf({ KUBECONFIG: '/a:/b', KUBERNETES_SERVICE_HOST: '10.0.0.1', KUBERNETES_SERVICE_PORT: '443' }).cluster).toEqual({ from: 'kubeconfig', path: '/a' });
    expect(configOf({ KUBERNETES_SERVICE_HOST: '10.0.0.1', KUBERNETES_SERVICE_PORT: '443' }).cluster).toEqual({ from: 'in-cluster' });
  });

  it('says what is wrong: a port that is none, a page folder with no index.html', () => {
    expect(() => configOf({ OVERKUBE_PORT: 'web' })).toThrow(/OVERKUBE_PORT/);
    // A Service called overkube, told to a pod as Kubernetes tells it: said for what it is.
    expect(() => configOf({ OVERKUBE_PORT: 'tcp://10.43.159.33:8443' })).toThrow(/enableServiceLinks: false/);
    expect(() => configOf({ OVERKUBE_UI: mkdtempSync(join(tmpdir(), 'ok-ui-')) })).toThrow(/no index.html/);
    const ui = mkdtempSync(join(tmpdir(), 'ok-ui-'));
    writeFileSync(join(ui, 'index.html'), '<p>page</p>');
    expect(configOf({ OVERKUBE_UI: ui }).ui).toBe(ui);
  });

  it('tells this machine’s addresses', () => {
    expect(['127.0.0.1', '127.1.2.3', '::1', 'localhost'].every(isLoopback)).toBe(true);
    expect(['0.0.0.0', '::', '192.168.1.5', '127.example.org', '127.0.0.1.nip.io', 'localhost.example.org'].some(isLoopback)).toBe(false);
    expect(isLoopback('[::1]')).toBe(true);
  });

  it('reads a flag strictly: neither yes nor no is a mistake, never a no', () => {
    expect([configOf({ OVERKUBE_READ_ONLY: 'true ' }).readOnly, configOf({ OVERKUBE_READ_ONLY: '' }).readOnly, configOf({ OVERKUBE_READ_ONLY: 'off' }).readOnly]).toEqual([
      true,
      false,
      false,
    ]);
    expect(() => configOf({ OVERKUBE_READ_ONLY: 'tru' })).toThrow('OVERKUBE_READ_ONLY: "tru" is neither true nor false');
    expect(() => configOf({ OVERKUBE_LOCAL_NETWORK: 'enabled' })).toThrow(/OVERKUBE_LOCAL_NETWORK/);
    expect(configOf({ OVERKUBE_PORT: ' ' }).port).toBe(8080);
  });

  it('is reached by its own names: this machine’s by default, those given, any when it listens beyond and was given none', () => {
    expect(() => configOf({ OVERKUBE_HOST: '0.0.0.0' })).toThrow('OVERKUBE_HOSTS: it listens on 0.0.0.0: say the names it is reached by (dash.example.org,localhost)');
    expect(configOf({ OVERKUBE_HOST: '0.0.0.0', OVERKUBE_HOSTS: 'Dash.example.org, localhost', OVERKUBE_LOCAL_NETWORK: 'true' }).hosts).toEqual(['dash.example.org', 'localhost']);
  });

  it('lets no one in unsigned but this machine: loopback only where only it reaches the server', () => {
    const beyond = { OVERKUBE_HOST: '0.0.0.0', OVERKUBE_HOSTS: 'dash.example.org' };
    expect(() => configOf(beyond)).toThrow(/^OVERKUBE_AUTH=loopback: it listens on 0.0.0.0, and anyone who reaches it would use the cluster as its credentials/);
    expect(configOf({ ...beyond, OVERKUBE_LOCAL_NETWORK: 'true' }).local).toBe(true);
    expect(() => configOf({ OVERKUBE_AUTH: 'basic' })).toThrow('OVERKUBE_AUTH: "basic" is none of loopback, token, oidc');
  });

  it('signs in off this machine only over HTTPS: its own certificate, or a proxy’s in front', () => {
    const beyond = { OVERKUBE_HOST: '0.0.0.0', OVERKUBE_HOSTS: 'dash.example.org', OVERKUBE_AUTH: 'token' };
    expect(() => configOf(beyond)).toThrow(/^OVERKUBE_AUTH=token: signing in off this machine needs HTTPS/);
    const { cert, key } = testCertificate();
    const files = { OVERKUBE_TLS_CERT: cert, OVERKUBE_TLS_KEY: key };
    expect(configOf({ ...beyond, ...files }).tls).toEqual({ cert: files.OVERKUBE_TLS_CERT, key: files.OVERKUBE_TLS_KEY });
    expect(configOf({ ...beyond, OVERKUBE_TLS: 'off' })).toMatchObject({ tls: 'off', auth: { mode: 'token', hours: 8 } });
    // On this machine: http://localhost is no less safe.
    expect(configOf({ OVERKUBE_AUTH: 'token', OVERKUBE_SESSION_HOURS: '1' }).auth).toEqual({ mode: 'token', hours: 1 });
    expect(() => configOf({ ...beyond, OVERKUBE_TLS_CERT: files.OVERKUBE_TLS_CERT })).toThrow('OVERKUBE_TLS_CERT and OVERKUBE_TLS_KEY: both, or neither');
    expect(() => configOf({ ...beyond, ...files, OVERKUBE_TLS: 'off' })).toThrow(/a proxy ends TLS, yet a certificate is given/);
    expect(() => configOf({ OVERKUBE_TLS: 'on' })).toThrow(/OVERKUBE_TLS: "on" is not off/);
    expect(() => configOf({ OVERKUBE_TLS_CERT: '/no/cert', OVERKUBE_TLS_KEY: '/no/key' })).toThrow('OVERKUBE_TLS_CERT: no file /no/cert');
    expect(() => configOf({ OVERKUBE_AUTH: 'token', OVERKUBE_SESSION_HOURS: '0' })).toThrow(/OVERKUBE_SESSION_HOURS/);
  });

  it('signs in with an OIDC provider: its issuer (https), its client; its claims as said, prefixed', () => {
    const oidc = { OVERKUBE_AUTH: 'oidc', OVERKUBE_OIDC_ISSUER: 'https://id.example.org', OVERKUBE_OIDC_CLIENT_ID: 'overkube' };
    expect(configOf(oidc).auth).toEqual({
      mode: 'oidc',
      hours: 8,
      oidc: { issuer: 'https://id.example.org', clientId: 'overkube', scopes: 'openid profile email', userClaim: 'email', groupsClaim: 'groups', prefix: 'oidc:' },
    });
    expect(configOf({ ...oidc, OVERKUBE_OIDC_CLIENT_SECRET: 's', OVERKUBE_OIDC_PREFIX: 'sso:' }).auth).toMatchObject({ oidc: { clientSecret: 's', prefix: 'sso:' } });
    expect(() => configOf({ OVERKUBE_AUTH: 'oidc' })).toThrow(/say the provider/);
    expect(() => configOf({ ...oidc, OVERKUBE_OIDC_ISSUER: 'http://id.example.org' })).toThrow(/is not https/);
    expect(configOf({ ...oidc, OVERKUBE_OIDC_ISSUER: 'http://127.0.0.1:5556' }).auth.mode).toBe('oidc');
    expect(configOf({ ...oidc, OVERKUBE_OIDC_ISSUER: 'http://dex.localhost:5556/dex' }).auth.mode).toBe('oidc');
    expect(() => configOf({ ...oidc, OVERKUBE_OIDC_ISSUER: 'http://dex.localhost.example.org' })).toThrow(/is not https/);
    expect(() => configOf({ ...oidc, OVERKUBE_OIDC_PREFIX: 'system:' })).toThrow(/never the cluster’s own names/);
  });

  it('takes the page’s folder where it really is', () => {
    const real = mkdtempSync(join(tmpdir(), 'ok-ui-'));
    writeFileSync(join(real, 'index.html'), '<p>page</p>');
    const link = join(mkdtempSync(join(tmpdir(), 'ok-link-')), 'ui');
    symlinkSync(real, link);
    expect(configOf({ OVERKUBE_UI: link }).ui).toBe(realpathSync(real));
  });
});
