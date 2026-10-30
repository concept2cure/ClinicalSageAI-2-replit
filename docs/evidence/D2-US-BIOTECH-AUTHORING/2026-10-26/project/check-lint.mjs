import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(resolve(here, 'lint-baseline.json'), 'utf8')).head;
const files = JSON.parse(readFileSync(resolve(here, 'lint-targets.json'), 'utf8'));
const eslint = new ESLint();
const results = [];
const counts = messages => messages.reduce((out, message) => {
  const key = `${message.severity}:${message.ruleId}`;
  out[key] = (out[key] ?? 0) + 1;
  return out;
}, {});
for (const file of files) {
  let original = '';
  try { original = execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* New file: zero baseline. */ }
  const [before] = await eslint.lintText(original, { filePath: file });
  const [after] = await eslint.lintFiles(file);
  const previous = counts(before.messages), current = counts(after.messages);
  const growth = Object.keys(current).filter(key => current[key] > (previous[key] ?? 0));
  results.push({ file, errors: after.errorCount, warnings: after.warningCount, baselineWarnings: before.warningCount, growth,
    previous, current, messages: after.messages });
}
writeFileSync(resolve(here, 'lint-details.json'), `${JSON.stringify({ baseline, results }, null, 2)}\n`);
console.info(JSON.stringify(results.map(({ file, errors, warnings, baselineWarnings, growth }) => ({ file, errors, warnings, baselineWarnings, growth }))));
process.exitCode = results.some(result => result.errors || result.growth.length) ? 1 : 0;
