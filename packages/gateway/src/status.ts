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

/**
 * Ask the API server its version. The status must not hang: the whole of it
 * — connecting, the answer, its body — has timeoutMs, and an answer broken
 * off is an answer too.
 */
export function kubeState(upstream: UpstreamSource, timeoutMs = 3000): Promise<KubeState> {
  return new Promise((done) => {
    let out: ReturnType<typeof openUpstream> | undefined;
    let settled = false;
    const deadline = setTimeout(() => {
      down('kube_timeout', `the API server did not answer in ${timeoutMs} ms`);
      out?.destroy();
    }, timeoutMs);
    const resolve = (state: KubeState) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      done(state);
    };
    const down = (code: ErrorCode, message: string) => resolve({ reachable: false, error: { code, message } });
    try {
      out = openUpstream(
        { method: 'GET', path: '/version', headers: { accept: 'application/json' }, connectTimeoutMs: timeoutMs, idleTimeoutMs: timeoutMs },
        upstream,
        (answer) => {
          let body = '';
          answer.setEncoding('utf8');
          answer.on('data', (c: string) => {
            body += c;
          });
          answer.on('close', () => {
            if (!answer.complete) down('kube_error', 'the API server broke its answer off');
          });
          answer.on('end', () => {
            if (answer.statusCode !== 200) return down('kube_error', `the API server answered ${answer.statusCode}`);
            try {
              resolve({ reachable: true, version: (JSON.parse(body) as { gitVersion?: string }).gitVersion ?? 'unknown' });
            } catch {
              down('kube_error', 'the API server answered something that is not its version');
            }
          });
        },
      );
      out.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ETIMEDOUT') down('kube_timeout', err.message);
        else down(isDown(err) ? 'kube_down' : 'kube_error', isDown(err) ? 'the Kubernetes API server is not answering' : err.message);
      });
    } catch (err) {
      down('kube_down', `no cluster to reach: ${(err as Error).message}`);
    }
  });
}

/** Answer GET /status. */
export async function status(res: ServerResponse, options: { upstream: UpstreamSource; version?: string; timeoutMs?: number }): Promise<void> {
  const kube = await kubeState(options.upstream, options.timeoutMs);
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  const answer: StatusAnswer = { version: options.version ?? 'unknown', kube };
  res.end(JSON.stringify(answer));
}
