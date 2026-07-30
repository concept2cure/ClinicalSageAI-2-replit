/**
 * Authoring schema — END-TO-END against a real (in-process PGlite) Postgres.
 *
 * The schema-contract test proves the migration DECLARES the columns the router
 * references. This proves the migration actually APPLIES to a real Postgres
 * engine and that the router's real INSERT/SELECT/UPDATE statements EXECUTE
 * against it — closing the gap between "it compiles / unit-tests with mocks" and
 * "the SQL runs". It exercises the exact statements that were failing with
 * missing-relation errors, the ON CONFLICT upserts, the FK cascade, the jsonb
 * columns (the anchor/metadata type question), and the canonical spine's
 * status/placement UPDATEs.
 *
 * PGlite is pure-WASM Postgres — no server, no docker, no cloud.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.join(__dirname, '../../../db/migrations');

// The CANONICAL authoring schema a real deploy applies, in order (ledger C-27):
// the 20260725_* loop/audit/signature files own the shared tables; the
// comments_router_columns ALTER unions the CoAuthor columns onto the canonical
// authoring_comments / user_pins; runtime_ddl adds the router's own tables; and
// 20260730_authoring_subsystem_schema now contributes only its genuinely-new
// workflow tables. (Its 10 duplicate copies of the canonical tables were retired,
// so it can no longer stand alone — the 0725 files provide them.)
const CANONICAL_MIGRATION_FILES = [
  '20260725_authoring_document_loop_tables.sql',
  '20260725_authoring_audit_trail.sql',
  '20260725_authoring_signatures_and_workflow.sql',
  '20260725_authoring_signature_freeze_binding.sql',
  '20260730_authoring_comments_router_columns.sql',
  '20260730_authoring_runtime_ddl.sql',
  '20260730_authoring_subsystem_schema.sql',
];

// Minimal concept2cure_artifacts to exercise the spine's status/placement SQL
// (the canonical identity; its full DDL lives in the core schema, out of scope).
const ARTIFACTS_MINIMAL_DDL = `
CREATE TABLE IF NOT EXISTS concept2cure_artifacts (
  id              SERIAL PRIMARY KEY,
  artifact_id     TEXT NOT NULL,
  organization_id INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  ctd_section     TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

// The canonical authoring_documents/sections/comments carry UUID ids (0725). The
// router mints ids with gen_random_uuid()::text — valid UUID strings — so these
// fixtures use real UUIDs, matching runtime, rather than the TEXT-id shorthand
// that only worked against the retired 20260730 shape.
const DOC_ID = '11111111-1111-1111-1111-111111111111';
const SEC_ID = '22222222-2222-2222-2222-222222222222';
const SEC_ID_2 = '22222222-2222-2222-2222-2222222222a2';
const SEC_ID_3 = '22222222-2222-2222-2222-2222222222a3';
const CMT_ID = '33333333-3333-3333-3333-333333333333';

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  for (const f of CANONICAL_MIGRATION_FILES) {
    await pg.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  }
  await pg.exec(ARTIFACTS_MINIMAL_DDL);
});
afterAll(async () => {
  await pg.close();
});

describe('authoring migrations apply to a real Postgres engine', () => {
  it('creates all 22 subsystem tables + 7 runtime-DDL tables', async () => {
    const { rows } = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = new Set(rows.map((r) => r.table_name));
    const expected = [
      'authoring_documents', 'authoring_sections', 'authoring_comments', 'authoring_comment_activity',
      'authoring_citations', 'authoring_reviews', 'authoring_audit_events', 'authoring_audit_trail',
      'authoring_ai_suggestions', 'authoring_compliance_scores', 'authoring_suggestion_feedback',
      'authoring_workflow_steps', 'authoring_signatures', 'authoring_exports', 'frozen_documents',
      'doc_change_requests', 'doc_checklist', 'doc_checklist_items', 'doc_permissions', 'doc_exports',
      'template_sections', 'user_pins',
      'authoring_tokens', 'authoring_templates', 'template_guidance', 'template_usage',
      'section_guidance', 'authoring_export_history', 'authoring_tracked_change_decisions',
    ];
    const missing = expected.filter((t) => !tables.has(t));
    expect(missing, `tables not created by the migrations: ${missing.join(', ')}`).toEqual([]);
  });
});

describe("the router's real SQL executes against the migrated schema", () => {
  it('create-document + create-section flow (the exact router INSERTs) succeeds', async () => {
    await pg.query(
      `INSERT INTO authoring_documents
       (id, title, module, product_code, locale, status, created_by, created_at, updated_at, tenant_id, template_id)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, NOW(), NOW(), $7, $8)`,
      [DOC_ID, 'Clinical Overview', 'M2', 'PRD-1', 'en-US', 'author-1', 1, null],
    );
    await pg.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [SEC_ID, DOC_ID, '2.5', 'Clinical Overview', 'Body', 0, 1],
    );
    const back = await pg.query<{ title: string }>(
      `SELECT s.title FROM authoring_sections s
       JOIN authoring_documents d ON d.id = s.doc_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [SEC_ID, 1],
    );
    expect(back.rows[0]?.title).toBe('Clinical Overview');
  });

  it('section upsert honors ON CONFLICT (doc_id, code, tenant_id)', async () => {
    const sql = `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (doc_id, code, tenant_id) DO UPDATE SET title = EXCLUDED.title`;
    await pg.query(sql, [SEC_ID_2, DOC_ID, '3.2.S', 'Drug Substance', 'x', 1, 1]);
    await pg.query(sql, [SEC_ID_3, DOC_ID, '3.2.S', 'Drug Substance (rev)', 'y', 1, 1]);
    const rows = await pg.query(`SELECT title FROM authoring_sections WHERE doc_id=$1 AND code='3.2.S' AND tenant_id=1`, [DOC_ID]);
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as { title: string }).title).toBe('Drug Substance (rev)');
  });

  it('comment INSERT accepts jsonb anchor + position_data (the type question, verified)', async () => {
    // node-postgres serializes JS objects to JSON for jsonb columns; a structured
    // editor anchor/position is an object, which is what this asserts works.
    await pg.query(
      `INSERT INTO authoring_comments
       (id, doc_id, section_id, body, anchor, status, created_by, user_name, user_email, parent_comment_id, position_data, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11, NOW())`,
      [CMT_ID, DOC_ID, SEC_ID, 'Please cite this', JSON.stringify({ from: 10, to: 20 }), 'author-1', 'Author', 'a@x.io', null, JSON.stringify({ x: 1 }), 1],
    );
    const r = await pg.query<{ anchor: unknown }>(`SELECT anchor FROM authoring_comments WHERE id=$1`, [CMT_ID]);
    expect(r.rows[0]?.anchor).toEqual({ from: 10, to: 20 });
  });

  it('review request upsert honors ON CONFLICT (doc_id, reviewer_id, tenant_id)', async () => {
    const sql = `INSERT INTO authoring_reviews
       (id, doc_id, reviewer_id, reviewer_name, reviewer_email, review_status, requested_by, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW())
       ON CONFLICT (doc_id, reviewer_id, tenant_id) DO UPDATE SET requested_at = NOW(), requested_by = EXCLUDED.requested_by`;
    await pg.query(sql, ['rv-1', 'doc-1', 'rev-9', 'Reviewer', 'r@x.io', 'requester-a', 1]);
    await pg.query(sql, ['rv-2', 'doc-1', 'rev-9', 'Reviewer', 'r@x.io', 'requester-b', 1]);
    const rows = await pg.query(`SELECT requested_by FROM authoring_reviews WHERE doc_id='doc-1' AND reviewer_id='rev-9' AND tenant_id=1`);
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as { requested_by: string }).requested_by).toBe('requester-b');
  });

  it('compliance-scores upsert honors ON CONFLICT (document_id, tenant_id) with numeric scores + jsonb blobs', async () => {
    const sql = `INSERT INTO authoring_compliance_scores
       (document_id, regulatory_score, technical_score, clarity_score, consistency_score, completeness_score, overall_score,
        ich_compliance, ctd_compliance, ind_compliance, missing_sections, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (document_id, tenant_id) DO UPDATE SET overall_score = EXCLUDED.overall_score, analysis_timestamp = NOW()`;
    await pg.query(sql, ['doc-1', 80, 70, 90, 95, 85, 84, '{}', '{}', '{}', '[]', 1]);
    await pg.query(sql, ['doc-1', 80, 70, 90, 95, 85, 88.5, '{}', '{}', '{}', '[]', 1]);
    const rows = await pg.query(`SELECT overall_score FROM authoring_compliance_scores WHERE document_id='doc-1' AND tenant_id=1`);
    expect(rows.rows).toHaveLength(1);
    expect(Number((rows.rows[0] as { overall_score: string }).overall_score)).toBeCloseTo(88.5);
  });

  it('checklist + items with FK cascade on delete', async () => {
    await pg.query(`INSERT INTO doc_checklist (checklist_id, doc_id, section_id, region, reviewer_email) VALUES ($1,$2,$3,$4,$5)`,
      ['cl-1', 'doc-1', 'sec-1', 'ICH', 'r@x.io']);
    await pg.query(`INSERT INTO doc_checklist_items (item_id, checklist_id, item_key, text) VALUES ($1,$2,$3,$4)`,
      ['it-1', 'cl-1', 'P5-SPECS', 'Specs complete']);
    await pg.query(`DELETE FROM doc_checklist WHERE checklist_id='cl-1'`);
    const items = await pg.query(`SELECT item_id FROM doc_checklist_items WHERE checklist_id='cl-1'`);
    expect(items.rows).toHaveLength(0); // cascaded
  });

  it('user_pins composite PK (email, tenant_id) + lockout columns', async () => {
    await pg.query(
      `INSERT INTO user_pins (email, pin_hash, tenant_id, created_at, last_changed) VALUES ($1,$2,$3,NOW(),NOW())`,
      ['u@x.io', 'hash', 1],
    );
    await pg.query(`UPDATE user_pins SET failed_attempts = failed_attempts + 1, last_attempt = NOW(), locked_until = NOW() WHERE email='u@x.io' AND tenant_id=1`);
    const r = await pg.query(`SELECT failed_attempts FROM user_pins WHERE email='u@x.io' AND tenant_id=1`);
    expect(Number((r.rows[0] as { failed_attempts: number }).failed_attempts)).toBe(1);
  });

  it('runtime-DDL tables work: token UNIQUE(section_id, cite_id) + tracked-change CHECK(decision)', async () => {
    await pg.query(`INSERT INTO authoring_tokens (section_id, cite_id, token_key) VALUES ('s1','c1','k1')`);
    await expect(
      pg.query(`INSERT INTO authoring_tokens (section_id, cite_id, token_key) VALUES ('s1','c1','k2')`),
    ).rejects.toThrow(); // UNIQUE(section_id, cite_id)
    await expect(
      pg.query(`INSERT INTO authoring_tracked_change_decisions (artifact_id, change_id, decision, user_id, tenant_id) VALUES ('a','c','maybe','u',1)`),
    ).rejects.toThrow(); // CHECK (decision IN ('accept','reject'))
  });
});

describe("the canonical spine's status + placement SQL executes", () => {
  it('setReviewStatusTx flips draft → review but never a locked artifact; setPlacementTx sets ctd_section', async () => {
    await pg.query(`INSERT INTO concept2cure_artifacts (artifact_id, organization_id, status) VALUES ('art-1', 1, 'draft')`);
    await pg.query(`INSERT INTO concept2cure_artifacts (artifact_id, organization_id, status) VALUES ('art-2', 1, 'locked')`);

    const LOCKED = ['locked', 'frozen', 'approved', 'submission_ready', 'submitted'];
    const flip = async (artifactId: string) => {
      const updated = await pg.query(
        `UPDATE concept2cure_artifacts SET status='review', updated_at=now()
          WHERE artifact_id=$1 AND organization_id=$2 AND status <> ALL($3::text[]) RETURNING status`,
        [artifactId, 1, LOCKED],
      );
      return updated.rows[0] as { status: string } | undefined;
    };
    expect((await flip('art-1'))?.status).toBe('review'); // draft flips
    expect(await flip('art-2')).toBeUndefined(); // locked is protected

    await pg.query(
      `UPDATE concept2cure_artifacts SET ctd_section=$3, updated_at=now() WHERE artifact_id=$1 AND organization_id=$2`,
      ['art-1', 1, '2.5'],
    );
    const r = await pg.query(`SELECT ctd_section FROM concept2cure_artifacts WHERE artifact_id='art-1'`);
    expect((r.rows[0] as { ctd_section: string }).ctd_section).toBe('2.5');
  });
});
