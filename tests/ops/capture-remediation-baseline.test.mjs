import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  BASELINE_FORMAT,
  buildManifest,
  categorizeFiles,
  compareManifests,
  parseArgs,
  sha256,
} from '../../scripts/architecture/capture-remediation-baseline.mjs';

test('categorizeFiles inventories contracts and control sources without duplicates', () => {
  const categories = categorizeFiles([
    'global-ri.openapi.json',
    'server/services/ana-ri/command-executor.ts',
    'server/services/toolRegistry.ts',
    'db/migrations/0001.sql',
    'shared/schema/core.ts',
    'docs/adr/0001-example.md',
    'client/src/unrelated.tsx',
    'server/services/toolRegistry.ts',
  ]);

  assert.deepEqual(categories.apiContracts, ['global-ri.openapi.json']);
  assert.deepEqual(categories.commandRegistry, ['server/services/ana-ri/command-executor.ts']);
  assert.deepEqual(categories.aiToolRegistry, ['server/services/toolRegistry.ts']);
  assert.deepEqual(categories.schemaAndMigrations, [
    'db/migrations/0001.sql',
    'shared/schema/core.ts',
  ]);
  assert.deepEqual(categories.architectureControls, ['docs/adr/0001-example.md']);
});

test('buildManifest is deterministic and records size and SHA-256 only', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'remediation-baseline-'));
  mkdirSync(path.join(root, 'server/services'), { recursive: true });
  writeFileSync(path.join(root, 'server/services/toolRegistry.ts'), 'export const tools = [];\n');

  const args = {
    root,
    files: ['server/services/toolRegistry.ts'],
    revision: 'abc123',
  };
  const first = buildManifest(args);
  const second = buildManifest(args);

  assert.deepEqual(first, second);
  assert.equal(first.format, BASELINE_FORMAT);
  assert.deepEqual(first.artifacts['server/services/toolRegistry.ts'], {
    bytes: 25,
    sha256: sha256(Buffer.from('export const tools = [];\n')),
  });
  assert.equal('content' in first.artifacts['server/services/toolRegistry.ts'], false);
});

test('compareManifests detects artifact drift and optionally enforces revision', () => {
  const expected = {
    format: BASELINE_FORMAT,
    revision: 'one',
    hashAlgorithm: 'sha256',
    categories: {},
    counts: {},
    artifacts: {
      'global-ri.openapi.json': { bytes: 1, sha256: 'a' },
      'removed.openapi.json': { bytes: 1, sha256: 'b' },
    },
  };
  const actual = {
    format: BASELINE_FORMAT,
    revision: 'two',
    hashAlgorithm: 'sha256',
    categories: {},
    counts: {},
    artifacts: {
      'global-ri.openapi.json': { bytes: 2, sha256: 'c' },
      'added.openapi.json': { bytes: 1, sha256: 'd' },
    },
  };

  const differences = compareManifests(expected, actual);
  assert.deepEqual(differences.slice(0, 3), [
    'added: added.openapi.json',
    'changed: global-ri.openapi.json',
    'removed: removed.openapi.json',
  ]);
  assert.ok(differences.some(value => value.startsWith('category count mismatch:')));
  assert.deepEqual(compareManifests(expected, actual, { strictRevision: true }).slice(0, 4), [
    'revision: expected one, found two',
    'added: added.openapi.json',
    'changed: global-ri.openapi.json',
    'removed: removed.openapi.json',
  ]);
});

test('compareManifests detects category-only and count drift', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'remediation-category-drift-'));
  mkdirSync(path.join(root, 'server/services'), { recursive: true });
  writeFileSync(path.join(root, 'server/services/toolRegistry.ts'), 'export const tools = [];\n');
  const actual = buildManifest({
    root,
    files: ['server/services/toolRegistry.ts'],
    revision: 'abc123',
  });
  const expected = structuredClone(actual);
  expected.categories.aiToolRegistry = [];
  expected.counts.aiToolRegistry = 99;

  const differences = compareManifests(expected, actual);
  assert.ok(differences.includes('category changed: aiToolRegistry'));
  assert.ok(differences.includes('category count mismatch: aiToolRegistry'));
});

test('parseArgs requires exactly one operation', () => {
  assert.deepEqual(parseArgs(['--output', 'baseline.json']), {
    output: 'baseline.json',
    verify: null,
    root: process.cwd(),
    strictRevision: false,
  });
  assert.throws(() => parseArgs([]), /one of --output/);
  assert.throws(
    () => parseArgs(['--output', 'one.json', '--verify', 'two.json']),
    /either --output or --verify/,
  );
  assert.throws(() => parseArgs(['--output']), /requires a value/);
  assert.throws(
    () => parseArgs(['--output', 'one.json', '--strict-revision']),
    /requires --verify/,
  );
});
