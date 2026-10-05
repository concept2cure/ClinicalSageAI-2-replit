/**
 * Cross-document figure reconciliation does not say "clean" when nothing was
 * compared across documents (row 74, track NC; ADR-0015 §7).
 *
 * reconcileDossierNumbers (the structured engine behind
 * reconcile_extracted_figures) groups figures by quantity and flags values that
 * disagree beyond tolerance. reconcileDeviceDocuments feeds it the labelled
 * figures of a device programme's post-market documents. Before this change
 * both answered verdict 'clean' when:
 *   - the programme's documents state no labelled figure (the reconciler
 *     short-circuited to a 'clean' report with figuresReconciled 0);
 *   - only one document states figures, or no quantity is stated in two
 *     documents, so no figure was compared with another document's.
 * The reconcile_device_documents tool then passed that 'clean' to the model,
 * and the route to its caller. Neither is a finding. Each now reports verdict
 * 'not_assessed' with the reason; 'clean' needs at least one quantity stated in
 * two different documents (`quantitiesCompared`), and a conflict found is
 * still reported whatever else was not compared.
 *
 * The verdicts are the dossier consistency check's list
 * (shared/ana/dossier-consistency.ts); the decision is consistency-verdict.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbState = vi.hoisted(() => ({ rows: [] as unknown[], reads: 0 }));

vi.mock('../../../db', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  const chain = {
    from: () => chain,
    where: async () => {
      dbState.reads += 1;
      return dbState.rows;
    },
  };
  return { ...real, db: { ...(real.db as object), select: () => chain } };
});

// Program ownership is one shared check since 38a9417c6 (program-access.ts);
// the program belongs to the caller's organization here unless a case says not.
const ownership = vi.hoisted(() => ({ ours: true }));
vi.mock('../../c2c/program-access.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: async () => ownership.ours,
}));

import { reconcileDossierNumbers, type ExtractedFigure } from '../dossier-number-reconciler';
import { reconcileDeviceDocuments } from '../device-document-reconciler';
import { RECONCILE_EXTRACTED_FIGURES } from '../../ana/reconciliationTools';
import { RECONCILE_DEVICE_DOCUMENTS } from '../../ana/changePropagationTools';

const fig = (quantityKey: string, value: number, documentId: string, module?: string): ExtractedFigure => ({
  quantityKey,
  value,
  source: { documentId, module },
});

const postMarket = (
  id: string,
  summary: string | null,
  lifecycle: { status?: string; previousDocumentId?: string | null } = {},
) => ({
  id,
  documentType: 'psur',
  summary,
  risksIdentified: null,
  benefitRiskConclusion: null,
  status: lifecycle.status ?? 'draft',
  previousDocumentId: lifecycle.previousDocumentId ?? null,
});
const NO_FIGURES_DOC = postMarket('pms-narrative', 'Post-market surveillance found no new signals during the reporting period.');
const SENS_95_A = postMarket('pms', 'Clinical sensitivity of 95% was confirmed in the surveillance cohort.');
const SENS_95_B = postMarket('psur', 'Clinical sensitivity of 95% is restated in the periodic safety update report.');
const SENS_92 = postMarket('sscp', 'Clinical sensitivity of 92% is stated in the summary of safety and clinical performance.');
const SPEC_98 = postMarket('pmcf', 'Clinical specificity of 98% was observed in the follow-up study population.');

async function tool(name: string, input: Record<string, unknown>) {
  const { getToolHandler } = await import('../../ana/AnaToolExecutor');
  return JSON.parse(await getToolHandler(name)!(input, { organizationId: 7, userId: 3 } as never));
}

beforeEach(() => {
  dbState.rows = [];
  dbState.reads = 0;
});

describe('reconcileDossierNumbers: nothing compared across documents is not clean', () => {
  it('a single figure is not_assessed (no_shared_quantities), never clean', () => {
    const report = reconcileDossierNumbers({ figures: [fig('enrolled_n', 648, 'm25')] });
    expect(report.verdict).not.toBe('clean');
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('no_shared_quantities');
    expect(report.quantitiesCompared).toBe(0);
  });

  it('a quantity stated twice in the same document is not a cross-document comparison', () => {
    const report = reconcileDossierNumbers({ figures: [fig('enrolled_n', 648, 'm25'), fig('enrolled_n', 648, 'm25')] });
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('no_shared_quantities');
  });

  it('two documents that state different quantities compare nothing', () => {
    const report = reconcileDossierNumbers({ figures: [fig('enrolled_n', 648, 'm25'), fig('noael', 50, 'm24')] });
    expect(report.verdict).toBe('not_assessed');
    expect(report.quantitiesCompared).toBe(0);
  });

  it('an empty figure set is still a parameter error, not a verdict', () => {
    expect(() => reconcileDossierNumbers({ figures: [] })).toThrow(/figures\[\] is required/);
  });
});

describe('reconcileDossierNumbers: a real comparison keeps its verdict', () => {
  it('a quantity stated in two documents with one value is clean', () => {
    const report = reconcileDossierNumbers({ figures: [fig('enrolled_n', 648, 'm25'), fig('enrolled_n', 648, 'csr')] });
    expect(report.verdict).toBe('clean');
  });

  it('clean counts the quantities compared across documents and carries no reason', () => {
    const report = reconcileDossierNumbers({
      figures: [fig('enrolled_n', 648, 'm25'), fig('enrolled_n', 648, 'csr'), fig('noael', 50, 'm24')],
    });
    expect(report.quantitiesCompared).toBe(1);
    expect(report.notAssessedReason).toBeUndefined();
  });

  it('two modules of one file are two places in the dossier: compared', () => {
    const report = reconcileDossierNumbers({
      figures: [fig('enrolled_n', 648, 'dossier.pdf', '2.5'), fig('enrolled_n', 648, 'dossier.pdf', '2.7.3')],
    });
    expect(report.verdict).toBe('clean');
    expect(report.quantitiesCompared).toBe(1);
  });

  // Review [4]/[6]: a figure with no module is its document, not a place of its
  // own. The same figure emitted twice for one document, once with its module
  // and once without, compared that document with itself.
  it('one document stated with and without its module is one place: not_assessed, never clean', () => {
    const report = reconcileDossierNumbers({
      figures: [fig('enrolled_n', 648, 'csr'), fig('enrolled_n', 648, 'csr', '5.3.5.1')],
    });
    expect(report.verdict).not.toBe('clean');
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('no_shared_quantities');
    expect(report.quantitiesCompared).toBe(0);
  });

  it('a module-less figure in one document and a moduled one in another are two places (the overcorrection guard)', () => {
    const report = reconcileDossierNumbers({ figures: [fig('enrolled_n', 648, 'csr'), fig('enrolled_n', 648, 'm25', '2.5')] });
    expect(report.verdict).toBe('clean');
    expect(report.quantitiesCompared).toBe(1);
  });

  it('a disagreement across documents is still a blocker', () => {
    const report = reconcileDossierNumbers({ figures: [fig('enrolled_n', 648, 'm25'), fig('enrolled_n', 612, 'csr')] });
    expect(report.verdict).toBe('blocker');
    expect(report.conflictCount).toBe(1);
    expect(report.quantitiesCompared).toBe(1);
  });

  it('a high-severity disagreement across documents is still needs_review (the shared severity ladder)', () => {
    const report = reconcileDossierNumbers({ figures: [fig('p_value', 0.003, 'm25'), fig('p_value', 0.03, 'csr')] });
    expect(report.verdict).toBe('needs_review');
    expect(report.conflicts[0].severity).toBe('high');
  });

  it('a disagreement inside one document is still flagged, though nothing was compared across documents', () => {
    const report = reconcileDossierNumbers({ figures: [fig('duration_weeks', 26, 'm25'), fig('duration_weeks', 52, 'm25')] });
    expect(report.verdict).toBe('minor_issues');
    expect(report.notAssessedReason).toBeUndefined();
  });

  it('every verdict the engine returns is in the shared list', async () => {
    const { DOSSIER_CONSISTENCY_VERDICTS } = await import('../../../../shared/ana/dossier-consistency');
    const sets: ExtractedFigure[][] = [
      [fig('enrolled_n', 648, 'm25')],
      [fig('enrolled_n', 648, 'm25'), fig('enrolled_n', 648, 'csr')],
      [fig('enrolled_n', 648, 'm25'), fig('enrolled_n', 612, 'csr')],
    ];
    for (const figures of sets) {
      expect(DOSSIER_CONSISTENCY_VERDICTS).toContain(reconcileDossierNumbers({ figures }).verdict);
    }
  });
});

describe('reconcileDeviceDocuments: the device programme', () => {
  it('documents that state no labelled figure are not_assessed (no_figures), never clean', async () => {
    dbState.rows = [NO_FIGURES_DOC, postMarket('psur', null)];
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.documentsScanned).toBe(2);
    expect(result.report.figuresReconciled).toBe(0);
    expect(result.report.verdict).not.toBe('clean');
    expect(result.report.verdict).toBe('not_assessed');
    expect(result.report.notAssessedReason).toBe('no_figures');
    expect(result.report.quantitiesCompared).toBe(0);
  });

  it('only one document with figures is not_assessed (no_shared_quantities)', async () => {
    dbState.rows = [SENS_95_A, NO_FIGURES_DOC];
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    if (!result.ok) throw new Error('expected a report');
    expect(result.report.figuresReconciled).toBe(1);
    expect(result.report.verdict).toBe('not_assessed');
    expect(result.report.notAssessedReason).toBe('no_shared_quantities');
  });

  it('two documents that restate one sensitivity are still clean', async () => {
    dbState.rows = [SENS_95_A, SENS_95_B, SPEC_98];
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    if (!result.ok) throw new Error('expected a report');
    expect(result.report.verdict).toBe('clean');
    expect(result.report.quantitiesCompared).toBe(1);
  });

  it('two documents that disagree are still a blocker', async () => {
    dbState.rows = [SENS_95_A, SENS_92];
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    if (!result.ok) throw new Error('expected a report');
    expect(result.report.verdict).toBe('blocker');
    expect(result.report.conflicts[0].quantityKey).toBe('sensitivity');
  });

  it('a programme with no documents is still not_found, not a report', async () => {
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
  });
});

// Review [1]: supersedeDocument copies the narratives verbatim into the new
// version and marks the old one 'superseded'. Reading both compared the
// document with its own copy: 'clean' by construction.
describe('reconcileDeviceDocuments: only current documents are compared (review [1])', () => {
  it('a superseded version and its verbatim successor are one document: not_assessed, never clean', async () => {
    dbState.rows = [
      postMarket('psur-v1', SENS_95_A.summary, { status: 'superseded' }),
      postMarket('psur-v2', SENS_95_A.summary, { previousDocumentId: 'psur-v1' }),
    ];
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    if (!result.ok) throw new Error('expected a report');
    expect(result.report.verdict).not.toBe('clean');
    expect(result.report.verdict).toBe('not_assessed');
    expect(result.report.notAssessedReason).toBe('no_shared_quantities');
    expect(result.report.quantitiesCompared).toBe(0);
    expect(result.documentsScanned).toBe(1);
    expect(result.versionsSetAside).toBe(1);
  });

  it('a version another document names as its predecessor is set aside even if its status was not updated', async () => {
    dbState.rows = [
      postMarket('psur-v1', SENS_95_A.summary, { status: 'approved' }),
      postMarket('psur-v2', SENS_95_A.summary, { previousDocumentId: 'psur-v1' }),
    ];
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    if (!result.ok) throw new Error('expected a report');
    expect(result.report.verdict).toBe('not_assessed');
    expect(result.versionsSetAside).toBe(1);
  });

  it('a value corrected in the successor is not a conflict with the superseded version', async () => {
    dbState.rows = [
      postMarket('psur-v1', SENS_92.summary, { status: 'superseded' }),
      postMarket('psur-v2', SENS_95_B.summary, { previousDocumentId: 'psur-v1' }),
      SENS_95_A,
    ];
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    if (!result.ok) throw new Error('expected a report');
    expect(result.report.verdict).toBe('clean');
    expect(result.report.conflictCount).toBe(0);
    expect(result.report.quantitiesCompared).toBe(1);
  });

  it('a withdrawn document is set aside', async () => {
    dbState.rows = [SENS_95_A, postMarket('sscp', SENS_92.summary, { status: 'withdrawn' })];
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    if (!result.ok) throw new Error('expected a report');
    expect(result.report.verdict).toBe('not_assessed');
    expect(result.versionsSetAside).toBe(1);
  });

  it('two current documents with a superseded third still compare, and a real conflict is still a blocker', async () => {
    dbState.rows = [SENS_95_A, SENS_92, postMarket('old', SENS_95_B.summary, { status: 'superseded' })];
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    if (!result.ok) throw new Error('expected a report');
    expect(result.report.verdict).toBe('blocker');
    expect(result.documentsScanned).toBe(2);
    expect(result.versionsSetAside).toBe(1);
  });

  it('every document superseded or withdrawn is not_assessed (no_current_documents), not "no figures"', async () => {
    dbState.rows = [
      postMarket('psur-v1', SENS_95_A.summary, { status: 'superseded' }),
      postMarket('sscp', SENS_92.summary, { status: 'withdrawn' }),
    ];
    const result = await reconcileDeviceDocuments({ programId: 'p-1', organizationId: 7 });
    if (!result.ok) throw new Error('expected a report');
    expect(result.report.verdict).toBe('not_assessed');
    expect(result.report.notAssessedReason).toBe('no_current_documents');
    expect(result.documentsScanned).toBe(0);
    expect(result.versionsSetAside).toBe(2);
  });
});

describe('reconcile_device_documents: the tool says nothing was compared', () => {
  it('a program that is not the caller organization\'s is still refused, before anything is read', async () => {
    ownership.ours = false;
    try {
      dbState.rows = [NO_FIGURES_DOC];
      const before = dbState.reads;
      const out = await tool('reconcile_device_documents', { programId: 'p-1' });
      expect(out.code).toBe('PROGRAM_NOT_IN_ORGANIZATION');
      expect(dbState.reads).toBe(before);
    } finally {
      ownership.ours = true;
    }
  });

  it('no figures: not_assessed, and the instruction says nothing was reconciled instead of "report each conflict"', async () => {
    dbState.rows = [NO_FIGURES_DOC];
    const out = await tool('reconcile_device_documents', { programId: 'p-1' });
    expect(out.status).toBe('computed');
    expect(out.result.verdict).toBe('not_assessed');
    expect(out.result.notAssessedReason).toBe('no_figures');
    expect(out.instruction).not.toMatch(/Report each conflict/);
    expect(out.instruction).toMatch(/^No labelled numeric figure was found in the text read, so nothing was reconciled/);
    expect(out.instruction).toMatch(/not assessed; this is not a clean result/);
  });

  // Review [2]: only three narrative columns are read, never the structured
  // content, so the copy may not speak for "the documents" as a whole.
  it('no figures: the instruction names what was read, and claims nothing about the rest of the documents', async () => {
    dbState.rows = [NO_FIGURES_DOC];
    const out = await tool('reconcile_device_documents', { programId: 'p-1' });
    expect(out.instruction).not.toMatch(/No document states/);
    expect(out.instruction).toMatch(
      /Read: the summary, risks-identified and benefit-risk narratives \(not the structured content\) of 1 current document\./,
    );
  });

  it('a superseded version and its copy: not_assessed, and the instruction says the version was set aside', async () => {
    dbState.rows = [
      postMarket('psur-v1', SENS_95_A.summary, { status: 'superseded' }),
      postMarket('psur-v2', SENS_95_A.summary, { previousDocumentId: 'psur-v1' }),
    ];
    const out = await tool('reconcile_device_documents', { programId: 'p-1' });
    expect(out.result.verdict).toBe('not_assessed');
    expect(out.versionsSetAside).toBe(1);
    expect(out.instruction).not.toMatch(/No cross-document conflicts/);
    expect(out.instruction).toMatch(/1 superseded or withdrawn version set aside and not compared/);
  });

  it('every document retired: the instruction says there was no current document', async () => {
    dbState.rows = [postMarket('psur-v1', SENS_95_A.summary, { status: 'superseded' })];
    const out = await tool('reconcile_device_documents', { programId: 'p-1' });
    expect(out.result.notAssessedReason).toBe('no_current_documents');
    expect(out.instruction).toMatch(/^Every document found is superseded or withdrawn/);
    expect(out.instruction).not.toMatch(/No labelled numeric figure/);
  });

  it('one document with figures: not_assessed, and the instruction counts what was found', async () => {
    dbState.rows = [SENS_95_A];
    const out = await tool('reconcile_device_documents', { programId: 'p-1' });
    expect(out.result.verdict).toBe('not_assessed');
    expect(out.instruction).toMatch(/^1 figure found, but no quantity is stated in two places \(two documents, or two modules of one document\)/);
    expect(out.instruction).toMatch(/Do not describe the documents' figures as consistent/);
  });

  it('a real agreement is clean, and the instruction counts what was compared', async () => {
    dbState.rows = [SENS_95_A, SENS_95_B];
    const out = await tool('reconcile_device_documents', { programId: 'p-1' });
    expect(out.result.verdict).toBe('clean');
    expect(out.instruction).toMatch(/^No cross-document conflicts: 1 quantity compared across documents \(or modules of one document\)/);
    expect(out.instruction).toMatch(/stated in only one place were not compared/);
  });

  it('a conflict keeps its instruction', async () => {
    dbState.rows = [SENS_95_A, SENS_92];
    const out = await tool('reconcile_device_documents', { programId: 'p-1' });
    expect(out.result.verdict).toBe('blocker');
    expect(out.instruction).toMatch(/^Report each conflict verbatim/);
  });
});

describe('reconcile_extracted_figures: the same engine, the same honesty', () => {
  it('figures from one document: not_assessed, and the instruction is not "report these conflicts"', async () => {
    const out = await tool('reconcile_extracted_figures', {
      figures: [fig('enrolled_n', 648, 'm25', '2.5'), fig('noael', 50, 'm25', '2.5')],
    });
    expect(out.status).toBe('computed');
    expect(out.result.verdict).toBe('not_assessed');
    expect(out.result.notAssessedReason).toBe('no_shared_quantities');
    expect(out.instruction).not.toMatch(/Report these conflicts/);
    expect(out.instruction).toMatch(/^2 figures found, but no quantity is stated in two places \(two documents, or two modules of one document\)/);
  });

  it('a real agreement is clean with a counted instruction; a conflict keeps its instruction', async () => {
    const clean = await tool('reconcile_extracted_figures', {
      figures: [fig('enrolled_n', 648, 'm25', '2.5'), fig('enrolled_n', 648, 'csr', '5.3.5.1')],
    });
    expect(clean.result.verdict).toBe('clean');
    expect(clean.instruction).toMatch(/^No cross-document conflicts: 1 quantity compared across documents \(or modules of one document\)/);
    const conflict = await tool('reconcile_extracted_figures', {
      figures: [fig('enrolled_n', 648, 'm25', '2.5'), fig('enrolled_n', 612, 'csr', '5.3.5.1')],
    });
    expect(conflict.result.verdict).toBe('blocker');
    expect(conflict.instruction).toMatch(/^Report these conflicts and values verbatim/);
  });

  it('every reason has its own copy, and no copy is the clean one', async () => {
    const { RECONCILIATION_NOT_ASSESSED_REASONS } = await import('../../../../shared/ana/dossier-consistency');
    const { reconciliationInstructionFor } = await import('../../intelligence/consistency-verdict');
    const copies = RECONCILIATION_NOT_ASSESSED_REASONS.map(reason =>
      reconciliationInstructionFor(
        { verdict: 'not_assessed', notAssessedReason: reason, figuresReconciled: 2, quantitiesCompared: 0 },
        'Report the conflicts.',
      ),
    );
    expect(new Set(copies).size).toBe(RECONCILIATION_NOT_ASSESSED_REASONS.length);
    for (const copy of copies) {
      expect(copy).not.toMatch(/No cross-document conflicts|Report the conflicts/);
      expect(copy).toMatch(/not a clean result/);
    }
  });
});

describe('the model hears the same thing', () => {
  // OpenAI-compatible providers trim a description at 1024 characters
  // (gateway.ts, OPENAI_MAX_TOOL_DESCRIPTION_CHARS): the rule must be in the head.
  const head = (description: string) => description.slice(0, 1024);

  it('reconcile_device_documents names not_assessed and says it is not clean', () => {
    expect(head(RECONCILE_DEVICE_DOCUMENTS.description)).toMatch(/not_assessed/);
    expect(head(RECONCILE_DEVICE_DOCUMENTS.description)).toMatch(/not a clean result/);
  });

  it('reconcile_extracted_figures names not_assessed and says it is not clean, before the trim', () => {
    expect(head(RECONCILE_EXTRACTED_FIGURES.description)).toMatch(/not_assessed/);
    expect(head(RECONCILE_EXTRACTED_FIGURES.description)).toMatch(/not a clean result/);
  });

  // Review [6]: the engine's definition of "compared" is two places, where a
  // module of one document is a place. The model reads the same definition.
  it("reconcile_extracted_figures states the engine's definition: two documents, or two modules of one document", () => {
    expect(head(RECONCILE_EXTRACTED_FIGURES.description)).toMatch(/two documents, or two modules of one document/);
    expect(RECONCILE_EXTRACTED_FIGURES.description).not.toMatch(/stated in two different documents, so/);
  });

  it('reconcile_device_documents says superseded and withdrawn versions are not compared', () => {
    expect(head(RECONCILE_DEVICE_DOCUMENTS.description)).toMatch(/[Ss]uperseded or withdrawn versions are set aside/);
  });

  it('reconcile_device_documents fits the trim whole, so its grounding note is not cut', () => {
    expect(RECONCILE_DEVICE_DOCUMENTS.description.length).toBeLessThanOrEqual(1024);
  });
});
