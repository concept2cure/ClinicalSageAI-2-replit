#!/usr/bin/env node
/** Executes the actual candidate core/adapter with deterministic external-service test doubles.
 * No PostgreSQL, repository-wide typecheck, model, browser or live-tenant pass is implied.
 * `npm run test:ci-scripts` runs the same suite through its glob; the suite builds itself then.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCandidate } from './build.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const {dir,cleanup}=buildCandidate();
try{
 const result=spawnSync(process.execPath,['--test',join(root,'scientific-review.test.mjs')],
  {encoding:'utf8',env:{...process.env,CSR_REVIEW_TEST_BUILD:dir}});
 process.stdout.write(result.stdout);process.stderr.write(result.stderr);
 process.exitCode=result.status??1;
}finally{cleanup();}
