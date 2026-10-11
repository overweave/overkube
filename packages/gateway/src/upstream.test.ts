import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inCluster, openUpstream } from './upstream.ts';

/*
 * A pod's own way to its cluster: the address the kubelet gives it, the
 * ServiceAccount's CA and token — the token read again when it is rotated.
 */

function account(token: string) {
  const dir = mkdtempSync(join(tmpdir(), 'ok-sa-'));
  writeFileSync(join(dir, 'token'), `${token}\n`);
  writeFileSync(join(dir, 'ca.crt'), 'the-ca');
  return dir;
}

describe('inCluster', () => {
  it('reaches the API server the kubelet names, with the ServiceAccount’s CA and token', () => {
    const upstream = inCluster({ dir: account('first'), host: '10.0.0.1', port: '443' })();
    expect([upstream.server, upstream.token, upstream.ca?.toString()]).toEqual(['https://10.0.0.1:443', 'first', 'the-ca']);
    expect(inCluster({ dir: account('t'), host: 'fd00::1', port: '443' })().server).toBe('https://[fd00::1]:443');
  });

  it('takes a rotated token at once', () => {
    const dir = account('first');
    const source = inCluster({ dir, host: '10.0.0.1', port: '443' });
    expect(source().token).toBe('first');
    writeFileSync(join(dir, 'token'), 'second');
    utimesSync(join(dir, 'token'), new Date(), new Date(Date.now() + 5000));
    expect(source().token).toBe('second');
  });

  it('says so when it is not in a cluster', () => {
    expect(() => inCluster({ dir: account('t'), host: '', port: '' })()).toThrow(/not in a cluster/);
    expect(() => inCluster({ dir: join(tmpdir(), 'no-such-account'), host: '10.0.0.1', port: '443' })()).toThrow();
  });
});

describe('openUpstream', () => {
  it('reaches an API server at an IPv6 address', async () => {
    const { createServer } = await import('node:http');
    const srv = createServer((_req, res) => res.end('{"gitVersion":"v6"}'));
    const listening = await new Promise<boolean>((done) => {
      srv.once('error', () => done(false));
      srv.listen(0, '::1', () => done(true));
    });
    if (!listening) return; // no IPv6 here: nothing to try
    const port = (srv.address() as { port: number }).port;
    const body = await new Promise<string>((done, failed) => {
      const out = openUpstream(
        { method: 'GET', path: '/version' },
        () => ({ server: `http://[::1]:${port}` }),
        (answer) => {
          let text = '';
          answer.on('data', (c) => {
            text += c;
          });
          answer.on('end', () => done(text));
        },
      );
      out.on('error', failed);
    });
    srv.close();
    expect(body).toBe('{"gitVersion":"v6"}');
  });
});

describe('inCluster: rotation', () => {
  it('takes a rotated CA too', () => {
    const dir = account('t');
    const source = inCluster({ dir, host: '10.0.0.1', port: '443' });
    expect(source().ca?.toString()).toBe('the-ca');
    writeFileSync(join(dir, 'ca.crt'), 'the-new-ca');
    utimesSync(join(dir, 'ca.crt'), new Date(), new Date(Date.now() + 5000));
    expect(source().ca?.toString()).toBe('the-new-ca');
  });
});
