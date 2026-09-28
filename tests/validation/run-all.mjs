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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = ['projects', 'vault', 'authoring', 'submission-center', 'submission-readiness', 'qms'];
const chosen = process.argv.slice(2).filter((a) => APPS.includes(a));
const list = chosen.length ? chosen : APPS;

// Sign the run identity in once for the whole run and hand the session to the
// protocols through the environment (see sharedSession in lib/harness.mjs). A
// development run without credentials is unchanged. The second signer signs in
// when a step first needs it (requireSigner in lib/credentials.mjs). Its first
// use comes late in the run, and since P1-1 (2026-09-26) a session left idle
// fifteen minutes has ended. Signing it in here also spent one of the ten
// sign-ins per client IP that OQ-001 needs in its first fifteen minutes
// (2026-09-27 execution, VSR-001 §18).
const sessions = {};
try {
  const run = runCredential();
  if (run) sessions.run = await passwordLogin(BASE_URL, run);
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
