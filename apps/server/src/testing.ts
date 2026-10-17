import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * What the server's tests share (not built: tsconfig.build.json leaves it
 * out): a certificate of this machine's names, made for them by openssl —
 * on CI's runner, in the image `make` checks in — and kept nowhere.
 */

let made: { cert: string; key: string } | undefined;

/** A self-signed certificate for localhost and 127.0.0.1 (a day's), its files: made once a test run. */
export function testCertificate(): { cert: string; key: string } {
  if (made) return made;
  const dir = mkdtempSync(join(tmpdir(), 'ok-tls-'));
  const files = { cert: join(dir, 'tls.crt'), key: join(dir, 'tls.key') };
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-keyout',
      files.key,
      '-out',
      files.cert,
    ],
    { stdio: 'ignore' },
  );
  made = files;
  return files;
}
