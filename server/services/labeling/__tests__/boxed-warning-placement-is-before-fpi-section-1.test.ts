/**
 * The FDA-vs-EU comparison places the US boxed warning where 21 CFR 201.57, as
 * this repository records it, puts it (2026-10-15).
 *
 * What the code used to do: the 'Boxed Warning' row said "Boxed Warning (Black
 * Box) in Highlights and Section 5". Section 5 is Warnings and Precautions
 * (201.57(c)(6)); the Full Prescribing Information's boxed warning is (c)(1), ahead
 * of Indications and Usage, (c)(2) — section 1 (docs/evidence/
 * D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/b1-plr-rules-elsa-facts.md, and
 * FPI_SECTIONS, which begins at section 1 with no box entry). The Highlights box is
 * 201.57(a)(4) (PLR_FORMAT_RULES 'plr-hl-boxed-warning').
 */
import { describe, it, expect } from 'vitest';
import { structureSmPC, assessPLRStructure } from '../labeling-intelligence-knowledge';
import { PLR_FORMAT_RULES } from '../../ind/ctd/fda-technical-rules';

describe('FDA vs EU comparison — boxed warning placement', () => {
  const row = structureSmPC({ productType: 'medicinal_product', procedure: 'centralized' })
    .differences.find((d) => d.topic === 'Boxed Warning')!;

  it('puts the FPI box before section 1, not in Section 5', () => {
    expect(row.fdaApproach, 'the box was placed in Section 5 (Warnings and Precautions)').not.toMatch(/Section 5/i);
    expect(row.fdaApproach).toMatch(/before section 1/);
  });

  it('cites the 201.57 paragraphs this repository records for each box', () => {
    expect(row.fdaApproach).toMatch(/201\.57\(a\)\(4\)/);
    expect(row.fdaApproach).toMatch(/\(c\)\(1\)/);
    expect(PLR_FORMAT_RULES.find((r) => r.id === 'plr-hl-boxed-warning')!.basis.ref).toContain('(a)(4)');
  });

  it('agrees with the FPI structure: section 1 comes first and section 5 is Warnings and Precautions', () => {
    const fpi = assessPLRStructure({ productType: 'prescription_drug', applicationType: 'NDA' }).fullPIStructure;
    expect(fpi[0].sectionNumber).toBe('1');
    expect(fpi.find((s) => s.sectionNumber === '5')?.sectionTitle).toBe('Warnings and Precautions');
  });
});
