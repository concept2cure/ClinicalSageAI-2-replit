/**
 * HARMONIZE reference integrity runs on the one in-text reference detector,
 * server/services/ana/in-text-references.ts (g-cross-reference-extractor-migrations).
 *
 * Before: harmonize-engine.ts checkReferences carried its own three regexes. It
 * resolved nothing — every dotted number not found in a section key became the
 * same warning, "Cross-reference to Section … — verify target exists", whether
 * the target was invented (Table 14.9.99 in a CSR, Module 2.7.9), unknowable
 * from the input (a protocol section) or not a reference at all ("per 1.5").
 * claim-evidence-engine.ts carried a fourth copy of the Table/Figure/Appendix
 * pattern.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HarmonizeEngine, type HarmonizeIssue } from '../harmonize-engine';
import { detectEvidenceStrength } from '../intelligence-engine/claim-evidence-engine';

async function references(
  sections: Record<string, string>,
  documentTypes?: Record<string, string>,
): Promise<HarmonizeIssue[]> {
  const result = await new HarmonizeEngine().check({ sections, submissionType: 'NDA', documentTypes });
  return result.issues.filter((i) => i.type === 'reference');
}

const FILLER = 'The overall conclusions are presented for the integrated programme as a whole.';

describe('HARMONIZE reference integrity uses the canonical in-text reference detector', () => {
  it('an invented CSR table is unresolved (error naming it), not "verify target exists"', async () => {
    const issues = await references(
      {
        '5.3.5.1': 'TEAEs occurred in 45% (54/120) of patients (Table 14.9.99).',
        '2.7.4': FILLER,
      },
      { '5.3.5.1': 'csr' },
    );
    const hit = issues.find((i) => i.description.includes('Table 14.9.99'));
    expect(hit, JSON.stringify(issues)).toBeDefined();
    expect(hit!.severity).toBe('error');
    expect(hit!.sectionA).toBe('5.3.5.1');
    expect(hit!.description).toMatch(/does not resolve/);
    expect(hit!.description).toMatch(/14\.1, 14\.2, 14\.3/);
    expect(issues.some((i) => /verify target exists/.test(i.description))).toBe(false);
  });

  it('a CTD code the CTD does not have is unresolved without any document type', async () => {
    const issues = await references({ '2.5': 'Exposure is summarised in Module 2.7.9.', '2.7.4': FILLER });
    const hit = issues.find((i) => i.description.includes('Module 2.7.9'));
    expect(hit, JSON.stringify(issues)).toBeDefined();
    expect(hit!.severity).toBe('error');
    expect(hit!.description).toMatch(/CTD 2\.7 has no 2\.7\.9/);
  });

  it('references that resolve raise nothing: a section key, a CTD heading, E3 sponsor numbering in a CSR', async () => {
    const issues = await references(
      {
        '2.5': 'Safety is summarised in Section 2.7.4 and Module 2.7.3.',
        '2.7.4': FILLER,
        '5.3.5.1': 'TEAEs occurred in 45% (54/120) of patients (Table 14.3.1.2; Section 12.2.2).',
      },
      { '5.3.5.1': 'csr' },
    );
    expect(issues).toEqual([]);
  });

  it('a reference nothing here can decide is an info notice that costs no score', async () => {
    const engine = new HarmonizeEngine();
    const result = await engine.check({
      sections: { '2.5': 'The primary analysis follows protocol Section 9.12 (Table 7).', '2.7.4': FILLER },
      submissionType: 'NDA',
    });
    const refs = result.issues.filter((i) => i.type === 'reference');
    expect(refs.map((i) => i.severity)).toEqual(['info', 'info']);
    expect(refs.map((i) => i.description).join(' ')).toMatch(/Section 9\.12.*protocol/);
    expect(refs.map((i) => i.description).join(' ')).toMatch(/Table 7/);
    expect(result.consistencyScore).toBe(100);
  });

  it('a number after "per" or "see" is not a cross-reference', async () => {
    const issues = await references({ '2.5': 'Dosed at 2 mg per 1.5 kg (see 2.7.4).', '2.7.4': FILLER });
    expect(issues).toEqual([]);
  });

  it('a table cited twice in one section is still noted once', async () => {
    const issues = await references({ '2.7.4': 'AEs are in Table 3; SAEs are also in Table 3.', '2.5': FILLER });
    const dup = issues.filter((i) => /referenced multiple times/.test(i.description));
    expect(dup).toHaveLength(1);
    expect(dup[0].description).toMatch(/Table 3/);
  });

  it('claim-evidence counts a listing as a data reference, through the same detector', () => {
    expect(detectEvidenceStrength('Individual values are given in Listing 16.2.7.')).toBe('partial');
  });

  it('neither engine keeps its own Table/Figure/Section reference pattern', () => {
    for (const file of ['../harmonize-engine.ts', '../intelligence-engine/claim-evidence-engine.ts']) {
      const src = readFileSync(resolve(__dirname, file), 'utf8');
      expect(src, file).toMatch(/from '(?:\.\/|(?:\.\.\/)+)ana\/in-text-references'/);
      expect(src, file).not.toMatch(/\/[^/\n]*\b(?:Table|Figure)\\s[+*]/);
    }
  });
});
