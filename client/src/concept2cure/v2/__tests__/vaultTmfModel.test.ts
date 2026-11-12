/**
 * The trial master file section's words and figures (surfaces/vaultTmf.ts):
 * the parts with no markup, checked against the real catalog, the real ingest
 * vocabulary and the completeness service's own assessment.
 *
 * What is pinned:
 *   - the Vault ingest type of a file uploaded against a record. The retired
 *     eTMF screen's mapping, which etmfFilingPayload.test.ts pinned until the
 *     screen was retired: a record code that IS an accepted type is that type,
 *     the investigator's brochure is IB, and every other record is OTHER;
 *   - the three figures, from the server's own summary, with a count it did
 *     not report said as not reported;
 *   - every sentence follows the scope of the answer it is about;
 *   - the package cover's label and its first part come from the one verdict;
 *   - the question to AnA names the study.
 */
import { describe, expect, it } from 'vitest';
import { TMF_REFERENCE_MODEL } from '@shared/constants/domain/tmf-reference-model';
import { VAULT_INGEST_DOCUMENT_TYPES } from '@shared/constants/domain/vault-taxonomy';
import { assessTmfCompleteness } from '../../../../../server/services/etmf/tmf-completeness';
import {
  NOT_ASSESSED, READINESS_LABEL, readinessParagraph, scopeNoun, tmfAskPrompt, tmfFigures, tmfFiguresSentence, tmfIngestType, tmfVerdict,
  tmfVerdictSentence, unverifiedWords, type TmfVerdict,
} from '../surfaces/vaultTmf';

const CODES = TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.map((a) => a.code));
const ESSENTIAL = TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.filter((a) => a.essential).map((a) => a.code));
const verified = (codes: string[]) => Object.fromEntries(codes.map((c) => [c, 'verified' as const]));
const assess = (codes: string[], scope: 'essential' | 'all' = 'essential') =>
  assessTmfCompleteness({ providedArtifacts: codes, scope, documentEvidence: verified(codes) });

describe('the Vault ingest type of a file uploaded against a record', () => {
  it('is one the ingest accepts, for every record of the catalog and for a code that is not one', () => {
    for (const code of [...CODES, '', 'a code that does not exist']) {
      expect(VAULT_INGEST_DOCUMENT_TYPES as readonly string[]).toContain(tmfIngestType(code));
    }
    // The value the retired screen once sent, which the ingest refused every time.
    expect(VAULT_INGEST_DOCUMENT_TYPES as readonly string[]).not.toContain('tmf_essential');
  });

  it('a record code that is an ingest type is that type, not OTHER', () => {
    expect(tmfIngestType('protocol')).toBe('PROTOCOL');
    expect(tmfIngestType('csr')).toBe('CSR');
    expect(tmfIngestType('sap')).toBe('SAP');
    expect(tmfIngestType(' Protocol ')).toBe('PROTOCOL');
    // The one alias: the catalog's code and the ingest type differ.
    expect(tmfIngestType('investigators_brochure')).toBe('IB');
  });

  it('any other record is OTHER, never a regulatory type nobody stated', () => {
    for (const code of ['monitoring_plan', 'insurance', 'tmf_plan', 'sample_icf', '']) expect(tmfIngestType(code)).toBe('OTHER');
  });
});

describe('the three figures', () => {
  it('are the server’s own summary: zones complete, records filed, records open, and how many of those have a filing', () => {
    const result = assessTmfCompleteness({
      providedArtifacts: ['protocol', 'tmf_plan', 'monitoring_plan'],
      documentEvidence: { protocol: 'verified', tmf_plan: 'no_document', monitoring_plan: 'unverifiable' },
    });
    expect(tmfFigures(result)).toEqual({ zonesComplete: 0, zoneCount: 11, filed: 1, required: ESSENTIAL.length, open: ESSENTIAL.length - 1, unverified: 2, notApplicable: 0 });
    expect(tmfFiguresSentence(result)).toBe(
      `0 of 11 zones are complete; 1 of ${ESSENTIAL.length} essential records are filed; ${ESSENTIAL.length - 1} are open, 2 filed with no verified document.`,
    );
  });

  it('a count the server did not report is not reported, never zero', () => {
    const result = assess(['protocol']);
    const unreported = { ...result, summary: { ...result.summary, totalUnverified: undefined as unknown as number } };
    expect(tmfFigures(unreported)?.unverified).toBeNull();
    expect(unverifiedWords(null)).toBe('how many are filed with no verified document was not reported');
    expect(tmfFiguresSentence(unreported)).toMatch(/are open, how many are filed with no verified document was not reported\.$/);
  });

  it('an answer with nothing to count has no figures: it checked nothing, or it is not ready and gave no count', () => {
    const result = assess(['protocol']);
    const nothing = { ...result, zones: [], summary: { zoneCount: 0, zonesComplete: 0, totalRequired: 0, totalMissing: 0, totalUnverified: 0, totalNotApplicable: 0 } };
    expect(tmfFigures(nothing)).toBeNull();
    expect(tmfFiguresSentence(nothing)).toBe('');
    // Not ready, and no count of what is missing: "26 of 26 filed" would read as complete.
    const uncounted = { ...result, ready: false, summary: { ...result.summary, totalMissing: 0 } };
    expect(tmfVerdict({ ...uncounted, zones: uncounted.zones.map((z) => ({ ...z, missing: [] })) })).toBe('incomplete');
    expect(tmfFigures(uncounted)).toBeNull();
    expect(tmfFiguresSentence(uncounted)).toBe('');
    // An answer that is ready has figures, with nothing open.
    expect(tmfFigures(assess(ESSENTIAL))).toMatchObject({ filed: ESSENTIAL.length, open: 0 });
  });

  it('nothing open is said without a word about unverified filings', () => {
    expect(tmfFiguresSentence(assess(ESSENTIAL))).toBe(`11 of 11 zones are complete; ${ESSENTIAL.length} of ${ESSENTIAL.length} essential records are filed; 0 are open.`);
  });
});

describe('every sentence follows the scope of the answer', () => {
  it('names essential records for the essential scope and records for all', () => {
    expect([scopeNoun('essential'), scopeNoun('essential', 1), scopeNoun('all'), scopeNoun('all', 1)]).toEqual(['essential records', 'essential record', 'records', 'record']);
    const all = assess(ESSENTIAL, 'all');
    expect(tmfVerdict(all)).toBe('incomplete');
    expect(tmfVerdictSentence('incomplete', all)).toBe(`${ESSENTIAL.length} of ${CODES.length} records are filed. ${CODES.length - ESSENTIAL.length} are missing.`);
    expect(tmfVerdictSentence('incomplete', all)).not.toMatch(/essential/);
    const complete = assess(CODES, 'all');
    expect(tmfVerdict(complete)).toBe('complete');
    expect(tmfVerdictSentence('complete', complete)).toBe(`Every record is filed: all ${CODES.length}, each against a Vault document that exists now.`);
    expect(tmfVerdictSentence('complete', assess(ESSENTIAL))).toBe(`Every essential record is filed: all ${ESSENTIAL.length}, each against a Vault document that exists now.`);
  });
});

describe('the package cover and its first part state the one verdict', () => {
  const VERDICTS: TmfVerdict[] = ['complete', 'incomplete', 'undetermined', 'not-assessed'];

  it('each verdict has its own label, and only complete is called inspection-ready', () => {
    expect(new Set(VERDICTS.map((v) => READINESS_LABEL[v])).size).toBe(4);
    expect(READINESS_LABEL.complete).toBe('Inspection-ready, on completeness');
    for (const v of VERDICTS.filter((x) => x !== 'complete')) expect(READINESS_LABEL[v]).not.toMatch(/^Inspection-ready/);
    expect(READINESS_LABEL.undetermined).toBe('Readiness not determined');
  });

  it('the first part opens with the verdict line’s own sentence', () => {
    const result = assess(['protocol']);
    for (const v of VERDICTS) expect(readinessParagraph(v, result).startsWith(`${tmfVerdictSentence(v, result)} `)).toBe(true);
    expect(readinessParagraph('undetermined', result)).toMatch(/neither ready nor not ready/);
    expect(readinessParagraph('incomplete', result)).toMatch(/It is not yet inspection-ready\./);
  });
});

describe('what AnA is asked and told', () => {
  it('the question names the study by its title, or by its id when it has none', () => {
    expect(tmfAskPrompt({ studyId: 'BX-204-201', title: 'BX-204 in plaque psoriasis', phase: '2' }))
      .toBe('Which trial master file gaps would an inspector raise for BX-204 in plaque psoriasis, and how do I close them?');
    expect(tmfAskPrompt({ studyId: 'BX-204-201', title: ' ', phase: '' })).toBe('Which trial master file gaps would an inspector raise for BX-204-201, and how do I close them?');
  });

  it('timeliness and quality control are said as not assessed, with the reason', () => {
    expect(NOT_ASSESSED).toBe('Timeliness and quality control are not assessed: no filing lag and no QC state is recorded for trial master file records.');
  });
});
