/**
 * Personal QMS acknowledgements execute against the canonical QMS migration,
 * not a SQL-pattern stub. Only the audit chain's cryptography is replaced: its
 * mock writes a real row on the supplied client, so transaction rollback is real.
 */
import { readFileSync } from 'node:fs';
import { QMS_APPROVAL_FIXTURE_DDL, assignToEveryone, seedQmsApprovalFixture } from './_release-approval-fixture';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QMS_TRAINING_DECLARATION,
  qmsTrainingAcknowledgementSchema,
  qmsTrainingContextSchema,
  type QmsTrainingAcknowledgementInput,
} from '@shared/qms/training';
import {
  computeQmsDocumentContentDigest,
  type QmsDocumentRow,
} from '../document-approval-signature';
import {
  acknowledgeQmsTraining,
  readQmsTrainingCompliance,
  readQmsTrainingContext,
} from '../training';

let database: PGlite;
const state = vi.hoisted(() => ({ auditFails: false, sql: [] as string[] }));
const client = {
  query: async (sql: string, params?: unknown[]) => {
    state.sql.push(sql);
    const result = await database.query<Record<string, unknown>>(sql, params);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  },
};

interface AuditEntry {
  tenantId?: number | string;
  organizationId?: number | string;
  userId?: number | string;
  action: string;
  resourceType?: string;
  resourceId?: number | string;
  details?: unknown;
}

vi.mock('../../auditService', () => ({
  writeChainedAuditRow: vi.fn(async (transactionClient: typeof client, entry: AuditEntry) => {
    await transactionClient.query(
      `INSERT INTO qms_training_audit_proof
         (organization_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.tenantId ?? entry.organizationId, entry.userId, entry.action,
        entry.resourceType ?? null, String(entry.resourceId ?? ''), JSON.stringify(entry.details ?? null)],
    );
    // Abort a real transaction after both writes. Neither row may survive.
    if (state.auditFails) {
      await transactionClient.query('INSERT INTO qms_training_audit_proof (missing_column) VALUES (1)');
    }
  }),
}));

const ORG = 1;
const OTHER_ORG = 2;
const VIEWER = 10;
const MEMBER = 11;
const FOREIGN_MEMBER = 12;
const INACTIVE_MEMBER = 13;
const SUSPENDED_MEMBER = 14;
const UNVERIFIED_MEMBER = 15;
const DEPARTED_MEMBER = 16;
const NOW = new Date('2026-10-14T12:00:00.000Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SECTIONS = [
  { key: 'purpose', label: 'Purpose', body: 'Preserve the original controlled record.' },
  { key: 'procedure', label: 'Procedure', body: 'Record each correction, its reason, and the responsible person.' },
];
let releasedDocument: QmsDocumentRow;
let foreignDocument: QmsDocumentRow;

/** Extract the actual CREATE blocks, including their original constraints. */
function canonicalQmsTable(name: 'qms_documents' | 'qms_training_records'): string {
  const migration = readFileSync(new URL('../../../../migrations/20260511_qms_and_labeling.sql', import.meta.url), 'utf8');
  const tablePattern = name === 'qms_documents'
    ? /CREATE TABLE IF NOT EXISTS qms_documents \([\s\S]*?\n\);/
    : /CREATE TABLE IF NOT EXISTS qms_training_records \([\s\S]*?\n\);/;
  const create = migration.match(tablePattern);
  if (!create) throw new Error(`Canonical ${name} CREATE block was not found`);
  return create[0];
}

beforeAll(async () => {
  database = await PGlite.create();
  await database.exec(`
    CREATE TABLE organizations (
      id integer PRIMARY KEY,
      status text NOT NULL DEFAULT 'active',
      payment_status text NOT NULL DEFAULT 'active'
    );
    CREATE TABLE users (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active', name text, email text);
    CREATE TABLE organization_users (
      organization_id integer NOT NULL REFERENCES organizations(id),
      user_id integer NOT NULL REFERENCES users(id),
      role text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (organization_id, user_id)
    );
    ${canonicalQmsTable('qms_documents')}
    ${canonicalQmsTable('qms_training_records')}
    ${QMS_APPROVAL_FIXTURE_DDL}
    CREATE TABLE qms_training_audit_proof (
      organization_id integer NOT NULL,
      user_id integer NOT NULL,
      action text NOT NULL,
      resource_type text,
      resource_id text,
      details jsonb
    ); CREATE UNIQUE INDEX qms_documents_id_org_uq ON qms_documents (id, organization_id);
  `);
  // The assignment store (P-49): compliance counts the people assigned to each document.
  await database.exec(readFileSync('migrations/20261029g_qms_job_roles_and_training_assignments.sql', 'utf8'));
}, 60_000);

beforeEach(async () => {
  state.auditFails = false;
  state.sql = [];
  await database.exec(`
    TRUNCATE electronic_signatures, qms_training_audit_proof, qms_training_records, qms_documents,
      organization_users, users, organizations RESTART IDENTITY CASCADE;
    INSERT INTO organizations (id) VALUES (1), (2);
    INSERT INTO users (id, status) VALUES
      (10, 'active'), (11, 'active'), (12, 'active'),
      (13, 'inactive'), (14, 'suspended'), (15, 'pending_verification'), (16, 'active');
    INSERT INTO organization_users (organization_id, user_id, role) VALUES
      (1, 10, 'viewer'), (1, 11, 'member'), (2, 12, 'member'),
      (1, 13, 'member'), (1, 14, 'member'), (1, 15, 'member');
  `);
  releasedDocument = await seedReleasedDocument(ORG, 'SOP-001', VIEWER);
  foreignDocument = await seedReleasedDocument(OTHER_ORG, 'SOP-FOREIGN', FOREIGN_MEMBER);
});

afterAll(async () => { await database?.close(); });

/** Compliance counts the people assigned (P-49); these cases are about receipts, so the document is assigned everyone (CASCADE clears it). */
const rosterCompliance = async () => { await assignToEveryone(client, ORG, releasedDocument.id, VIEWER); return readQmsTrainingCompliance(client, ORG, NOW); };

describe('actual retained approval controls current training', () => {
  it.each([
    "verification_status='revoked'",
    'is_valid=false',
    'superseded_by=1234',
  ])('holds a withdrawn approval (%s) without changing old receipts or signatures', async mutation => {
    const first = await acknowledge();
    const signatures = (await database.query('SELECT signature_manifest,signature_hash FROM electronic_signatures ORDER BY id')).rows;
    if (mutation === "verification_status='revoked'") await database.query("UPDATE electronic_signatures SET verification_status='revoked' WHERE signed_target=$1", [`qms-document:${releasedDocument.id}`]);
    else if (mutation === 'is_valid=false') await database.query('UPDATE electronic_signatures SET is_valid=false WHERE signed_target=$1', [`qms-document:${releasedDocument.id}`]);
    else await database.query('UPDATE electronic_signatures SET superseded_by=1234 WHERE signed_target=$1', [`qms-document:${releasedDocument.id}`]);
    await expect(acknowledge(MEMBER)).rejects.toMatchObject({ status: 409 });
    const context = await readQmsTrainingContext(client, { organizationId: ORG, userId: VIEWER, document: await documentById(), now: NOW });
    expect(context).toMatchObject({ eligible: false, acknowledgement: null });
    expect(context.unavailableReason).toMatch(/withdrawn/);
    expect((await trainingRows()).map(row => row.id)).toEqual([first.acknowledgement.id]);
    expect((await database.query('SELECT * FROM qms_training_audit_proof')).rows).toHaveLength(1);
    expect((await database.query('SELECT signature_manifest,signature_hash FROM electronic_signatures ORDER BY id')).rows).toEqual(signatures);
    expect((await rosterCompliance())[0]).toMatchObject({ eligible: false, current: 0 });
  });

  it('refuses an ambiguous exact approval identity without choosing the latest duplicate', async () => {
    await seedQmsApprovalFixture(client, releasedDocument);
    await expect(acknowledge()).rejects.toMatchObject({ status: 409 });
    await expectNoTrainingOrAudit();
  });

  it('requires the exact signature manifest integrity, not just its target and content digest', async () => {
    await database.query("UPDATE electronic_signatures SET signature_hash='changed-manifest' WHERE signed_target=$1", [`qms-document:${releasedDocument.id}`]);
    await expect(acknowledge()).rejects.toMatchObject({ status: 409 });
    await expectNoTrainingOrAudit();
  });

  it('returns unavailable on a failed signature read instead of treating it as a revoked or missing release', async () => {
    await database.exec('ALTER TABLE electronic_signatures RENAME TO unavailable_qms_signatures');
    try {
      await expect(acknowledge()).rejects.toMatchObject({ status: 503, code: 'QMS_TRAINING_APPROVAL_UNAVAILABLE' });
      const context = await readQmsTrainingContext(client, { organizationId: ORG, userId: VIEWER, document: await documentById(), now: NOW });
      expect(context).toMatchObject({ eligible: false, acknowledgement: null });
      expect(context.unavailableReason).toMatch(/could not be checked/);
      await expectNoTrainingOrAudit();
    } finally { await database.exec('ALTER TABLE unavailable_qms_signatures RENAME TO electronic_signatures'); }
  });
});

async function documentById(id = releasedDocument.id): Promise<QmsDocumentRow> {
  return (await database.query<QmsDocumentRow>('SELECT * FROM qms_documents WHERE id = $1', [id])).rows[0];
}

function approvalFor(row: QmsDocumentRow) {
  return {
    contentDigest: computeQmsDocumentContentDigest(row),
    meaning: 'APPROVED', bindingBasis: 'qms-document-version-content-sha256',
    by: row.approver_id, at: row.approved_at,
    reason: 'Released following controlled review.', twoPersonRule: 'independent-review',
  };
}

async function seedReleasedDocument(organizationId: number, docNumber: string, authorId: number): Promise<QmsDocumentRow> {
  const inserted = await database.query<QmsDocumentRow>(
    `INSERT INTO qms_documents
       (organization_id, doc_number, title, doc_type, category, version, status,
        effective_date, next_review_date, author_id, approver_id, approved_at, metadata)
     VALUES ($1, $2, 'Controlled record corrections', 'sop', 'training', '1.0', 'effective',
       '2026-10-01', '2027-10-01', $3, $3, '2026-10-01T09:00:00Z', $4)
     RETURNING *`,
    [organizationId, docNumber, authorId, JSON.stringify({ sections: SECTIONS })],
  );
  const row = inserted.rows[0];
  const metadata = { ...row.metadata, approval: approvalFor(row) };
  const released = (await database.query<QmsDocumentRow>(
    'UPDATE qms_documents SET metadata = $1 WHERE id = $2 RETURNING *',
    [JSON.stringify(metadata), row.id],
  )).rows[0];
  await seedQmsApprovalFixture(client, released);
  return released;
}

function inputFor(document = releasedDocument): QmsTrainingAcknowledgementInput {
  return {
    documentVersion: document.version,
    contentDigest: computeQmsDocumentContentDigest(document),
    understood: true,
    method: 'attestation',
  };
}

function acknowledge(userId = VIEWER, overrides: Partial<Parameters<typeof acknowledgeQmsTraining>[1]> = {}) {
  return acknowledgeQmsTraining(client, {
    organizationId: ORG, userId, documentId: releasedDocument.id,
    input: inputFor(), now: NOW, ipAddress: '127.0.0.1', userAgent: 'QMS SQL contract',
    ...overrides,
  });
}

async function trainingRows() {
  return (await database.query<{
    id: number;
    organization_id: number;
    user_id: number;
    document_id: number;
    document_version: string;
    acknowledgment_method: string;
    trainer_id: number | null;
    quiz_score: number | null;
    acknowledged_at: Date;
    expires_at: Date;
    metadata: { declaration: string; contentDigest: string; bindingBasis: string; documentSnapshot: QmsDocumentRow };
  }>('SELECT * FROM qms_training_records ORDER BY id')).rows;
}

async function expectNoTrainingOrAudit() {
  expect(await trainingRows()).toHaveLength(0);
  expect((await database.query('SELECT * FROM qms_training_audit_proof')).rows).toHaveLength(0);
}

describe('personal acknowledgement on canonical QMS SQL', () => {
  it('allows an active viewer to acknowledge only their own exact released revision with its declaration and snapshot', async () => {
    const result = await acknowledge();
    const receipt = qmsTrainingAcknowledgementSchema.parse(result.acknowledgement);
    expect(result.alreadyAcknowledged).toBe(false);
    expect(receipt).toMatchObject({
      documentId: releasedDocument.id, userId: VIEWER,
      documentVersion: '1.0', contentDigest: inputFor().contentDigest,
      method: 'attestation', acknowledgedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 365 * ONE_DAY_MS).toISOString(),
    });
    const rows = await trainingRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: ORG, user_id: VIEWER, document_id: releasedDocument.id,
      document_version: '1.0', acknowledgment_method: 'attestation', trainer_id: null, quiz_score: null,
      metadata: {
        declaration: QMS_TRAINING_DECLARATION,
        contentDigest: inputFor().contentDigest,
        bindingBasis: 'qms-document-version-content-sha256',
        documentSnapshot: { doc_number: 'SOP-001', title: releasedDocument.title, version: '1.0', metadata: { sections: SECTIONS } },
      },
    });
    expect(computeQmsDocumentContentDigest(rows[0].metadata.documentSnapshot)).toBe(receipt.contentDigest);
    expect((await database.query('SELECT role FROM organization_users WHERE organization_id = 1 AND user_id = 10')).rows)
      .toEqual([{ role: 'viewer' }]);
    const audit = await database.query('SELECT organization_id, user_id, action FROM qms_training_audit_proof');
    expect(audit.rows).toEqual([{ organization_id: ORG, user_id: VIEWER, action: 'mdx.qms.training.acknowledge' }]);
    expect(state.sql).toContain('BEGIN');
    expect(state.sql.some(sql => /qms_documents[\s\S]*FOR UPDATE/i.test(sql))).toBe(true);
    expect(state.sql).toContain('COMMIT');
  });

  it('reads the same current receipt and released section text through the shared context schema', async () => {
    const created = await acknowledge();
    const context = qmsTrainingContextSchema.parse(await readQmsTrainingContext(client, {
      organizationId: ORG, userId: VIEWER, document: await documentById(), now: NOW,
    }));
    expect(context).toMatchObject({
      documentId: releasedDocument.id, docNumber: 'SOP-001', eligible: true,
      unavailableReason: null, contentDigest: inputFor().contentDigest,
      sections: SECTIONS, acknowledgement: created.acknowledgement,
    });
    const someoneElse = await readQmsTrainingContext(client, {
      organizationId: ORG, userId: MEMBER, document: await documentById(), now: NOW,
    });
    expect(someoneElse.acknowledgement).toBeNull();
  });

  it('returns an existing current receipt without another training or audit insertion', async () => {
    const first = await acknowledge();
    const repeated = await acknowledge();
    expect(repeated).toEqual({ acknowledgement: first.acknowledgement, alreadyAcknowledged: true });
    expect(await trainingRows()).toHaveLength(1);
    expect((await database.query('SELECT * FROM qms_training_audit_proof')).rows).toHaveLength(1);
  });

  it('permits refresh after expiry, preserves history, and returns only the new current receipt', async () => {
    const first = await acknowledge();
    await database.query('UPDATE qms_training_records SET expires_at = $1 WHERE id = $2',
      [new Date(NOW.getTime() - ONE_DAY_MS).toISOString(), first.acknowledgement.id]);
    const expired = await readQmsTrainingContext(client, { organizationId: ORG, userId: VIEWER, document: await documentById(), now: NOW });
    expect(expired.acknowledgement).toBeNull();
    const refreshed = await acknowledge();
    expect(refreshed.alreadyAcknowledged).toBe(false);
    expect(refreshed.acknowledgement.id).not.toBe(first.acknowledgement.id);
    expect(await trainingRows()).toHaveLength(2);
    expect((await database.query('SELECT * FROM qms_training_audit_proof')).rows).toHaveLength(2);
    const current = await readQmsTrainingContext(client, { organizationId: ORG, userId: VIEWER, document: await documentById(), now: NOW });
    expect(current.acknowledgement).toEqual(refreshed.acknowledgement);
  });

  it.each([
    ['version', { documentVersion: '0.9' }],
    ['digest', { contentDigest: '0'.repeat(64) }],
  ] as const)('refuses a stale submitted %s without recording an acknowledgement', async (_label, stale) => {
    await expect(acknowledge(VIEWER, { input: { ...inputFor(), ...stale } })).rejects.toThrow();
    await expectNoTrainingOrAudit();
  });
});

describe('released revision binding and acknowledgement transaction integrity', () => {
  it('refuses text changed after approval even when the caller submits the changed text digest', async () => {
    const changedMetadata = { ...releasedDocument.metadata, sections: [{ ...SECTIONS[0], body: 'A changed instruction after release.' }] };
    await database.query('UPDATE qms_documents SET metadata = $1 WHERE id = $2', [JSON.stringify(changedMetadata), releasedDocument.id]);
    const changed = await documentById();
    await expect(acknowledge(VIEWER, { input: inputFor(changed) })).rejects.toThrow();
    await expectNoTrainingOrAudit();
  });

  it('retains the acknowledged content after an in-place revision and refuses the old reader submission', async () => {
    const first = await acknowledge();
    const newMetadata = { sections: [{ ...SECTIONS[0], body: 'The newly released revision has a different procedure.' }] };
    await database.query('UPDATE qms_documents SET version = $1, metadata = $2 WHERE id = $3', ['2.0', JSON.stringify(newMetadata), releasedDocument.id]);
    await database.query('UPDATE qms_documents SET approved_at=$1::timestamptz WHERE id=$2', [NOW.toISOString(), releasedDocument.id]);
    const revised = await documentById();
    const approval = approvalFor(revised);
    await database.query('UPDATE qms_documents SET metadata = $1 WHERE id = $2', [JSON.stringify({ ...newMetadata, approval }), revised.id]);
    await seedQmsApprovalFixture(client, await documentById());
    await expect(acknowledge()).rejects.toThrow();
    const history = await trainingRows();
    expect(history).toHaveLength(1);
    expect(history[0].metadata.documentSnapshot).toMatchObject({ version: '1.0', metadata: { sections: SECTIONS } });
    expect(computeQmsDocumentContentDigest(history[0].metadata.documentSnapshot)).toBe(first.acknowledgement.contentDigest);
    const context = await readQmsTrainingContext(client, { organizationId: ORG, userId: VIEWER, document: await documentById(), now: NOW });
    expect(context).toMatchObject({ eligible: true, documentVersion: '2.0', acknowledgement: null });
  });

  it.each(['retired', 'superseded', 'draft'])('rechecks document status %s inside the acknowledgement transaction', async status => {
    await database.query('UPDATE qms_documents SET status = $1 WHERE id = $2', [status, releasedDocument.id]);
    await expect(acknowledge()).rejects.toThrow();
    await expectNoTrainingOrAudit();
  });

  it('refuses a future-effective release and a deleted release', async () => {
    await database.query("UPDATE qms_documents SET effective_date = '2026-10-15' WHERE id = $1", [releasedDocument.id]);
    await expect(acknowledge()).rejects.toThrow();
    await database.query("UPDATE qms_documents SET effective_date = '2026-10-01', deleted_at = $1 WHERE id = $2", [NOW.toISOString(), releasedDocument.id]);
    await expect(acknowledge()).rejects.toThrow();
    await expectNoTrainingOrAudit();
  });

  it.each([
    ['missing approver', 'approver_id = NULL'],
    ['missing approval timestamp', 'approved_at = NULL'],
    ['future approval timestamp', "approved_at = '2026-10-15T00:00:00Z'"],
    ['missing approval meaning', "metadata = metadata #- '{approval,meaning}'"],
    ['missing approval basis', "metadata = metadata #- '{approval,bindingBasis}'"],
    ['wrong approval meaning', "metadata = jsonb_set(metadata, '{approval,meaning}', '\"REVIEWED\"'::jsonb)"],
  ])('does not mistake a digest-only effective row for a released document: %s', async (_label, assignment) => {
    // These columns/stamps do not change the content digest itself. Their
    // absence must still prevent a legacy effective header becoming training.
    await database.query(`UPDATE qms_documents SET ${assignment} WHERE id = $1`, [releasedDocument.id]);
    const row = await documentById();
    expect(computeQmsDocumentContentDigest(row)).toBe(inputFor().contentDigest);
    const context = await readQmsTrainingContext(client, { organizationId: ORG, userId: VIEWER, document: row, now: NOW });
    expect(context).toMatchObject({ eligible: false, acknowledgement: null });
    await expect(acknowledge()).rejects.toThrow();
    await expectNoTrainingOrAudit();
  });

  it('rolls back the receipt and the already-inserted audit proof if the audit transaction aborts', async () => {
    state.auditFails = true;
    await expect(acknowledge()).rejects.toThrow();
    await expectNoTrainingOrAudit();
    expect(state.sql.some(sql => /INSERT INTO qms_training_records/i.test(sql))).toBe(true);
    expect(state.sql.some(sql => /INSERT INTO qms_training_audit_proof/i.test(sql))).toBe(true);
    expect(state.sql).toContain('ROLLBACK');
    expect(state.sql).not.toContain('COMMIT');
  });

  it('reports a lost COMMIT reply as unconfirmed and permits readback instead of claiming rollback', async () => {
    const lostReplyClient = {
      query: async (sql: string, params?: unknown[]) => {
        const result = await client.query(sql, params);
        if (sql === 'COMMIT') throw new Error('Connection closed before COMMIT reply');
        return result;
      },
    };
    await expect(acknowledgeQmsTraining(lostReplyClient, {
      organizationId: ORG, userId: VIEWER, documentId: releasedDocument.id, input: inputFor(), now: NOW,
    })).rejects.toMatchObject({ code: 'QMS_TRAINING_COMMIT_UNCONFIRMED' });
    expect(await trainingRows()).toHaveLength(1);
    expect((await database.query('SELECT * FROM qms_training_audit_proof')).rows).toHaveLength(1);
    const recovered = await acknowledge();
    expect(recovered.alreadyAcknowledged).toBe(true);
    expect(recovered.acknowledgement.id).toBe((await trainingRows())[0].id);
    expect((await database.query('SELECT * FROM qms_training_audit_proof')).rows).toHaveLength(1);
  });
});

describe('current trainee standing and tenant boundaries', () => {
  it('derives controlled-text editing capability from the current membership, document state, and payment posture', async () => {
    const contextFor = async (userId: number) => qmsTrainingContextSchema.parse(await readQmsTrainingContext(client, {
      organizationId: ORG, userId, document: await documentById(), now: NOW,
    }));
    expect(await contextFor(MEMBER)).toMatchObject({ status: 'effective', canEditControlledText: false });
    await database.query("UPDATE qms_documents SET status = 'draft' WHERE id = $1", [releasedDocument.id]);
    expect(await contextFor(MEMBER)).toMatchObject({ status: 'draft', canEditControlledText: true });
    expect(await contextFor(VIEWER)).toMatchObject({ status: 'draft', canEditControlledText: false });
    await database.query("UPDATE organizations SET payment_status = 'past_due' WHERE id = $1", [ORG]);
    expect(await contextFor(MEMBER)).toMatchObject({ status: 'draft', canEditControlledText: false });
    await expectNoTrainingOrAudit();
  });

  it('retains a previously acknowledged receipt and released text when payment standing becomes read-only', async () => {
    const first = await acknowledge();
    await database.query("UPDATE organizations SET payment_status = 'past_due' WHERE id = $1", [ORG]);
    const context = qmsTrainingContextSchema.parse(await readQmsTrainingContext(client, {
      organizationId: ORG, userId: VIEWER, document: await documentById(), now: NOW,
    }));
    expect(context).toMatchObject({ eligible: false, sections: SECTIONS, acknowledgement: first.acknowledgement });
    expect(context.unavailableReason).toBeTruthy();
    await expect(acknowledge()).rejects.toMatchObject({ status: 403 });
    expect(await trainingRows()).toHaveLength(1);
    expect((await database.query('SELECT * FROM qms_training_audit_proof')).rows).toHaveLength(1);
  });

  it.each([
    ['foreign membership', FOREIGN_MEMBER],
    ['inactive account', INACTIVE_MEMBER],
    ['suspended account', SUSPENDED_MEMBER],
    ['unverified account', UNVERIFIED_MEMBER],
    ['departed membership', DEPARTED_MEMBER],
    ['missing identity', 999],
  ] as const)('refuses %s without a training or audit record', async (_label, userId) => {
    await expect(acknowledge(userId)).rejects.toThrow();
    await expectNoTrainingOrAudit();
  });

  it('cannot acknowledge a foreign document using a valid membership in the requesting tenant', async () => {
    await expect(acknowledge(VIEWER, { documentId: foreignDocument.id, input: inputFor(foreignDocument) })).rejects.toThrow();
    await expect(acknowledge(FOREIGN_MEMBER, { organizationId: OTHER_ORG })).rejects.toThrow();
    await expectNoTrainingOrAudit();
  });

  it.each(['inactive', 'suspended', 'pending_deletion'])('refuses organization status %s', async status => {
    await database.query('UPDATE organizations SET status = $1 WHERE id = $2', [status, ORG]);
    await expect(acknowledge()).rejects.toThrow();
    await expectNoTrainingOrAudit();
  });

  it('refuses an organization whose payment standing prevents training writes', async () => {
    await database.query("UPDATE organizations SET payment_status = 'past_due' WHERE id = $1", [ORG]);
    await expect(acknowledge()).rejects.toThrow();
    await expectNoTrainingOrAudit();
  });
});

describe('current roster coverage from real training history', () => {
  it('counts distinct active current members and excludes stale, departed, expired, foreign, and legacy receipts', async () => {
    await database.exec(`
      INSERT INTO users (id) VALUES (17), (18), (19), (20), (21);
      INSERT INTO organization_users (organization_id, user_id, role) VALUES
        (1, 16, 'member'), (1, 17, 'member'), (1, 18, 'member'),
        (1, 19, 'member'), (1, 20, 'member'), (1, 21, 'member');
      UPDATE users SET status = 'active' WHERE id = 13;
    `);
    const receipts = new Map<number, number>();
    for (const userId of [VIEWER, MEMBER, INACTIVE_MEMBER, DEPARTED_MEMBER, 17, 18, 19, 20]) {
      receipts.set(userId, (await acknowledge(userId)).acknowledgement.id);
    }
    await database.exec(`
      UPDATE users SET status = 'inactive' WHERE id = 13;
      DELETE FROM organization_users WHERE organization_id = 1 AND user_id = 16;
    `);
    await database.query('UPDATE qms_training_records SET document_version = $1 WHERE id = $2', ['0.9', receipts.get(17)]);
    await database.query("UPDATE qms_training_records SET metadata = jsonb_set(metadata, '{contentDigest}', $1::jsonb) WHERE id = $2",
      [JSON.stringify('0'.repeat(64)), receipts.get(18)]);
    await database.query('UPDATE qms_training_records SET expires_at = $1 WHERE id = $2',
      [new Date(NOW.getTime() - ONE_DAY_MS).toISOString(), receipts.get(19)]);
    await database.query("UPDATE qms_training_records SET metadata = '{}'::jsonb WHERE id = $1", [receipts.get(20)]);
    // Canonical DDL permits historical duplicates. They are one trainee, not two.
    await database.query(`
      INSERT INTO qms_training_records
        (organization_id, user_id, document_id, document_version, acknowledged_at,
         acknowledgment_method, expires_at, metadata)
      SELECT organization_id, user_id, document_id, document_version, acknowledged_at,
        acknowledgment_method, expires_at, metadata FROM qms_training_records WHERE id = $1`, [receipts.get(VIEWER)]);
    // Even a bound-looking foreign-tenant history row is outside this roster.
    await database.query(`
      INSERT INTO qms_training_records
        (organization_id, user_id, document_id, document_version, acknowledged_at,
         acknowledgment_method, expires_at, metadata)
      SELECT $1, $2, document_id, document_version, acknowledged_at,
        acknowledgment_method, expires_at, metadata FROM qms_training_records WHERE id = $3`,
    [OTHER_ORG, FOREIGN_MEMBER, receipts.get(VIEWER)]);

    const rows = await rosterCompliance();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: releasedDocument.id, doc_number: 'SOP-001', title: releasedDocument.title,
      document_version: '1.0', content_digest: inputFor().contentDigest, current: 2, of: 7,
    });
    expect(rows[0].last_cycle).toBeTruthy();
    expect(await trainingRows()).toHaveLength(10);
  });

  it('does not credit an old acknowledgement after the controlled version changes', async () => {
    await acknowledge();
    await database.query("UPDATE qms_documents SET version = '2.0' WHERE id = $1", [releasedDocument.id]);
    await database.query('UPDATE qms_documents SET approved_at=$1::timestamptz WHERE id=$2', [NOW.toISOString(), releasedDocument.id]);
    const changed = await documentById();
    const metadata = { ...changed.metadata, approval: approvalFor(changed) };
    await database.query('UPDATE qms_documents SET metadata = $1 WHERE id = $2', [JSON.stringify(metadata), changed.id]);
    await seedQmsApprovalFixture(client, await documentById());
    const rows = await rosterCompliance();
    expect(rows[0]).toMatchObject({ document_version: '2.0', content_digest: computeQmsDocumentContentDigest(changed), current: 0, of: 2 });
    expect(await trainingRows()).toHaveLength(1);
  });
});
