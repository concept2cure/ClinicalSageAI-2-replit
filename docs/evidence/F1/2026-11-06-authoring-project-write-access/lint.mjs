import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packet = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(resolve(packet, 'discovery.json'), 'utf8')).head;
const targets = JSON.parse(readFileSync(resolve(packet, 'lint-targets.json'), 'utf8'));
const eslint = new ESLint();
const counts = messages => messages.reduce((total, row) => {
  const key = `${row.severity}:${row.ruleId}`;
  total[key] = (total[key] ?? 0) + 1;
  return total;
}, {});
const results = [];
for (const target of targets) {
  let original = '';
  try { original = execFileSync('git', ['show', `${baseline}:${target}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* New test/helper: zero source baseline. */ }
  const [before] = await eslint.lintText(original, { filePath: target });
  const [after] = await eslint.lintFiles([target]);
  const previous = counts(before.messages);
  const current = counts(after.messages);
  results.push({ file: target, errors: after.errorCount, warnings: after.warningCount, baselineWarnings: before.warningCount,
    growth: Object.keys(current).filter(key => current[key] > (previous[key] ?? 0)), messages: after.messages });
}
writeFileSync(resolve(packet, 'lint-details.json'), `${JSON.stringify({ baseline, results }, null, 2)}\n`);
console.info(JSON.stringify({ files: results.length, errors: results.reduce((n, row) => n + row.errors, 0),
  warnings: results.reduce((n, row) => n + row.warnings, 0), growth: results.filter(row => row.growth.length) }));
process.exitCode = results.some(row => row.errors || row.growth.length) ? 1 : 0;
