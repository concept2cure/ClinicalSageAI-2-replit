import { ESLint } from 'eslint';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const packet = dirname(fileURLToPath(import.meta.url));
const inputs = JSON.parse(readFileSync(resolve(packet, 'regression-inputs.json'), 'utf8')).files;
const eslint = new ESLint();
const counts = messages => messages.reduce((out, item) => {
  const key = `${item.severity}:${item.ruleId}`;
  out[key] = (out[key] ?? 0) + 1;
  return out;
}, {});
const results = [];
for (const target of Object.keys(inputs)) {
  let original = '';
  const red = ['red-source-', 'alias-red-source-'].map(prefix => resolve(packet, `${prefix}${basename(target)}.gz`)).find(existsSync);
  if (target.endsWith('/builtin-authoring-templates.test.ts')) {
    original = execFileSync('git', ['show', `HEAD:${target}`], { encoding: 'utf8' });
  } else if (!target.includes('/__tests__/') && red) original = gunzipSync(readFileSync(red)).toString();
  const [before] = await eslint.lintText(original, { filePath: target });
  const [after] = await eslint.lintFiles([target]);
  const previous = counts(before.messages);
  const current = counts(after.messages);
  results.push({ file: target, errors: after.errorCount, warnings: after.warningCount,
    baselineErrors: before.errorCount, baselineWarnings: before.warningCount, previous, current,
    growth: Object.keys(current).filter(rule => current[rule] > (previous[rule] ?? 0)), messages: after.messages });
}
writeFileSync(resolve(packet, 'lint-details.json'), `${JSON.stringify({ results }, null, 2)}\n`);
console.info(JSON.stringify(results.map(({ file, errors, warnings, baselineWarnings, growth }) => ({ file, errors, warnings, baselineWarnings, growth }))));
process.exitCode = results.some(row => row.errors || row.growth.length) ? 1 : 0;
