/**
 * placeVaultDocument against real PostgreSQL — the governed filing write.
 *
 * ── Why this suite exists ────────────────────────────────────────────────────
 * Changing where a document is filed is a regulated action: it moves evidence
 * inside a dossier, and 21 CFR Part 11 wants the move recorded with its before
 * and after. Until this change the write lived in one 191-line Express handler
 * that no test touched — not its taxonomy check, not its tenancy predicate,
 * not its audit row. A governed mutation with no test is a governed mutation
 * that is only believed to work.
 *
 * It now lives in vault-placement.service.ts so AnA's place_project_document
 * and the Vault surface perform the SAME write, which is exactly why it needs
 * proving once, here, against a real database:
 *
 *   1. filing into a folder the program's own view defines succeeds, and the
 *      row carries the folder, the status and who placed it;
 *   2. the move leaves a hash-chained audit row naming BOTH locations;
 *   3. a folder from another modality's taxonomy is REFUSED, not stored — the
 *      device vault has no 'module-4', and writing one would put a document
 *      in a folder its own surface cannot render;
 *   4. confirming a suggestion keeps the CTD section the classifier read;
 *   5. confirming when there is nothing suggested is refused, rather than
 *      silently filing into null;
 *   6. an explicit unfile is honoured — the visible Unfiled queue is a
 *      legitimate answer;
 *   7. a caller from another organization cannot move the document, and
 *      nothing is written;
 *   8. a placement AnA makes, through the real place_project_document handler,
 *      is recorded as a SUGGESTION with her provenance on the audit row, and
 *      she cannot confirm one — while a person's filing through the same
 *      service is still a confirmed decision with no agent marker.
 *
 * Only a real database can witness 3 and 7: both are predicates, and a mocked
 * pool has no catalog to refuse against and no rows to filter.
 *
 * 8 is D5 (placement-attribution). AnA's placement wrote placement_status
 * 'confirmed', placed_by the human, and a chained 'vault.document.file' row
 * whose user and actor were that human — with nothing anywhere saying AnA, the
 * tool or the serving model made the call. The Vault counts 'confirmed' as "an
 * upload a person filed", and URS-VAULT-007 says a person confirms the filing,
 * so the Part 11 record said a person decided something no person decided.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

// place_project_document refuses unless the catalog is on for the tenant; the
// env override the flag helper honours stands in for a toggle row.
process.env.ANA_DOCUMENT_CATALOG_FORCE_ON = 'true';

const PROBE_PREFIX = 'dbtest-place ';
const PROBE_CODE = 'DBTEST-PLACE-DOC';

let owner: Pool;
let orgId: number;
let orgUuid: string;
let otherOrgId: number;
let otherOrgUuid: string;
let userId: number;
let programId: string;
let documentId: string;

async function inTenantScope<T>(
  org: { id: number; uuid: string },
  fn: () => Promise<T>,
  role: string | null = 'admin',
): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope(
    {
      tenantId: String(org.id),
      orgUuid: org.uuid,
      role,
      source: 'request',
      caller: 'tests/db/vault-placement.dbtest.ts',
    },
    fn,
  );
}

async function place(
  args: Record<string, unknown>,
  as: { id: number; uuid: string } = { id: orgId, uuid: orgUuid },
  role: string | null = 'admin',
) {
  const { placeVaultDocument } = await import(
    '../../server/services/vault/vault-placement.service'
  );
  return inTenantScope(
    as,
    () =>
      placeVaultDocument({
        programId,
        documentId,
        organizationId: as.id,
        userId,
        ...args,
      } as Parameters<typeof placeVaultDocument>[0]),
    role,
  );
}

const row = async () =>
  (
    await owner.query(
      `SELECT folder_id, ctd_section, evidence_kind, placement_status,
              placement_rationale, placed_by, placed_at
         FROM vault.documents WHERE id = $1`,
      [documentId],
    )
  ).rows[0];

/* The probe documents and the filing audit rows written about them. Run before
   every case, not only at the end: the per-case reset used to delete the
   documents alone, which orphaned every earlier case's audit rows beyond the
   reach of the final cleanup (it found them through the documents). Keyed on
   this suite's own two tenants instead, which also sweeps a crashed run's. */
async function deleteProbeDocuments(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(
      `DELETE FROM audit_logs WHERE action = 'vault.document.file' AND tenant_id = ANY($1::int[])`,
      [[orgId, otherOrgId]],
    );
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${PROBE_CODE}%`]);
}

async function cleanupProbeRows(): Promise<void> {
  await deleteProbeDocuments();
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE_PREFIX}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE_PREFIX}tenant`, 'dbtest-place-tenant'],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);

  const other = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE_PREFIX}other tenant`, 'dbtest-place-other'],
  );
  otherOrgId = Number(other.rows[0].id);
  otherOrgUuid = String(other.rows[0].uuid);

  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-place@example.test', `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  await cleanupProbeRows();

  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, '510k', 'device', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}device program`, 'DBTEST-PLACE-A', orgId, 'AeroFlow AF-1000'],
  );
  programId = String(prog.rows[0].id);
});

/* A fresh document per case: these are writes, and a case that inherited the
   previous one's placement would pass for the wrong reason. */
beforeEach(async () => {
  await deleteProbeDocuments();
  const doc = await owner.query(
    `INSERT INTO vault.documents
       (program_id, organization_id, document_code, document_title, document_type,
        version, s3_bucket, s3_key, file_name, file_size, mime_type, content_hash,
        classification, placement_status, placement_rationale, processing_status, created_by)
     VALUES ($1, $2, $3, 'Design History File extract', 'OTHER',
             '1.0', 'local', 'probe/key', 'dhf.pdf', 10, 'application/pdf', $4,
             'INTERNAL', 'unfiled', NULL, 'INDEXED', $5)
     RETURNING id`,
    [programId, orgId, PROBE_CODE, `hash-${Date.now()}`, userId],
  );
  documentId = String(doc.rows[0].id);
});

afterAll(async () => {
  await cleanupProbeRows().catch(() => {});
  await owner.end().catch(() => {});
});

/** The latest filing audit row for the probe document, details parsed. */
async function lastFilingAudit() {
  const { rows } = await owner.query(
    `SELECT user_id, new_values
       FROM audit_logs
      WHERE action = 'vault.document.file' AND record_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [documentId],
  );
  if (!rows[0]) return null;
  const nv = rows[0].new_values;
  return {
    userId: rows[0].user_id == null ? null : Number(rows[0].user_id),
    details: (typeof nv === 'string' ? JSON.parse(nv) : nv) as Record<string, any>,
  };
}

const filingAuditCount = async () =>
  Number(
    (
      await owner.query(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE action = 'vault.document.file' AND record_id = $1`,
        [documentId],
      )
    ).rows[0].n,
  );

/* The provenance the chat stream hands a tool, tagged so a row it leaves is
   recognisably this suite's. */
const ANA_CTX = {
  // place_project_document is a write in the tool register (P1-34); these
  // cases pin the handler as it runs on a person's yes.
  humanConfirmed: true,
  servingModel: { provider: 'anthropic', model: 'dbtest-place-model' },
  threadId: 'dbtest-place-thread',
  turnId: 'dbtest-place-turn',
};

/** place_project_document, resolved through the real executor registry. */
async function anaPlaces(input: Record<string, unknown>, role: string | null = 'admin') {
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const handler = getToolHandler('place_project_document');
  if (!handler) throw new Error('place_project_document is not registered');
  const raw = await inTenantScope(
    { id: orgId, uuid: orgUuid },
    () => handler({ document_id: documentId, ...input }, { organizationId: orgId, userId, ...ANA_CTX }),
    role,
  );
  return JSON.parse(raw);
}

/* AnA files only a document she has read and recorded, so the AnA cases give
   the probe the comprehension record catalog_project_document would leave. */
async function markCataloged(): Promise<void> {
  await owner.query(
    `INSERT INTO vault.document_catalog
       (document_id, content_hash, catalog_status, char_count, document_kind,
        purpose, summary, cataloged_by, cataloged_at)
     VALUES ($1, repeat('d', 64), 'cataloged', 120, 'design_history_file',
             'Design history extract for AF-1000.', 'dbtest-place summary', $2, NOW())
     ON CONFLICT (document_id) DO UPDATE SET catalog_status = 'cataloged'`,
    [documentId, userId],
  );
}

describe('filing a document where its own taxonomy allows', () => {
  it('files it, records who placed it, and reports the folder label', async () => {
    const out = await place({
      folderId: 'eng',
      evidenceKind: 'report',
      note: 'The document is a design history file extract.',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.filing.folderId).toBe('eng');
    expect(out.filing.placementStatus).toBe('confirmed');
    expect(out.filing.needsReview).toBe(false);
    expect(out.filing.folderLabel).toContain('Engineering');

    const r = await row();
    expect(r.folder_id).toBe('eng');
    expect(r.placement_status).toBe('confirmed');
    expect(r.evidence_kind).toBe('report');
    expect(r.placement_rationale).toBe('The document is a design history file extract.');
    expect(Number(r.placed_by)).toBe(userId);
  });

  it('left an audit row naming the location it came from and the one it went to', async () => {
    await place({ folderId: 'qms', note: 'Quality system record.' });
    const { rows } = await owner.query(
      `SELECT action, user_id, new_values, sha256_chain
         FROM audit_logs
        WHERE action = 'vault.document.file' AND record_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [documentId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].user_id)).toBe(userId);
    // Hash-chained, not just logged: an entry with no chain link is one a
    // later edit could replace without trace.
    expect(rows[0].sha256_chain).toBeTruthy();
    const details =
      typeof rows[0].new_values === 'string' ? JSON.parse(rows[0].new_values) : rows[0].new_values;
    // The whole point of the row: both ends of the move, not just the new one.
    expect(details.from.folderId).toBeNull();
    expect(details.from.placementStatus).toBe('unfiled');
    expect(details.to.folderId).toBe('qms');
    expect(details.to.placementStatus).toBe('confirmed');
    expect(details.rationale).toBe('Quality system record.');
  });

  it('honours an explicit unfile — the Unfiled queue is a real answer', async () => {
    await place({ folderId: 'eng', note: 'first' });
    const out = await place({ folderId: null, note: 'I cannot tell where this belongs.' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.filing.placementStatus).toBe('unfiled');
    expect(out.filing.needsReview).toBe(true);
    expect((await row()).folder_id).toBeNull();
  });
});

describe('what it refuses, writing nothing', () => {
  it("refuses a folder from another modality's taxonomy", async () => {
    // 'module-4' is a CTD folder. This is a device program; its vault has no
    // such folder, and a document filed there would be invisible in its tree.
    const out = await place({ folderId: 'module-4', note: 'looks nonclinical' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe('INVALID_FOLDER');
    expect(out.message).toContain('module-4');
    expect((await row()).placement_status).toBe('unfiled');
  });

  it('refuses to confirm a suggestion that does not exist', async () => {
    const out = await place({ confirm: true });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe('NOTHING_TO_CONFIRM');
    expect((await row()).placement_status).toBe('unfiled');
  });

  it('refuses a call that names no destination at all', async () => {
    const out = await place({});
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe('NO_TARGET');
  });

  it('confirms an existing suggestion in place, keeping the CTD section', async () => {
    await owner.query(
      `UPDATE vault.documents
          SET folder_id = 'cer', ctd_section = '4.2.3.2', placement_status = 'suggested',
              placement_rationale = 'Classifier read a clinical evaluation.'
        WHERE id = $1`,
      [documentId],
    );
    const out = await place({ confirm: true });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.filing.placementStatus).toBe('confirmed');
    expect(out.filing.ctdSection).toBe('4.2.3.2');
    expect(out.filing.rationale).toContain('Classifier read a clinical evaluation.');
  });

  it('will not let another organization move the document', async () => {
    const out = await place(
      { folderId: 'eng', note: 'not mine to file' },
      { id: otherOrgId, uuid: otherOrgUuid },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    // Reported as absent, not as forbidden — a 403 would confirm it exists.
    expect(out.status).toBe(404);
    expect((await row()).placement_status).toBe('unfiled');
  });
});

describe('a placement AnA makes is a suggestion, attributed to her (D5)', () => {
  const RATIONALE = 'The document is a design history file extract for the AF-1000.';

  it("records AnA's folder as a suggestion a person must confirm, not as a person's filing", async () => {
    await markCataloged();
    const out = await anaPlaces({ folder_id: 'eng', rationale: RATIONALE });
    expect(out.ok).toBe(true);

    const r = await row();
    const audit = await lastFilingAudit();
    // One assertion over the whole record, so a failure prints every field of
    // the row and the audit entry at once rather than the first wrong one.
    expect({
      reported: out.filing.placementStatus,
      row: r,
      auditUserId: audit?.userId,
      audit: audit?.details,
    }).toMatchObject({
      reported: 'suggested',
      // The state the ingest classifier writes for a machine proposal, which
      // the Vault already asks a person to confirm — and, like the
      // classifier's, it names no person as the one who placed it.
      row: {
        folder_id: 'eng',
        placement_status: 'suggested',
        placed_by: null,
        placed_at: null,
        // Signed in the text: the Vault shows it beside the Confirm button,
        // where an unsigned rationale would read as the classifier's.
        placement_rationale: `AnA's suggestion: ${RATIONALE}`,
      },
      // The person stays on the audit row: AnA acted on their behalf, in
      // their session...
      auditUserId: userId,
      // ...and the row says who actually decided.
      audit: {
        actorKind: 'agent:ana',
        tool: 'place_project_document',
        agentReason: RATIONALE,
        servingModel: { provider: 'anthropic', model: 'dbtest-place-model' },
        threadId: 'dbtest-place-thread',
        turnId: 'dbtest-place-turn',
        to: { folderId: 'eng', placementStatus: 'suggested' },
        rationale: `AnA's suggestion: ${RATIONALE}`,
      },
    });
  });

  it('refuses to confirm a suggestion — a person confirms filing in the Vault', async () => {
    await markCataloged();
    await owner.query(
      `UPDATE vault.documents
          SET folder_id = 'cer', placement_status = 'suggested',
              placement_rationale = 'Classifier read a clinical evaluation.'
        WHERE id = $1`,
      [documentId],
    );
    const before = await filingAuditCount();
    const out = await anaPlaces({ confirm_suggested: true, rationale: 'The classifier was right.' });
    expect(out.ok).toBe(false);
    expect(out.refused).toBe(true);
    expect(out.reason).toContain('Vault');

    const r = await row();
    expect(r.placement_status).toBe('suggested');
    expect(r.placed_by).toBeNull();
    expect(await filingAuditCount()).toBe(before);
  });

  it("the service itself refuses an agent's confirm, so no other agent caller can record one either", async () => {
    await owner.query(
      `UPDATE vault.documents
          SET folder_id = 'cer', placement_status = 'suggested',
              placement_rationale = 'Classifier read a clinical evaluation.'
        WHERE id = $1`,
      [documentId],
    );
    const before = await filingAuditCount();
    const out = await place({ confirm: true, agent: { actorKind: 'agent:ana', tool: 'dbtest-place-probe' } });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe('CONFIRMATION_REQUIRES_A_PERSON');
    expect((await row()).placement_status).toBe('suggested');
    expect(await filingAuditCount()).toBe(before);
  });

  it('unfiles with the same attribution — the Unfiled queue is where a person decides', async () => {
    const out = await anaPlaces({ unfile: true, rationale: 'I cannot tell which design control this evidences.' });
    expect(out.ok).toBe(true);
    const r = await row();
    expect(r.placement_status).toBe('unfiled');
    expect(r.placed_by).toBeNull();
    expect(r.placed_at).toBeNull();
    const audit = await lastFilingAudit();
    expect(audit!.details).toMatchObject({
      actorKind: 'agent:ana',
      tool: 'place_project_document',
      turnId: 'dbtest-place-turn',
      to: { folderId: null, placementStatus: 'unfiled' },
    });
  });

  it("leaves a person's filing through the Vault a confirmed decision with no agent marker", async () => {
    const out = await place({ folderId: 'eng', note: 'Filed by the reviewer.' });
    expect(out.ok).toBe(true);
    const r = await row();
    expect(r.placement_status).toBe('confirmed');
    expect(Number(r.placed_by)).toBe(userId);
    expect(r.placed_at).not.toBeNull();
    const audit = await lastFilingAudit();
    expect(audit!.userId).toBe(userId);
    expect(audit!.details.to.placementStatus).toBe('confirmed');
    expect(audit!.details.actorKind).toBeUndefined();
    expect(audit!.details.tool).toBeUndefined();
    expect(audit!.details.servingModel).toBeUndefined();
  });
});

describe('only a role that may write files into the Vault (D3)', () => {
  /* The web routes carry requireEditorAccess. The service they share with
     AnA's tools, authoring's file-to-vault and eSTAR retention carried none, and
     ToolContext carries no role at all — so a viewer who asked AnA to file a
     document had it filed. The check now sits in the service, on the role the
     tenant scope carries: on every request path that is the organization_users
     role the middleware reads, AnA's included. */
  it('refuses a viewer, and writes nothing', async () => {
    const before = await row();
    const out = await place({ folderId: 'eng', note: 'filed by a viewer' }, undefined, 'viewer');
    expect(out).toMatchObject({ ok: false, status: 403, code: 'VAULT_WRITE_ROLE_REQUIRED' });
    expect(await row()).toEqual(before);
    expect(await lastFilingAudit()).toBeNull();
  });

  it('refuses a scope that carries no role at all', async () => {
    const out = await place({ folderId: 'eng', note: 'no role' }, undefined, null);
    expect(out).toMatchObject({ ok: false, status: 403, code: 'VAULT_WRITE_ROLE_REQUIRED' });
    expect((await row()).placement_status).toBe('unfiled');
  });

  it('refuses AnA acting for a viewer — the path that had no check', async () => {
    await markCataloged();
    const before = await row();
    const out = await anaPlaces({ folder_id: 'eng', rationale: 'Design history extract.' }, 'viewer');
    // The tool's refusal shape: the service's code under `error`, its message for AnA to relay.
    expect(out).toMatchObject({ ok: false, error: 'VAULT_WRITE_ROLE_REQUIRED' });
    expect(out.message).toMatch(/viewer/);
    expect(await row()).toEqual(before);
    expect(await lastFilingAudit()).toBeNull();
  });

  it('lets a member file — the role SSO provisioning assigns', async () => {
    const out = await place({ folderId: 'eng', note: 'filed by a member' }, undefined, 'member');
    expect(out.ok).toBe(true);
    expect((await row()).folder_id).toBe('eng');
  });
});

