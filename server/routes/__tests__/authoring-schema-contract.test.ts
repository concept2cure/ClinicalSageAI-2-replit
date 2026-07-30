/**
 * Authoring schema-contract test.
 *
 * Plans the authoring router's SQL against the real migration schema: it parses
 * the columns 20260730_authoring_subsystem_schema.sql actually creates and
 * asserts that every column server/routes/authoring.router.ts references exists.
 * This is the test class that caught the original defect — endpoints querying
 * columns (and whole tables) that were never created — and it fails loudly if
 * the router and the schema ever drift apart again.
 *
 * Hermetic: pure file parsing, no database. The CONTRACT below is the set of
 * columns the router's SQL references per table (INSERT/SELECT/UPDATE/WHERE/
 * ON CONFLICT/JOIN), extracted from authoring.router.ts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The router validates against the CANONICAL authoring schema — the union of the
// migrations a real deploy actually applies (ledger C-27). The 20260725_* loop /
// audit / signature files are the canonical definitions of the shared tables;
// 20260730_authoring_runtime_ddl adds the router's own tables; the
// comments_router_columns ALTER unions the CoAuthor columns onto the canonical
// authoring_comments / user_pins; and 20260730_authoring_subsystem_schema now
// contributes only its genuinely-new workflow tables (its 10 duplicate copies of
// the canonical tables were retired). Parsing the union — not one file — is what
// keeps this contract honest about the schema that ships.
const CANONICAL_MIGRATIONS = [
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  'db/migrations/20260725_authoring_audit_trail.sql',
  'db/migrations/20260725_authoring_signatures_and_workflow.sql',
  'db/migrations/20260725_authoring_signature_freeze_binding.sql',
  'db/migrations/20260730_authoring_runtime_ddl.sql',
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  'db/migrations/20260730_authoring_subsystem_schema.sql',
].map((r) => path.join(__dirname, '../../../', r));
const ROUTER = path.join(__dirname, '../authoring.router.ts');

/** Parse `CREATE TABLE IF NOT EXISTS name ( ... )` blocks → table → Set(columns). */
function parseCreatedTables(sql: string): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  const tableRe = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(sql))) {
    const table = m[1];
    // Walk from the opening paren to its matching close paren.
    let depth = 0;
    let i = m.index + m[0].length - 1; // at the '('
    const start = i + 1;
    for (; i < sql.length; i++) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = sql.slice(start, i);
    const cols = new Set<string>();
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      // Skip table-level constraint clauses.
      if (/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\b/i.test(line)) continue;
      const col = line.match(/^([a-z_][a-z0-9_]*)\s+/i);
      if (col) cols.add(col[1].toLowerCase());
    }
    out[table] = cols;
  }
  return out;
}

/** Fold `ALTER TABLE [IF EXISTS] name ADD COLUMN [IF NOT EXISTS] col …` into the map. */
function applyAlterAddColumns(sql: string, into: Record<string, Set<string>>): void {
  const alterRe =
    /ALTER TABLE(?:\s+IF EXISTS)?\s+([a-z_][a-z0-9_]*)([\s\S]*?);/gi;
  let m: RegExpExecArray | null;
  while ((m = alterRe.exec(sql))) {
    const table = m[1].toLowerCase();
    const cols = into[table] ?? (into[table] = new Set<string>());
    const addRe = /ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)\s+/gi;
    let a: RegExpExecArray | null;
    while ((a = addRe.exec(m[2]))) cols.add(a[1].toLowerCase());
  }
}

/** The canonical created-table map: CREATE TABLE across every canonical migration, plus ALTER-added columns. */
function buildCanonicalSchema(): Record<string, Set<string>> {
  const merged: Record<string, Set<string>> = {};
  for (const file of CANONICAL_MIGRATIONS) {
    const sql = fs.readFileSync(file, 'utf8');
    const created = parseCreatedTables(sql);
    for (const [table, cols] of Object.entries(created)) {
      const target = merged[table] ?? (merged[table] = new Set<string>());
      for (const c of cols) target.add(c);
    }
    applyAlterAddColumns(sql, merged);
  }
  return merged;
}

/**
 * Columns the router references per table. If the router starts querying a new
 * column, add it here and to the migration together — the test keeps them honest.
 */
const CONTRACT: Record<string, string[]> = {
  authoring_documents: [
    'id', 'title', 'module', 'product_code', 'locale', 'status', 'created_by',
    'template_id', 'submitted_at', 'current_workflow_id', 'approved_at', 'frozen_at',
    'locked_at', 'locked_by', 'version', 'tenant_id', 'created_at', 'updated_at',
  ],
  // Canonical (0725) column names — the router uses doc_id / order_index / code
  // (see the note near the router's freeze-diff query: authoring_sections "has
  // `code` and `doc_id`, never `section_number` or `document_id`"). The
  // document_id / order_idx / section_number names belong to OTHER tables
  // (frozen_documents, export history) or to on-disk template JSON, not this one.
  authoring_sections: [
    'id', 'doc_id', 'code', 'title', 'content', 'order_index',
    'track_changes', 'tenant_id', 'created_at', 'updated_at',
  ],
  authoring_comments: [
    'id', 'doc_id', 'section_id', 'body', 'anchor', 'status', 'created_by',
    'user_name', 'user_email', 'parent_comment_id', 'position_data', 'resolved_by',
    'resolved_at', 'resolution_note', 'tenant_id', 'created_at', 'updated_at',
  ],
  authoring_comment_activity: [
    'id', 'doc_id', 'comment_id', 'activity_type', 'actor_id', 'actor_name',
    'metadata', 'tenant_id', 'created_at',
  ],
  authoring_citations: [
    'id', 'section_id', 'source', 'anchor', 'citation_text', 'reference_id',
    'created_by', 'payload_sha256', 'frozen_at', 'tenant_id', 'created_at',
  ],
  authoring_reviews: [
    'id', 'doc_id', 'reviewer_id', 'reviewer_name', 'reviewer_email', 'review_status',
    'review_comments', 'reviewed_at', 'requested_at', 'requested_by', 'tenant_id',
    'created_at', 'updated_at',
  ],
  authoring_audit_events: [
    'id', 'doc_id', 'event_type', 'actor', 'metadata', 'tenant_id', 'created_at',
  ],
  authoring_audit_trail: [
    'id', 'doc_id', 'section_id', 'operation_type', 'actor_email', 'actor_role',
    'before_content', 'after_content', 'content_hash_before', 'content_hash_after',
    'change_reason', 'metadata', 'ip_address', 'user_agent', 'session_id',
    'tenant_id', 'created_at',
  ],
  authoring_ai_suggestions: [
    'id', 'document_id', 'section_id', 'suggestion_type', 'severity', 'original_text',
    'suggested_text', 'explanation', 'position_start', 'position_end',
    'confidence_score', 'status', 'resolved_at', 'resolved_by', 'tenant_id', 'created_at',
  ],
  authoring_compliance_scores: [
    'id', 'document_id', 'regulatory_score', 'technical_score', 'clarity_score',
    'consistency_score', 'completeness_score', 'overall_score', 'ich_compliance',
    'ctd_compliance', 'ind_compliance', 'missing_sections', 'analysis_timestamp',
    'tenant_id',
  ],
  authoring_suggestion_feedback: [
    'suggestion_id', 'action', 'modified_text', 'user_email', 'feedback_reason', 'tenant_id',
  ],
  authoring_workflow_steps: [
    'workflow_id', 'doc_id', 'step_no', 'role', 'approver_email', 'status',
    'decision_note', 'decided_at', 'tenant_id', 'created_at',
  ],
  authoring_signatures: [
    'id', 'doc_id', 'signer_email', 'signer_name', 'meaning', 'reason', 'method',
    'content_hash', 'signature_digest', 'signed_at', 'tenant_id',
  ],
  authoring_exports: [
    'id', 'doc_id', 'format', 'options', 'performed_by', 'file_hash', 'tenant_id', 'created_at',
  ],
  frozen_documents: [
    'id', 'document_id', 'version', 'frozen_content', 'content_hash', 'frozen_by',
    'frozen_reason', 'frozen_at', 'tenant_id',
  ],
  doc_change_requests: [
    'cr_id', 'doc_id', 'section_id', 'title', 'reason', 'apply_kind', 'patch_json',
    'proposer_email', 'approver_email', 'status', 'resolved_at', 'created_at',
  ],
  doc_checklist: [
    'checklist_id', 'doc_id', 'section_id', 'region', 'reviewer_email', 'status', 'created_at',
  ],
  doc_checklist_items: [
    'item_id', 'checklist_id', 'item_key', 'text', 'status', 'comment', 'evidence_cite',
    'created_at', 'updated_at',
  ],
  doc_permissions: ['id', 'doc_id', 'section_id', 'email', 'role', 'created_at'],
  doc_exports: ['id', 'doc_id', 'fmt', 'doc_sha256', 'created_at'],
  template_sections: ['id', 'template_id', 'code', 'title', 'content', 'order_index', 'tenant_id'],
  user_pins: [
    'email', 'pin_hash', 'tenant_id', 'failed_attempts', 'locked_until', 'last_attempt',
    'pin_expires_at', 'last_changed',
  ],
};

/** Tables provisioned OUTSIDE this migration (runtime ensure* DDL + prior migrations). */
const PROVISIONED_ELSEWHERE = new Set([
  // runtime `ensure*` DDL inside authoring.router.ts
  'authoring_tokens', 'authoring_templates', 'authoring_export_history',
  'authoring_tracked_change_decisions', 'template_guidance', 'template_usage',
  'section_guidance',
  // prior migrations / shared
  'electronic_signatures', 'doc_revisions', 'users',
]);

describe('authoring schema contract — migration matches the router SQL', () => {
  const created = buildCanonicalSchema();

  it('parses the migration into tables', () => {
    expect(Object.keys(created).length).toBeGreaterThanOrEqual(Object.keys(CONTRACT).length);
  });

  it('creates every contracted table', () => {
    const missing = Object.keys(CONTRACT).filter((t) => !created[t]);
    expect(missing, `tables missing from the migration: ${missing.join(', ')}`).toEqual([]);
  });

  for (const [table, cols] of Object.entries(CONTRACT)) {
    it(`${table} has every column the router queries`, () => {
      const have = created[table];
      expect(have, `${table} is not created by the migration`).toBeTruthy();
      const missing = cols.filter((c) => !have.has(c));
      expect(missing, `${table} is missing columns the router references: ${missing.join(', ')}`).toEqual([]);
    });
  }
});

describe('authoring schema contract — no table is referenced-but-uncreated', () => {
  it('every authoring table the router queries is provisioned somewhere', () => {
    const router = fs.readFileSync(ROUTER, 'utf8');
    const refs = new Set<string>();
    const re = /\b(?:from|into|update|join)\s+([a-z_][a-z0-9_]*)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(router))) {
      const t = m[1].toLowerCase();
      // Only guard the authoring subsystem's own tables.
      if (/^(authoring_|doc_|template_sections|frozen_documents|user_pins|electronic_signatures)/.test(t)) {
        refs.add(t);
      }
    }
    const created = new Set(Object.keys(buildCanonicalSchema()));
    const unprovisioned = [...refs].filter(
      (t) => !created.has(t) && !PROVISIONED_ELSEWHERE.has(t),
    );
    expect(
      unprovisioned,
      `authoring tables referenced by the router but created by no migration/runtime DDL: ${unprovisioned.join(', ')}`,
    ).toEqual([]);
  });
});

describe('authoring schema contract — the router issues no runtime DDL', () => {
  const RUNTIME_DDL_MIGRATION = path.join(
    __dirname,
    '../../../db/migrations/20260730_authoring_runtime_ddl.sql',
  );
  const RUNTIME_DDL_TABLES = [
    'authoring_tokens', 'authoring_templates', 'template_guidance', 'template_usage',
    'section_guidance', 'authoring_export_history', 'authoring_tracked_change_decisions',
  ];

  it('authoring.router.ts contains no CREATE TABLE — schema lives in migrations', () => {
    const router = fs.readFileSync(ROUTER, 'utf8');
    const createTableCount = (router.match(/CREATE TABLE/gi) ?? []).length;
    expect(createTableCount, 'the router must not create tables at runtime; declare them in a migration').toBe(0);
  });

  it('the previously runtime-only tables are now declared in a migration', () => {
    const sql = fs.readFileSync(RUNTIME_DDL_MIGRATION, 'utf8');
    const created = new Set(Object.keys(parseCreatedTables(sql)));
    const missing = RUNTIME_DDL_TABLES.filter((t) => !created.has(t));
    expect(missing, `runtime-DDL tables missing from the migration: ${missing.join(', ')}`).toEqual([]);
  });
});
