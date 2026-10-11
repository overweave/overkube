import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readKubeconfig } from './kubeconfig.ts';

function file(text: string, extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'ok-'));
  for (const [name, body] of Object.entries(extra)) writeFileSync(join(dir, name), body);
  writeFileSync(join(dir, 'config'), text);
  return join(dir, 'config');
}

const b64 = (s: string) => Buffer.from(s).toString('base64');

// As KubeSolo writes it: two users, the current context the certificate one.
const KUBESOLO = `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${b64('CA')}
    server: https://172.22.0.2:6443
  name: kubesolo
contexts:
- context:
    cluster: kubesolo
    user: admin-token
  name: admin-token@kubesolo
- context:
    cluster: kubesolo
    user: kubernetes-admin
  name: kubernetes-admin@kubesolo
current-context: kubernetes-admin@kubesolo
kind: Config
users:
- name: admin-token
  user:
    token: secret-token
- name: kubernetes-admin
  user:
    client-certificate-data: ${b64('CERT')}
    client-key-data: ${b64('KEY')}
`;

describe('readKubeconfig', () => {
  it("takes the current context's cluster and user", () => {
    const u = readKubeconfig(file(KUBESOLO));
    expect(u.server).toBe('https://172.22.0.2:6443');
    expect(u.ca?.toString()).toBe('CA');
    expect(u.cert?.toString()).toBe('CERT');
    expect(u.key?.toString()).toBe('KEY');
    expect(u.token).toBeUndefined();
  });

  it('follows another current context to its user', () => {
    const u = readKubeconfig(file(KUBESOLO.replace('current-context: kubernetes-admin@kubesolo', 'current-context: admin-token@kubesolo')));
    expect(u.token).toBe('secret-token');
    expect(u.cert).toBeUndefined();
  });

  it('reads credentials kept in files next to it', () => {
    const text = `clusters:
- cluster:
    certificate-authority: ca.crt
    server: http://127.0.0.1:8080
  name: c
users:
- name: u
  user:
    client-certificate: admin.crt
    client-key: admin.key
contexts:
- context:
    cluster: c
    user: u
  name: x
`;
    const u = readKubeconfig(file(text, { 'ca.crt': 'CA2', 'admin.crt': 'CERT2', 'admin.key': 'KEY2' }));
    expect(u.server).toBe('http://127.0.0.1:8080');
    expect([u.ca?.toString(), u.cert?.toString(), u.key?.toString()]).toEqual(['CA2', 'CERT2', 'KEY2']);
  });

  it('says when there is no server', () => {
    expect(() => readKubeconfig(file('kind: Config\n'))).toThrow('no server');
  });

  it('reads lists written with an indent (Lens, Rancher, by hand), CRLF line ends and quoted values', () => {
    const text = [
      'apiVersion: v1',
      'clusters:',
      '  - name: "home"',
      '    cluster:',
      `      server: "https://cluster.example:6443"`,
      `      certificate-authority-data: '${b64('CA3')}'`,
      'users:',
      '  - name: me',
      '    user:',
      '      token: "a token with spaces"',
      'contexts:',
      '  - name: here',
      '    context: { cluster: home, user: me }',
      "current-context: 'here'",
      '',
    ].join('\r\n');
    const u = readKubeconfig(file(text));
    expect(u.server).toBe('https://cluster.example:6443');
    expect(u.ca?.toString()).toBe('CA3');
    expect(u.token).toBe('a token with spaces');
  });

  it('picks the right one of several clusters and users', () => {
    const text = `clusters:
- name: a
  cluster: { server: https://a:6443 }
- name: b
  cluster: { server: https://b:6443 }
users:
- name: ua
  user: { token: ta }
- name: ub
  user: { token: tb }
contexts:
- name: ca
  context: { cluster: a, user: ua }
- name: cb
  context: { cluster: b, user: ub }
current-context: cb
`;
    expect(readKubeconfig(file(text))).toMatchObject({ server: 'https://b:6443', token: 'tb' });
  });

  it('refuses a current-context it does not have, rather than taking another cluster', () => {
    expect(() => readKubeconfig(file(KUBESOLO.replace('current-context: kubernetes-admin@kubesolo', 'current-context: gone')))).toThrow(
      'its current-context "gone" is not one of its contexts',
    );
  });

  it('refuses a context naming a cluster or user it does not have', () => {
    expect(() => readKubeconfig(file(KUBESOLO.replace('    cluster: kubesolo\n    user: kubernetes-admin', '    cluster: elsewhere\n    user: kubernetes-admin')))).toThrow(
      'names a cluster "elsewhere"',
    );
    expect(() =>
      readKubeconfig(file(KUBESOLO.replace('    user: kubernetes-admin\n  name: kubernetes-admin@kubesolo', '    user: nobody\n  name: kubernetes-admin@kubesolo'))),
    ).toThrow('names a user "nobody"');
  });

  it('never guesses among several contexts with none current; takes the only one there is', () => {
    expect(() => readKubeconfig(file(KUBESOLO.replace('current-context: kubernetes-admin@kubesolo\n', '')))).toThrow('it has 2 contexts and no current-context');
    const one = KUBESOLO.replace('current-context: kubernetes-admin@kubesolo\n', '').replace(
      /- context:\n {4}cluster: kubesolo\n {4}user: kubernetes-admin\n {2}name: kubernetes-admin@kubesolo\n/,
      '',
    );
    expect(readKubeconfig(file(one)).token).toBe('secret-token');
  });

  it('reads a token kept in a file', () => {
    const text =
      'clusters:\n- name: c\n  cluster: { server: https://c:6443 }\nusers:\n- name: u\n  user: { tokenFile: token }\ncontexts:\n- name: x\n  context: { cluster: c, user: u }\n';
    expect(readKubeconfig(file(text, { token: 'from-a-file\n' })).token).toBe('from-a-file');
  });

  it('says when it is not YAML, or not a kubeconfig', () => {
    expect(() => readKubeconfig(file('clusters: [\n'))).toThrow(/^not YAML/);
    expect(() => readKubeconfig(file('- a\n- b\n'))).toThrow('not a kubeconfig');
  });

  it("gives a context without a user no credentials, never another user's", () => {
    const text =
      'clusters:\n- name: home\n  cluster: { server: https://home:6443 }\n- name: open\n  cluster: { server: https://open:6443 }\n' +
      'users:\n- name: admin\n  user: { token: private-admin }\n' +
      'contexts:\n- name: anon\n  context: { cluster: open }\ncurrent-context: anon\n';
    expect(readKubeconfig(file(text))).toEqual({ server: 'https://open:6443', ca: undefined, cert: undefined, key: undefined, token: undefined });
  });

  it('refuses a context naming no cluster, rather than taking the first', () => {
    const text = 'clusters:\n- name: c\n  cluster: { server: https://c:6443 }\ncontexts:\n- name: x\n  context: { user: u }\nusers:\n- name: u\n  user: { token: t }\n';
    expect(() => readKubeconfig(file(text))).toThrow('its context "x" names no cluster');
  });

  it('takes the first cluster and user only when it has no contexts at all', () => {
    const text = 'clusters:\n- name: c\n  cluster: { server: https://c:6443 }\nusers:\n- name: u\n  user: { token: t }\n';
    expect(readKubeconfig(file(text))).toMatchObject({ server: 'https://c:6443', token: 't' });
  });

  it('reads insecure-skip-tls-verify, but not with a certificate authority too', () => {
    const text = (extra: string) =>
      `clusters:\n- name: c\n  cluster: { server: https://c:6443, insecure-skip-tls-verify: true${extra} }\ncontexts:\n- name: x\n  context: { cluster: c }\n`;
    expect(readKubeconfig(file(text(''))).insecure).toBe(true);
    expect(() => readKubeconfig(file(text(`, certificate-authority-data: ${b64('CA')}`)))).toThrow('certificate authority and insecure-skip-tls-verify both');
  });

  it('reads a token file again when it is rotated, the kubeconfig unchanged', () => {
    const text =
      'clusters:\n- name: c\n  cluster: { server: https://c:6443 }\nusers:\n- name: u\n  user: { tokenFile: token }\ncontexts:\n- name: x\n  context: { cluster: c, user: u }\n';
    const path = file(text, { token: 'first-token' });
    expect(readKubeconfig(path).token).toBe('first-token');
    const token = join(dirname(path), 'token');
    writeFileSync(token, 'second-token');
    utimesSync(token, new Date(), new Date(Date.now() + 5000));
    expect(readKubeconfig(path).token).toBe('second-token');
  });

  it('reads the file again when it changes', () => {
    const path = file(KUBESOLO);
    expect(readKubeconfig(path).server).toBe('https://172.22.0.2:6443');
    writeFileSync(path, KUBESOLO.replace('https://172.22.0.2:6443', 'https://10.0.0.9:6443 '));
    expect(readKubeconfig(path).server).toBe('https://10.0.0.9:6443');
  });
});

describe('readKubeconfig: what it cannot use', () => {
  const user = (fields: string) =>
    `clusters:\n- cluster:\n    server: https://k:6443\n  name: c\ncontexts:\n- context: { cluster: c, user: u }\n  name: x\ncurrent-context: x\nusers:\n- name: u\n  user:\n${fields}`;

  it('says so of credentials it does not support, rather than going out anonymous', () => {
    expect(() => readKubeconfig(file(user('    exec:\n      command: aws\n')))).toThrow('signs in with exec credentials');
    expect(() => readKubeconfig(file(user('    auth-provider:\n      name: oidc\n')))).toThrow('signs in with an auth-provider');
    expect(() => readKubeconfig(file(user('    username: a\n    password: b\n')))).toThrow('signs in with a username and password');
    expect(readKubeconfig(file(user('    token: t\n    exec:\n      command: aws\n'))).token).toBe('t');
  });

  it('says so of a proxy; takes the name a certificate is checked against', () => {
    expect(() => readKubeconfig(file(user('    token: t\n').replace('server: https://k:6443', 'server: https://k:6443\n    proxy-url: http://p:3128')))).toThrow('proxy-url');
    expect(readKubeconfig(file(user('    token: t\n').replace('server: https://k:6443', 'server: https://10.0.0.1:6443\n    tls-server-name: kubernetes'))).serverName).toBe(
      'kubernetes',
    );
  });

  it('never pairs a cluster and a user among several, with no context', () => {
    const two = 'clusters:\n- cluster: { server: https://a }\n  name: a\n- cluster: { server: https://b }\n  name: b\nusers:\n- name: u\n  user: { token: t }\n';
    expect(() => readKubeconfig(file(two))).toThrow('it has 2 clusters and no context');
  });
});
