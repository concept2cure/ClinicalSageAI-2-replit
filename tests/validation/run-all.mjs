/**
 * Execute every OQ protocol in order (OQ-001 … OQ-006) against the running
 * server and print the roll-up. Exit 1 if any protocol recorded a fail.
 *
 *   npm run validation:oq            # all six
 *   npm run validation:oq -- qms     # one app
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = ['projects', 'vault', 'authoring', 'submission-center', 'submission-readiness', 'qms'];
const chosen = process.argv.slice(2).filter((a) => APPS.includes(a));
const list = chosen.length ? chosen : APPS;

let failed = false;
for (const app of list) {
  console.log(`\n=== ${app} ===`);
  const r = spawnSync(process.execPath, [path.join(HERE, 'oq', app, 'run.mjs')], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
