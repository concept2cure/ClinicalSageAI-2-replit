/** The existing Quality document editor writes controlled words atomically. */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { approveQmsDocumentSigned, computeQmsDocumentContentDigest, type QmsDocumentRow } from '../document-approval-signature';
import { saveQmsControlledText } from '../training-controlled-text';
import { readQmsTrainingContext } from '../training';

let database: PGlite;
const state = vi.hoisted(() => ({ auditFails: false, sql: [] as string[] }));
const client = {
  query: async (sql: string, params?: unknown[]) => {
    state.sql.push(sql);
    const result = await database.query<Record<string, unknown>>(sql, params);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  },
};
vi.mock('../../auditService', () => ({
  writeChainedAuditRow: vi.fn(async (transactionClient: typeof client, entry: {
    tenantId?: number; organizationId?: number; userId?: number; details?: unknown;
  }) => {
    await transactionClient.query('INSERT INTO qms_text_audit_proof (organization_id, user_id, details) VALUES ($1, $2, $3)',
      [entry.tenantId ?? entry.organizationId, entry.userId, JSON.stringify(entry.details ?? null)]);
    if (state.auditFails) await transactionClient.query('INSERT INTO qms_text_audit_proof (missing_column) VALUES (1)');
  }),
}));

vi.mock('../../../routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn(async (transactionClient: typeof client, entry: {
    userId: number; payload: { contentDigest: string };
  }) => {
    for (const kind of ['governed', 'audit']) {
      await transactionClient.query('INSERT INTO qms_approval_proof (kind, user_id, content_digest) VALUES ($1, $2, $3)',
        [kind, entry.userId, entry.payload.contentDigest]);
    }
    return { actionId: 'approval-action-proof', auditId: 'approval-audit-proof', sha256Chain: '1'.repeat(64) };
  }),
}));
vi.mock('../../part11/signature-persistence', async importOriginal => {
  const actual = await importOriginal<typeof import('../../part11/signature-persistence')>();
  return {
    ...actual, // Keep the canonical digest function real.
    persistGovernedActionSignature: vi.fn(async (transactionClient: typeof client, entry: {
      userId: number; binding: { digest: string }; occurredAt: Date;
    }) => {
      const inserted = await transactionClient.query(
        "INSERT INTO qms_approval_proof (kind, user_id, content_digest) VALUES ('signature', $1, $2) RETURNING id",
        [entry.userId, entry.binding.digest],
      );
      return { id: Number(inserted.rows[0].id), signedAt: entry.occurredAt };
    }),
  };
});

const NOW = new Date('2026-10-14T12:00:00.000Z');
const OLD_SECTIONS = [{ key: 'purpose', label: 'Purpose', body: 'Existing draft procedure.' }];
const NEW_SECTIONS = [
  { key: 'purpose', label: 'Purpose', body: 'Retain <original> records & document every correction.\nKeep the original text visible.', order: 0 },
  { key: 'procedure', label: 'Procedure', body: 'Record the correction reason and responsible person.', hint: 'Use the current controlled process.', order: 1 },
];
let document: QmsDocumentRow;

function canonicalTable(name: 'qms_documents' | 'qms_training_records') {
  const migration = readFileSync(new URL('../../../../migrations/20260511_qms_and_labeling.sql', import.meta.url), 'utf8');
  const match = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n\\);`));
  if (!match) throw new Error(`Canonical ${name} DDL not found`);
  return match[0];
}

beforeAll(async () => {
  database = await PGlite.create();
  await database.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active', payment_status text NOT NULL DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
    CREATE TABLE organization_users (
      organization_id integer NOT NULL REFERENCES organizations(id),
      user_id integer NOT NULL REFERENCES users(id), role text NOT NULL,
      PRIMARY KEY (organization_id, user_id)
    );
    ${canonicalTable('qms_documents')}
    ${canonicalTable('qms_training_records')}
    CREATE TABLE qms_text_audit_proof (organization_id integer NOT NULL, user_id integer NOT NULL, details jsonb);
    CREATE TABLE qms_approval_proof (id serial PRIMARY KEY, kind text NOT NULL, user_id integer NOT NULL, content_digest text NOT NULL);
  `);
}, 60_000);

beforeEach(async () => {
  state.auditFails = false;
  state.sql = [];
  await database.exec(`
    TRUNCATE qms_approval_proof, qms_text_audit_proof, qms_training_records, qms_documents, organization_users, users, organizations RESTART IDENTITY CASCADE;
    INSERT INTO organizations (id) VALUES (1), (2);
    INSERT INTO users (id, status) VALUES (10, 'active'), (11, 'active'), (12, 'active'), (13, 'inactive');
    INSERT INTO organization_users (organization_id, user_id, role) VALUES
      (1, 10, 'member'), (1, 11, 'viewer'), (2, 12, 'member'), (1, 13, 'member');
  `);
  document = (await database.query<QmsDocumentRow>(
    `INSERT INTO qms_documents
      (organization_id, doc_number, title, doc_type, version, status, author_id, metadata)
     VALUES (1, 'SOP-EDIT', 'A controlled draft', 'sop', '1.0', 'draft', 10, $1) RETURNING *`,
    [JSON.stringify({
      sections: OLD_SECTIONS,
      templateId: 'record-corrections',
      source: { artifactId: 71 },
      revisionHistory: [{ version: '0.9', note: 'Retained history' }],
      approval: { contentDigest: '0'.repeat(64), reason: 'A stale approval stamp' },
    })],
  )).rows[0];
});
afterAll(async () => { await database?.close(); });

function input() {
  return {
    controlledText: {
      documentVersion: document.version,
      contentDigest: computeQmsDocumentContentDigest(document),
      sections: NEW_SECTIONS,
    },
    reason: 'Correct the controlled procedure before review.',
  };
}
function save(overrides: Partial<Parameters<typeof saveQmsControlledText>[1]> = {}, transactionClient = client) {
  return saveQmsControlledText(transactionClient, { organizationId: 1, userId: 10, documentId: document.id, input: input(), now: NOW, ...overrides });
}
async function currentDocument() {
  return (await database.query<QmsDocumentRow>('SELECT * FROM qms_documents WHERE id = $1', [document.id])).rows[0];
}
async function expectUnchanged() {
  expect(await currentDocument()).toEqual(document);
  expect((await database.query('SELECT * FROM qms_text_audit_proof')).rows).toHaveLength(0);
}

async function contributorDocumentUnderReview() {
  await database.exec(`
    UPDATE organization_users SET role = 'member' WHERE organization_id = 1 AND user_id = 11;
    INSERT INTO organization_users (organization_id, user_id, role) VALUES (1, 12, 'approver');
  `);
  await save({ userId: 11 });
  await database.query("UPDATE qms_documents SET status = 'in_review' WHERE id = $1", [document.id]);
  return currentDocument();
}

async function approveAs(userId: number) {
  await client.query('BEGIN');
  try {
    const result = await approveQmsDocumentSigned(client, {
      orgId: 1, userId, documentId: document.id,
      reason: 'Reviewed the controlled procedure independently.', meaning: 'APPROVED', effectiveDate: '2026-10-14',
      authenticationMethod: 'password+totp', secondFactorVerified: true, ipAddress: '127.0.0.1',
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

describe('controlled QMS text on canonical migration SQL', () => {
  it('persists exact words, preserves unrelated metadata, removes stale approval, and records audit on the same transaction', async () => {
    await save();
    const saved = await currentDocument();
    expect(saved).toMatchObject({ title: document.title, version: '1.0', status: 'draft', author_id: 10 });
    expect(saved.metadata).toEqual({
      sections: NEW_SECTIONS, templateId: 'record-corrections', source: { artifactId: 71 },
      revisionHistory: [{ version: '0.9', note: 'Retained history' }],
      controlledTextAuthorship: { authorUserIds: [10] },
    });
    expect(computeQmsDocumentContentDigest(saved)).not.toBe(input().controlledText.contentDigest);
    expect((await database.query('SELECT organization_id, user_id FROM qms_text_audit_proof')).rows)
      .toEqual([{ organization_id: 1, user_id: 10 }]);
    expect((await database.query('SELECT * FROM qms_training_records')).rows).toHaveLength(0);
    expect(state.sql).toContain('BEGIN');
    expect(state.sql.some(sql => /qms_documents[\s\S]*FOR UPDATE/i.test(sql))).toBe(true);
    expect(state.sql).toContain('COMMIT');
    const context = await readQmsTrainingContext(client, { organizationId: 1, userId: 10, document: saved, now: NOW });
    expect(context).toMatchObject({ eligible: false, contentDigest: computeQmsDocumentContentDigest(saved), acknowledgement: null });
  });

  it('returns a document under review to draft when its controlled text changes', async () => {
    await database.query("UPDATE qms_documents SET status = 'in_review' WHERE id = $1", [document.id]);
    await save();
    expect(await currentDocument()).toMatchObject({ status: 'draft', version: '1.0', metadata: { sections: NEW_SECTIONS } });
  });

  it.each([
    ['version', { documentVersion: '0.9' }],
    ['content digest', { contentDigest: '0'.repeat(64) }],
  ] as const)('refuses a stale %s without overwriting the draft', async (_label, stale) => {
    const body = input();
    await expect(save({ input: { ...body, controlledText: { ...body.controlledText, ...stale } } })).rejects.toThrow();
    await expectUnchanged();
  });

  it.each(['effective', 'retired', 'superseded'])('does not edit controlled words in status %s', async status => {
    await database.query('UPDATE qms_documents SET status = $1 WHERE id = $2', [status, document.id]);
    document = await currentDocument();
    await expect(save()).rejects.toThrow();
    await expectUnchanged();
  });

  it.each([
    ['viewer', 11], ['foreign membership', 12], ['inactive account', 13], ['missing identity', 999],
  ] as const)('refuses a current %s instead of accepting session-provided writing authority', async (_label, userId) => {
    await expect(save({ userId })).rejects.toThrow();
    await expectUnchanged();
  });

  it('refuses a valid member of a different tenant targeting this document', async () => {
    await expect(save({ organizationId: 2, userId: 12 })).rejects.toThrow();
    await expectUnchanged();
  });

  it.each(['inactive', 'suspended'])('refuses an organization with status %s', async status => {
    await database.query('UPDATE organizations SET status = $1 WHERE id = 1', [status]);
    await expect(save()).rejects.toThrow();
    await expectUnchanged();
  });

  it('refuses an organization whose payment standing prevents writing', async () => {
    await database.query("UPDATE organizations SET payment_status = 'past_due' WHERE id = 1");
    await expect(save()).rejects.toThrow();
    await expectUnchanged();
  });

  it('refuses a deleted draft', async () => {
    await database.query('UPDATE qms_documents SET deleted_at = $1 WHERE id = $2', [NOW.toISOString(), document.id]);
    document = await currentDocument();
    await expect(save()).rejects.toThrow();
    await expectUnchanged();
  });
});

describe('draft concurrency and controlled-text transaction integrity', () => {
  it('does not overwrite a more recent edit read after the editor opened', async () => {
    const staleInput = input();
    await database.query("UPDATE qms_documents SET title = 'A newer draft title' WHERE id = $1", [document.id]);
    document = await currentDocument();
    await expect(save({ input: staleInput })).rejects.toThrow();
    await expectUnchanged();
  });

  it('allows incomplete controlled words to remain a draft without creating training', async () => {
    const body = input();
    const sections = [{ key: 'purpose', label: 'Purpose', body: '' }];
    await save({ input: { ...body, controlledText: { ...body.controlledText, sections } } });
    const saved = await currentDocument();
    expect(saved).toMatchObject({ status: 'draft', metadata: { sections } });
    const context = await readQmsTrainingContext(client, { organizationId: 1, userId: 10, document: saved, now: NOW });
    expect(context).toMatchObject({ eligible: false, acknowledgement: null });
    expect((await database.query('SELECT * FROM qms_training_records')).rows).toHaveLength(0);
  });

  it('requires a reason and rejects another metadata/status payload alongside controlled text', async () => {
    await expect(save({ input: { ...input(), reason: 'short' } })).rejects.toThrow();
    const injected = { ...input(), status: 'effective', metadata: { approval: { meaning: 'APPROVED' } } };
    await expect(save({ input: injected })).rejects.toThrow();
    await expectUnchanged();
  });

  it('rolls back both the controlled text and its audit proof when auditing aborts', async () => {
    state.auditFails = true;
    await expect(save()).rejects.toThrow();
    await expectUnchanged();
    expect(state.sql.some(sql => /UPDATE qms_documents/i.test(sql))).toBe(true);
    expect(state.sql).toContain('ROLLBACK');
    expect(state.sql).not.toContain('COMMIT');
  });

  it('reports a lost COMMIT reply as unconfirmed while the saved text remains discoverable', async () => {
    const lostReplyClient = {
      query: async (sql: string, params?: unknown[]) => {
        const result = await client.query(sql, params);
        if (sql === 'COMMIT') throw new Error('Connection closed before COMMIT reply');
        return result;
      },
    };
    await expect(save({}, lostReplyClient)).rejects.toMatchObject({ code: expect.stringContaining('UNCONFIRMED') });
    expect(await currentDocument()).toMatchObject({ metadata: { sections: NEW_SECTIONS } });
    expect((await database.query('SELECT * FROM qms_text_audit_proof')).rows).toHaveLength(1);
  });
});

describe('recorded section provenance across native controlled-text edits', () => {
  it('preserves unknown per-section provenance while replacing only the submitted controlled words', async () => {
    const provenance = {
      sourceDocumentId: 42,
      sourcePage: 3,
      provenance: { artifactVersion: 2, locations: [{ page: 3, paragraph: 7 }] },
    };
    await database.query("UPDATE qms_documents SET metadata = jsonb_set(metadata, '{sections}', $1::jsonb) WHERE id = $2",
      [JSON.stringify([{ ...OLD_SECTIONS[0], ...provenance }]), document.id]);
    document = await currentDocument();
    await save();
    const saved = await currentDocument();
    expect(saved.metadata?.sections).toEqual([
      { ...NEW_SECTIONS[0], ...provenance },
      NEW_SECTIONS[1],
    ]);
    expect(saved.metadata).toMatchObject({ source: { artifactId: 71 }, revisionHistory: [{ version: '0.9', note: 'Retained history' }] });
    expect(saved.metadata).not.toHaveProperty('approval');
    expect((await database.query('SELECT * FROM qms_text_audit_proof')).rows).toHaveLength(1);
  });

  it.each([
    { label: 'not an array', sections: { purpose: 'A legacy shape with unrepresented attributes.' } },
    { label: 'missing key', sections: [{ label: 'Purpose', body: 'Recorded text.', sourcePage: 3 }] },
    { label: 'duplicate keys', sections: [{ ...OLD_SECTIONS[0], sourcePage: 3 }, { ...OLD_SECTIONS[0], sourcePage: 4 }] },
  ])('refuses malformed stored section maps ($label) instead of dropping unrepresented attributes', async ({ sections }) => {
    await database.query("UPDATE qms_documents SET metadata = jsonb_set(metadata, '{sections}', $1::jsonb) WHERE id = $2",
      [JSON.stringify(sections), document.id]);
    document = await currentDocument();
    await expect(save()).rejects.toMatchObject({ status: 409 });
    await expectUnchanged();
  });
});

describe('actual controlled-text contributors and the canonical approval gate', () => {
  it('refuses the actual text contributor as approver without a document update, governed act, signature, or approval audit', async () => {
    const beforeApproval = await contributorDocumentUnderReview();
    state.sql = [];
    await expect(approveAs(11)).rejects.toMatchObject({ code: 'SELF_APPROVAL' });
    expect(await currentDocument()).toEqual(beforeApproval);
    expect(state.sql.some(sql => /UPDATE qms_documents/i.test(sql))).toBe(false);
    expect((await database.query('SELECT * FROM qms_approval_proof')).rows).toHaveLength(0);
    expect((await database.query('SELECT * FROM qms_text_audit_proof')).rows).toHaveLength(1);
    expect(beforeApproval).toMatchObject({ author_id: 10, metadata: { controlledTextAuthorship: { authorUserIds: [11] } } });
  });

  it('allows an uninvolved signer through the canonical gate and binds the real digest including contributor history', async () => {
    const beforeApproval = await contributorDocumentUnderReview();
    const result = await approveAs(12);
    const digest = computeQmsDocumentContentDigest(beforeApproval);
    expect(result.document).toMatchObject({ status: 'effective', author_id: 10, approver_id: 12,
      metadata: { controlledTextAuthorship: { authorUserIds: [11] }, approval: { contentDigest: digest, twoPersonRule: 'enforced' } } });
    expect(result.signature.boundPayloadDigest).toBe(digest);
    expect(computeQmsDocumentContentDigest(await currentDocument())).toBe(digest);
    const proof = await database.query('SELECT kind, user_id, content_digest FROM qms_approval_proof ORDER BY id');
    expect(proof.rows).toEqual(['governed', 'audit', 'signature'].map(kind => ({ kind, user_id: 12, content_digest: digest })));
  });

  it('retains multiple actual editors, preserves the original creator, and carries protected contributors in the audit details', async () => {
    document = await contributorDocumentUnderReview();
    await save({ userId: 10 });
    const saved = await currentDocument();
    expect(saved).toMatchObject({ author_id: 10, metadata: { controlledTextAuthorship: { authorUserIds: [10, 11] } } });
    const audited = await database.query<{ details: { controlledTextAuthorUserIds: number[] } }>('SELECT details FROM qms_text_audit_proof');
    expect(audited.rows).toHaveLength(2);
    expect(audited.rows.map(row => row.details.controlledTextAuthorUserIds)).toEqual(expect.arrayContaining([[11], [10, 11]]));
  });

  it.each([
    { authorUserIds: 'unrepresented contributors' },
    { authorUserIds: [] },
    { authorUserIds: [0] },
    { authorUserIds: [Number.MAX_SAFE_INTEGER + 1] },
    { authorUserIds: [11, 11] },
  ])('refuses malformed stored protected authorship before editing or recording an audit', async block => {
    await database.query("UPDATE qms_documents SET metadata = jsonb_set(metadata, '{controlledTextAuthorship}', $1::jsonb) WHERE id = $2",
      [JSON.stringify(block), document.id]);
    document = await currentDocument();
    await expect(save()).rejects.toMatchObject({ status: 409 });
    await expectUnchanged();
  });

  it('does not accept contributor identities supplied through the strict controlled-text input', async () => {
    const forged = { ...input(), controlledTextAuthorship: { authorUserIds: [12] } };
    await expect(save({ input: forged })).rejects.toThrow();
    await expectUnchanged();
  });
});
