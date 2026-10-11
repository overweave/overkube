import { mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configOf, isLoopback } from './config.ts';

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
    });
    const told = configOf({ OVERKUBE_HOST: '0.0.0.0', OVERKUBE_PORT: '9000', OVERKUBE_PREFIX: 'api/kube/', OVERKUBE_READ_ONLY: 'TRUE' }, '/h');
    expect([told.host, told.port, told.prefix, told.readOnly]).toEqual(['0.0.0.0', 9000, '/kube', true]);
  });

  it('finds the cluster as kubectl does: KUBECONFIG (its first file), else the pod’s ServiceAccount, else ~/.kube/config', () => {
    expect(configOf({ KUBECONFIG: '/a:/b', KUBERNETES_SERVICE_HOST: '10.0.0.1', KUBERNETES_SERVICE_PORT: '443' }).cluster).toEqual({ from: 'kubeconfig', path: '/a' });
    expect(configOf({ KUBERNETES_SERVICE_HOST: '10.0.0.1', KUBERNETES_SERVICE_PORT: '443' }).cluster).toEqual({ from: 'in-cluster' });
  });

  it('says what is wrong: a port that is none, a page folder with no index.html', () => {
    expect(() => configOf({ OVERKUBE_PORT: 'web' })).toThrow(/OVERKUBE_PORT/);
    expect(() => configOf({ OVERKUBE_UI: mkdtempSync(join(tmpdir(), 'ok-ui-')) })).toThrow(/no index.html/);
    const ui = mkdtempSync(join(tmpdir(), 'ok-ui-'));
    writeFileSync(join(ui, 'index.html'), '<p>page</p>');
    expect(configOf({ OVERKUBE_UI: ui }).ui).toBe(ui);
  });

  it('tells this machine’s addresses', () => {
    expect(['127.0.0.1', '127.1.2.3', '::1', 'localhost'].every(isLoopback)).toBe(true);
    expect(['0.0.0.0', '::', '192.168.1.5'].some(isLoopback)).toBe(false);
  });

  it('reads a flag strictly: neither yes nor no is a mistake, never a no', () => {
    expect([configOf({ OVERKUBE_READ_ONLY: 'true ' }).readOnly, configOf({ OVERKUBE_READ_ONLY: '' }).readOnly, configOf({ OVERKUBE_READ_ONLY: 'off' }).readOnly]).toEqual([
      true,
      false,
      false,
    ]);
    expect(() => configOf({ OVERKUBE_READ_ONLY: 'tru' })).toThrow('OVERKUBE_READ_ONLY: "tru" is neither true nor false');
    expect(() => configOf({ OVERKUBE_TRUST_NETWORK: 'enabled' })).toThrow(/OVERKUBE_TRUST_NETWORK/);
    expect(configOf({ OVERKUBE_PORT: ' ' }).port).toBe(8080);
  });

  it('is reached by its own names: this machine’s by default, those given, any when it listens beyond and was given none', () => {
    expect(configOf({ OVERKUBE_HOST: '0.0.0.0' }).hosts).toBeUndefined();
    expect(configOf({ OVERKUBE_HOST: '0.0.0.0', OVERKUBE_HOSTS: 'Dash.example.org, localhost' }).hosts).toEqual(['dash.example.org', 'localhost']);
    expect(configOf({ OVERKUBE_TRUST_NETWORK: 'true' }).trustNetwork).toBe(true);
  });

  it('takes the page’s folder where it really is', () => {
    const real = mkdtempSync(join(tmpdir(), 'ok-ui-'));
    writeFileSync(join(real, 'index.html'), '<p>page</p>');
    const link = join(mkdtempSync(join(tmpdir(), 'ok-link-')), 'ui');
    symlinkSync(real, link);
    expect(configOf({ OVERKUBE_UI: link }).ui).toBe(realpathSync(real));
  });
});
