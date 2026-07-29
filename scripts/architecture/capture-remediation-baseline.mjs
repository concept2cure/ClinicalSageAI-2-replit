#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const BASELINE_FORMAT = 'concept2cure.architecture-remediation-baseline/v1';

const CATEGORY_RULES = Object.freeze({
  apiContracts: (file) =>
    /(^|\/)(openapi|[^/]+\.openapi)\.json$/i.test(file) ||
    file === 'scripts/global-ri/generate-openapi.ts',
  commandRegistry: (file) =>
    /(^|\/)(command-executor|command-registry|commandRegistry)\.(?:[cm]?[jt]s|tsx?)$/i.test(file) ||
    /command-registry-consistency\.test\.(?:[cm]?[jt]s|tsx?)$/i.test(file),
  aiToolRegistry: (file) =>
    /(^|\/)(tool-registry|toolRegistry)\.(?:[cm]?[jt]s|tsx?)$/i.test(file) ||
    /tool-registry-consistency\.test\.(?:[cm]?[jt]s|tsx?)$/i.test(file),
  schemaAndMigrations: (file) =>
    /^(db\/migrations|migrations)\/.+\.(?:sql|json)$/i.test(file) ||
    /^shared\/schema\/.+\.(?:[cm]?[jt]s|tsx?)$/i.test(file) ||
    file === 'drizzle.config.ts',
  architectureControls: (file) =>
    file === 'AGENTS.md' ||
    /^docs\/(?:adr|architecture)\/.+\.md$/i.test(file) ||
    file === 'docs/ARCHITECTURE.md',
});

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function categorizeFiles(files) {
  return Object.fromEntries(
    Object.entries(CATEGORY_RULES).map(([category, matches]) => [
      category,
      [...new Set(files.filter(matches))].sort(),
    ]),
  );
}

export function buildManifest({ root, files, revision }) {
  const categories = categorizeFiles(files);
  const artifacts = {};

  for (const file of [...new Set(Object.values(categories).flat())].sort()) {
    const absolute = path.join(root, file);
    const content = readFileSync(absolute);
    artifacts[file] = {
      bytes: statSync(absolute).size,
      sha256: sha256(content),
    };
  }

  const counts = Object.fromEntries(
    Object.entries(categories).map(([category, members]) => [category, members.length]),
  );

  return {
    format: BASELINE_FORMAT,
    revision,
    hashAlgorithm: 'sha256',
    categories,
    counts,
    artifacts,
  };
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

export function captureRepository(root) {
  const files = git(root, ['ls-files', '-co', '--exclude-standard'])
    .split('\n')
    .filter(Boolean);
  const revision = git(root, ['rev-parse', 'HEAD']);
  return buildManifest({ root, files, revision });
}

export function compareManifests(expected, actual, { strictRevision = false } = {}) {
  const differences = [];
  if (expected.format !== BASELINE_FORMAT) {
    differences.push(`unsupported baseline format: ${expected.format ?? '<missing>'}`);
    return differences;
  }
  if (strictRevision && expected.revision !== actual.revision) {
    differences.push(`revision: expected ${expected.revision}, found ${actual.revision}`);
  }

  const paths = new Set([
    ...Object.keys(expected.artifacts ?? {}),
    ...Object.keys(actual.artifacts ?? {}),
  ]);
  for (const file of [...paths].sort()) {
    const before = expected.artifacts?.[file];
    const after = actual.artifacts?.[file];
    if (!before) differences.push(`added: ${file}`);
    else if (!after) differences.push(`removed: ${file}`);
    else if (before.sha256 !== after.sha256 || before.bytes !== after.bytes) {
      differences.push(`changed: ${file}`);
    }
  }
  return differences;
}

export function parseArgs(argv) {
  const options = { output: null, verify: null, root: process.cwd(), strictRevision: false };
  const readValue = (arg, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') options.output = readValue(arg, index++);
    else if (arg === '--verify') options.verify = readValue(arg, index++);
    else if (arg === '--root') options.root = readValue(arg, index++);
    else if (arg === '--strict-revision') options.strictRevision = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.output && options.verify) throw new Error('use either --output or --verify, not both');
  if (!options.output && !options.verify) {
    throw new Error('one of --output <path> or --verify <path> is required');
  }
  if (options.strictRevision && !options.verify) {
    throw new Error('--strict-revision requires --verify');
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  const root = path.resolve(options.root);
  const current = captureRepository(root);

  if (options.output) {
    const output = path.resolve(root, options.output);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    console.log(`Wrote remediation baseline ${output}`);
    console.log(JSON.stringify(current.counts));
    return;
  }

  const input = path.resolve(root, options.verify);
  const expected = JSON.parse(readFileSync(input, 'utf8'));
  const differences = compareManifests(expected, current, {
    strictRevision: options.strictRevision,
  });
  if (differences.length > 0) {
    console.error(`Baseline verification failed (${differences.length} difference(s)):`);
    for (const difference of differences) console.error(`- ${difference}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Baseline verified: ${input}`);
}

const isEntrypoint = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 2;
  }
}
