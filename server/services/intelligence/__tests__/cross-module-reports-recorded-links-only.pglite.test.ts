/**
 * The cross-module report states only relationships recorded in the data
 * (2026-10-15, finding 18).
 *
 * What the code used to do:
 *  - every approved/published document paired with every draft in the project
 *    was a 'missing_dependency' at severity 'high' ("Complete and advance ... to
 *    match the lifecycle stage"), with no relationship between them checked;
 *  - two approved documents of one type updated 7+ days apart were a
 *    'stale_reference' ("may reference outdated content"), with no reference
 *    checked;
 *  - the unlinked-document detector selected evidence_links.source_id, a column
 *    no migration creates, so on a provisioned schema it failed with 42703 and
 *    the whole report threw; where evidence_links was missing (42P01) it
 *    reported no unlinked documents at all.
 *
 * The last case is a guard, not a reproduction: drizzle wraps driver errors,
 * so the old 42P01 swallow never matched and a missing table already threw.
 *
 * Real DDL on PGlite: projects and documents from the base migration, the
 * evidence tables from their creator migration.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';

const holder = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite, db: null as unknown }));
vi.mock('../../../db.js', () => ({
  get db() {
    return holder.db;
  },
}));

import { analyzeCrossModuleRelationships } from '../cross-module-intelligence';

const ORG = 1;
const PROJECT = 5;
const run = (sql: string) => holder.pg.exec(sql);

beforeAll(async () => {
  holder.pg = new PGlite();
  holder.db = drizzle(holder.pg);
  await run(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT); INSERT INTO organizations (id, name) VALUES (1, 'acme');`);
  await run(readFileSync(join(REPO_ROOT, 'migrations/20260524_program_workbench_schema.sql'), 'utf8'));
  await run(extractTableDdl('migrations/0000_sweet_joseph.sql', ['projects', 'documents']));
  await run(`
    INSERT INTO projects (id, organization_id, client_workspace_id, name, type) VALUES (${PROJECT}, ${ORG}, 1, 'P', 'ind');
    INSERT INTO documents (id, organization_id, client_workspace_id, project_id, document_code, title, document_type, status, owner_id, created_by_id, updated_at) VALUES
      (1, ${ORG}, 1, ${PROJECT}, 'D-1', 'Approved protocol', 'protocol', 'approved', 1, 1, NOW() - INTERVAL '30 days'),
      (2, ${ORG}, 1, ${PROJECT}, 'D-2', 'Unrelated draft cover letter', 'letter', 'draft', 1, 1, NOW()),
      (3, ${ORG}, 1, ${PROJECT}, 'D-3', 'Approved protocol v2', 'protocol', 'approved', 1, 1, NOW()),
      (4, ${ORG}, 1, ${PROJECT}, 'D-4', 'Stability report', 'report', 'draft', 1, 1, NOW());
    -- Document 4 is the recorded source of an evidence object.
    INSERT INTO evidence_objects (organization_id, title, code, evidence_type, evidence_category, source_type, document_id)
      VALUES (${ORG}, 'Stability data', 'EV-1', 'test_report', 'quality', 'internal', 4);
  `);
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

describe('the cross-module report', () => {
  it('runs on the provisioned schema', async () => {
    const report = await analyzeCrossModuleRelationships({ organizationId: ORG, projectId: PROJECT });
    expect(report.documentsExamined).toBe(4);
  });

  it('reports no dependency or reference that is not recorded', async () => {
    const report = await analyzeCrossModuleRelationships({ organizationId: ORG, projectId: PROJECT });
    for (const i of report.insights) {
      expect(i.type).not.toBe('missing_dependency');
      expect(i.type).not.toBe('stale_reference');
      expect(i.description).not.toMatch(/may reference outdated content/);
    }
    const heuristics = report.insights.filter(i => i.basis === 'co_occurrence_heuristic');
    expect(heuristics.length).toBeGreaterThan(0);
    for (const h of heuristics) {
      expect(h.severity).toBe('low');
      expect(h.description).toMatch(/no link between them was checked/i);
    }
    // The approved protocol and the unrelated cover letter are an observed
    // co-occurrence, not a dependency.
    const pair = report.insights.find(i => i.sourceDocumentId === '1' && i.targetDocumentId === '2');
    expect(pair).toMatchObject({ type: 'status_co_occurrence', severity: 'low', basis: 'co_occurrence_heuristic' });
  });

  it('names the documents no evidence record mentions, from the evidence records', async () => {
    const report = await analyzeCrossModuleRelationships({ organizationId: ORG, projectId: PROJECT });
    const unlinked = report.insights.filter(i => i.type === 'no_recorded_evidence_link');
    expect(unlinked.map(i => i.sourceDocumentId).sort()).toEqual(['1', '2', '3']);
    for (const u of unlinked) {
      expect(u.basis).toBe('evidence_records');
      expect(u.description).not.toMatch(/regulatory program module/);
    }
  });

  it('is an error, not a report of co-occurrences, when the evidence records cannot be read', async () => {
    await run(`ALTER TABLE evidence_links RENAME TO evidence_links_hidden`);
    try {
      const err = await analyzeCrossModuleRelationships({ organizationId: ORG, projectId: PROJECT }).then(
        () => null,
        (e: { code?: string; cause?: { code?: string } }) => e,
      );
      // drizzle wraps the driver error; the Postgres code is on its cause.
      expect(err?.cause?.code ?? err?.code).toBe('42P01');
    } finally {
      await run(`ALTER TABLE evidence_links_hidden RENAME TO evidence_links`);
    }
  });
});
