/**
 * The CSR release gate decides what a document is before it frames it as one
 * (csr-scientific-review.ts assertCsrScientificRelease).
 *
 * Every freeze, sign, export and filing to Vault of an Authoring document runs
 * this gate (workflow-import-governance.ts assertWorkflowImportRelease). Until
 * this change it built the strict full-visible snapshot first and only then
 * asked whether the document was a CSR, so one row that snapshot refuses made
 * every release of a document that is not a CSR answer 500. That is how the
 * sign, freeze, export and file-to-Vault route suites went red on 2026-10-28.
 */
import { describe, expect, it, vi } from 'vitest';
import { assertCsrScientificRelease } from '../csr-scientific-review';

const ORG = 7;
const DOC = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const PROGRAM = '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';

/** Answers only the two reads this gate makes; anything else is a defect in the test or the gate. */
function reader(answer: { required?: unknown; receipts?: unknown[] }) {
  const query = vi.fn(async (sql: string) => {
    if (/SELECT EXISTS/.test(sql) && /csrScientificEvidence/.test(sql)) {
      return { rows: 'required' in answer ? [{ required: answer.required }] : [], rowCount: 1 };
    }
    if (/FROM authoring_reviews r/.test(sql)) return { rows: answer.receipts ?? [], rowCount: (answer.receipts ?? []).length };
    throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
  });
  return { query };
}

/** Rows the strict snapshot refuses: a section id that is not a UUID. */
const unframeable = [{ id: 'S1', code: '2.6.6', content: '<p>Body</p>' }];
const framed = [{ id: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', code: '11.4', title: 'Efficacy', content: '<p>10/12 and 4/11.</p>' }];

describe('assertCsrScientificRelease', () => {
  it('releases a document that is not a CSR without framing it, so a row the CSR snapshot refuses cannot fail its release', async () => {
    const q = reader({ required: false });
    await expect(assertCsrScientificRelease(q, { organizationId: ORG,
      doc: { id: DOC, title: 'Nonclinical overview', module: 'M2', client_program_id: PROGRAM }, sections: unframeable,
      actor: { id: '41' } })).resolves.toBeUndefined();
    expect(q.query).toHaveBeenCalledTimes(1);
  });

  it('still fails closed when what the document is cannot be read', async () => {
    const q = reader({});
    await expect(assertCsrScientificRelease(q, { organizationId: ORG,
      doc: { id: DOC, title: 'Nonclinical overview', module: 'M2', client_program_id: PROGRAM }, sections: framed,
      actor: { id: '41' } })).rejects.toMatchObject({ code: 'CSR_EVIDENCE_IDENTITY_UNAVAILABLE' });
  });

  it('still refuses a CSR with no current scientific-review receipt', async () => {
    const q = reader({ required: false, receipts: [] });
    await expect(assertCsrScientificRelease(q, { organizationId: ORG,
      doc: { id: DOC, title: 'LMN-201 Clinical Study Report', module: 'M5', client_program_id: PROGRAM }, sections: framed,
      actor: { id: '41' } })).rejects.toMatchObject({ code: 'CSR_SCIENTIFIC_REVIEW_REQUIRED' });
  });

  it('still refuses a document whose stored history makes it a CSR, whatever its label now says', async () => {
    const q = reader({ required: true, receipts: [] });
    await expect(assertCsrScientificRelease(q, { organizationId: ORG,
      doc: { id: DOC, title: 'Final report', module: 'M5', client_program_id: PROGRAM }, sections: framed,
      actor: { id: '41' } })).rejects.toMatchObject({ code: 'CSR_SCIENTIFIC_REVIEW_REQUIRED' });
  });
});
