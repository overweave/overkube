// The release's version, set where it is said: every workspace's package.json (its own version, and
// those of ours it depends on), the chart's version and appVersion. In the repository all of them are
// 0.0.0-dev; a release is a tag v<version>, and CI sets it (after `npm ci`: the lock file is the
// repository's), then builds. Run: node scripts/set-version.mjs 0.1.3 (or v0.1.3).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHART = join(ROOT, 'charts', 'overkube', 'Chart.yaml');
const DEPENDENCIES = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/** The workspaces' folders, as the root's package.json names them (packages/*, …). */
function workspaces() {
  const globs = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).workspaces ?? [];
  return globs.flatMap((glob) => {
    if (!glob.endsWith('/*')) return [join(ROOT, glob)];
    const parent = join(ROOT, glob.slice(0, -2));
    return readdirSync(parent, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(parent, d.name));
  });
}

export function setVersion(given) {
  const version = given.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`not a version: ${given}`);
  const dirs = workspaces().filter((dir) => {
    try {
      readFileSync(join(dir, 'package.json'));
      return true;
    } catch {
      return false;
    }
  });
  const ours = new Set(dirs.map((dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name));
  for (const dir of dirs) {
    const file = join(dir, 'package.json');
    const p = JSON.parse(readFileSync(file, 'utf8'));
    p.version = version;
    for (const field of DEPENDENCIES) for (const name of Object.keys(p[field] ?? {})) if (ours.has(name)) p[field][name] = version;
    writeFileSync(file, `${JSON.stringify(p, null, 2)}\n`);
  }
  const chart = readFileSync(CHART, 'utf8')
    .replace(/^version: .*$/m, `version: ${version}`)
    .replace(/^appVersion: .*$/m, `appVersion: "${version}"`);
  writeFileSync(CHART, chart);
  return { version, packages: dirs.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const given = process.argv[2];
  if (!given) {
    console.error('usage: node scripts/set-version.mjs <version>');
    process.exit(2);
  }
  const { version, packages } = setVersion(given);
  console.log(`${version}: ${packages} packages and the chart`);
}
