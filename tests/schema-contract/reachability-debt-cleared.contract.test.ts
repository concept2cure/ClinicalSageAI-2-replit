/**
 * The reachability debt, at zero — and the invariants that keep it there
 * (ledger C-37 → C-40).
 *
 * `ci:migration-reachability` (C-32) started at 112 server-referenced tables whose
 * only creator was a migration no applier runs. It is now 0. That number is easy
 * to reach dishonestly — by deleting findings, loosening the scan, or wiring files
 * nobody verified — so this file pins the things that make the zero mean
 * something:
 *
 *   • the baseline is genuinely empty (not "small");
 *   • each group that was once written off as impossible is now actually wired;
 *   • the extraction that resolved the quarantined _consolidated tree did NOT
 *     re-import the two hazards that got the tree quarantined in the first place;
 *   • the existing-database reconciliation runs BEFORE the migrations it unblocks,
 *     and refuses to touch a populated audit table.
 *
 * @compliance 21 CFR Part 11 §11.10(e) — audit records may not be altered or
 *             discarded to satisfy a schema change.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const idx = (rel: string) => C2C_MIGRATION_FILES.indexOf(rel);

describe('C-37..C-40: the reachability baseline is empty', () => {
  it('migration-reachability-baseline.json holds zero tables', () => {
    const baseline = JSON.parse(read('scripts/ci/migration-reachability-baseline.json'));
    expect(baseline.count).toBe(0);
    expect(Object.keys(baseline.tables ?? {})).toEqual([]);
  });
});

describe('C-37: the pgvector group is wired, not written off', () => {
  it.each([
    'db/migrations/20260207_phase6_6a_fda_clearance_universe.sql',
    'db/migrations/20260306_precedent_engine.sql',
    'db/migrations/20260208_phase6_6a_risk_rollups.sql',
  ])('%s is on the deploy path', (rel) => {
    expect(C2C_MIGRATION_FILES).toContain(rel);
  });

  it('risk_rollups runs after the clearance universe it reads', () => {
    // predicate.fda_510k_clearances is created by the first and read by the
    // second; reversing them fails the deploy.
    expect(idx('db/migrations/20260208_phase6_6a_risk_rollups.sql')).toBeGreaterThan(
      idx('db/migrations/20260207_phase6_6a_fda_clearance_universe.sql'),
    );
  });
});

describe('C-38: the identity collisions were reconciled, not excluded', () => {
  it.each([
    ['db/migrations/20260125_ai_provider_audit_log.sql', /organization_id\s+INTEGER/i],
    ['db/migrations/20260324_ana_kernel_decision_log.sql', /tenant_id\s+INTEGER/i],
    ['db/migrations/20260326_conversation_os_durability_phase2.sql', /organization_id\s+INTEGER/i],
  ])('%s is wired and keys on the canonical integer tenant', (rel, pattern) => {
    expect(C2C_MIGRATION_FILES).toContain(rel);
    expect(read(rel as string)).toMatch(pattern as RegExp);
  });

  it('none of them still declares a uuid/text tenant key', () => {
    for (const rel of [
      'db/migrations/20260125_ai_provider_audit_log.sql',
      'db/migrations/20260324_ana_kernel_decision_log.sql',
      'db/migrations/20260326_conversation_os_durability_phase2.sql',
    ]) {
      const body = read(rel).replace(/--[^\n]*/g, '');
      expect(body, `${rel} still has a non-integer tenant column`).not.toMatch(
        /^\s*(organization_id|tenant_id)\s+(UUID|TEXT|VARCHAR)/im,
      );
    }
  });
});

describe('C-39: the _consolidated tree was extracted, not imported', () => {
  const EXTRACTION = 'db/migrations/20260801_consolidated_tree_reconciliation.sql';

  it('the extraction is wired', () => {
    expect(C2C_MIGRATION_FILES).toContain(EXTRACTION);
  });

  it('no _consolidated file is ever wired — the tree stays quarantined', () => {
    // Wiring 012_document_authoring_schema would create a rival `doc_revisions`
    // against the canonical authoring subsystem (the C-27 defect); wiring
    // 001_create_core_tables would redefine users/organizations.
    const consolidated = C2C_MIGRATION_FILES.filter((f: string) => f.includes('_consolidated/'));
    expect(consolidated).toEqual([]);
  });

  it('the extraction does NOT recreate doc_revisions (the collision)', () => {
    expect(read(EXTRACTION)).not.toMatch(/CREATE\s+TABLE[^;]*\bdoc_revisions\b/i);
  });

  it('the extraction does NOT redefine core identity tables', () => {
    const body = read(EXTRACTION);
    for (const t of ['users', 'organizations', 'tenants']) {
      expect(body, `extraction must not redefine ${t}`).not.toMatch(
        new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?${t}"?\s*\(`, 'i'),
      );
    }
  });

  it('every tenant column it creates is the canonical integer', () => {
    const body = read(EXTRACTION).replace(/--[^\n]*/g, '');
    expect(body).not.toMatch(/^\s*(organization_id|tenant_id)\s+(UUID|TEXT|VARCHAR)/im);
    expect(body).toMatch(/organization_id\s+INTEGER/i);
  });

  it('supplies the columns its consumers actually query', () => {
    // Provisioning alone would not have fixed these endpoints: at extraction
    // time cerGenerator selected templates.sections (that consumer has since
    // been deleted in the D11b dead-path purge — the column stays in the
    // shipped migration), and command-executor selects doc_sections.id —
    // neither existed in the _consolidated definitions.
    const body = read(EXTRACTION);
    expect(body, 'templates.sections (historical consumer: the deleted cerGenerator.ts)').toMatch(/sections\s+JSONB/i);
    expect(body, 'doc_sections must key on id, not section_id').toMatch(
      /CREATE TABLE IF NOT EXISTS doc_sections \(\s*\n\s*id\s+UUID/i,
    );
  });
});

describe('C-40: existing databases are reconciled, and audit data is not sacrificed', () => {
  const C40 = 'db/migrations/20260801_atom_identity_existing_db_reconciliation.sql';

  it('runs BEFORE the corrected migrations it unblocks', () => {
    // Both fixes are CREATE TABLE IF NOT EXISTS, i.e. no-ops where the broken
    // shape already exists. If this file ran after them it would achieve nothing.
    expect(idx(C40)).toBeGreaterThan(-1);
    expect(idx(C40)).toBeLessThan(idx('db/migrations/20260125_enhanced_cortex_schema.sql'));
    expect(idx(C40)).toBeLessThan(idx('db/migrations/20260125_ai_provider_audit_log.sql'));
  });

  it('only drops a table it has proven empty', () => {
    const body = read(C40);
    expect(body).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.%I LIMIT 1\)/);
    expect(body).toMatch(/IF is_empty THEN/);
  });

  it('leaves a populated table untouched, and says so loudly', () => {
    const body = read(C40);
    expect(body).toMatch(/RAISE WARNING/);
    expect(body).toMatch(/11\.10\(e\)/); // the Part 11 clause this respects
  });
});
