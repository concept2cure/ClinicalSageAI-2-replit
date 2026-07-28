/**
 * Schema contract: the authoring-router supplementary stores (G-02).
 *
 * Eleven tables the router / command-executor read/write had NO CREATE TABLE
 * anywhere in the repo (they sat on the unbacked-tables baseline), so on a fresh
 * database every AI-suggestion / review / checklist / change-request /
 * compliance-score / comment-activity / audit-events endpoint 500s or no-ops.
 * db/migrations/20260728_authoring_supplementary_tables.sql reconstructs them
 * from the code's own queries.
 *
 * This suite applies that migration to real Postgres (PGlite) and runs the EXACT
 * INSERT / SELECT / UPDATE statements the code issues (including the two
 * `ON CONFLICT` upserts and the two intra-cluster foreign keys). A wrong or
 * missing column, a wrong ON CONFLICT target, or a broken FK fails the query —
 * which is the proof the reconstruction matches the code.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = 'db/migrations/20260728_authoring_supplementary_tables.sql';
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SEC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CMT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TPL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const T = 1; // tenant

let db: PGlite;
const q = (sql: string, params?: unknown[]) => db.query(sql, params as unknown[]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.resolve(MIGRATION), 'utf8'));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('authoring supplementary stores (G-02) match the code', () => {
  it('authoring_ai_suggestions: insert, tenant-scoped select, resolve update', async () => {
    await q(
      `INSERT INTO authoring_ai_suggestions
        (document_id, section_id, suggestion_type, severity, original_text, suggested_text,
         explanation, position_start, position_end, confidence_score, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [DOC, SEC, 'regulatory', 'critical', 'was', 'now', 'why', 0, 0, 0.85, T],
    );
    const sel = await q(
      `SELECT id, document_id, section_id, suggestion_type, severity, original_text, suggested_text,
              explanation, position_start, position_end, confidence_score, status, resolved_at,
              resolved_by, created_at, tenant_id
         FROM authoring_ai_suggestions
        WHERE document_id = $1 AND status = $2 AND tenant_id = $3
        ORDER BY severity DESC, position_start ASC`,
      [DOC, 'pending', T],
    );
    expect(sel.rows.length).toBe(1);
    const id = (sel.rows[0] as { id: string }).id;
    const upd = await q(
      `UPDATE authoring_ai_suggestions SET status = $1, resolved_at = NOW(), resolved_by = $2 WHERE id = $3`,
      ['accept', 'me@x.test', id],
    );
    expect(upd.affectedRows).toBe(1);
  });

  it('authoring_audit_events: read-only shape (out-of-band write) selects', async () => {
    await q(
      `INSERT INTO authoring_audit_events (doc_id, event_type, actor, metadata, tenant_id)
       VALUES ($1,$2,$3,$4::jsonb,$5)`,
      [DOC, 'freeze', 'a@x.test', JSON.stringify({ v: 1 }), T],
    );
    const sel = await q(
      `SELECT id, doc_id, event_type, actor, metadata, created_at, tenant_id
         FROM authoring_audit_events WHERE doc_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC LIMIT $3`,
      [DOC, T, 50],
    );
    expect(sel.rows.length).toBe(1);
  });

  it('authoring_comment_activity: insert (with and without metadata) + select', async () => {
    await q(
      `INSERT INTO authoring_comment_activity
        (id, doc_id, comment_id, activity_type, actor_id, actor_name, metadata, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7, NOW())`,
      [DOC, CMT, 'comment_added', '7', 'Author', JSON.stringify({ section_id: SEC }), T],
    );
    // delete-path insert omits metadata
    await q(
      `INSERT INTO authoring_comment_activity
        (id, doc_id, comment_id, activity_type, actor_id, actor_name, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'comment_deleted', $3, $4, $5, NOW())`,
      [DOC, CMT, '7', 'Author', T],
    );
    const sel = await q(
      `SELECT id, doc_id, comment_id, activity_type, actor_id, actor_name, metadata, created_at, tenant_id
         FROM authoring_comment_activity WHERE doc_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC LIMIT $3`,
      [DOC, T, 50],
    );
    expect(sel.rows.length).toBe(2);
  });

  it('authoring_compliance_scores: upsert on (document_id, tenant_id)', async () => {
    const insert = () =>
      q(
        `INSERT INTO authoring_compliance_scores
          (document_id, regulatory_score, technical_score, clarity_score, consistency_score,
           completeness_score, overall_score, ich_compliance, ctd_compliance, ind_compliance,
           missing_sections, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (document_id, tenant_id) DO UPDATE SET
           regulatory_score = $2, technical_score = $3, clarity_score = $4,
           consistency_score = $5, completeness_score = $6, overall_score = $7,
           analysis_timestamp = NOW()`,
        [DOC, 90, 93, 85, 87, 85, 88.0, '{}', '{}', '{}', '[]', T],
      );
    await insert();
    await insert(); // second call must UPDATE, not violate the unique key
    const sel = await q(
      `SELECT id, document_id, overall_score, missing_sections, analysis_timestamp, tenant_id
         FROM authoring_compliance_scores WHERE document_id = $1 AND tenant_id = $2
        ORDER BY analysis_timestamp DESC LIMIT 1`,
      [DOC, T],
    );
    expect(sel.rows.length).toBe(1);
  });

  it('authoring_reviews: request upsert on (doc_id, reviewer_id, tenant_id) + submit update', async () => {
    const reqInsert = () =>
      q(
        `INSERT INTO authoring_reviews
          (id, doc_id, reviewer_id, reviewer_name, reviewer_email, review_status, requested_by, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW())
         ON CONFLICT (doc_id, reviewer_id, tenant_id) DO UPDATE SET requested_at = NOW(), requested_by = $6`,
        ['11111111-1111-4111-8111-111111111111', DOC, 'rev-1', 'Rev One', 'r1@x.test', 'req@x.test', T],
      );
    await reqInsert();
    await reqInsert(); // must UPDATE, not violate unique
    const exists = await q(
      `SELECT id FROM authoring_reviews WHERE doc_id = $1 AND reviewer_id = $2 AND tenant_id = $3`,
      [DOC, 'rev-1', T],
    );
    expect(exists.rows.length).toBe(1);
    const id = (exists.rows[0] as { id: string }).id;
    const upd = await q(
      `UPDATE authoring_reviews SET review_status = $1, review_comments = $2, reviewed_at = NOW(), updated_at = NOW()
        WHERE id = $3 AND tenant_id = $4`,
      ['approved', 'lgtm', id, T],
    );
    expect(upd.affectedRows).toBe(1);
  });

  it('authoring_suggestion_feedback: insert respects the FK to authoring_ai_suggestions', async () => {
    const s = await q(
      `INSERT INTO authoring_ai_suggestions
        (document_id, suggestion_type, severity, position_start, position_end, confidence_score, tenant_id)
       VALUES ($1,'clarity','style',0,0,0.5,$2) RETURNING id`,
      [DOC, T],
    );
    const suggestionId = (s.rows[0] as { id: string }).id;
    await q(
      `INSERT INTO authoring_suggestion_feedback
        (suggestion_id, action, modified_text, user_email, feedback_reason, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [suggestionId, 'modify', 'edited', 'u@x.test', 'clearer', T],
    );
    // FK must reject an orphan suggestion_id
    await expect(
      q(
        `INSERT INTO authoring_suggestion_feedback (suggestion_id, action, user_email, tenant_id)
         VALUES ('99999999-9999-4999-8999-999999999999','reject','u@x.test',$1)`,
        [T],
      ),
    ).rejects.toThrow();
  });

  it('doc_change_requests: insert with COALESCE defaults, approve/reject/apply lifecycle', async () => {
    const ins = await q(
      `INSERT INTO doc_change_requests (doc_id, section_id, title, reason, apply_kind, patch_json, proposer_email)
       VALUES ($1,$2,$3,$4,COALESCE($5,'CONTENT'),COALESCE($6::jsonb,'{}'::jsonb),$7) RETURNING cr_id, status`,
      [DOC, SEC, 'Fix wording', null, null, null, 'p@x.test'],
    );
    const cr = ins.rows[0] as { cr_id: string; status: string };
    expect(cr.status).toBe('OPEN');
    const upd = await q(
      `UPDATE doc_change_requests SET status='APPROVED', approver_email=$2, resolved_at=NOW()
        WHERE cr_id=$1 AND status='OPEN' RETURNING *`,
      [cr.cr_id, 'a@x.test'],
    );
    expect(upd.rows.length).toBe(1);
    const applied = await q(
      `UPDATE doc_change_requests SET status='APPLIED', resolved_at=NOW() WHERE cr_id=$1`,
      [cr.cr_id],
    );
    expect(applied.affectedRows).toBe(1);
  });

  it('doc_checklist + doc_checklist_items: create checklist, add items (FK), update item', async () => {
    const c = await q(
      `INSERT INTO doc_checklist (doc_id, section_id, region, reviewer_email) VALUES ($1,$2,$3,$4) RETURNING checklist_id`,
      [DOC, SEC, 'ICH', 'rev@x.test'],
    );
    const checklistId = (c.rows[0] as { checklist_id: string }).checklist_id;
    await q(
      `INSERT INTO doc_checklist_items (checklist_id, item_key, text) VALUES ($1,$2,$3)`,
      [checklistId, 'P5-SPECS', 'Check specs'],
    );
    const items = await q(
      `SELECT item_id, checklist_id, item_key, text, status, comment, evidence_cite, created_at, updated_at
         FROM doc_checklist_items WHERE checklist_id=$1 ORDER BY created_at`,
      [checklistId],
    );
    expect(items.rows.length).toBe(1);
    const itemId = (items.rows[0] as { item_id: string }).item_id;
    const upd = await q(
      `UPDATE doc_checklist_items
          SET status = COALESCE($2,status), comment = COALESCE($3,comment),
              evidence_cite = COALESCE($4,evidence_cite), updated_at = NOW()
        WHERE item_id=$1 RETURNING *`,
      [itemId, 'done', 'ok', 'cite-1'],
    );
    expect(upd.rows.length).toBe(1);
    // Item FK must reject an orphan checklist_id
    await expect(
      q(`INSERT INTO doc_checklist_items (checklist_id, item_key, text) VALUES ('88888888-8888-4888-8888-888888888888','k','t')`),
    ).rejects.toThrow();
  });

  // template_sections is deliberately NOT created by this migration — see the
  // removal note in the .sql. The authoring router reads the global
  // intelligence.template_sections catalog instead, so a public.template_sections
  // would be dead DDL and would shadow the real relation on the search path.

  it('doc_sections: command-executor read', async () => {
    await q(`INSERT INTO doc_sections (id, code, title) VALUES ($1,$2,$3)`, [SEC, '2.5.1', 'Sec']);
    const sel = await q(`SELECT id, code, title FROM doc_sections WHERE id = $1 LIMIT 1`, [SEC]);
    expect(sel.rows.length).toBe(1);
  });
});
