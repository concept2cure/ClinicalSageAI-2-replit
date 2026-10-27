import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packet = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(resolve(packet, 'checkpoint-source.json'), 'utf8')).base;
const targets = JSON.parse(readFileSync(resolve(packet, 'lint-targets.json'), 'utf8'));
const eslint = new ESLint();
const results = [];
const ruleCounts = messages => messages.reduce((counts, item) => {
  const key = `${item.severity}:${item.ruleId}`;
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
for (const target of targets) {
  let original = '';
  try { original = execFileSync('git', ['show', `${baseline}:${target}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* New files have an empty baseline. */ }
  const [before] = await eslint.lintText(original, { filePath: target });
  const [after] = await eslint.lintFiles([target]);
  const previous = ruleCounts(before.messages);
  const current = ruleCounts(after.messages);
  results.push({ file: target, baselineErrors: before.errorCount, errors: after.errorCount,
    baselineWarnings: before.warningCount, warnings: after.warningCount,
    previous, current, messages: after.messages,
    growth: Object.keys(current).filter(rule => current[rule] > (previous[rule] ?? 0)) });
}
writeFileSync(resolve(packet, 'lint-details.json'), `${JSON.stringify({ baseline, results }, null, 2)}\n`);
console.info(JSON.stringify({ files: results.length,
  errors: results.reduce((sum, row) => sum + row.errors, 0),
  warnings: results.reduce((sum, row) => sum + row.warnings, 0),
  baselineWarnings: results.reduce((sum, row) => sum + row.baselineWarnings, 0),
  growth: results.filter(row => row.growth.length).map(row => ({ file: row.file, rules: row.growth })) }));
process.exitCode = results.some(row => row.errors || row.growth.length) ? 1 : 0;
