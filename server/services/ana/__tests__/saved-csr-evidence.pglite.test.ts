/** CSR slice 5 (2026-10-30): critique_document on a saved CSR re-reads the
 * retained run behind each imported section's claim receipts and returns a
 * real number-to-source verdict. Real SQL for the saved document (PGlite);
 * the retained-table reader is injected, and the receipts are produced by the
 * real drafting path (acceptEvidenceBoundDraft → buildCsrClaimReceipts →
 * importedCsrSectionEvidence), not written by hand. */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { critiqueSavedDocument, type RetainedTableReader } from '../saved-document-critique';
import { pg, PROGRAM, DOCUMENT, sectionId, context, connection, statements } from './_saved-document-critique-fixture';
import { buildCsrAuthoringEvidence, type RetainedCsrTables } from '../../csr/cortex-authoring-context';
import { acceptEvidenceBoundDraft } from '../../csr/unsupplied-statistics';
import { buildCsrClaimReceipts, importedCsrSectionEvidence } from '../../csr/csr-claim-receipts';
import { CsrSourceInputError } from '../../csr/source-access';
import { workflowCopySectionContent } from '../../authoring/workflow-copy-content';

const RUN = '33333333-2222-4333-8444-000000000001';
const STUDY_INFO = { protocolNumber: 'LMN-201', title: 'LMN-201 Part B' };
const CELL = '16/305 (5.2%)';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

function retained(result = CELL): RetainedCsrTables {
  return { runId: RUN, programId: PROGRAM, historical: true, releaseEligibilityVerified: false, studies: [{
    source: { documentId: '44444444-2222-4333-8444-000000000001', version: '1', sha256: 'b'.repeat(64), dataCutDate: '2026-09-30',
      studyId: 'LMN-201', protocolNumber: 'LMN-201', clinicalVerification: 'not-established' },
    tables: {
      analysisPopulations: { title: 'Analysis populations', headers: ['Population', 'LMN-201', 'Placebo'], rows: [['Randomized', '305', '300']] },
      primaryEfficacy: { title: '§11.4 — Primary Efficacy Endpoint Results', headers: ['Endpoint', 'Arm', 'Result', 'CI', 'p-value', 'vs Comparator'],
        rows: [['Global cure', 'LMN-201', result, '—', '—', 'Placebo']] },
    },
  }] };
}

/** One section through the real drafting acceptance, then the real import binding. */
function draftedSection(sectionNumber: string, prose: string) {
  const pack = buildCsrAuthoringEvidence(retained(), { programId: PROGRAM, runId: RUN, studyId: 'LMN-201', sectionNumber });
  const lineage: Record<string, unknown> = {};
  const claims = [{ table: 'primaryEfficacy', row: 0, column: 2, value: CELL }];
  expect(acceptEvidenceBoundDraft({ sectionNumber, prose, claims }, pack, STUDY_INFO, lineage)).toBe(true);
  lineage.claimReceipts = buildCsrClaimReceipts(pack, lineage.reconciliation, prose);
  const copy = workflowCopySectionContent(prose);
  const csrEvidence = importedCsrSectionEvidence({ sectionNumber, content: prose, contentHash: sha(prose), lineage }, copy, STUDY_INFO);
  expect(csrEvidence).not.toBeNull();
  return { copy, origin: { code: sectionNumber, sourceRowId: `csr_section_outputs:${sectionNumber}`, contentSha256: sha(prose),
    originalAuthorship: 'machine', model: 'claude-opus-5-5', modelEvidence: 'recorded-name-only', csrEvidence } };
}

const SYNOPSIS = 'In LMN-201 Part B, global cure was achieved by 16/305 (5.2%) subjects on LMN-201.';
const EFFICACY = 'Global cure occurred in 16/305 (5.2%) subjects in the LMN-201 arm (Table 14.2.1).';

async function seedCsr(opts: { synopsisText?: string; synopsisReceipts?: boolean; title?: string; module?: string | null } = {}) {
  const synopsis = draftedSection('2', SYNOPSIS);
  const efficacy = draftedSection('11.4', EFFICACY);
  const origins = [opts.synopsisReceipts === false ? { ...synopsis.origin, csrEvidence: undefined } : synopsis.origin, efficacy.origin];
  await pg.query('UPDATE authoring_documents SET title=$3, module=$4, provenance=$1 WHERE id=$2',
    [JSON.stringify({ source: 'import', importSource: { kind: 'csr', id: '1', programId: PROGRAM, sectionOrigins: origins } }), DOCUMENT,
      opts.title ?? 'Clinical Study Report LMN-201', opts.module === undefined ? '5' : opts.module]);
  await pg.query('UPDATE authoring_sections SET code=$1,title=$2,content=$3 WHERE id=$4',
    ['2', 'Synopsis', opts.synopsisText ?? synopsis.copy, sectionId(1)]);
  await pg.query('UPDATE authoring_sections SET code=$1,title=$2,content=$3 WHERE id=$4', ['11.4', 'Efficacy results', efficacy.copy, sectionId(2)]);
}

interface Verdict {
  verdict: string;
  csrEvidence: { status: string; checkedClaims: number; checkedSections: number; issueCount: number; blockingUnclaimedFigureCount: number; editedSectionCount?: number; runs: Array<{ source: string; code?: string }> };
  items: Array<Record<string, unknown>>;
}
async function critique(read: RetainedTableReader = async () => retained()): Promise<Verdict> {
  const raw = await critiqueSavedDocument({ document_id: DOCUMENT }, context, connection, read);
  return JSON.parse(raw) as Verdict;
}
const issues = (v: Verdict) => v.items.filter(i => i.kind === 'csr-evidence-issue');

describe('a saved CSR gets a number-to-source verdict from its retained run', () => {
  it('reconciles a saved CSR whose every stated figure is its claimed retained cell', async () => {
    await seedCsr();
    const v = await critique();
    expect(v.csrEvidence).toMatchObject({ status: 'reconciled_pending_human_review', checkedSections: 2, checkedClaims: 2, issueCount: 0,
      blockingUnclaimedFigureCount: 0, runs: [{ source: 'verified' }] });
    expect(issues(v)).toEqual([]);
  });

  it('fails the document gate when the synopsis states 15/305 while §11.4 and the table state 16/305', async () => {
    await seedCsr({ synopsisText: workflowCopySectionContent(SYNOPSIS.replace(CELL, '15/305 (4.9%)')) });
    const v = await critique();
    expect(v.csrEvidence.status).toBe('blocked');
    expect(v.verdict).toBe('revise');
    // 2026-10-30 (edited-section re-check): the edited synopsis is re-checked by
    // its text, not blocked on its hash. It was SECTION_VERSION_CHANGED plus
    // CLAIM_NOT_STATED; the changed figure is now named against its cell.
    expect(issues(v).some(i => i.code === 'SECTION_VERSION_CHANGED')).toBe(false);
    expect(issues(v)).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: '2', code: 'FIGURE_CHANGED', stated: '15/305 (4.9%)',
        cell: { table: 'primaryEfficacy', row: 0, column: 2, claimed: CELL, current: CELL } }),
      expect.objectContaining({ section: '2', code: 'CROSS_SECTION_CONFLICT', stated: '15/305',
        cell: expect.objectContaining({ table: 'primaryEfficacy', row: 0, column: 2, current: CELL }), statedIn: ['11.4'] }),
    ]));
    expect(v.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'csr-unclaimed-figures', section: '2', blocking: true, figures: ['15', '4.9'] }),
    ]));
  });

  it('fails it too when the synopsis carries no receipts at all and states a figure the body contradicts', async () => {
    await seedCsr({ synopsisReceipts: false, synopsisText: workflowCopySectionContent(SYNOPSIS.replace(CELL, '15/305 (4.9%)')) });
    const v = await critique();
    expect(v.csrEvidence.status).toBe('blocked');
    expect(issues(v)).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: '2', code: 'BINDING_MISSING' }),
      expect.objectContaining({ section: '2', code: 'CROSS_SECTION_CONFLICT', stated: '15/305', statedIn: ['11.4'] }),
    ]));
  });

  it('names the exact cell when the retained source no longer says what the CSR states', async () => {
    await seedCsr();
    const v = await critique(async () => retained('17/305 (5.6%)'));
    expect(v.csrEvidence.status).toBe('blocked');
    expect(issues(v)).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: '11.4', code: 'RUN_ID_MISMATCH' }),
      expect.objectContaining({ section: '11.4', code: 'NUMERIC_MISMATCH',
        cell: { table: 'primaryEfficacy', row: 0, column: 2, claimed: CELL, current: '17/305 (5.6%)' } }),
      expect.objectContaining({ section: '11.4', code: 'SOURCE_VERSION_MISMATCH' }),
    ]));
  });

  it('records an unreadable retained run as blocked, never as agreement, and still completes the review', async () => {
    await seedCsr();
    const v = await critique(async () => { throw new CsrSourceInputError(404, 'CSR_RUN_INPUTS_NOT_FOUND', 'gone'); });
    expect(v.csrEvidence).toMatchObject({ status: 'blocked', runs: [{ source: 'unavailable', code: 'CSR_RUN_INPUTS_NOT_FOUND' }] });
    expect(issues(v)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MISSING_SOURCE', section: '2' })]));
    expect(statements).toContain('ROLLBACK TO SAVEPOINT csr_evidence_read');
    expect(statements.at(-1)).toBe('COMMIT');
    expect(statements.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  });

  it('reports every number a section states without a claim, blocking only in a results section', async () => {
    await seedCsr();
    await pg.query(`INSERT INTO authoring_sections(id,doc_id,tenant_id,code,title,order_index,created_at,updated_at,content)
      VALUES($1,$2,7,'9.4.4','Selection of doses',3,'2026-10-01','2026-10-02','<p>Subjects received 2 doses 28 days apart.</p>')`, [sectionId(3), DOCUMENT]);
    const v = await critique();
    expect(v.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'csr-unclaimed-figures', section: '9.4.4', blocking: false, figures: ['2', '28'] }),
    ]));
    expect(v.csrEvidence.status).toBe('reconciled_pending_human_review');
  });

  // Review of slice 5 (2026-10-30): the import names the copy after the study
  // (workflow-source-import csrTitle) with module null, so the saved identity
  // is the CSR import provenance, not a title that says "CSR".
  it('assesses an imported CSR whose title is the study title and whose module is unset, as the real import saves it', async () => {
    await seedCsr({ title: 'LMN-201 Part B', module: null, synopsisText: workflowCopySectionContent(SYNOPSIS.replace(CELL, '15/305 (4.9%)')) });
    const v = await critique();
    expect(v.csrEvidence?.status).toBe('blocked');
    expect(v.verdict).toBe('revise');
  });

  it('blocks an unclaimed number in a results section that has no table mapping (§10.2)', async () => {
    await seedCsr();
    await pg.query(`INSERT INTO authoring_sections(id,doc_id,tenant_id,code,title,order_index,created_at,updated_at,content)
      VALUES($1,$2,7,'10.2','Protocol deviations',3,'2026-10-01','2026-10-02','<p>Major deviations occurred in 23 subjects.</p>')`, [sectionId(3), DOCUMENT]);
    const v = await critique();
    expect(v.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'csr-unclaimed-figures', section: '10.2', blocking: true, figures: ['23'] }),
    ]));
    expect(v.csrEvidence.status).toBe('blocked');
  });

  it('blocks when a section the import carried receipts for is no longer in the document', async () => {
    await seedCsr();
    await pg.query('DELETE FROM authoring_sections WHERE id=$1', [sectionId(2)]);
    const v = await critique();
    expect(v.csrEvidence.status).toBe('blocked');
    expect(issues(v)).toEqual(expect.arrayContaining([expect.objectContaining({ section: '11.4', code: 'MISSING_SECTION' })]));
  });

  it('checks a section with no code too: its numbers are listed and a contradicting n/N blocks', async () => {
    await seedCsr();
    await pg.query(`INSERT INTO authoring_sections(id,doc_id,tenant_id,code,title,order_index,created_at,updated_at,content)
      VALUES($1,$2,7,NULL,'Added summary',3,'2026-10-01','2026-10-02','<p>Cure was seen in 15/305 subjects.</p>')`, [sectionId(3), DOCUMENT]);
    const v = await critique();
    expect(v.csrEvidence.status).toBe('blocked');
    expect(issues(v)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CROSS_SECTION_CONFLICT', stated: '15/305' }),
    ]));
  });
});

// 2026-10-30 (edited-section re-check): a medical writer edits an imported
// section. The edited text is re-reconciled against its claim receipts and the
// retained run instead of blocking forever on SECTION_VERSION_CHANGED.
describe('a section edited after import is re-checked against its receipts and the retained run', () => {
  const editEfficacy = (prose: string) => pg.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', [workflowCopySectionContent(prose), sectionId(2)]);
  const edited = (v: Verdict) => v.items.filter(i => i.kind === 'csr-edited-section');

  it('reconciles an edit that rewords the sentence but keeps every figure, and names the section as edited and re-checked', async () => {
    await seedCsr();
    await editEfficacy('In the LMN-201 arm, 16/305 (5.2%) subjects achieved global cure (Table 14.2.1).');
    const v = await critique();
    expect(v.csrEvidence).toMatchObject({ status: 'reconciled_pending_human_review', issueCount: 0, blockingUnclaimedFigureCount: 0, editedSectionCount: 1 });
    expect(issues(v)).toEqual([]);
    expect(edited(v)).toEqual([expect.objectContaining({ section: '11.4', state: 'edited after import, re-checked' })]);
  });

  it('blocks an edit that changes 16/305 to 18/305, naming the figure and the cell it was meant to be', async () => {
    await seedCsr();
    await editEfficacy(EFFICACY.replace('16/305', '18/305'));
    const v = await critique();
    expect(v.csrEvidence.status).toBe('blocked');
    expect(issues(v)).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: '11.4', code: 'FIGURE_CHANGED', stated: '18/305 (5.2%)',
        cell: { table: 'primaryEfficacy', row: 0, column: 2, claimed: CELL, current: CELL } }),
    ]));
    expect(issues(v).some(i => i.code === 'SECTION_VERSION_CHANGED')).toBe(false);
    expect(v.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'csr-unclaimed-figures', section: '11.4', blocking: true, figures: ['18'] }),
    ]));
  });

  it('blocks an edit that adds an unsourced number in §11', async () => {
    await seedCsr();
    await editEfficacy(`${EFFICACY} Median time to cure was 12 days.`);
    const v = await critique();
    expect(v.csrEvidence.status).toBe('blocked');
    expect(v.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'csr-unclaimed-figures', section: '11.4', blocking: true, figures: ['12'] }),
    ]));
    expect(issues(v).some(i => i.code === 'SECTION_VERSION_CHANGED')).toBe(false);
    expect(edited(v)).toEqual([expect.objectContaining({ section: '11.4' })]);
  });

  // Decision 8 (2026-10-30): in a results section a removal cannot be told apart from a swap to a value
  // another claim carries, so it blocks there; outside §2/§10-13 it is reported without blocking.
  it('blocks on a claimed figure an edit removed from a results section, naming the cell', async () => {
    await seedCsr();
    await editEfficacy('Global cure was the primary endpoint (Table 14.2.1).');
    const v = await critique();
    expect(issues(v)).toEqual([expect.objectContaining({ section: '11.4', code: 'CLAIM_NOT_STATED',
      cell: { table: 'primaryEfficacy', row: 0, column: 2, claimed: CELL, current: CELL } })]);
    expect(issues(v)[0]).not.toHaveProperty('blocking', false);
    expect(v.csrEvidence.status).toBe('blocked');
  });

  it('still blocks an edited section whose retained cell has since changed', async () => {
    await seedCsr();
    await editEfficacy('In the LMN-201 arm, 16/305 (5.2%) subjects achieved global cure (Table 14.2.1).');
    const v = await critique(async () => retained('17/305 (5.6%)'));
    expect(v.csrEvidence.status).toBe('blocked');
    expect(issues(v)).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: '11.4', code: 'NUMERIC_MISMATCH', cell: expect.objectContaining({ current: '17/305 (5.6%)' }) }),
    ]));
  });
});
