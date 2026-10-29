/** medical_writing_review with a document reference (D2-CSR, 2026-10-30).
 * Through the registered tool handler: the saved CSR section's text, its import
 * claim receipts (produced by the real drafting path) and the retained run give
 * the writing review plus the section's evidence verdict in one result. Real SQL
 * for the saved document (PGlite); the tenant connection and the retained-table
 * reader are routed to the fixture. Without a reference the tool's output is
 * byte-identical to trunk (golden hashes recorded before the change). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { RetainedCsrTables } from '../../csr/cortex-authoring-context';

const routed = vi.hoisted(() => ({
  connection: null as null | ((opts: unknown, fn: unknown) => Promise<string>),
  read: null as null | (() => Promise<RetainedCsrTables>),
}));
vi.mock('../../../db/withTenantConnection', () => ({
  withTenantConnection: (opts: unknown, fn: unknown) => {
    if (!routed.connection) throw new Error('fixture connection not set');
    return routed.connection(opts, fn);
  },
}));
vi.mock('../../csr/saved-clinical-tables', () => ({
  readSavedClinicalTables: () => {
    if (!routed.read) throw new Error('fixture reader not set');
    return routed.read();
  },
}));

import { pg, DOCUMENT, sectionId, context, connection, statements } from './_saved-document-critique-fixture';
import { CELL, EFFICACY, SYNOPSIS, retained, seedCsr } from './_saved-csr-evidence-fixture';
import { getToolHandler } from '../AnaToolExecutor';
import { getDocumentTypeStandard } from '../medical-writing';
import { workflowCopySectionContent } from '../../authoring/workflow-copy-content';
import { CsrSourceInputError } from '../../csr/source-access';

const tool = (input: Record<string, unknown>, ctx: Record<string, unknown> = context as unknown as Record<string, unknown>) =>
  getToolHandler('medical_writing_review')!(input, ctx as never);
const parse = async (input: Record<string, unknown>) => {
  const raw = await tool({ document_type: 'csr', document_id: DOCUMENT, ...input });
  expect(raw.length).toBeLessThanOrEqual(8000);
  return JSON.parse(raw);
};

beforeEach(() => {
  routed.connection = connection as never;
  routed.read = async () => retained();
});

describe('medical_writing_review with a document reference runs the CSR section evidence check', () => {
  it('returns the evidence finding for a saved CSR section whose figure differs from its retained cell', async () => {
    await seedCsr();
    routed.read = async () => retained('17/305 (5.6%)');
    const r = await parse({ section: '11.4' });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ source: 'AnA Medical-Writing QC', scope: 'saved_section', documentId: DOCUMENT, readyForApproval: false,
      section: { sectionId: sectionId(2), code: '11.4' },
      writing: { documentType: 'csr', structureStatus: 'checked', evidenceReviewed: false, approvalStatus: 'not_assessed' } });
    expect(r.writing.missingSections.length).toBeGreaterThan(0);
    expect(Object.keys(r).indexOf('csrSectionEvidence')).toBeLessThan(Object.keys(r).indexOf('writing'));
    expect(r.csrSectionEvidence.status).toBe('blocked');
    expect(r.csrSectionEvidence.sectionGate).toMatchObject({ status: 'blocked', checkedClaims: 1,
      issues: expect.arrayContaining(['RUN_ID_MISMATCH', 'EVIDENCE_RECONCILIATION_FAILED']),
      findings: expect.arrayContaining([expect.objectContaining({ code: 'NUMERIC_MISMATCH' })]) });
    expect(r.csrSectionEvidence.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'NUMERIC_MISMATCH', cell: { table: 'primaryEfficacy', row: 0, column: 2, claimed: CELL, current: '17/305 (5.6%)' } }),
    ]));
  });

  it('reconciles a section whose stated figure is its cell, as transcription agreement only', async () => {
    await seedCsr();
    const r = await parse({ section: '11.4' });
    expect(r.csrSectionEvidence).toMatchObject({ status: 'reconciled_pending_human_review', issues: [], unclaimedFigures: [],
      sectionGate: { status: 'reconciled_pending_human_review', issues: [], checkedClaims: 1 }, runs: [{ source: 'verified' }] });
    expect(r.readyForApproval).toBe(false);
    expect(statements.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('names a figure another section contradicts, by the section\'s id as well as its number', async () => {
    await seedCsr({ synopsisText: workflowCopySectionContent(SYNOPSIS.replace(CELL, '15/305 (4.9%)')) });
    const r = await parse({ section: sectionId(1) });
    expect(r.section.code).toBe('2');
    expect(r.csrSectionEvidence.status).toBe('blocked');
    expect(r.csrSectionEvidence.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CROSS_SECTION_CONFLICT', stated: '15/305', statedIn: ['11.4'] }),
    ]));
    expect(r.csrSectionEvidence.unclaimedFigures).toEqual(expect.arrayContaining([{ figure: '15', blocking: true }]));
  });

  it('blocks a section a writer edited to a figure its retained cell does not hold, naming the cell', async () => {
    await seedCsr();
    await pg.query('UPDATE authoring_sections SET content=$1 WHERE id=$2',
      [workflowCopySectionContent(EFFICACY.replace(CELL, '17/305 (5.6%)')), sectionId(2)]);
    const r = await parse({ section: '11.4' });
    expect(r.csrSectionEvidence.status).toBe('blocked');
    expect(r.csrSectionEvidence.edited).toMatchObject({ state: 'edited after import, re-checked' });
    expect(r.csrSectionEvidence.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FIGURE_CHANGED', stated: '17/305 (5.6%)', cell: expect.objectContaining({ claimed: CELL, current: CELL }) }),
    ]));
    expect(r.readyForApproval).toBe(false);
  });

  it('records an unreadable retained run as blocked, never as agreement', async () => {
    await seedCsr();
    routed.read = async () => { throw new CsrSourceInputError(404, 'CSR_RUN_INPUTS_NOT_FOUND', 'gone'); };
    const r = await parse({ section: '11.4' });
    expect(r.csrSectionEvidence.status).toBe('blocked');
    expect(r.csrSectionEvidence.runs).toEqual([expect.objectContaining({ source: 'unavailable', code: 'CSR_RUN_INPUTS_NOT_FOUND' })]);
  });

  it('is not_assessed for a CSR that carries no claim receipts, and still lists the section\'s figures', async () => {
    await pg.query('UPDATE authoring_documents SET title=$1 WHERE id=$2', ['Clinical Study Report LMN-201', DOCUMENT]);
    await pg.query('UPDATE authoring_sections SET code=$1, content=$2 WHERE id=$3', ['11.4', '<p>Cure in 16/305 subjects.</p>', sectionId(2)]);
    const r = await parse({ section: '11.4' });
    expect(r.csrSectionEvidence).toMatchObject({ status: 'not_assessed', sectionGate: null,
      unclaimedFigures: [{ figure: '16', blocking: true }, { figure: '305', blocking: true }] });
  });

  it('refuses rather than guesses: a non-CSR document, an unknown section, draft_text with a reference, no project', async () => {
    const notCsr = await parse({ section: '1' });
    expect(notCsr).toMatchObject({ complete: false, error: expect.stringMatching(/not a CSR/) });
    await seedCsr();
    expect((await parse({ section: '99.9' })).error).toMatch(/No saved section/);
    expect((await parse({ section: '11.4', draft_text: 'text' })).error).toMatch(/either draft_text or document_id/);
    expect((await parse({})).error).toMatch(/Provide section/);
    const noProject = JSON.parse(await tool({ document_type: 'csr', document_id: DOCUMENT, section: '11.4' }, { organizationId: 7, userId: 7 }));
    expect(noProject.error).toMatch(/Open an authorized project/);
    const foreign = JSON.parse(await tool({ document_type: 'csr', document_id: DOCUMENT, section: '11.4' }, { organizationId: 8, userId: 8, projectRef: context.projectRef }));
    expect(foreign).toMatchObject({ complete: false, error: expect.stringMatching(/could not be read and verified/) });
    expect(foreign.csrSectionEvidence).toBeUndefined();
  });
});

describe('medical_writing_review without a document reference is unchanged', () => {
  // docs/evidence/D2-CSR/2026-10-30-medical-writing-review-document-ref/golden-trunk.txt
  const GOLDEN: Array<[string, Record<string, unknown>, string]> = [
    ['manuscriptHeadings', { document_type: 'manuscript', draft_text: getDocumentTypeStandard('manuscript')!.structure.map(x => `## ${x}`).join('\n') },
      '1373f46c7d7c031f5a380f6ad52110b6376466f8a11a7bc608cb223eace0f426'],
    ['csrFreeText', { document_type: 'csr', draft_text: '## Synopsis\nGlobal cure occurred in 16/305 (5.2%) subjects.\n## Efficacy Evaluation\nText.' },
      '2b5fb09ee780f6f253c0b434da1bb920372e0e542c7ecad3e927f5bfd3ac72ac'],
    ['csrPreDraft', { document_type: 'csr' }, '2701469ce16bf82230aa2d27a25e64134677335eb6bee54f170c38451457fab3'],
    ['unknownType', { document_type: 'CMC stability report' }, '5693591d3cfbde994cbe5c034305040af8f7b6ded4c95e16cbb645ea67464294'],
    ['missingType', {}, 'e1ac334d51e8a138508ca626da67737e431751a6daf11999d01fb32a3d64ebe5'],
  ];
  it.each(GOLDEN)('%s is byte-identical to the trunk output', async (_name, input, hash) => {
    const out = await tool(input, {});
    expect(createHash('sha256').update(out).digest('hex')).toBe(hash);
    // And with a project context: the free-text path reads nothing.
    statements.length = 0;
    expect(createHash('sha256').update(await tool(input)).digest('hex')).toBe(hash);
    expect(statements).toEqual([]);
  });
});
