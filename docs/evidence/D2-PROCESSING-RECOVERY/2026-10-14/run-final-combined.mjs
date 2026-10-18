/** Reproduce the recorded focused suite; no arbitrary database endpoint. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
if (!process.version.startsWith('v22.')) throw new Error('Use supported Node 22.');
const { paths } = JSON.parse(fs.readFileSync(path.join(folder, 'final-test-manifest.json'), 'utf8'));
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...paths], {
  cwd: root, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
});
process.exitCode = result.status ?? 1;
