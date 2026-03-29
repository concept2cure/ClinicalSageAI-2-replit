import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  parseArgs,
  isGeneratedAuditArtifact,
  pruneGeneratedArtifacts,
} from '../../scripts/audits/prune-generated-audit-artifacts.mjs';

test('parseArgs handles defaults and flags', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.dir, 'docs/audits');
  assert.equal(defaults.retainDays, 14);
  assert.equal(defaults.dryRun, false);

  const opts = parseArgs(['--dir', 'tmp/audits', '--retain-days', '3', '--dry-run']);
  assert.equal(opts.dir, 'tmp/audits');
  assert.equal(opts.retainDays, 3);
  assert.equal(opts.dryRun, true);
});

test('isGeneratedAuditArtifact only matches expected generated patterns', () => {
  assert.equal(isGeneratedAuditArtifact('LAST_20_PRS_WIRING_AUDIT_2026-03-29.md'), true);
  assert.equal(isGeneratedAuditArtifact('LAST_20_PRS_BUILD_PLAN_EXECUTION_2026-03-29.json'), true);
  assert.equal(isGeneratedAuditArtifact('AUDIT_INDEX.md'), false);
});

test('pruneGeneratedArtifacts removes old generated files and keeps recent files', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'audit-prune-'));
  const oldFile = path.join(dir, 'LAST_20_PRS_WIRING_AUDIT_2026-03-01.md');
  const newFile = path.join(dir, 'LAST_20_PRS_BUILD_PLAN_EXECUTION_2026-03-29.md');
  const nongenerated = path.join(dir, 'AUDIT_INDEX.md');

  writeFileSync(oldFile, 'old');
  writeFileSync(newFile, 'new');
  writeFileSync(nongenerated, 'keep');

  const now = new Date('2026-03-29T00:00:00.000Z');
  const oldMtime = new Date('2026-03-01T00:00:00.000Z');
  const newMtime = new Date('2026-03-29T00:00:00.000Z');

  // force mtimes
  utimesSync(oldFile, oldMtime, oldMtime);
  utimesSync(newFile, newMtime, newMtime);

  const summary = pruneGeneratedArtifacts({ dir, retainDays: 7, now });

  assert.equal(summary.generated, 2);
  assert.equal(summary.removed.length, 1);
  assert.equal(summary.kept.length, 1);
  assert.equal(summary.removed[0].includes('2026-03-01'), true);

  const remaining = statSync(newFile);
  assert.ok(remaining.isFile());
});
