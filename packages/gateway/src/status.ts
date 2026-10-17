import type { ServerResponse } from 'node:http';
import type { ErrorCode, KubeState, StatusAnswer } from './protocol.ts';
import { isDown, openUpstream, type UpstreamSource } from './upstream.ts';

/*
 * GET /status — whether the gateway is there and what it sees: its version
 * (the host's, as it was given) and whether the cluster answers.
 *
 *   { "version": "0.1.0",
 *     "kube": { "reachable": true, "version": "v1.35.7" } }
 *   { "version": "0.1.0",
 *     "kube": { "reachable": false, "error": { "code": "kube_down", "message": "…" } } }
 *
 * Always 200: the answer itself says what is wrong. The page asks it whether
 * to show the cluster or why it cannot; a host, whether the gateway is up.
 */

/** A small answer of the API server read whole: its status and body, or why there is none. */
export type Asked = { status: number; body: string } | { error: { code: ErrorCode; message: string } };

/**
 * Ask the API server something small. It must not hang: the whole of it —
 * connecting, the answer, its body — has timeoutMs, and an answer broken
 * off is an answer too.
 */
export function ask(upstream: UpstreamSource, request: { method: string; path: string; body?: string }, timeoutMs = 3000): Promise<Asked> {
  return new Promise((done) => {
    let out: ReturnType<typeof openUpstream> | undefined;
    let settled = false;
    const deadline = setTimeout(() => {
      down('kube_timeout', `the API server did not answer in ${timeoutMs} ms`);
      out?.destroy();
    }, timeoutMs);
    const resolve = (asked: Asked) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      done(asked);
    };
    const down = (code: ErrorCode, message: string) => resolve({ error: { code, message } });
    try {
      out = openUpstream({ ...request, headers: { accept: 'application/json' }, connectTimeoutMs: timeoutMs, idleTimeoutMs: timeoutMs }, upstream, (answer) => {
        let body = '';
        answer.setEncoding('utf8');
        answer.on('data', (c: string) => {
          body += c;
        });
        answer.on('close', () => {
          if (!answer.complete) down('kube_error', 'the API server broke its answer off');
        });
        answer.on('end', () => resolve({ status: answer.statusCode ?? 502, body }));
      });
      out.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ETIMEDOUT') down('kube_timeout', err.message);
        else down(isDown(err) ? 'kube_down' : 'kube_error', isDown(err) ? 'the Kubernetes API server is not answering' : err.message);
      });
    } catch (err) {
      down('kube_down', `no cluster to reach: ${(err as Error).message}`);
    }
  });
}

/** Ask the API server its version. */
export async function kubeState(upstream: UpstreamSource, timeoutMs = 3000): Promise<KubeState> {
  const asked = await ask(upstream, { method: 'GET', path: '/version' }, timeoutMs);
  if ('error' in asked) return { reachable: false, error: asked.error };
  if (asked.status !== 200) return { reachable: false, error: { code: 'kube_error', message: `the API server answered ${asked.status}` } };
  try {
    return { reachable: true, version: (JSON.parse(asked.body) as { gitVersion?: string }).gitVersion ?? 'unknown' };
  } catch {
    return { reachable: false, error: { code: 'kube_error', message: 'the API server answered something that is not its version' } };
  }
}

/** Answer GET /status. */
export async function status(res: ServerResponse, options: { upstream: UpstreamSource; version?: string; timeoutMs?: number }): Promise<void> {
  const kube = await kubeState(options.upstream, options.timeoutMs);
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  const answer: StatusAnswer = { version: options.version ?? 'unknown', kube };
  res.end(JSON.stringify(answer));
}
