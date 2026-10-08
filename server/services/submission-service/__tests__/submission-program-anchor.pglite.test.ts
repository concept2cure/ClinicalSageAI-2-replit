/**
 * An existing submission with no project is anchored to one by an authorised
 * person, with a reason, on the audit chain (P-14's remedy,
 * docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08).
 *
 * P-14 refuses a project's document placed into a submission that records no
 * project (409 UNANCHORED_SUBMISSION) and says "a legacy submission with no
 * program is anchored first, through the Submission Center". Nothing could do
 * that: no route wrote submissions.program_id after creation, and the refusal
 * named no screen. The rules here:
 *   - the project is a live project of the caller's organization;
 *   - the caller leads that project or manages the organization
 *     (canMutateProgram, the rule for changing a project's records);
 *   - only a submission with no project is anchored; one that has a project
 *     keeps it (a project holds several submissions, one per market, so
 *     "already anchored to another submission" is not a rule of this model);
 *   - a submission that already files another project's document is not
 *     anchored to this one (a filing holds only its own project's documents);
 *   - the change and its chained audit row, with the reason, commit together.
 *
 * Real SQL on in-process PGlite: the harness's submission core and program
 * spine, the vault table as the ingest writes it, and the real chained writer.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../../db/pglite-harness';
import { VAULT_DDL } from '../../../routes/__tests__/_authoring-canvas-fixture';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../../db', () => {
  const run = async (sql: string, params?: unknown[]) => {
    const r = await holder.pglite.query(sql, params);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    get db() { return holder.db; },
    pool: { query: run, connect: async () => ({ query: run, release: () => {} }) },
  };
});
// The best-effort secondary log behind a leaf placement; the anchor's own row is
// the chained one, written on its transaction (writeChainedAuditRow, real).
vi.mock('../../auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auditService')>()),
  default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) },
}));

import { anchorSubmissionToProgram, upsertLeaf, SubmissionError } from '../submission-service';

let h: IndPgliteDb;
const ORG = 1;
const OTHER_ORG = 2;
const MANAGER = { organizationId: ORG, userId: 9, orgRole: 'manager' };
const LEAD = { organizationId: ORG, userId: 21, orgRole: 'member' };
const MEMBER = { organizationId: ORG, userId: 22, orgRole: 'member' };
const P_A = '0a000000-0000-4000-8000-00000000000a';
const P_B = '0b000000-0000-4000-8000-00000000000b';
const P_X = '0e000000-0000-4000-8000-00000000000e'; // another organization's
const V_A = 'a1000000-0000-4000-8000-0000000000a1';
const V_B = 'b1000000-0000-4000-8000-0000000000b1';
const REASON = 'Legacy IND created before submissions recorded their project.';

async function q<T = any>(text: string, params: unknown[] = []) {
  return (await h.pglite.query<T>(text, params)).rows;
}

/** An unanchored submission with one sequence: [submissionId, sequenceId]. */
async function legacySubmission(): Promise<[number, number]> {
  const [s] = await q<{ id: number }>(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ('Legacy IND', 'ind', 'pharma', 'fda', $1, 9, NULL) RETURNING id`,
    [ORG],
  );
  const [seq] = await q<{ id: number }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
     VALUES ($1, 'fda', '0000', 'draft', $2, 9) RETURNING id`,
    [Number(s.id), ORG],
  );
  return [Number(s.id), Number(seq.id)];
}

const programOf = async (submissionId: number) =>
  (await q<{ program_id: string | null }>(`SELECT program_id FROM submissions WHERE id = $1`, [submissionId]))[0].program_id;

const anchorRows = async (submissionId: number) =>
  q<{ action: string; actor_id: number; reason: string | null; program: string | null; chained: boolean }>(
    `SELECT action, actor_id, reason, new_values::jsonb ->> 'programId' AS program, sha256_chain IS NOT NULL AS chained
       FROM audit_logs WHERE table_name = 'submission' AND record_id = $1 ORDER BY occurred_at, id`,
    [String(submissionId)],
  );

const vaultLeaf = (sequenceId: number, documentUuid: string) =>
  upsertLeaf({ sequenceId, sectionCode: 'm5.3.5', title: 'Protocol', documentTable: 'vault_documents', documentUuid }, { organizationId: ORG, userId: 9 });

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pglite.exec(VAULT_DDL);
  // shared/schema/programs.ts leadUserId; the harness's program spine omits it.
  await h.pglite.exec(`ALTER TABLE regulatory_programs ADD COLUMN IF NOT EXISTS lead_user_id INTEGER`);
  for (const [id, org, code, lead] of [[P_A, ORG, 'A-1', LEAD.userId], [P_B, ORG, 'B-1', null], [P_X, OTHER_ORG, 'X-1', null]] as const) {
    await q(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name, lead_user_id)
       VALUES ($1, $2, $3, $4, 'ind', 'Alpha', $5)`,
      [id, org, `Program ${code}`, code, lead],
    );
  }
  for (const [id, programId, hash] of [[V_A, P_A, 'a'.repeat(64)], [V_B, P_B, 'b'.repeat(64)]]) {
    await q(
      `INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, content_hash)
       VALUES ($1, $2, $3, $4, $4, 'PROTOCOL', $5)`,
      [id, programId, ORG, `doc-${id.slice(0, 2)}`, hash],
    );
  }
}, 60_000);

afterAll(async () => {
  await h?.close();
});

describe('anchoring a submission that records no project', () => {
  it('a manager anchors it, with the reason on a chained audit row; the project’s documents are then placed', async () => {
    const [sub, seq] = await legacySubmission();
    const refused = await vaultLeaf(seq, V_A).catch((e) => e);
    expect(refused).toMatchObject({ code: 'UNANCHORED_SUBMISSION' });

    const anchored = await anchorSubmissionToProgram({ submissionId: sub, programId: P_A, reason: REASON }, MANAGER);
    expect(anchored).toMatchObject({ id: sub, programId: P_A });
    expect(await programOf(sub)).toBe(P_A);
    expect(await anchorRows(sub)).toEqual([
      { action: 'SUBMISSION_PROGRAM_ANCHORED', actor_id: MANAGER.userId, reason: REASON, program: P_A, chained: true },
    ]);

    await expect(vaultLeaf(seq, V_A)).resolves.toMatchObject({ documentUuid: V_A });
  });

  it('the project’s lead may anchor it; a member who does not lead the project may not, and nothing changes', async () => {
    const [sub] = await legacySubmission();
    const refused = await anchorSubmissionToProgram({ submissionId: sub, programId: P_A, reason: REASON }, MEMBER).catch((e) => e);
    expect(refused).toBeInstanceOf(SubmissionError);
    expect(refused).toMatchObject({ code: 'FORBIDDEN', message: expect.stringMatching(/lead or an organization manager.*Nothing was changed/) });
    expect(await programOf(sub)).toBeNull();
    expect(await anchorRows(sub)).toEqual([]);

    await anchorSubmissionToProgram({ submissionId: sub, programId: P_A, reason: REASON }, LEAD);
    expect(await programOf(sub)).toBe(P_A);
  });

  it('another organization’s project is not found, and nothing changes', async () => {
    const [sub] = await legacySubmission();
    const refused = await anchorSubmissionToProgram({ submissionId: sub, programId: P_X, reason: REASON }, MANAGER).catch((e) => e);
    expect(refused).toMatchObject({ code: 'NOT_FOUND' });
    expect(await programOf(sub)).toBeNull();
    expect(await anchorRows(sub)).toEqual([]);
  });

  it('another organization’s submission is not found', async () => {
    const [sub] = await legacySubmission();
    const refused = await anchorSubmissionToProgram(
      { submissionId: sub, programId: P_X, reason: REASON },
      { organizationId: OTHER_ORG, userId: 9, orgRole: 'manager' },
    ).catch((e) => e);
    expect(refused).toMatchObject({ code: 'NOT_FOUND' });
    expect(await programOf(sub)).toBeNull();
  });

  it('a submission that has a project keeps it', async () => {
    const [sub] = await legacySubmission();
    await anchorSubmissionToProgram({ submissionId: sub, programId: P_A, reason: REASON }, MANAGER);
    const again = await anchorSubmissionToProgram({ submissionId: sub, programId: P_B, reason: REASON }, MANAGER).catch((e) => e);
    expect(again).toMatchObject({ code: 'INVALID_STATE', message: expect.stringMatching(/already anchored to another project/) });
    expect(await programOf(sub)).toBe(P_A);
    expect((await anchorRows(sub)).map((r) => r.program)).toEqual([P_A]);
  });

  it('a submission that already files another project’s document is not anchored to this one', async () => {
    const [sub, seq] = await legacySubmission();
    // Placed before P-14, when a placement into an unanchored submission was allowed.
    await q(
      `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_uuid, organization_id, created_by)
       VALUES ($1, 'm5.3.5', 'Protocol', 'new', 'vault_documents', $2, $3, 9)`,
      [seq, V_B, ORG],
    );
    const refused = await anchorSubmissionToProgram({ submissionId: sub, programId: P_A, reason: REASON }, MANAGER).catch((e) => e);
    expect(refused).toMatchObject({ code: 'CROSS_PROJECT', message: expect.stringMatching(/sequence 0000, m5\.3\.5/) });
    expect(await programOf(sub)).toBeNull();
    expect(await anchorRows(sub)).toEqual([]);

    // Its own project is the one it can be anchored to.
    await anchorSubmissionToProgram({ submissionId: sub, programId: P_B, reason: REASON }, MANAGER);
    expect(await programOf(sub)).toBe(P_B);
  });
});

describe('the unanchored-placement refusal names the control that anchors the submission', () => {
  it('says where: Submission Center, “Anchor to a project”', async () => {
    const [, seq] = await legacySubmission();
    const refused = await vaultLeaf(seq, V_B).catch((e) => e);
    expect(refused).toMatchObject({ code: 'UNANCHORED_SUBMISSION' });
    expect(refused.message).toMatch(/in Submission Center, open this submission and choose “Anchor to a project”/);
    expect(refused.message).toMatch(/Nothing was placed\.$/);
  });
});
