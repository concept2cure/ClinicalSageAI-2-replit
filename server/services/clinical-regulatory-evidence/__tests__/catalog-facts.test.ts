/**
 * The Data Room catalog's text rules (S3): each finds its fact only under its
 * label, records where, and declines a lookalike. A wrong study, registry id or
 * data cut on a regulatory record is worse than none.
 */
import { describe, expect, it } from 'vitest';
import { findTextFacts, isoDate, matchStudy } from '../catalog-facts';

const TITLE_PAGE = [
  'CLINICAL STUDY REPORT',
  'A Phase 2b, Randomized, Double-blind Study of Bexotinib in IPF',
  'Protocol Number: BX-301-02',
  'ClinicalTrials.gov Identifier: NCT04567890',
  'EudraCT Number: 2021-001234-42',
  'Report Date: 14 March 2025',
  'Data cut-off date: 2024-12-31',
].join('\n');

describe('findTextFacts', () => {
  const f = findTextFacts(TITLE_PAGE);

  it('finds every labelled fact on a title page, with the offset it matched at', () => {
    expect(f.protocolNumber?.value).toBe('BX-301-02');
    expect(f.registryIds.map(r => r.value)).toEqual(['NCT04567890', '2021-001234-42']);
    expect(f.documentDate?.value).toBe('2025-03-14');
    expect(f.dataCutDate?.value).toBe('2024-12-31');
    expect(TITLE_PAGE.slice(f.registryIds[0].offset, f.registryIds[0].offset + 11)).toBe('NCT04567890');
    expect(f.protocolNumber?.rule).toBe('labelled protocol number');
  });

  it('reads the date shapes regulatory documents use', () => {
    expect(findTextFacts('Database lock: 31-Jan-2025').dataCutDate?.value).toBe('2025-01-31');
    expect(findTextFacts('The data lock point was March 3, 2024.').dataCutDate?.value).toBe('2024-03-03');
    expect(findTextFacts('Version Date: 05FEB2023').documentDate?.value).toBe('2023-02-05');
  });

  it('takes nothing without its label: a bare date, number or code is not a fact', () => {
    const bare = findTextFacts('Dosing began 2021-001234-42 units. Visit on 14 March 2025. Study BX-301 enrolled 120.');
    expect(bare.registryIds).toEqual([]);
    expect(bare.documentDate).toBeNull();
    expect(bare.dataCutDate).toBeNull();
    expect(bare.protocolNumber).toBeNull();
  });

  it('declines an impossible date rather than recording a plausible one', () => {
    expect(findTextFacts('Data cut-off: 31 February 2025').dataCutDate).toBeNull();
    expect(isoDate('2025-02-29')).toBeNull();
    expect(isoDate('2024-02-29')).toBe('2024-02-29');
  });

  it('nothing to read is no facts, not an error', () => {
    expect(findTextFacts(null)).toEqual({ registryIds: [], protocolNumber: null, documentDate: null, dataCutDate: null });
  });
});

describe('matchStudy keeps every explicit protocol in the scope decision', () => {
  const programId = '55555555-5555-4555-8555-555555555555';
  const known = { id: 31, study_id: 'sd_STUDY-A', protocol_id: 'STUDY-A' };

  it('does not discard a later unmatched protocol because the first matched', async () => {
    const facts = findTextFacts('Protocol Number: STUDY-A\nProtocol Number: UNKNOWN-B');
    const found = await matchStudy({ query: async () => ({ rows: [known] }) }, 7, programId, facts);
    expect(facts.protocolNumber?.value).toBe('STUDY-A');
    expect(found).toEqual({ studyRef: null, candidates: [{ id: 31, studyId: 'sd_STUDY-A', protocolId: 'STUDY-A' }] });
  });

  it('passes all distinct protocols to the scoped matcher, retaining a repeated single protocol', async () => {
    let keys: unknown;
    const q = { query: async (_sql: string, params?: unknown[]) => { keys = params?.[2]; return { rows: [known] }; } };
    await matchStudy(q, 7, programId, findTextFacts('Protocol Number: STUDY-A\nProtocol ID: STUDY-B'));
    expect(keys).toEqual(['STUDY-A', 'STUDY-B']);
    const repeated = await matchStudy(q, 7, programId, findTextFacts('Protocol Number: STUDY-A\nProtocol ID: study-a'));
    expect(keys).toEqual(['STUDY-A']);
    expect(repeated.studyRef).toBe(31);
  });
});
