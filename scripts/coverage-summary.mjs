// The coverage of the last `npm run coverage` (coverage/coverage-summary.json), as a table — all, and each
// workspace: in CI the job's summary, a warning for each with a figure under 80% — told, never failing the run.
import { appendFileSync, readFileSync } from 'node:fs';

const WARN_UNDER = 80;
const METRICS = ['lines', 'statements', 'functions', 'branches'];

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const byWorkspace = new Map();
for (const [file, figures] of Object.entries(summary)) {
  const at = file.match(/\/((?:packages|apps|addons)\/[^/]+)\//)?.[1];
  if (!at) continue;
  const total = byWorkspace.get(at) ?? Object.fromEntries(METRICS.map((m) => [m, { total: 0, covered: 0 }]));
  for (const m of METRICS) {
    total[m].total += figures[m].total;
    total[m].covered += figures[m].covered;
  }
  byWorkspace.set(at, total);
}
const pct = ({ total, covered }) => (total ? Math.round((covered / total) * 10000) / 100 : 100);
const rows = [['all', Object.fromEntries(METRICS.map((m) => [m, summary.total[m].pct]))]];
for (const [at, total] of [...byWorkspace].sort()) rows.push([at, Object.fromEntries(METRICS.map((m) => [m, pct(total[m])]))]);

const low = new Map();
const cell = (who, m, figure) => {
  if (figure >= WARN_UNDER) return `${figure}%`;
  low.set(who, [...(low.get(who) ?? []), `${m} ${figure}%`]);
  return `⚠️ ${figure}%`;
};
const table = [
  '### Coverage',
  '',
  `| | ${METRICS.join(' | ')} |`,
  `|---|${METRICS.map(() => '---:').join('|')}|`,
  ...rows.map(([who, t]) => `| ${who} | ${METRICS.map((m) => cell(who, m, t[m])).join(' | ')} |`),
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
else console.log(table);
for (const [who, figures] of low) console.log(`::warning title=Coverage under ${WARN_UNDER}%::${who}: ${figures.join(', ')}`);
