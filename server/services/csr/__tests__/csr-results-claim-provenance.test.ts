/**
 * Scientific grounding from generation to Authoring import and later review.
 * All values are SYNTHETIC. A number that appears in metadata is not a
 * clinical result unless a retained table explicitly supplies it.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  findUnclaimedNumbers, acceptEvidenceBoundDraft, isCsrObservedResultsSection,
} from '../unsupplied-statistics';
import { buildCsrClaimReceipts, importedCsrSectionEvidence } from '../csr-claim-receipts';
import { assessSavedCsrEvidence } from '../../ana/csr-saved-evidence';
import { buildCsrAuthoringEvidence, type RetainedCsrTables } from '../cortex-authoring-context';

const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const PROGRAM = '11111111-2222-4333-8444-000000000001';
const RUN = '11111111-2222-4333-8444-000000000002';
const DOC = '11111111-2222-4333-8444-000000000003';
const STUDY = 'SYN-300';
const DATA = {
  protocolNumber: STUDY, title: 'SYN-300 planned enrollment study',
  phase: '3', sampleSize: 300, primaryEndpoint: 'Response rate 95%',
};

function retained(): RetainedCsrTables {
  return { runId: RUN, programId: PROGRAM, historical: true,
    releaseEligibilityVerified: false, studies: [{
      source: { documentId: DOC, version: '1', sha256: 'e'.repeat(64),
        dataCutDate: '2026-09-30', studyId: STUDY, protocolNumber: STUDY,
        clinicalVerification: 'not-established' },
      tables: {
        analysisPopulations: { title: 'Analysis populations', headers: ['Group', 'Treatment'],
          rows: [['Safety', '114']] },
        aeOverallSummary: { title: 'Adverse events', headers: ['Event', 'Treatment'],
          rows: [['Any AE', '12 (10.5%)']] },
        deathsSAEsDiscontinuations: { title: 'Serious events', headers: ['Event', 'Treatment'],
          rows: [['Fatal AEs', '1']] },
      },
    }] };
}
const sectionPack = (code: string) => buildCsrAuthoringEvidence(retained(),
  { programId: PROGRAM, runId: RUN, studyId: STUDY, sectionNumber: code });
function oldReceipt(sectionNumber: string, prose: string) {
  const evidence = sectionPack(sectionNumber);
  const r = buildCsrClaimReceipts(evidence,
    { evidenceDigest: evidence.evidenceDigest, findings: [] }, prose);
  expect(r).not.toBeNull();
  return { ...r!, sectionSha256: sha(prose), studyInformationNumbers: ['300'] };
}

describe('CSR clinical outcomes always require retained analysis-cell claims', () => {
  it('does not treat planned sample size as evidence of deaths or completions', () => {
    for (const [sectionNumber, prose] of [
      ['10.1', '300 patients completed the study.'],
      ['11.4.1', 'The efficacy response rate was 95%.'],
      ['12.3', '300 patients died.'],
      ['13', 'An odds ratio of 3 was observed.'],
    ]) {
      expect(isCsrObservedResultsSection(sectionNumber)).toBe(true);
      const lineage: Record<string, unknown> = {};
      expect(acceptEvidenceBoundDraft({ sectionNumber, prose, claims: [] },
        sectionPack(sectionNumber), DATA, lineage)).toBe(false);
      expect(lineage.rejectedModelDraft).toMatchObject({ reason: 'unreconciled_figures' });
    }
  });

  it('excludes product and protocol IDs without excluding free-standing clinical figures', () => {
    expect(findUnclaimedNumbers(
      'Study SYN-300 (NCT05330182) evaluated 300 patients; see Table 14.3.1.',
      { claimed: [] },
    ).map(x => x.text)).toEqual(['300']);
    expect(findUnclaimedNumbers(
      'Drug LMN-201 was compared with BX-204 in §12.3.',
      { claimed: [] },
    )).toEqual([]);
  });

  it('never issues a planned-metadata exemption in a results-section import', () => {
    const sectionNumber = '12.2';
    const prose = '300 patients experienced an adverse event in SYN-300.';
    const imported = importedCsrSectionEvidence({
      sectionNumber, content: prose, contentHash: sha(prose),
      lineage: { claimReceipts: oldReceipt(sectionNumber, prose) },
    }, prose, DATA);
    expect(imported).not.toBeNull();
    expect(imported?.studyInformationNumbers).toEqual([]);
  });

  it('retains planned-design metadata support outside observed-results headings', () => {
    const sectionNumber = '9.7.1';
    const prose = 'A total of 300 participants were planned for SYN-300.';
    const imported = importedCsrSectionEvidence({
      sectionNumber, content: prose, contentHash: sha(prose),
      lineage: { claimReceipts: oldReceipt(sectionNumber, prose) },
    }, prose, DATA);
    expect(imported?.studyInformationNumbers).toContain('300');
  });

  it('blocks actual completion figures in a legacy synopsis even when the same number was planned', () => {
    const code = '2';
    const prose = 'Enrollment of 300 participants was planned. 300 participants completed treatment in SYN-300.';
    const legacy = oldReceipt(code, prose); // explicitly includes a legacy metadata exemption for 300
    const verdict = assessSavedCsrEvidence([{
      code, title: 'Synopsis', content: prose, text: prose,
    }], new Map([[code, legacy]]),
    new Map([[PROGRAM.toLowerCase() + ':' + RUN.toLowerCase(), {
      ok: true as const, tables: retained(),
    }]]));
    expect(verdict.status).toBe('blocked');
    expect(verdict.unclaimedFigures).toContainEqual({
      section: '2', figure: '300', blocking: true,
    });
  });

  it('rechecks legacy imports instead of honoring stale metadata exemptions', () => {
    const code = '12.2';
    const prose = '300 patients experienced an adverse event in SYN-300.';
    const verdict = assessSavedCsrEvidence([{
      code, title: 'Adverse events', content: prose, text: prose,
    }], new Map([[code, oldReceipt(code, prose)]]),
    new Map([[PROGRAM.toLowerCase() + ':' + RUN.toLowerCase(), { ok: true as const, tables: retained() }]]));
    expect(verdict.status).toBe('blocked');
    expect(verdict.unclaimedFigures).toContainEqual({
      section: '12.2', figure: '300', blocking: true,
    });
  });
});
