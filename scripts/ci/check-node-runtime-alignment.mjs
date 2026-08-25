#!/usr/bin/env node
/**
 * Fail when the declared, CI, container, and Replit Node runtimes drift apart.
 *
 * The lock currently contains production packages whose engine floor is Node
 * 22. Before this guard, package.json allowed Node 20 and nearly every workflow
 * plus both container stages installed Node 20, while dependency installation
 * merely printed engine warnings. That is not a supported release path: the
 * application was being tested and deployed on a runtime its dependencies had
 * explicitly stopped supporting.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXPECTED_MAJOR = 22;
const failures = [];

const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));

const packageJson = json('package.json');
const lock = json('package-lock.json');
const expectedEngine = `>=${EXPECTED_MAJOR}.0.0`;

if (packageJson.engines?.node !== expectedEngine) {
  failures.push(`package.json engines.node must be ${expectedEngine}`);
}
if (lock.packages?.['']?.engines?.node !== expectedEngine) {
  failures.push(`package-lock.json root engines.node must be ${expectedEngine}`);
}

const replit = read('.replit');
if (!new RegExp(`\\bnodejs-${EXPECTED_MAJOR}\\b`).test(replit)) {
  failures.push(`.replit must select nodejs-${EXPECTED_MAJOR}`);
}

const dockerfile = read('Dockerfile.optimized');
const dockerMajors = [...dockerfile.matchAll(/^FROM\s+node:(\d+)(?:[-.]|\s)/gm)].map((m) => Number(m[1]));
if (dockerMajors.length < 2 || dockerMajors.some((major) => major !== EXPECTED_MAJOR)) {
  failures.push(`every Dockerfile.optimized stage must use Node ${EXPECTED_MAJOR}`);
}

const workflowDir = path.join(repoRoot, '.github', 'workflows');
for (const name of fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name))) {
  const relative = path.posix.join('.github', 'workflows', name);
  const text = read(relative);
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const direct = line.match(/node-version:\s*['"]?(\d+)/);
    const env = line.match(/NODE_VERSION:\s*['"]?(\d+)/);
    const found = direct ?? env;
    if (found && Number(found[1]) !== EXPECTED_MAJOR) {
      failures.push(`${relative}:${index + 1} selects Node ${found[1]}, expected ${EXPECTED_MAJOR}`);
    }
  }
}

if (failures.length > 0) {
  console.error('[ci:node-runtime-alignment] FAIL');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `[ci:node-runtime-alignment] OK — package, lockfile, Replit, containers, and workflows use Node ${EXPECTED_MAJOR}`,
);
