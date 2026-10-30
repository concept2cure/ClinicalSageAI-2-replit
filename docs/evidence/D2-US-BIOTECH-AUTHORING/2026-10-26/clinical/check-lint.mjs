import { ESLint } from 'eslint';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packet = dirname(fileURLToPath(import.meta.url));
const inputs = JSON.parse(readFileSync(resolve(packet, 'scope-inputs.json'), 'utf8')).files;
const eslint = new ESLint();
const counts = messages => messages.reduce((out, item) => {
  const key = `${item.severity}:${item.ruleId}`;
  out[key] = (out[key] ?? 0) + 1;
  return out;
}, {});
const results = [];
for (const target of Object.keys(inputs)) {
  const original = target.includes('/__tests__/') || target.endsWith('/document-template-outline-sections.ts') ? ''
    : gunzipSync(readFileSync(resolve(packet, `red-source-${basename(target)}.gz`))).toString();
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
