// Compare owned production warnings with the named original source, using the real config.
const { ESLint } = require('eslint');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const files = ['client/src/concept2cure/v2/surfaces/ProjectHome.tsx',
  'client/src/concept2cure/v2/surfaces/projectSources.ts',
  'server/routes/c2c/projects.ts', 'server/services/clinical-regulatory-evidence/data-room-search.ts'];
(async () => {
  const eslint = new ESLint();
  const rows = [];
  for (const file of files) {
    const baseline = execFileSync('git', ['show', `5a552f142:${file}`], { encoding: 'utf8' });
    const current = fs.readFileSync(file, 'utf8');
    const [old] = await eslint.lintText(baseline, { filePath: file });
    const [next] = await eslint.lintText(current, { filePath: file });
    rows.push({ file, baselineSha256: createHash('sha256').update(baseline).digest('hex'),
      currentSha256: createHash('sha256').update(current).digest('hex'),
      baseline: { errors: old.errorCount, warnings: old.warningCount, messages: old.messages },
      current: { errors: next.errorCount, warnings: next.warningCount, messages: next.messages } });
  }
  const passed = rows.every(row => !row.current.errors && row.current.warnings <= row.baseline.warnings);
  fs.writeFileSync(path.join(__dirname, `${process.argv[2] || 'final'}-lint-comparison.json`), JSON.stringify({ baseline: '5a552f142', passed, rows }, null, 2) + '\n');
  console.info(JSON.stringify({ passed, rows: rows.map(row => ({ file: row.file, baseline: row.baseline.warnings, current: row.current.warnings, errors: row.current.errors })) }));
  if (!passed) process.exitCode = 1;
})();
