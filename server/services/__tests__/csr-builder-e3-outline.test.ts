/**
 * ICH E3 outline contract for the CSR builder.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 * `ICH_E3_STRUCTURE` is the one definition of what a Clinical Study Report
 * contains on this platform: the CSR job runner drafts from a copy of it, the
 * Module 5 assembly QC derives its required-section list from it, and the
 * workflow routes serve it as the section catalog. A section missing from it is
 * missing from every CSR the platform produces — and nothing said so, because
 * the existing structure test checks for a "backbone" (efficacy, safety, study
 * population, appendices) rather than for the guideline's own numbered outline.
 *
 * Two sections of ICH E3 were absent: §9.8 (changes in the conduct of the
 * study or planned analyses — protocol amendments and SAP changes, which a
 * reviewer reads first when the analysis differs from the plan) and §12.6
 * (safety conclusions). A CSR drafted from the structure had no place for
 * either, reported every required section drafted, and passed the M5 gate.
 *
 * ── What is pinned, and what deliberately is not ──────────────────────────────
 * The guideline's numbering IS the contract, so it is asserted by number:
 * sixteen top-level sections in order, and the second-level sections E3 itself
 * enumerates for §9–§12. The synopsis (§2) and objectives (§8) children are the
 * platform's own decomposition — E3 does not number them — so their presence is
 * not pinned here. Whether §14–§16 are mandatory depends on what a given study
 * produced; that policy belongs to the M5 QC, not to this outline, so only the
 * flags E3 leaves no room on (§1–§13 required) are asserted.
 */

import { describe, it, expect } from 'vitest';
import { ICH_E3_STRUCTURE, type CSRSection } from '../csr-builder';

const E3_TOP_LEVEL = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'];

/** The second-level sections ICH E3 numbers itself. */
const E3_NUMBERED_SUBSECTIONS: Readonly<Record<string, readonly string[]>> = {
  '9': ['9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7', '9.8'],
  '10': ['10.1', '10.2'],
  '11': ['11.1', '11.2', '11.3', '11.4'],
  '12': ['12.1', '12.2', '12.3', '12.4', '12.5', '12.6'],
};

const byNumber = (n: string): CSRSection | undefined => ICH_E3_STRUCTURE.find((s) => s.number === n);

describe('ICH_E3_STRUCTURE follows the ICH E3 numbered outline', () => {
  it('carries the sixteen top-level sections, in order', () => {
    expect(ICH_E3_STRUCTURE.map((s) => s.number)).toEqual(E3_TOP_LEVEL);
  });

  it.each(Object.entries(E3_NUMBERED_SUBSECTIONS))(
    'section %s carries exactly the subsections E3 numbers under it',
    (parent, expected) => {
      const section = byNumber(parent);
      expect(section, `top-level section ${parent} missing`).toBeDefined();
      expect(
        (section!.childSections ?? []).map((c) => c.number),
        `E3 §${parent} subsections`,
      ).toEqual(expected);
    },
  );

  it('names the two sections a CSR reviewer opens when the analysis differs from the plan', () => {
    const changes = byNumber('9')!.childSections!.find((c) => c.number === '9.8');
    const safetyConclusions = byNumber('12')!.childSections!.find((c) => c.number === '12.6');
    expect(changes?.title).toMatch(/changes in the conduct/i);
    expect(safetyConclusions?.title).toMatch(/safety conclusions/i);
    expect(changes?.required).toBe(true);
    expect(safetyConclusions?.required).toBe(true);
  });

  it('marks §1–§13 required — E3 leaves no discretion on the body of the report', () => {
    for (const n of E3_TOP_LEVEL.slice(0, 13)) {
      expect(byNumber(n)?.required, `§${n} must be required`).toBe(true);
    }
  });

  it('every child number extends its parent, and no number repeats anywhere in the tree', () => {
    const seen = new Set<string>();
    for (const s of ICH_E3_STRUCTURE) {
      expect(seen.has(s.number), `duplicate section ${s.number}`).toBe(false);
      seen.add(s.number);
      for (const c of s.childSections ?? []) {
        expect(c.number.startsWith(`${s.number}.`), `${c.number} is filed under §${s.number}`).toBe(true);
        expect(seen.has(c.number), `duplicate section ${c.number}`).toBe(false);
        seen.add(c.number);
      }
    }
  });
});
