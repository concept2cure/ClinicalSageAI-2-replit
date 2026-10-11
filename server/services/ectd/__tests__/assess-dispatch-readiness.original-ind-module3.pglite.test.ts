/**
 * The dispatch-readiness ASSESSMENT asks an original US IND for its Module 3.
 *
 * ── The defect (CMC-M3-GA item 21, 2026-10-05) ───────────────────────────────
 * The launch dispatch path required Module 1 codes only, and only as warnings
 * (MISSING_REQUIRED_SECTION). The IND required-section profile — which names
 * 3.2.S and 3.2.P — was never consulted, so an original IND (sequence 0000)
 * carrying Module 1 alone, with no chemistry, manufacturing and controls
 * section anywhere, read dispatch-clear: no error finding, gate cleared.
 *
 * ── What is locked here (real SQL, in-process PGlite; the gate's own reads) ──
 *   • an original IND with Module 1 only is BLOCKED, by one error per missing
 *     heading (IND_MODULE3_REQUIRED, 3.2.S and 3.2.P), each naming the heading
 *     and how to clear it — on the dispatch gate and the freeze gate;
 *   • Module 3 placed in that sequence (m3.2.S.*, m3.2.P.*) clears it;
 *   • a recorded cross-reference naming the heading, with a Letter of
 *     Authorization on file, clears that heading and says so (info);
 *   • a cross-reference with no LOA, one naming no section, and one in another
 *     organization do not clear it;
 *   • an amendment is not asked, nor is a later sequence typed 'original' by
 *     the column default; the first sequence of an IND not numbered 0000 is;
 *   • a register that cannot be read leaves the finding blocking and says why.
 *
 * The release-signature resolver is stubbed (not required, its store is not
 * in this harness); every other gate input is read by the assessor itself.
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

import { assessSequenceDispatchReadiness } from '../assess-dispatch-readiness';

let harness: IndPgliteDb;
const ORG = 52;
const OTHER_ORG = 53;
const USER = 6;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const q = (text: string, params: unknown[] = []) => harness.pglite.query<any>(text, params);

async function seedSubmission(applicationType = 'ind'): Promise<number> {
  const r = await q(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ('ABC-101 IND', 'ABC-101', $1, 'biotech', 'fda', $2, $3) RETURNING id`,
    [applicationType, ORG, USER],
  );
  return Number(r.rows[0].id);
}

/** A sequence that has had a completed Shadow Review, so only the structural gate can stand in its way. */
async function seedSequence(submissionId: number, sequenceNumber: string, type: string): Promise<number> {
  const r = await q(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
     VALUES ($1, 'fda', $2, $3, 'assembling', $4, $5) RETURNING id`,
    [submissionId, sequenceNumber, type, ORG, USER],
  );
  const id = Number(r.rows[0].id);
  await q(`INSERT INTO shadow_review_runs (sequence_id, status, organization_id) VALUES ($1, 'complete', $2)`, [id, ORG]);
  return id;
}

/** A leaf over a real, pinned coauthor document — it resolves, so it adds no error of its own. */
async function placeLeaf(sequenceId: number, sectionCode: string, title: string): Promise<void> {
  const body = `${title} body`;
  const doc = await q(
    `INSERT INTO coauthor_documents (organization_id, title, content, module_number, status) VALUES ($1, $2, $3, $4, 'approved') RETURNING id`,
    [ORG, title, body, sectionCode],
  );
  await q(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_content_sha256, organization_id, created_by)
     VALUES ($1, $2, $3, 'new', 'coauthor_documents', $4, $5, $6, $7)`,
    [sequenceId, sectionCode, title, Number(doc.rows[0].id), sha(body), ORG, USER],
  );
}

async function placeModule1(sequenceId: number): Promise<void> {
  await placeLeaf(sequenceId, 'm1.1', 'Form FDA 1571');
  await placeLeaf(sequenceId, 'm1.2', 'Cover Letter');
}

async function recordCrossReference(
  submissionId: number,
  ref: { number: string; sections: string[]; loa: boolean; org?: number },
): Promise<void> {
  await q(
    `INSERT INTO ind_cross_references (organization_id, submission_id, referenced_file_type, referenced_file_number, subject_name, authorized_sections, loa_on_file)
     VALUES ($1, $2, 'DMF', $3, 'ABC-101 drug substance', $4::jsonb, $5)`,
    [ref.org ?? ORG, submissionId, ref.number, JSON.stringify(ref.sections), ref.loa],
  );
}

const assess = (sequenceId: number) => assessSequenceDispatchReadiness({ sequenceId, organizationId: ORG, asOf: '2026-10-05' });
const m3Errors = (a: Awaited<ReturnType<typeof assess>>) =>
  a.readiness.findings.filter((f) => f.code === 'IND_MODULE3_REQUIRED');

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  await harness.pglite.exec(`
    CREATE TABLE IF NOT EXISTS shadow_review_runs (
      id SERIAL PRIMARY KEY, sequence_id INTEGER NOT NULL, region TEXT NOT NULL DEFAULT 'fda', lens TEXT NOT NULL DEFAULT 'fda_filing',
      model TEXT, prompt_version TEXT, status TEXT NOT NULL DEFAULT 'running', rtf_risk_score REAL, crl_risk_score REAL, summary TEXT,
      organization_id INTEGER NOT NULL, created_by INTEGER, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS shadow_review_findings (
      id SERIAL PRIMARY KEY, run_id INTEGER NOT NULL, dimension TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, detail TEXT,
      basis TEXT, recommendation TEXT, leaf_ref TEXT, status TEXT NOT NULL DEFAULT 'open', organization_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ
    );
  `);
});

afterAll(async () => {
  await harness?.close?.();
});

describe('an original IND is asked for its Module 3 (IND_MODULE3_REQUIRED)', () => {
  it('Module 1 only: blocked on both gates, one error per missing heading, each saying how to clear it', async () => {
    const sequenceId = await seedSequence(await seedSubmission(), '0000', 'original');
    await placeModule1(sequenceId);

    const a = await assess(sequenceId);
    const errors = m3Errors(a);
    expect(errors.map((f) => f.sectionCode)).toEqual(['3.2.S', '3.2.P']);
    for (const f of errors) {
      expect(f.severity).toBe('error');
      expect(f.message).toMatch(/the original IND \(sequence 0000\)/);
      expect(f.message).toMatch(/CMC \/ Module 3, "Place into the submission"/);
      expect(f.message).toMatch(/Letter of Authorization/);
      expect(f.rule?.id).toBe('IND_MODULE3_REQUIRED');
    }
    expect(errors[0].message).toMatch(/no 3\.2\.S Drug Substance leaf/);
    expect(errors[1].message).toMatch(/no 3\.2\.P Drug Product leaf/);
    expect(a.validationErrors).toBe(2);
    for (const gate of [a.gate, a.freezeGate]) {
      expect(gate.cleared).toBe(false);
      expect(gate.blockers.join(' ')).toMatch(/2 open error-severity validation finding/);
    }
  });

  it('Module 3 placed in that sequence clears it, and the gate opens', async () => {
    const sequenceId = await seedSequence(await seedSubmission(), '0000', 'original');
    await placeModule1(sequenceId);
    await placeLeaf(sequenceId, 'm3.2.S.1', 'General Information');
    await placeLeaf(sequenceId, 'm3.2.P.1', 'Description and Composition of the Drug Product');

    const a = await assess(sequenceId);
    expect(m3Errors(a)).toEqual([]);
    expect(a.validationErrors).toBe(0);
    expect(a.gate.cleared, a.gate.blockers.join(' | ')).toBe(true);
  });

  it('a cross-reference naming 3.2.S with its LOA on file stands in for 3.2.S, and says so', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0000', 'original');
    await placeModule1(sequenceId);
    await placeLeaf(sequenceId, 'm3.2.P.1', 'Description and Composition of the Drug Product');
    await recordCrossReference(submissionId, { number: '012345', sections: ['3.2.S'], loa: true });

    const a = await assess(sequenceId);
    expect(m3Errors(a)).toEqual([]);
    const byRef = a.readiness.findings.filter((f) => f.code === 'IND_MODULE3_BY_REFERENCE');
    expect(byRef).toHaveLength(1);
    expect(byRef[0]).toMatchObject({ severity: 'info', sectionCode: '3.2.S' });
    expect(byRef[0].message).toMatch(/DMF 012345/);
    expect(a.gate.cleared, a.gate.blockers.join(' | ')).toBe(true);
  });

  it('no LOA, no section named, or another organization’s record: still blocked, and the finding says which', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0000', 'original');
    await placeModule1(sequenceId);
    await placeLeaf(sequenceId, 'm3.2.P.1', 'Description and Composition of the Drug Product');
    await recordCrossReference(submissionId, { number: '000111', sections: ['3.2.S'], loa: false });
    await recordCrossReference(submissionId, { number: '000222', sections: [], loa: true });
    await recordCrossReference(submissionId, { number: '000333', sections: ['3.2.S'], loa: true, org: OTHER_ORG });

    const a = await assess(sequenceId);
    const errors = m3Errors(a);
    expect(errors.map((f) => f.sectionCode)).toEqual(['3.2.S']);
    expect(errors[0].message).toMatch(/no Letter of Authorization on file: DMF 000111/);
    expect(errors[0].message).toMatch(/not naming 3\.2\.S among its sections: DMF 000222/);
    expect(errors[0].message).not.toMatch(/000333/);
    expect(a.gate.cleared).toBe(false);
  });
});

describe('which sequence is an original IND', () => {
  it('an amendment is not asked, nor a later sequence typed "original" by the column default', async () => {
    const submissionId = await seedSubmission();
    await seedSequence(submissionId, '0000', 'original');
    const amendment = await seedSequence(submissionId, '0001', 'amendment');
    const untyped = await seedSequence(submissionId, '0002', 'original');
    for (const sequenceId of [amendment, untyped]) {
      await placeModule1(sequenceId);
      expect(m3Errors(await assess(sequenceId))).toEqual([]);
    }
  });

  it('the first sequence of an IND is asked, whatever its number', async () => {
    const sequenceId = await seedSequence(await seedSubmission(), '0001', 'original');
    await placeModule1(sequenceId);
    const errors = m3Errors(await assess(sequenceId));
    expect(errors.map((f) => f.sectionCode)).toEqual(['3.2.S', '3.2.P']);
    expect(errors[0].message).toMatch(/the original IND \(sequence 0001, its first sequence\)/);
  });

  it('another application type is not judged by this rule', async () => {
    const sequenceId = await seedSequence(await seedSubmission('nda'), '0000', 'original');
    await placeModule1(sequenceId);
    expect(m3Errors(await assess(sequenceId))).toEqual([]);
  });

  it('a register that cannot be read leaves the finding blocking and says so', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0000', 'original');
    await placeModule1(sequenceId);
    await placeLeaf(sequenceId, 'm3.2.P.1', 'Description and Composition of the Drug Product');
    await recordCrossReference(submissionId, { number: '012345', sections: ['3.2.S'], loa: true });
    await q('ALTER TABLE ind_cross_references RENAME TO ind_cross_references_away');
    try {
      const errors = m3Errors(await assess(sequenceId));
      expect(errors.map((f) => f.sectionCode)).toEqual(['3.2.S']);
      expect(errors[0].message).toMatch(/cross-reference register could not be read/);
    } finally {
      await q('ALTER TABLE ind_cross_references_away RENAME TO ind_cross_references');
    }
  });
});
