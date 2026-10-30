/** Current actual components, historical host reuse, scoped synthetic HTTP only. */
import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { runBoundary } from './boundary-cases.mjs';
import { runPositive } from './positive-case.mjs';

const bundle = fileURLToPath(new URL('.', import.meta.url));
const root = path.resolve(bundle, '../../../../..');
const label = process.argv.find(argument => argument.startsWith('--output='))?.slice('--output='.length) ?? 'final';
assert.match(label, /^[a-z0-9-]+$/);
const out = path.join(bundle, label); assert.ok(!fs.existsSync(out), 'Preserve earlier evidence; choose a fresh output'); fs.mkdirSync(out);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = ['design-system/colors_and_type.css', 'shared/authoring/assembly-sources.ts',
  ...['useSourceAssemblyTarget.ts', 'SourceAssemblyDialog.tsx', 'assemblySourceIntent.ts', 'assemblySourceSelection.ts',
    'DocumentWorkbench.tsx', 'RichSectionEditor.tsx', 'authoringDraftTransport.ts', 'authoringCurrentRead.ts',
    'documentRecordRead.ts', 'AuthoringAssemblyBuild.tsx', 'useAuthoringAssemblyBuild.ts']
    .map(name => `client/src/concept2cure/v2/editor/${name}`),
  ...['editorTarget.ts', 'shellProject.ts', 'ceremony.ts', 'useDialog.ts', 'taskTarget.ts', 'surfaces/ProjectHome.tsx']
    .map(name => `client/src/concept2cure/v2/${name}`),
  'client/src/services/portal/authService.tsx', 'client/src/utils/authToken.ts', 'client/src/lib/queryClient.ts',
  ...['app-v2', 'journey-v2', 'authoring-v2', 'coverage-v2', 'misc-surfaces-v2', 'surface-text-ramp', 'project-home-v2']
    .map(name => `client/src/concept2cure/v2/styles/${name}.css`)];
const fixtures = ['fixtures.mjs', 'probe.tsx', 'index.html', 'positive.tsx', 'positive.html', 'positive-api.mjs',
  'server.mjs', 'measure.mjs', 'boundary-cases.mjs', 'positive-case.mjs', 'final-matrix.mjs'];
const shared = ['docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/probe.tsx',
  'docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/mock-api.mjs',
  'docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/create-recovery/browser/visual-checks.mjs'];
const readPins = paths => Object.fromEntries(paths.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
const before = readPins(sources), sharedBefore = readPins(shared);
const fixturePins = Object.fromEntries(fixtures.map(file => [file, sha(fs.readFileSync(path.join(bundle, file)))]));
for (const file of sources.slice(2, 6)) fs.writeFileSync(path.join(out, path.basename(file) + '.gz'), gzipSync(fs.readFileSync(path.join(root, file)), { mtime: 0 }));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const viewports = process.argv.includes('--diagnostic') ? [['touch-light', 390, 844, 'light']]
  : [['desktop-light', 1440, 1000, 'light'], ['desktop-dark', 1440, 1000, 'dark'], ['touch-light', 390, 844, 'light'], ['touch-dark', 390, 844, 'dark']];
const cases = [];
try {
  for (const viewport of viewports) {
    cases.push(await runPositive(browser, viewport, out));
    cases.push(await runPositive(browser, viewport, out, true));
    for (const mode of ['close-project', 'close-session', 'close-ceremony', 'close-parent', 'refresh', 'late-project', 'late-session', 'late-raw', 'escape'])
      cases.push(await runBoundary(browser, viewport, mode, out));
  }
} finally { await browser.close(); }
const after = readPins(sources), sharedAfter = readPins(shared);
const sourceDrift = sources.filter(file => before[file] !== after[file]), sharedDrift = shared.filter(file => sharedBefore[file] !== sharedAfter[file]);
const summary = { utc: new Date().toISOString(), argv: process.argv.slice(1), node: process.version,
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourcePinsBefore: before, sourcePinsAfter: after, fixturePins, sharedPinsBefore: sharedBefore, sharedPinsAfter: sharedAfter,
  sourceDrift, sharedDrift, cases, passed: cases.filter(row => row.status === 'pass').length, failed: cases.filter(row => row.status !== 'pass').length,
  qualification: 'Actual source chooser, native editor and current ownership/session/channel; synthetic HTTP. No database/RLS, provider, regulatory delivery or actual human qualification.',
  limitations: ['The positive host switches to the actual native Workbench at the onNav boundary; it does not emulate the complete shell router.',
    'Axe incomplete results require manual assessment; this is a bounded automated check, not a complete accessibility audit.',
    'Only display/identity/read/handoff are exercised; preview, build, generation and acceptance remain separate explicit actions.'] };
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
process.stdout.write(JSON.stringify({ passed: summary.passed, failed: summary.failed, sourceDrift, sharedDrift,
  failures: cases.filter(row => row.status !== 'pass').map(({ name, mode, error }) => ({ name, mode, error })) }) + '\n');
if (summary.failed || sourceDrift.length || sharedDrift.length) process.exitCode = 1;
