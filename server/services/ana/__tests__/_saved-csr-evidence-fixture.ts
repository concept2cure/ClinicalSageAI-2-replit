/** Shared seed for the saved-CSR evidence tests (CSR slice 5, 2026-10-30): a saved
 * CSR whose claim receipts come from the real drafting path (acceptEvidenceBoundDraft
 * → buildCsrClaimReceipts → importedCsrSectionEvidence), not written by hand. Moved
 * from saved-csr-evidence.pglite.test.ts so medical_writing_review's document
 * reference is tested on the same receipts. Import after _saved-document-critique-fixture. */
import { expect } from 'vitest';
import { createHash } from 'node:crypto';
import { pg, PROGRAM, DOCUMENT, sectionId } from './_saved-document-critique-fixture';
import { buildCsrAuthoringEvidence, type RetainedCsrTables } from '../../csr/cortex-authoring-context';
import { acceptEvidenceBoundDraft } from '../../csr/unsupplied-statistics';
import { buildCsrClaimReceipts, importedCsrSectionEvidence } from '../../csr/csr-claim-receipts';
import { workflowCopySectionContent } from '../../authoring/workflow-copy-content';

export const RUN = '33333333-2222-4333-8444-000000000001';
export const STUDY_INFO = { protocolNumber: 'LMN-201', title: 'LMN-201 Part B' };
export const CELL = '16/305 (5.2%)';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export function retained(result = CELL): RetainedCsrTables {
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
export function draftedSection(sectionNumber: string, prose: string) {
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

export const SYNOPSIS = 'In LMN-201 Part B, global cure was achieved by 16/305 (5.2%) subjects on LMN-201.';
export const EFFICACY = 'Global cure occurred in 16/305 (5.2%) subjects in the LMN-201 arm (Table 14.2.1).';

export async function seedCsr(opts: { synopsisText?: string; synopsisReceipts?: boolean; title?: string; module?: string | null } = {}) {
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
