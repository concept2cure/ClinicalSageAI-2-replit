/**
 * C2C-AUDIT-001 — regulated AnA mutations must be ATOMIC with their 21 CFR
 * Part 11 §11.10(e) audit row.
 *
 * Before the fix, the six document-register handlers in AnaToolExecutor.ts fell
 * into three broken shapes:
 *
 *   create_qms_document   — getPool().query(INSERT ...) autocommit, NO audit at all
 *   approve_qms_document  — getPool().query(UPDATE ...) autocommit, NO audit at all
 *   revise_qms_document   — autocommit UPDATE, then `void auditService.logAction(...)`
 *   retire_qms_document   — autocommit UPDATE, then `void auditService.logAction(...)`
 *   save_document_to_vault  — COMMIT, then post-commit
 *                             `try { auditLog(...) } catch { /* never block on audit *\/ }`
 *                             (now an authoring draft; pinned in
 *                             draft-authoring-document-tool.pglite.integration.test.ts)
 *   update_vault_document   — same post-COMMIT swallowing shape
 *
 * In every case the regulated mutation could durably commit with no audit row:
 * the audit ran on a SEPARATE connection/transaction, was not awaited, and its
 * failures were swallowed.
 *
 * These tests run the REAL handlers against in-process Postgres (PGlite) with
 * the REAL recordGovernedAction and the REAL c2c_ana_actions DDL from
 * migrations/20260527_mutation_primitives.sql. Failure is injected by breaking
 * the audit_logs INSERT with a CHECK constraint — simulating an audit-integrity
 * failure INSIDE the transaction — and we then assert the regulated mutation
 * rolled back with it.
 *
 * On the parent commit these fail: the "no audit row" assertions fail for
 * create/approve (nothing was ever written), and every fail-closed assertion
 * fails because the mutation had already autocommitted / committed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { installQmsAuthoringHarness, seedQmsEditingCopy, QMS_TEST_PROGRAM } from '../../qms/__tests__/qms-authoring-harness';
import fs from 'node:fs';
import path from 'node:path';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  // >= 32 chars: server/config/environment.ts throws below that. Canonical
  // verifyJwtWithRotation reads JWT_SECRET_{ENV} first under NODE_ENV=test.
  const S = 'qms-vault-audit-atomicity-contract-secret-0727';
  process.env.JWT_SECRET = S;
  process.env.JWT_SECRET_DEV = S;
  process.env.JWT_SECRET_TEST = S;
});

let pglite: PGlite;

const q = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  const rows = r.rows as unknown[];
  return { rows: rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? rows.length };
};

// PGlite is a SINGLE connection, so BEGIN / COMMIT / ROLLBACK issued by the
// handler on this "client" are real Postgres transaction control — a rollback
// asserted below is a genuine rollback, not a mock recording.
const fakeClient = { query: q, release: () => undefined };

vi.mock('../../../db', () => ({
  pool: { query: (s: string, p?: unknown[]) => q(s, p) },
  getPool: () => ({
    query: (s: string, p?: unknown[]) => q(s, p),
    connect: async () => fakeClient,
  }),
}));

// 2026-09-28 (Q-0928-2): revise_qms_document now reads the caller's org role
// from organization_users (resolveSignerOrgRole, over drizzle, which this
// PGlite harness does not provide). An editor-capable role here; the refusal
// is pinned in revise-qms-document-role.test.ts.
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: vi.fn(async () => 'member') }));

import { approvedToolHandler } from './support/approved-tool-handler';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const DDL = `
CREATE TABLE qms_documents (
  id serial PRIMARY KEY, organization_id int NOT NULL, doc_number text NOT NULL, title text NOT NULL,
  doc_type text NOT NULL, category text, version text NOT NULL DEFAULT '1.0', status text NOT NULL DEFAULT 'draft',
  effective_date date, next_review_date date, author_id int, approver_id int, approved_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE concept2cure_artifacts (
  id serial PRIMARY KEY, artifact_id text, organization_id int,
  -- NOT NULL, matching the real table (migrations/0000_sweet_joseph.sql:1849).
  -- This test's first DDL omitted the column entirely, so save_document_to_vault
  -- passed here while failing on every real call — the drift this file exists
  -- to prevent. The pglite table must be at least as strict as production.
  project_id int NOT NULL,
  type text, category text, title text,
  content text, content_hash text, ctd_section text, status text, version int, created_by_id int,
  metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE concept2cure_artifact_versions (
  id serial PRIMARY KEY, artifact_id int, organization_id int, version int, content text,
  content_hash text, change_description text, created_by_id int, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE concept2cure_provenance_events (
  id serial PRIMARY KEY, event_id text NOT NULL UNIQUE, artifact_id int NOT NULL, artifact_version_id int,
  organization_id int NOT NULL, event_type text NOT NULL, event_action text NOT NULL, actor_id int,
  actor_name text, actor_email text, details jsonb NOT NULL DEFAULT '{}', source_artifact_id int,
  source_description text, backend_route text, backend_service text, ip_address varchar(45),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- audit_logs shaped exactly as recordGovernedAction writes it (matches
-- scripts/db-verify/00_bootstrap_base.sql); the migration below then adds the
-- chain columns idempotently.
CREATE TABLE audit_logs (
  id text PRIMARY KEY, tenant_id integer, user_id integer, action text, table_name text, record_id text,
  actor_id integer, target text, target_type text, target_id text, reason text, payload_hash text,
  ana_action_id text, sha256_chain text, occurred_at timestamptz NOT NULL DEFAULT now(), hmac_seal text,
  old_values   json,
  new_values   json,
  ip_address   text,
  user_agent   text
);
`;

/** The command vocabulary c2c_ana_actions_command_check actually permits. */
const ALLOWED_COMMANDS = [
  'claim', 'transition', 'resolve', 'sign', 'accept-ai-suggestion', 'lock',
  'unclaim', 'transition-back', 'reopen', 'revoke-signature', 'reject-ai-suggestion', 'unlock',
];

// humanConfirmed: the vault tools run only on a person's yes (P0-12,
// CONFIRM_TIER_TOOLS), stamped by POST /governed-action. This file tests what
// the handler does once it runs — its one transaction — so it dispatches as that
// route does.
const CTX = { organizationId: 1, userId: 10, projectId: 77, humanConfirmed: true };

/**
 * Break the Part 11 audit write from INSIDE the caller's transaction. A
 * non-null sha256_chain is exactly what recordGovernedAction always writes, so
 * this rejects every governed audit INSERT the way a real audit-integrity
 * failure would.
 */
async function breakAuditWrites() {
  await pglite.exec(`ALTER TABLE audit_logs ADD CONSTRAINT audit_write_broken CHECK (sha256_chain IS NULL);`);
}
async function repairAuditWrites() {
  await pglite.exec(`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_write_broken; ALTER TABLE authoring_audit_trail DROP CONSTRAINT IF EXISTS authoring_write_broken;
    ALTER TABLE doc_permissions DROP CONSTRAINT IF EXISTS permission_write_broken;`);
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
  // REAL ledger DDL — including c2c_ana_actions_command_check, which pins the
  // command vocabulary the handlers are allowed to emit.
  await pglite.exec(fs.readFileSync(path.join(REPO_ROOT, 'migrations/20260527_mutation_primitives.sql'), 'utf8'));
  // The lineage gate update_vault_document now enlists (ledger L160): a real
  // organizations row for the FK, the evidence spine and the span-lineage store.
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (1, 'org-1'), (9, 'org-9') ON CONFLICT DO NOTHING;`);
  await installQmsAuthoringHarness(pglite);
  for (const rel of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql', 'db/migrations/20260803_document_span_lineage.sql', 'migrations/20260907_span_lineage_accepted_machine_draft.sql', 'migrations/20260908_span_lineage_machine_draft.sql']) {
    await pglite.exec(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
  }
});
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await repairAuditWrites();
  await pglite.exec(
    `DELETE FROM c2c_ana_actions; DELETE FROM audit_logs;
     DELETE FROM concept2cure_artifact_versions; DELETE FROM concept2cure_artifacts;
     DELETE FROM qms_documents; DELETE FROM c2c_document_aliases; DELETE FROM doc_permissions; DELETE FROM authoring_audit_trail; DELETE FROM doc_revisions; DELETE FROM authoring_sections; DELETE FROM authoring_documents;`,
  );
});

async function call(name: string, input: Record<string, unknown>, ctx: unknown = CTX) {
  const handler = approvedToolHandler(name);
  expect(handler, `${name} must be registered`).toBeTypeOf('function');
  const body = name === 'create_qms_document' ? { program_id: QMS_TEST_PROGRAM, ...input } : input;
  return JSON.parse(await handler!(body, ctx as never));
}

const auditRows = async () =>
  (await pglite.query(`SELECT * FROM audit_logs WHERE action NOT LIKE 'authoring.%' ORDER BY occurred_at`)).rows as any[];
const ledgerRows = async () =>
  (await pglite.query(`SELECT * FROM c2c_ana_actions`)).rows as any[];
const docRow = async (id: number) =>
  (await pglite.query(`SELECT * FROM qms_documents WHERE id = $1`, [id])).rows[0] as any;

async function effectiveDoc(num: string) {
  const r = await pglite.query(
    `INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, version, status, approver_id)
     VALUES (1, $1, 'Proc', 'sop', '3.1', 'effective', 11) RETURNING id`,
    [num],
  );
  const id = (r.rows[0] as { id: number }).id;
    await seedQmsEditingCopy(pglite, id);
    return id;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('create_qms_document — controlled document creation is audited atomically', () => {
  it('writes the document AND its Part 11 audit row (previously wrote NO audit at all)', async () => {
    const res = await call('create_qms_document', {
      doc_number: 'SOP-100', title: 'Cleaning validation', doc_type: 'sop',
      reason: 'New controlled procedure for line 3.',
    });
    expect(res.ok).toBe(true);

    const audits = await auditRows();
    expect(audits).toHaveLength(1);
    expect(audits[0].target).toBe(`qms-document:${res.id}`);
    expect(audits[0].tenant_id).toBe(1);
    expect(audits[0].actor_id).toBe(10);
    expect(audits[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);

    const ledger = await ledgerRows();
    expect(ledger).toHaveLength(1);
    // Constraint-compatibility: the emitted command must be in the vocabulary
    // c2c_ana_actions_command_check permits, or this INSERT would have thrown.
    expect(ALLOWED_COMMANDS).toContain(ledger[0].command);
    expect(ledger[0].payload.kind).toBe('create');
    const permissions = (await pglite.query('SELECT role,principal_id FROM doc_permissions WHERE doc_id=$1',[(await docRow(res.id)).authoring_document_id])).rows;
    expect(permissions).toEqual(expect.arrayContaining([expect.objectContaining({role:'OWNER',principal_id:'10'}),expect.objectContaining({role:'AUTHOR',principal_id:'10'})]));
  });

  it('stores the periodic review date the user named, which review-due reads (gap 5.1)', async () => {
    const res = await call('create_qms_document', {
      doc_number: 'SOP-102', title: 'Reviewed procedure', doc_type: 'sop', next_review_date: '2027-10-01',
      reason: 'New controlled procedure with a yearly review.',
    });
    expect(res.ok, JSON.stringify(res)).toBe(true);
    const due = (await docRow(res.id)).next_review_date;
    expect(due instanceof Date ? due.toISOString().slice(0, 10) : String(due).slice(0, 10)).toBe('2027-10-01');
  });

  it('FAILS CLOSED — a broken audit write rolls the document back', async () => {
    await breakAuditWrites();
    const res = await call('create_qms_document', {
      doc_number: 'SOP-101', title: 'Should not persist', doc_type: 'sop', reason: 'New SOP for supplier audits.',
    });
    expect(res.ok).toBeUndefined();
    expect(res.error).toMatch(/create_qms_document failed/i);

    const docs = (await pglite.query(`SELECT * FROM qms_documents`)).rows;
    expect(docs, 'the regulated document must NOT exist without its audit row').toHaveLength(0);
    expect(await auditRows()).toHaveLength(0);
    expect(await ledgerRows()).toHaveLength(0);
  });

  it('rolls back register, editing copy, sections and both ledgers when canonical authoring audit fails after the QMS ledger was written', async () => {
    await pglite.exec('ALTER TABLE authoring_audit_trail ADD CONSTRAINT authoring_write_broken CHECK (false)');
    const res = await call('create_qms_document', { doc_number: 'SOP-103', title: 'Must rollback', doc_type: 'sop', reason: 'Test late audit failure' });
    expect(res.ok).not.toBe(true);
    expect((await pglite.query('SELECT * FROM qms_documents')).rows).toHaveLength(0);
    expect((await pglite.query('SELECT * FROM authoring_documents')).rows).toHaveLength(0);
    expect((await pglite.query('SELECT * FROM authoring_sections')).rows).toHaveLength(0);
    expect(await auditRows()).toHaveLength(0);
    expect(await ledgerRows()).toHaveLength(0);
  });

  it('refuses the whole creation if canonical creator ownership cannot persist', async () => {
    await pglite.exec('ALTER TABLE doc_permissions ADD CONSTRAINT permission_write_broken CHECK (false)');
    const res = await call('create_qms_document',{doc_number:'SOP-NOGRANT',title:'Must remain editable',doc_type:'sop',reason:'Test creator ownership failure'});
    expect(res.ok).not.toBe(true);
    expect((await pglite.query('SELECT * FROM qms_documents')).rows).toHaveLength(0);
    expect((await pglite.query('SELECT * FROM authoring_documents')).rows).toHaveLength(0);
    expect((await pglite.query('SELECT * FROM authoring_sections')).rows).toHaveLength(0);
    expect(await auditRows()).toHaveLength(0);
    expect(await ledgerRows()).toHaveLength(0);
  });

  it('refuses without a verified actor (no anonymous controlled-document creation)', async () => {
    const res = await call(
      'create_qms_document',
      { doc_number: 'SOP-102', title: 'x', doc_type: 'sop' },
      { organizationId: 1, humanConfirmed: true },
    );
    // 2026-09-28: the registry wrapper now refuses a confirmed write with no
    // identified member (writeRoleRefusal) before the handler's own
    // "requires user context" check is reached. Same refusal, one layer earlier.
    expect(res.error).toMatch(/identified member/i);
    expect(res.error).toMatch(/Nothing was changed/);
    expect((await pglite.query(`SELECT * FROM qms_documents`)).rows).toHaveLength(0);
    expect(await ledgerRows()).toHaveLength(0);
  });
});

describe('approve_qms_document — AnA cannot make a document effective', () => {
  /* It used to: this block asserted that the tool wrote the approval and its
     audit row. The audit row was right and the act was not. Making an SOP
     effective is an electronic signature (§11.50), and the signed route
     (POST /api/mdx/qms/documents/:id/approve, VSR-001 F-3) re-verifies the
     signer's password and second factor, checks signing authority and refuses
     the author. This tool did none of that and stamped the chat user as
     approver. New-code audit 2026-09-24, finding 1. */
  it('writes nothing and hands the approval to the person', async () => {
    const id = await effectiveDoc('SOP-200');
    await pglite.query(
      `UPDATE qms_documents SET status = 'draft', approver_id = NULL, approved_at = NULL WHERE id = $1`,
      [id],
    );

    const res = await call('approve_qms_document', { document_id: id, reason: 'QA approval complete.' });
    expect(res.ok).toBe(false);
    expect(res.signatureRequired).toBe(true);
    expect(res.message).toMatch(/electronic signature/i);

    const doc = await docRow(id);
    expect(doc.status, 'a chat turn must not make a controlled document effective').toBe('draft');
    expect(doc.approved_at).toBeNull();
    expect(doc.approver_id).toBeNull();
    expect(await auditRows()).toHaveLength(0);
    expect(await ledgerRows()).toHaveLength(0);
  });
});

describe('revise_qms_document — controlled revision is audited atomically', () => {
  it('bumps the version AND writes the audit row in one transaction', async () => {
    const id = await effectiveDoc('SOP-300');
    const res = await call('revise_qms_document', { document_id: id, reason: 'Add re-qualification cadence.' });
    expect(res.ok).toBe(true);
    expect(res.version).toBe('4.0');

    const audits = await auditRows();
    expect(audits).toHaveLength(1);
    expect(audits[0].reason).toBe('Add re-qualification cadence.');
    const ledger = await ledgerRows();
    expect(ledger[0].payload).toMatchObject({ kind: 'revise', from: '3.1', to: '4.0' });
  });

  it('FAILS CLOSED — a broken audit write rolls the revision back', async () => {
    const id = await effectiveDoc('SOP-301');
    await breakAuditWrites();

    const res = await call('revise_qms_document', { document_id: id, reason: 'Attempted revision.' });
    expect(res.error).toMatch(/revise_qms_document failed/i);

    const doc = await docRow(id);
    expect(doc.version, 'version bump must not persist without its audit row').toBe('3.1');
    expect(doc.status).toBe('effective');
    expect(doc.approver_id, 'approval must not have been cleared').toBe(11);
    expect(await auditRows()).toHaveLength(0);
    expect(await ledgerRows()).toHaveLength(0);
  });
});

describe('retire_qms_document — AnA cannot retire a controlled document', () => {
  /* 2026-09-28 (Q-0928-1 / SEC-0928-1). This block asserted that the tool
     retired the document and wrote its audit row atomically. The audit row was
     right and the act was not: retirement is an electronic signature on the
     route (POST /api/mdx/qms/documents/:id/retire — verifyApprovalSigner +
     retireQmsDocumentSigned, one electronic_signatures row), and the tool
     skipped all of it. Refused like approve_qms_document. */
  it('writes nothing and hands the retirement to the person', async () => {
    const id = await effectiveDoc('SOP-400');
    const res = await call('retire_qms_document', { document_id: id, reason: 'Superseded by SOP-401.' });
    expect(res.ok).toBe(false);
    expect(res.signatureRequired).toBe(true);
    expect(res.message).toMatch(/electronic signature/i);
    expect((await docRow(id)).status, 'a chat turn must not retire a controlled document').toBe('effective');
    expect(await auditRows()).toHaveLength(0);
    expect(await ledgerRows()).toHaveLength(0);
  });
});

/* save_document_to_vault no longer writes concept2cure_artifacts (document store
   consolidation step 2, 2026-10-17): it creates an authoring draft through the
   draft_authoring_document path, whose transaction holds the document, section,
   genesis revision, machine-draft lineage and Part 11 CREATE row together. Its
   atomicity, lineage, project refusal and tenant scoping are pinned against the
   real authoring DDL in draft-authoring-document-tool.pglite.integration.test.ts
   ("save_document_to_vault — the single-body form of draft_authoring_document"). */

describe('update_vault_document — new regulated version is audited atomically', () => {
  /* An existing artifact row, as save_document_to_vault wrote them before
     2026-10-17. Those rows stay readable and versionable; no tool creates
     new ones. */
  async function seedArtifact() {
    const externalId = 'ana-doc-seed00000001';
    const ins = await pglite.query<{ id: number }>(
      `INSERT INTO concept2cure_artifacts (artifact_id, organization_id, project_id, type, category, title, content,
         content_hash, status, version, created_by_id)
       VALUES ($1, 1, 77, 'document', 'document', 'Protocol', 'v1 body', 'h1', 'draft', 1, 10) RETURNING id`,
      [externalId],
    );
    await pglite.query(
      `INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, content_hash, change_description, created_by_id)
       VALUES ($1, 1, 1, 'v1 body', 'h1', 'Initial draft of the protocol.', 10)`,
      [ins.rows[0].id],
    );
    return externalId;
  }

  it('writes v2 AND the audit row', async () => {
    const artifactId = await seedArtifact();
    const res = await call('update_vault_document', {
      artifact_id: artifactId, content: 'v2 body', reason: 'Incorporate reviewer comments.',
    });
    expect(res.ok).toBe(true);
    expect(res.version).toBe(2);
    expect((await pglite.query(`SELECT * FROM concept2cure_artifact_versions`)).rows).toHaveLength(2);
    expect(await auditRows()).toHaveLength(1);
    expect((await ledgerRows())[0].payload).toMatchObject({ kind: 'version', from: 1, to: 2 });
    /* Ledger L160: the new version's text is attributed in the same
       transaction — as AnA's unaccepted draft, for the same reason as the
       create path above. */
    const spans = await q(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE document_table = 'concept2cure_artifacts' AND provenance_kind = 'machine_draft'
          AND machine_author_id = 'ana' AND asserted_by IS NULL AND deleted_at IS NULL`,
    );
    expect(Number(spans.rows[0].n)).toBeGreaterThanOrEqual(1);
  });

  it('FAILS CLOSED — a broken audit write rolls the new version back', async () => {
    const artifactId = await seedArtifact();
    await breakAuditWrites();

    const res = await call('update_vault_document', {
      artifact_id: artifactId, content: 'v2 body', reason: 'Incorporate reviewer comments.',
    });
    expect(res.error).toMatch(/update_vault_document failed/i);

    const art = (await pglite.query(`SELECT version, content FROM concept2cure_artifacts`)).rows[0] as any;
    expect(art.version, 'version must not advance without its audit row').toBe(1);
    expect(art.content).toBe('v1 body');
    expect(
      (await pglite.query(`SELECT * FROM concept2cure_artifact_versions`)).rows,
      'no orphan version row may survive',
    ).toHaveLength(1);
    expect(await auditRows()).toHaveLength(0);
  });
});

describe('identity is derived from the verified principal, never from tool input', () => {
  it('ignores spoofed organization_id / user_id in the tool input', async () => {
    const res = await call('create_qms_document', {
      doc_number: 'SOP-500', title: 'Spoof probe', doc_type: 'sop',
      reason: 'Spoofing probe for tenant derivation.',
      // Attacker-controlled tool input — model- or prompt-supplied.
      organization_id: 9, organizationId: 9, tenant_id: 9, user_id: 42, created_by: 42, author_id: 42,
    });
    expect(res.ok).toBe(true);

    const audits = await auditRows();
    expect(audits[0].tenant_id).toBe(1);
    expect(audits[0].actor_id).toBe(10);
    expect(audits[0].user_id).toBe(10);

    const ledger = await ledgerRows();
    expect(ledger[0].org_id).toBe(1);
    expect(ledger[0].proposed_by).toBe(10);

    const doc = (await pglite.query(`SELECT organization_id, author_id FROM qms_documents`)).rows[0] as any;
    expect(doc.organization_id).toBe(1);
    expect(doc.author_id).toBe(10);
  });
});
