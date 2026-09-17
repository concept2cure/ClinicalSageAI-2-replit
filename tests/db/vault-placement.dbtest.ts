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
 *      nothing is written.
 *
 * Only a real database can witness 3 and 7: both are predicates, and a mocked
 * pool has no catalog to refuse against and no rows to filter.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

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

async function inTenantScope<T>(org: { id: number; uuid: string }, fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope(
    {
      tenantId: String(org.id),
      orgUuid: org.uuid,
      role: 'admin',
      source: 'request',
      caller: 'tests/db/vault-placement.dbtest.ts',
    },
    fn,
  );
}

async function place(
  args: Record<string, unknown>,
  as: { id: number; uuid: string } = { id: orgId, uuid: orgUuid },
) {
  const { placeVaultDocument } = await import(
    '../../server/services/vault/vault-placement.service'
  );
  return inTenantScope(as, () =>
    placeVaultDocument({
      programId,
      documentId,
      organizationId: as.id,
      userId,
      ...args,
    } as Parameters<typeof placeVaultDocument>[0]),
  );
}

const row = async () =>
  (
    await owner.query(
      `SELECT folder_id, ctd_section, evidence_kind, placement_status,
              placement_rationale, placed_by
         FROM vault.documents WHERE id = $1`,
      [documentId],
    )
  ).rows[0];

async function cleanupProbeRows(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.audit_archive_bypass = 'on'`);
    await client.query(
      `DELETE FROM audit_logs WHERE action = 'vault.document.file'
         AND record_id IN (SELECT id::text FROM vault.documents WHERE document_code LIKE $1)`,
      [`${PROBE_CODE}%`],
    );
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${PROBE_CODE}%`]);
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
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${PROBE_CODE}%`]);
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
