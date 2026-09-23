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
import { BASE_URL, passwordLogin, runCredential } from './lib/harness.mjs';
import { signerCredential } from './lib/credentials.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = ['projects', 'vault', 'authoring', 'submission-center', 'submission-readiness', 'qms'];
const chosen = process.argv.slice(2).filter((a) => APPS.includes(a));
const list = chosen.length ? chosen : APPS;

// Sign each credentialed identity in once for the whole run and hand the
// sessions to the protocols through the environment (see sharedSession in
// lib/harness.mjs). A development run without credentials is unchanged.
const sessions = {};
try {
  const run = runCredential();
  if (run) sessions.run = await passwordLogin(BASE_URL, run);
  const signer = signerCredential();
  if (signer) sessions.signer = await passwordLogin(BASE_URL, signer);
} catch (err) {
  console.error(`run-all: could not open the run's sessions — ${err.message}`);
  process.exit(1);
}
const env = Object.keys(sessions).length
  ? { ...process.env, VALIDATION_SESSIONS: JSON.stringify(sessions) }
  : process.env;

let failed = false;
for (const app of list) {
  console.log(`\n=== ${app} ===`);
  const r = spawnSync(process.execPath, [path.join(HERE, 'oq', app, 'run.mjs')], { stdio: 'inherit', env });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
