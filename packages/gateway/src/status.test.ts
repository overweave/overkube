import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { kubeState as stateOf, status } from './status.ts';
import { fromKubeconfig } from './upstream.ts';

/** The cluster's state as a kubeconfig at this path reaches it. */
const kubeState = (config: string, timeoutMs?: number) => stateOf(fromKubeconfig(config), timeoutMs);

const servers: Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
});

async function listen(srv: Server): Promise<number> {
  servers.push(srv);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return (srv.address() as AddressInfo).port;
}

function kubeconfigFor(server: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig');
  writeFileSync(
    file,
    `clusters:\n- name: c\n  cluster: { server: "${server}" }\nusers:\n- name: u\n  user: { token: t }\ncontexts:\n- name: x\n  context: { cluster: c, user: u }\ncurrent-context: x\n`,
  );
  return file;
}

async function apiServer(answer: (res: ServerResponse) => void): Promise<string> {
  return kubeconfigFor(`http://127.0.0.1:${await listen(createServer((_req, res) => answer(res)))}`);
}

describe('kubeState', () => {
  it('says the cluster answers, with its version', async () => {
    const config = await apiServer((res) => res.end('{"gitVersion":"v1.35.7+kubesolo-v1.2.1"}'));
    expect(await kubeState(config)).toEqual({ reachable: true, version: 'v1.35.7+kubesolo-v1.2.1' });
  });

  it('says why it does not', async () => {
    expect(await kubeState(join(tmpdir(), 'no-such-kubeconfig'))).toMatchObject({ reachable: false, error: { code: 'kube_down' } });
    const port = await listen(createServer());
    await new Promise((r) => servers.pop()?.close(r));
    expect(await kubeState(kubeconfigFor(`http://127.0.0.1:${port}`))).toMatchObject({ reachable: false, error: { code: 'kube_down' } });
    expect(await kubeState(await apiServer((res) => res.writeHead(500).end()))).toMatchObject({ reachable: false, error: { code: 'kube_error' } });
    expect(await kubeState(await apiServer((res) => res.end('not json')))).toMatchObject({ reachable: false, error: { code: 'kube_error' } });
  });

  it('does not hang on an answer broken off, nor on one whose body never ends', async () => {
    const broken = await apiServer((res) => {
      res.writeHead(200);
      res.write('{"gitVersion":');
      setTimeout(() => res.socket?.destroy(), 20);
    });
    expect(await kubeState(broken, 2000)).toMatchObject({ reachable: false, error: { code: 'kube_error', message: 'the API server broke its answer off' } });
    const trickling = await apiServer((res) => {
      res.writeHead(200);
      const drip = setInterval(() => (res.destroyed ? clearInterval(drip) : res.write(' ')), 30);
    });
    const started = Date.now();
    expect(await kubeState(trickling, 200)).toMatchObject({ reachable: false, error: { code: 'kube_timeout' } });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('does not hang on an API server that does not answer', async () => {
    const config = await apiServer(() => {});
    const started = Date.now();
    expect(await kubeState(config, 100)).toMatchObject({ reachable: false, error: { code: 'kube_timeout' } });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('status', () => {
  it("answers 200 with the gateway's version and the cluster's state", async () => {
    const config = await apiServer((res) => res.end('{"gitVersion":"v1.35.7"}'));
    const url = `http://127.0.0.1:${await listen(createServer((_req, res) => void status(res, { upstream: fromKubeconfig(config), version: '1.2.3' })))}/`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe('1.2.3');
    expect(body.kube).toEqual({ reachable: true, version: 'v1.35.7' });
  });
});
