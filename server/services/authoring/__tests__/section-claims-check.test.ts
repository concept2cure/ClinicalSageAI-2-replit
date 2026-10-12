/**
 * A drafted section's figures set against the figures the documents it cites
 * state — the reachable path for the clinical figure claims engine.
 *
 * `draft-figure-check.ts` answers a different question: is this number present
 * in a source at all (anti-fabrication). It cannot answer whether the number
 * AGREES, because it does not read what the number measures on either side. A
 * section that says nausea occurred in 12.0% of patients, citing a CSR that
 * says 18.0%, passes that check: 12.0 is "unverified", and the 18.0 in the
 * source is never looked at. This is the check that reads both frames.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { claimDocRoleOf } from '../../../../shared/ana/clinical-claims-vocabulary';
import { CLAIMS_KEPT, checkSectionClaims, type ClaimsExcerpt } from '../section-claims-check';

const CSR_SAFETY =
  '12.2.2 Common Adverse Events\n' +
  'Study DPL-301 (NCT05551234), Safety Analysis Set. Nausea was reported in 55 subjects (18.0%) on dapralutide 1.5 mg and 14 (4.6%) on placebo.\n';

const excerpt = (text: string, over: Partial<ClaimsExcerpt> = {}): ClaimsExcerpt => ({
  documentId: '11111111-1111-4111-8111-111111111111',
  contentHash: 'a'.repeat(64),
  text,
  ctdSection: '5.3.5.1',
  documentType: 'Clinical Study Report',
  ...over,
});

describe('a section against the documents it cites', () => {
  it('reports the conflict a figure check cannot see, and cites both sides', () => {
    const r = checkSectionClaims(
      '2.7.4',
      'In Study DPL-301 (NCT05551234), nausea was reported in 12.0% of patients treated with dapralutide 1.5 mg.',
      [excerpt(CSR_SAFETY)],
    );
    expect(r.verdict).toBe('conflicts_found');
    expect(r.conflicts).toBe(1);
    const c = r.comparisons.find((x) => x.outcome === 'conflict');
    expect(c, JSON.stringify(r.comparisons)).toBeDefined();
    expect(c!.section.values.join()).toContain('12.0');
    expect(c!.source.values.join()).toContain('18.0');
    // The cited document is named, with the version the check read.
    expect(c!.source.documentId).toBe('11111111-1111-4111-8111-111111111111');
    expect(c!.source.contentHash).toBe('a'.repeat(64));
    // A disagreement carries both quotes, so the author can read the context without opening
    // either document; a pair that agrees carries only its values and offsets.
    expect(c!.section.quote).toBeTruthy();
    expect(c!.source.quote).toBeTruthy();
    const agreed = r.comparisons.find((x) => x.outcome === 'consistent');
    if (agreed) expect(agreed.section.quote).toBeUndefined();
  });

  it('never says "consistent" as a verdict, and counts what it compared', () => {
    const r = checkSectionClaims(
      '2.7.4',
      'In Study DPL-301 (NCT05551234), nausea was reported in 18.0% of patients treated with dapralutide 1.5 mg.',
      [excerpt(CSR_SAFETY)],
    );
    expect(r.verdict).toBe('no_conflict_among_compared');
    expect(r.conflicts).toBe(0);
    expect(r.compared).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(r)).not.toContain('"verdict":"consistent"');
  });

  it('declines a pair whose frames differ, with the reason, and never calls it a conflict', () => {
    // Different analysis populations, so the figures are not the same measure however close they
    // look: per-protocol against full analysis set (the engine's pvs-32 shape).
    const r = checkSectionClaims(
      '2.7.3',
      'Pooled Phase 3 (DPX-301, DPX-302), Per-Protocol Set: EASI-75 at Week 16 was achieved by 44.0% of dupraxinab and 23.5% of placebo patients.',
      [
        excerpt(
          'Pooled Phase 3 (DPX-301, DPX-302), Full Analysis Set: EASI-75 at Week 16 was achieved by 41.3% of dupraxinab and 22.8% of placebo patients.',
          { ctdSection: null, documentType: 'Integrated Summary of Efficacy' },
        ),
      ],
    );
    expect(r.conflicts).toBe(0);
    expect(r.notCompared.some((n) => n.reason === 'population_differs'), JSON.stringify(r.notCompared)).toBe(true);
    for (const n of r.notCompared) expect(typeof n.why).toBe('string');
  });

  it('reports nothing compared as nothing compared, not as agreement', () => {
    const r = checkSectionClaims('2.7.4', 'The safety profile was consistent with the known profile.', [excerpt(CSR_SAFETY)]);
    expect(r.verdict).toBe('nothing_compared');
    expect(r.compared).toBe(0);
    expect(r.conflicts).toBe(0);
  });

  it('keeps the counts complete when it truncates the detail', () => {
    const terms = ['nausea', 'diarrhoea', 'vomiting', 'fatigue', 'headache', 'constipation', 'insomnia', 'pyrexia'];
    const sectionRows = terms.map((t, i) => `${t[0].toUpperCase()}${t.slice(1)} | ${10 + i}.0 | 1.0`).join('\n');
    const csrRows = terms.map((t, i) => `${t[0].toUpperCase()}${t.slice(1)} | ${20 + i} (${20 + i}.0) | 3 (1.0)`).join('\n');
    const r = checkSectionClaims(
      '2.7.4',
      `Table 1 Adverse events by preferred term (Study DPL-301 (NCT05551234), Safety Analysis Set)\nPreferred Term | Dapralutide 1.5 mg (N=305) % | Placebo (N=303) %\n${sectionRows}\n`,
      [
        excerpt(
          `Table 12-3 TEAEs by Preferred Term (Safety Analysis Set, Study DPL-301, NCT05551234)\nPreferred Term | Dapralutide 1.5 mg (N=305) n (%) | Placebo (N=303) n (%)\n${csrRows}\n`,
        ),
      ],
    );
    expect(r.compared + r.notCompared.length).toBeGreaterThan(0);
    expect(r.comparisons.length).toBeLessThanOrEqual(CLAIMS_KEPT);
    expect(r.notCompared.length).toBeLessThanOrEqual(CLAIMS_KEPT);
    if (r.compared > CLAIMS_KEPT) expect(r.truncated).toBe(true);
  });
});

describe('the role a document plays, from the platform’s own identifiers', () => {
  it('reads the CTD section a section or a catalogued document carries', () => {
    expect(claimDocRoleOf({ ctdSection: '2.5' })).toBe('m2_5');
    expect(claimDocRoleOf({ ctdSection: '2.7.3' })).toBe('m2_7_3');
    expect(claimDocRoleOf({ ctdSection: '2.7.3.3.2.1' })).toBe('m2_7_3');
    expect(claimDocRoleOf({ ctdSection: '2.7.4' })).toBe('m2_7_4');
    expect(claimDocRoleOf({ ctdSection: '2.7.6' })).toBe('m2_7_6');
    expect(claimDocRoleOf({ ctdSection: '5.3.5.1' })).toBe('csr');
    expect(claimDocRoleOf({ ctdSection: '5.3.5.3' })).toBe('iss');
    expect(claimDocRoleOf({ ctdSection: '1.14.1.1' })).toBe('uspi');
  });

  it('reads the document type when no CTD section is recorded', () => {
    expect(claimDocRoleOf({ documentType: 'Clinical Study Report' })).toBe('csr');
    expect(claimDocRoleOf({ documentType: 'CSR Synopsis' })).toBe('csr_synopsis');
    expect(claimDocRoleOf({ documentType: 'Integrated Summary of Safety' })).toBe('iss');
    expect(claimDocRoleOf({ documentType: 'Integrated Summary of Efficacy' })).toBe('ise');
    expect(claimDocRoleOf({ documentType: 'US Prescribing Information' })).toBe('uspi');
    expect(claimDocRoleOf({ documentType: 'Summary of Product Characteristics' })).toBe('smpc');
  });

  it('fails closed on anything it does not recognise, so no role convention binds', () => {
    expect(claimDocRoleOf({})).toBe('other');
    expect(claimDocRoleOf({ ctdSection: null, documentType: null })).toBe('other');
    expect(claimDocRoleOf({ documentType: 'Investigator Brochure' })).toBe('other');
    expect(claimDocRoleOf({ ctdSection: '3.2.P.5.1' })).toBe('other');
    // A CTD section the record holds wins over a type that disagrees with it: the filed
    // location is the stronger fact, and a mis-typed upload must not change a comparison.
    expect(claimDocRoleOf({ ctdSection: '2.7.4', documentType: 'US Prescribing Information' })).toBe('m2_7_4');
  });
});

describe('the check is on the path a draft already takes', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('runs where the figure check runs, over the excerpts the save already verified', () => {
    const from = src('authoring-from-draft.ts');
    expect(from).toContain("from './section-claims-check'");
    expect(from).toContain('checkSectionClaims(');
    // The same seam, the same excerpts: one load, not two.
    const seam = from.slice(from.indexOf('checkSectionFigures('), from.indexOf('checkSectionFigures(') + 900);
    expect(seam).toContain('checkSectionClaims(');
    expect(seam).toContain('claims');
    // And it is stored in the record the document and every CREATE audit row carry.
    expect(from).toMatch(/claims\?:\s*SectionClaimsCheck/);
  });

  it('gives the engine the role of each cited document, from the record', () => {
    const refs = src('draft-source-references.ts');
    expect(refs).toContain('ctdSection');
    expect(refs).toContain('documentType');
  });
});
