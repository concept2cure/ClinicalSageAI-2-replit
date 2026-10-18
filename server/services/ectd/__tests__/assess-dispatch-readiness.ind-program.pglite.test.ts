/**
 * The one dispatch verdict carries what the IND gate checked (decision P-33,
 * docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-15).
 *
 * `ind-lifecycle/ind-dispatch-gate.ts` was merged into this assessor and
 * deleted. What it checked that the assessor did not is carried by
 * ind-program-findings.ts, and each carry is locked here against real SQL
 * (in-process PGlite), with every gate input read by the assessor itself:
 *
 *   (b) a cross-reference recorded with no Letter of Authorization blocks
 *       EVERY sequence of the IND — an amendment as much as the original —
 *       one CROSS_REFERENCE_LOA_MISSING per reference; an unreadable register
 *       blocks and says why;
 *   (c) an overdue IND safety report is a warning, never a block, and is not
 *       raised against the sequence that carries the safety report itself;
 *   (d) every US IND sequence states that a clinical hold is NOT ASSESSED —
 *       in its findings and on the structural gate — and is not blocked by
 *       it; a hold is never read from anywhere a caller supplies;
 *   (e) a continuing IND sequence is held to 1.1, 1.2 and the content its
 *       type requires (validateSequenceLeaves): an amendment with only its
 *       1571 is blocked;
 *   and the two checks P-33 did NOT carry stay uncarried:
 *   (g) a dispatched, clean sequence keeps gate.cleared — transmit requires a
 *       dispatched sequence with a clear gate;
 *   (h) a leaf with no checksum does not block — the governed leaf route
 *       cannot set the column and the packager computes it from the bytes.
 *
 * The release-signature resolver is stubbed (not required; its store is not
 * in this harness), as in assess-dispatch-readiness.original-ind-module3.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../../db.js', () => ({ get db() { return holder.db; } }));
vi.mock('../release-signature-status', async (importOriginal) => ({
  resolveReleaseSignatureStatus: async () => ({ verdict: 'unsigned', detail: 'stubbed: no release signature store in this harness' }),
  isReleaseSignatureRequired: () => false,
  signingNowResolvesRelease: (await importOriginal<typeof import('../release-signature-status')>()).signingNowResolvesRelease,
}));

import { assessSequenceDispatchReadiness, readinessOptionsForSequence } from '../assess-dispatch-readiness';
import { CLINICAL_HOLD_NOT_ASSESSED_NOTE } from '../ind-program-findings';

let harness: IndPgliteDb;
const ORG = 61;
const USER = 7;
const AS_OF = '2026-10-15';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const q = (text: string, params: unknown[] = []) => harness.pglite.query<any>(text, params);

async function seedSubmission(applicationType = 'ind'): Promise<number> {
  const r = await q(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ('ABC-201 IND', 'ABC-201', $1, 'biotech', 'fda', $2, $3) RETURNING id`,
    [applicationType, ORG, USER],
  );
  return Number(r.rows[0].id);
}

/** A sequence with a completed Shadow Review, so only the structural gate can stand in its way. */
async function seedSequence(submissionId: number, sequenceNumber: string, type: string, status = 'assembling'): Promise<number> {
  const r = await q(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
     VALUES ($1, 'fda', $2, $3, $4, $5, $6) RETURNING id`,
    [submissionId, sequenceNumber, type, status, ORG, USER],
  );
  const id = Number(r.rows[0].id);
  await q(`INSERT INTO shadow_review_runs (sequence_id, status, organization_id) VALUES ($1, 'complete', $2)`, [id, ORG]);
  return id;
}

/** A leaf over a real, approved, pinned coauthor document — and NO checksum, as the governed leaf route stores it. */
async function placeLeaf(sequenceId: number, sectionCode: string, title: string, documentType: string | null = null): Promise<void> {
  const body = `${title} body ${sequenceId}`;
  const doc = await q(
    `INSERT INTO coauthor_documents (organization_id, title, content, module_number, status) VALUES ($1, $2, $3, $4, 'approved') RETURNING id`,
    [ORG, title, body, sectionCode],
  );
  await q(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_content_sha256, document_type, organization_id, created_by)
     VALUES ($1, $2, $3, 'new', 'coauthor_documents', $4, $5, $6, $7, $8)`,
    [sequenceId, sectionCode, title, Number(doc.rows[0].id), sha(body), documentType, ORG, USER],
  );
}

/** The transmittal pair and a protocol amendment: a complete 312.30 amendment. */
async function placeCompleteAmendment(sequenceId: number): Promise<void> {
  await placeLeaf(sequenceId, 'm1.1.1', 'Form FDA 1571');
  await placeLeaf(sequenceId, 'm1.2', 'Cover Letter');
  await placeLeaf(sequenceId, 'm5.3.5.1', 'Protocol amendment');
}

async function recordCrossReference(submissionId: number, number: string, loa: boolean): Promise<void> {
  await q(
    `INSERT INTO ind_cross_references (organization_id, submission_id, referenced_file_type, referenced_file_number, subject_name, authorized_sections, loa_on_file)
     VALUES ($1, $2, 'DMF', $3, 'ABC-201 drug substance', '["3.2.S"]'::jsonb, $4)`,
    [ORG, submissionId, number, loa],
  );
}

async function recordSafetyReport(submissionId: number, opts: { deadline: string; status?: string; sequenceId?: number | null }): Promise<void> {
  await q(
    `INSERT INTO ind_safety_reports (organization_id, submission_id, adverse_event_id, obligation, reporting_window_days, deadline, regulatory_basis, status, sequence_id, classification, document)
     VALUES ($1, $2, 'ae-p33', 'FIFTEEN_DAY', 15, $3, '21 CFR 312.32(c)(1)', $4, $5, '{}'::jsonb, '{}'::jsonb)`,
    [ORG, submissionId, opts.deadline, opts.status ?? 'draft', opts.sequenceId ?? null],
  );
}

const assess = (sequenceId: number) => assessSequenceDispatchReadiness({ sequenceId, organizationId: ORG, asOf: AS_OF });
type Assessment = Awaited<ReturnType<typeof assess>>;
const byCode = (a: Assessment, code: string) => a.readiness.findings.filter((f) => f.code === code);
const structural = (a: Assessment) => a.gates.find((g) => g.key === 'structural')!;

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, shadowReview: true });
  await harness.pglite.exec(`CREATE TABLE IF NOT EXISTS organizations(id integer PRIMARY KEY,settings jsonb NOT NULL DEFAULT '{}'); INSERT INTO organizations(id) VALUES(${ORG});`);
  holder.db = harness.db;
});

afterAll(async () => {
  await harness?.close?.();
});

describe('(b) a cross-reference with no Letter of Authorization blocks every sequence of the IND', () => {
  it('an amendment: one CROSS_REFERENCE_LOA_MISSING per reference, and the gate is not cleared', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0001', 'amendment');
    await placeCompleteAmendment(sequenceId);
    await recordCrossReference(submissionId, '044001', false);
    await recordCrossReference(submissionId, '044002', false);
    await recordCrossReference(submissionId, '044003', true);

    const a = await assess(sequenceId);
    const loa = byCode(a, 'CROSS_REFERENCE_LOA_MISSING');
    expect(loa.map((f) => f.severity)).toEqual(['error', 'error']);
    expect(loa.map((f) => f.message.match(/DMF \d+/)?.[0])).toEqual(['DMF 044001', 'DMF 044002']);
    expect(loa[0].message).toMatch(/21 CFR 312\.23\(b\)/);
    expect(loa[0].rule?.id).toBe('CROSS_REFERENCE_LOA_MISSING');
    expect(a.indProgram?.crossReferencesWithoutLoa).toBe(2);
    expect(a.validationErrors).toBe(2);
    expect(a.gate.cleared).toBe(false);
    expect(a.freezeGate.cleared).toBe(false);
    expect(structural(a).cleared).toBe(false);
  });

  it('the original too, even with its Module 3 placed', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0000', 'original');
    const required =
      readinessOptionsForSequence({ region: 'fda', type: 'original', sequenceNumber: '0000' }, 'ind', AS_OF).requiredByRegulation?.codes ?? [];
    for (const code of required) await placeLeaf(sequenceId, `m${code}`, `Module ${code}`);
    await placeLeaf(sequenceId, 'm3.2.S.1', 'General Information');
    await placeLeaf(sequenceId, 'm3.2.P.1', 'Description and Composition of the Drug Product');
    await recordCrossReference(submissionId, '055001', false);

    const a = await assess(sequenceId);
    expect(byCode(a, 'IND_MODULE3_REQUIRED')).toEqual([]);
    expect(byCode(a, 'CROSS_REFERENCE_LOA_MISSING')).toHaveLength(1);
    expect(a.gate.cleared).toBe(false);
  });

  it('with every LOA on file the same amendment clears', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0001', 'amendment');
    await placeCompleteAmendment(sequenceId);
    await recordCrossReference(submissionId, '066001', true);

    const a = await assess(sequenceId);
    expect(byCode(a, 'CROSS_REFERENCE_LOA_MISSING')).toEqual([]);
    expect(a.indProgram?.crossReferencesWithoutLoa).toBe(0);
    expect(a.gate.cleared, a.gate.blockers.join(' | ')).toBe(true);
  });

  it('a register that cannot be read blocks, and says why', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0001', 'amendment');
    await placeCompleteAmendment(sequenceId);
    await q('ALTER TABLE ind_cross_references RENAME TO ind_cross_references_away');
    try {
      const a = await assess(sequenceId);
      const loa = byCode(a, 'CROSS_REFERENCE_LOA_MISSING');
      expect(loa).toHaveLength(1);
      expect(loa[0].message).toMatch(/cross-reference register could not be read/);
      expect(a.indProgram?.crossReferencesWithoutLoa).toBeNull();
      expect(a.gate.cleared).toBe(false);
    } finally {
      await q('ALTER TABLE ind_cross_references_away RENAME TO ind_cross_references');
    }
  });

  it('another application type is not judged by it', async () => {
    const submissionId = await seedSubmission('nda');
    const sequenceId = await seedSequence(submissionId, '0001', 'amendment');
    await placeLeaf(sequenceId, 'm1.1', 'Form FDA 356h');
    await recordCrossReference(submissionId, '077001', false);
    expect(byCode(await assess(sequenceId), 'CROSS_REFERENCE_LOA_MISSING')).toEqual([]);
  });
});

describe('(c) an overdue IND safety report is a warning, never a block', () => {
  it('warns on an amendment, and the gate stays cleared', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0001', 'amendment');
    await placeCompleteAmendment(sequenceId);
    await recordSafetyReport(submissionId, { deadline: '2026-01-15T00:00:00Z' });
    await recordSafetyReport(submissionId, { deadline: '2026-12-31T00:00:00Z' }); // not yet due on the filing day
    await recordSafetyReport(submissionId, { deadline: '2026-01-01T00:00:00Z', status: 'filed' });

    const a = await assess(sequenceId);
    const overdue = byCode(a, 'IND_SAFETY_REPORT_OVERDUE');
    expect(overdue).toHaveLength(1);
    expect(overdue[0].severity).toBe('warning');
    expect(overdue[0].message).toMatch(/15-day IND safety report was due by 2026-01-15/);
    expect(overdue[0].rule?.id).toBe('IND_SAFETY_REPORT_OVERDUE');
    expect(a.indProgram?.overdueSafetyReports).toBe(1);
    expect(a.validationErrors).toBe(0);
    expect(a.gate.cleared, a.gate.blockers.join(' | ')).toBe(true);
  });

  it('is not raised against the sequence that carries the safety report itself', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0002', 'amendment');
    await placeLeaf(sequenceId, 'm1.1.1', 'Form FDA 1571');
    await placeLeaf(sequenceId, 'm1.2', 'Cover Letter');
    await placeLeaf(sequenceId, 'm1.12.4', 'IND Safety Report — 15-day', 'ind_safety_report');
    await recordSafetyReport(submissionId, { deadline: '2026-01-15T00:00:00Z' });

    const a = await assess(sequenceId);
    expect(byCode(a, 'IND_SAFETY_REPORT_OVERDUE')).toEqual([]);
    expect(a.indProgram).toMatchObject({ carriesSafetyReport: true, continuingFilingType: 'safety_report', overdueSafetyReports: 1 });
    expect(a.gate.cleared, a.gate.blockers.join(' | ')).toBe(true);
  });
});

describe('(d) a clinical hold is stated as not assessed, visibly, and never blocks', () => {
  it('every US IND sequence carries CLINICAL_HOLD_NOT_ASSESSED and the structural gate says so', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0001', 'amendment');
    await placeCompleteAmendment(sequenceId);

    const a = await assess(sequenceId);
    const hold = byCode(a, 'CLINICAL_HOLD_NOT_ASSESSED');
    expect(hold).toHaveLength(1);
    expect(hold[0]).toMatchObject({ severity: 'info', message: CLINICAL_HOLD_NOT_ASSESSED_NOTE });
    expect(hold[0].message).toMatch(/21 CFR 312\.42/);
    expect(hold[0].rule?.id).toBe('CLINICAL_HOLD_NOT_ASSESSED');
    expect(a.indProgram?.clinicalHold).toEqual({ assessed: false, note: CLINICAL_HOLD_NOT_ASSESSED_NOTE });
    // Cleared, but never silently: the gate view says what it did not assess.
    expect(a.gate.cleared, a.gate.blockers.join(' | ')).toBe(true);
    expect(structural(a).cleared).toBe(true);
    expect(structural(a).notAssessed).toBe(CLINICAL_HOLD_NOT_ASSESSED_NOTE);
  });

  it('the response that would lift a hold is not blocked either', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0003', 'response');
    await placeLeaf(sequenceId, 'm1.1.1', 'Form FDA 1571');
    await placeLeaf(sequenceId, 'm1.2', 'Cover Letter');
    await placeLeaf(sequenceId, 'm1.11.1', 'Complete response to clinical hold');

    const a = await assess(sequenceId);
    expect(byCode(a, 'CLINICAL_HOLD_NOT_ASSESSED')).toHaveLength(1);
    expect(a.indProgram?.continuingFilingType).toBe('response');
    expect(a.gate.cleared, a.gate.blockers.join(' | ')).toBe(true);
  });

  it('an NDA sequence is not given an IND hold statement', async () => {
    const sequenceId = await seedSequence(await seedSubmission('nda'), '0001', 'amendment');
    await placeLeaf(sequenceId, 'm1.1', 'Form FDA 356h');
    const a = await assess(sequenceId);
    expect(byCode(a, 'CLINICAL_HOLD_NOT_ASSESSED')).toEqual([]);
    expect(a.indProgram).toBeUndefined();
    expect(structural(a).notAssessed).toBeUndefined();
  });
});

describe('(e) a continuing IND sequence is held to 1.1, 1.2 and its type\'s content', () => {
  it('an amendment with only its Form FDA 1571 is blocked', async () => {
    const sequenceId = await seedSequence(await seedSubmission(), '0001', 'amendment');
    await placeLeaf(sequenceId, 'm1.1.1', 'Form FDA 1571');

    const a = await assess(sequenceId);
    const missing = byCode(a, 'MISSING_REQUIRED_SECTION');
    expect(missing.map((f) => [f.sectionCode, f.severity])).toEqual([['1.2', 'error'], ['5.3.5', 'error']]);
    expect(missing[0].message).toMatch(/Required section 1\.2 \(Cover Letter\)/);
    expect(missing[1].message).toMatch(/any of 5\.3\.5, 1\.11, 2, 3, 4, 5/);
    expect(a.indProgram?.continuingFilingType).toBe('amendment');
    expect(a.validationErrors).toBe(2);
    expect(a.gate.cleared).toBe(false);
  });

  it('an amendment with no 1571 is blocked on 1.1, naming the Form FDA 1571', async () => {
    const sequenceId = await seedSequence(await seedSubmission(), '0001', 'amendment');
    await placeLeaf(sequenceId, 'm1.2', 'Cover Letter');
    await placeLeaf(sequenceId, 'm5.3.5.1', 'Protocol amendment');

    const missing = byCode(await assess(sequenceId), 'MISSING_REQUIRED_SECTION');
    expect(missing.map((f) => f.sectionCode)).toEqual(['1.1']);
    expect(missing[0].message).toMatch(/Form FDA 1571/);
    expect(missing[0].message).toMatch(/21 CFR 312/);
  });

  it('the complete amendment clears, and an annual report is held to 1.13', async () => {
    const amendment = await seedSequence(await seedSubmission(), '0001', 'amendment');
    await placeCompleteAmendment(amendment);
    const a = await assess(amendment);
    expect(byCode(a, 'MISSING_REQUIRED_SECTION')).toEqual([]);
    expect(a.gate.cleared, a.gate.blockers.join(' | ')).toBe(true);

    const annual = await seedSequence(await seedSubmission(), '0004', 'annual');
    await placeLeaf(annual, 'm1.1.1', 'Form FDA 1571');
    await placeLeaf(annual, 'm1.2', 'Cover Letter');
    expect(byCode(await assess(annual), 'MISSING_REQUIRED_SECTION').map((f) => f.sectionCode)).toEqual(['1.13']);
  });
});

describe('what P-33 did not carry stays uncarried', () => {
  it('(g) a dispatched, clean sequence keeps gate.cleared — transmit requires exactly that', async () => {
    const sequenceId = await seedSequence(await seedSubmission(), '0001', 'amendment', 'dispatched');
    await placeCompleteAmendment(sequenceId);
    const a = await assess(sequenceId);
    expect(a.sequenceStatus).toBe('dispatched');
    expect(a.gate.cleared, a.gate.blockers.join(' | ')).toBe(true);
  });

  it('(h) a leaf with no checksum does not block — the packager computes it from the bytes', async () => {
    const sequenceId = await seedSequence(await seedSubmission(), '0001', 'amendment');
    await placeCompleteAmendment(sequenceId);
    const { rows } = await q('SELECT checksum FROM submission_leaves WHERE sequence_id = $1', [sequenceId]);
    expect(rows.length).toBe(3);
    expect(rows.every((r: { checksum: string | null }) => r.checksum === null)).toBe(true);
    const a = await assess(sequenceId);
    expect(a.gate.cleared, a.gate.blockers.join(' | ')).toBe(true);
  });
});
