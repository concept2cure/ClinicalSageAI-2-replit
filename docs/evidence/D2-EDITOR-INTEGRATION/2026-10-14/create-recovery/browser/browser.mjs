import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJson } from './browser-checks.mjs';
import { runUnknown, runHeld } from './unknown-cases.mjs';
import { runWorkbench } from './workbench-cases.mjs';

const BUNDLE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const records = readJson(resolve(BUNDLE, 'records.json'));
const urlPath = '/' + relative(ROOT, BUNDLE).split(sep).join('/') + '/';
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sourcePaths = ['design-system/colors_and_type.css',
  'client/src/concept2cure/v2/C2CForm.tsx',
  'client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx',
  'client/src/concept2cure/v2/editor/useAuthoringCreation.ts',
  'client/src/concept2cure/v2/editor/DocumentWorkbench.tsx',
  'client/src/concept2cure/v2/editor/RichSectionEditor.tsx',
  'client/src/concept2cure/v2/editorTarget.ts',
  'client/src/concept2cure/v2/shellProject.ts',
  ...['app-v2', 'journey-v2', 'coverage-v2', 'authoring-v2', 'misc-surfaces-v2', 'surface-text-ramp']
    .map(name => `client/src/concept2cure/v2/styles/${name}.css`)];
const productionPins = () => Object.fromEntries(sourcePaths.map(path => [path, sha256(resolve(ROOT, path))]));
const originalPins = productionPins();
const fixturePins = Object.fromEntries(readdirSync(BUNDLE).filter(file => /\.(?:tsx?|mjs|json|html)$/.test(file))
  .filter(file => !file.endsWith('-summary.json') && !file.endsWith('-results.json') && !file.endsWith('-lint.json') && !file.endsWith('-proof.json'))
  .map(file => [file, sha256(resolve(BUNDLE, file))]));
const diagnostic = process.argv.includes('--diagnostic');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const contexts = diagnostic ? [['diagnostic-touch-light', 390, 844, 'light']]
  : [['desktop-light', 1440, 1000, 'light'], ['desktop-dark', 1440, 1000, 'dark'],
    ['touch-light', 390, 844, 'light'], ['touch-dark', 390, 844, 'dark']];

async function runContext([label, width, height, theme]) {
  const config = { label, width, height, theme, urlPath };
  const cases = [];
  for (const kind of ['document', 'section']) cases.push(await runUnknown(browser, config, records, BUNDLE, kind));
  for (const kind of ['document', 'section']) cases.push(await runWorkbench(browser, config, records, BUNDLE, kind));
  cases.push(await runHeld(browser, config, records, BUNDLE));
  const report = { label, width, height, theme, cases, status: cases.every(row => row.status === 'pass') ? 'pass' : 'fail' };
  writeFileSync(resolve(BUNDLE, `${label}-results.json`), JSON.stringify(report, null, 2) + '\n');
  console.info(`${label}: ${report.status}; ${cases.map(row => `${row.label}/${row.kind}=${row.status}`).join(', ')}`);
  return report;
}

try {
  const reports = await Promise.all(contexts.map(runContext));
  const frozen = JSON.stringify(originalPins) === JSON.stringify(productionPins());
  const summary = { testedHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    completedAt: new Date().toISOString(), productionFrozenDuringCapture: frozen, sourceSha256: originalPins,
    fixtureSha256: fixturePins, contexts: reports.map(({ label, status, cases }) => ({ label, status,
      cases: cases.map(row => ({ kind: row.kind, mode: row.label, status: row.status, stages: row.stages.length, error: row.error })) })),
    caseCount: reports.reduce((sum, row) => sum + row.cases.length, 0),
    stageCount: reports.flatMap(row => row.cases).reduce((sum, row) => sum + row.stages.length, 0),
    mutationCount: reports.flatMap(row => row.cases).reduce((sum, row) => sum + row.mutations.length, 0),
    limitations: [records.qualification,
      'Unknown outcomes use deliberately mismatched successful receipts. Failed recovery is a successful HTTP response with wrong-scope rows; production tests separately exercise HTTP/network failures.',
      'The native Workbench document case records its exact editorTarget/onNav handoff boundary after the real unsaved-work decision. The local fixture does not emulate the shell router or claim a deployed reopen.',
      'The native Workbench section case opens the exact returned section through its actual section refresh, leave guard and canonical RichSectionEditor.',
      'All original style tokens and product components are imported directly; this host adds no product CSS or alternate editor.',
      'Axe incomplete rules are retained per capture and require manual review; this is not a complete accessibility audit.'],
    status: frozen && reports.every(report => report.status === 'pass') ? 'pass' : 'fail' };
  writeFileSync(resolve(BUNDLE, diagnostic ? 'diagnostic-summary.json' : 'browser-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.info(JSON.stringify({ status: summary.status, caseCount: summary.caseCount, stageCount: summary.stageCount,
    mutationCount: summary.mutationCount, productionFrozenDuringCapture: frozen }));
  if (summary.status !== 'pass') process.exitCode = 1;
} finally { await browser.close(); }
