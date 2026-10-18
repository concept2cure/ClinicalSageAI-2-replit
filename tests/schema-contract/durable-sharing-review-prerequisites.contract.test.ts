/** Static source/deployment contract only. Actual SQL replay, physical
 * constraints, historical NULL and first-deploy RLS require separate proof. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { C2C_MIGRATION_FILES, TENANT_ISOLATION_SWEEP, CHILD_TABLE_PARENT_SCOPE, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharingPath = 'db/migrations/20260401_project_sharing_visibility.sql';
const reviewPath = 'db/migrations/20260314_phase12_multi_user_review.sql';
const read = (name: string) => readFileSync(path.join(root, name), 'utf8');
const executable = (source: string) => source.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const sharing = executable(read(sharingPath));
const review = executable(read(reviewPath));

describe('durable sharing/review canonical prerequisites', () => {
  it('replays exactly the two sole creators before the unchanged isolation tail', () => {
    for (const creator of [sharingPath, reviewPath]) {
      expect(C2C_MIGRATION_FILES.filter(name => name === creator)).toEqual([creator]);
      expect(C2C_MIGRATION_FILES.indexOf(creator)).toBeLessThan(C2C_MIGRATION_FILES.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC));
    }
    expect(C2C_MIGRATION_FILES.slice(-3)).toEqual([UUID_TENANT_ISOLATION_NONPUBLIC, CHILD_TABLE_PARENT_SCOPE, TENANT_ISOLATION_SWEEP]);
    const applier = read('scripts/db/migration-set.mjs');
    expect(applier).toContain('const full = path.join(repoRoot, file)');
    expect(applier).toContain('const wrap = !selfTransacting(sql)');
    expect(review).toMatch(/^\s*BEGIN;/);
    expect(review).toMatch(/COMMIT;\s*$/);
  });
  it('adds unknown historical update time without stamping existing decisions with deployment time', () => {
    expect(review).toMatch(/ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP\s*;/);
    expect(review).not.toMatch(/ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP\s+(?:DEFAULT|NOT NULL)/);
    expect(review).toMatch(/ALTER COLUMN updated_at SET DEFAULT NOW\(\)/);
    expect(review.indexOf('ADD COLUMN IF NOT EXISTS updated_at')).toBeLessThan(review.indexOf('ALTER COLUMN updated_at SET DEFAULT'));
    expect(review).not.toMatch(/\bUPDATE\s+(?:public\.)?concept2cure_review_decisions\b/i);
    const schema = read('shared/schema.ts');
    const decisions = schema.slice(schema.indexOf('export const concept2cureReviewDecisions ='), schema.indexOf('export type Concept2cureReviewDecision ='));
    expect(decisions).toContain("updatedAt: timestamp('updated_at').defaultNow()");
    expect(decisions).not.toMatch(/updatedAt:[^\n]*notNull/);
    const route = read('server/routes/c2c/artifacts.ts');
    expect(route).toMatch(/\.select\(\)\s*\.from\(concept2cureReviewDecisions\)/);
    expect(route).toMatch(/\.insert\(concept2cureReviewDecisions\)/);
  });
  it.each([[sharingPath, sharing], [reviewPath, review]])('%s refuses malformed stores and checks semantic immediate unique identities', (_path, sql) => {
    expect(sql).toContain('required_columns');
    expect(sql).toContain('key_columns');
    for (const term of ['pg_attribute', 'pg_index', 'indisunique', 'indisvalid', 'indisready', 'indimmediate', 'indpred IS NULL', 'indexprs IS NULL']) expect(sql).toContain(term);
    expect(sql).toMatch(/RAISE EXCEPTION '[^']*requires reconciliation/);
    expect(sql).not.toMatch(/\bDROP\s+(?:TABLE|INDEX|CONSTRAINT|POLICY)\b/i);
    expect(sql).not.toMatch(/\b(?:INSERT INTO|DELETE FROM|TRUNCATE)\s+(?:public\.)?(?:project_members|project_visibility_settings|concept2cure_review_assignments|concept2cure_review_decisions)\b/i);
    expect(sql).not.toMatch(/^\s*(?:GRANT|REVOKE)\b/im);
    expect(sql).not.toMatch(/ALTER\s+COLUMN\s+\w+\s+TYPE\b/i);
  });
  it('preserves the existing explicit sharing role and stronger creator CHECK sets', () => {
    expect(sharing).toMatch(/role TEXT NOT NULL\s*,/);
    expect(sharing).toContain("visibility IN ('private', 'org_public')");
    expect(sharing).toContain("role IN ('owner', 'edit', 'use')");
    expect(sharing).toContain("status IN ('active', 'revoked')");
    expect(review).toContain("status IN ('pending','in_progress','completed','withdrawn')");
    expect(review).toContain("decision IN ('approve','request_changes','reject')");
  });
});
