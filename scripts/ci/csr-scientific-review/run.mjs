#!/usr/bin/env node
/** Executes the actual candidate core/adapter with deterministic external-service test doubles.
 * No PostgreSQL, repository-wide typecheck, model, browser or live-tenant pass is implied.
 * The test builds the real modules itself (build.mjs), so this runner and
 * `npm run test:ci-scripts` exercise the same code.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, ['--test', join(root, 'scientific-review.test.mjs')], { encoding: 'utf8' });
process.stdout.write(result.stdout); process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
