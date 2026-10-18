/** Test the final readmission control against a one-line shadow mutant.
 * No production edit, external database, provider or deployment operation. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const folder = fileURLToPath(new URL('.', import.meta.url)), repo = path.resolve(folder, '../../../..');
if (!process.version.startsWith('v22.')) throw new Error('Use supported Node22');
const sourcePath = path.join(repo, 'server/services/document-data-disposition/service.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const marker = '        await scoped(q,input,true,true);';
if (source.split(marker).length !== 2) throw new Error('Final readmission marker is not unique');
const shadowPath = path.join(folder, 'disposition-counterfactual.mts');
const testPath = path.join(folder, 'independent-disposition-counterfactual.test.mts');
if (fs.existsSync(shadowPath) || fs.existsSync(testPath)) throw new Error('Temporary shadow paths already exist');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const before = hash(source);
const shadow = source.replace(marker, '        // Counterfactual: omit final persisted actor and program readmission.')
  .replace(/from '([^']+)'/g, (match, specifier) => {
    if (!specifier.startsWith('.')) return match;
    const relative = path.relative(folder, path.resolve(path.dirname(sourcePath), specifier)).split(path.sep).join('/');
    return `from '${relative.startsWith('.') ? relative : './' + relative}'`;
  });
const test = fs.readFileSync(path.join(folder, 'independent-ancestry.test.mts'), 'utf8')
  .replace("from '../../../../server/services/document-data-disposition/service.ts'", "from './disposition-counterfactual.mts'");
let result;
try {
  fs.writeFileSync(shadowPath, shadow, { flag: 'wx' }); fs.writeFileSync(testPath, test, { flag: 'wx' });
  result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config',
    path.relative(repo, path.join(folder, 'independent.config.mts')), path.relative(repo, testPath),
    '-t', 'disposition reserves impacts'], { cwd: repo, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
  const log = (result.stdout ?? '') + (result.stderr ?? '');
  fs.writeFileSync(path.join(folder, 'independent-disposition-counterfactual.log'), log);
  const after = hash(fs.readFileSync(sourcePath));
  const expectedRed = result.status === 1 && /1 failed/.test(log) && /expected .* to match object|AssertionError/.test(log) && /IMPACT_UNAVAILABLE|FORBIDDEN/.test(log);
  const record = { runtime: process.version, testName: 'disposition reserves impacts before holding actor rows and refuses a persisted downgrade after that checkpoint',
    mutation: 'Only final scoped(q,input,true,true) omitted in evidence-directory shadow', exitCode: result.status,
    expectedRed, sourceBeforeSha256: before, sourceAfterSha256: after, productionSourceUnchanged: before === after,
    shadowSourceSha256: hash(shadow), shadowTestSha256: hash(test), logSha256: hash(log),
    proofScope: 'Real PGlite persisted-policy checkpoint with audit test seam. No two-session PostgreSQL, provider or deployed-role qualification.' };
  fs.writeFileSync(path.join(folder, 'independent-disposition-counterfactual.json'), JSON.stringify(record, null, 2) + '\n');
  process.stdout.write(JSON.stringify(record) + '\n'); process.exitCode = expectedRed && before === after ? 0 : 1;
} finally { fs.rmSync(shadowPath, { force: true }); fs.rmSync(testPath, { force: true }); }
