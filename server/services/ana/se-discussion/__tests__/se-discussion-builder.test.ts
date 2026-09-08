/**
 * E6 — focused unit tests for the SE-discussion builder (pure, no I/O).
 *
 * Covers:
 *   - required_strings derivation from matrix facts + verdicts,
 *   - the comparison-table renderer (matrix → rows / markdown),
 *   - the honesty guard (no overall SE asserted beyond the matrix; sample /
 *     not_assessed never sealable/exportable),
 *   - the narrative reflecting matrix verdicts verbatim (no invention).
 */

import { describe, it, expect } from 'vitest';
import {
  deriveRequiredStrings,
  toComparisonTableRows,
  renderComparisonTableMarkdown,
  renderSEDiscussionMarkdown,
  buildSEDocumentPlan,
  evaluateHonesty,
  EQUIVALENCE_VERDICT_LABEL,
} from '../se-discussion-builder';
import { CLEAN_SE_MATRIX, UNRESOLVED_SE_MATRIX } from '../fixtures';

describe('deriveRequiredStrings', () => {
  it('includes the predicate K-number, predicate name, and every row fact + verdict label', () => {
    const req = deriveRequiredStrings(CLEAN_SE_MATRIX);
    expect(req).toContain('K201234');
    expect(req).toContain('MedStream Volumetric Pump');
    for (const row of CLEAN_SE_MATRIX.comparison_rows) {
      expect(req).toContain(row.characteristic);
      expect(req).toContain(row.subject_value.value);
      expect(req).toContain(row.predicate_value.value);
      expect(req).toContain(EQUIVALENCE_VERDICT_LABEL[row.equivalence_status]);
    }
  });

  it('de-duplicates repeated values (equal subject/predicate values appear once)', () => {
    const req = deriveRequiredStrings(CLEAN_SE_MATRIX);
    // "Controlled IV fluid delivery" is identical on both sides of row 1.
    const occurrences = req.filter((s) => s === 'Controlled IV fluid delivery').length;
    expect(occurrences).toBe(1);
  });

  it('carries the exact verdict labels for unresolved rows so a mismatch is detectable', () => {
    const req = deriveRequiredStrings(UNRESOLVED_SE_MATRIX);
    expect(req).toContain(EQUIVALENCE_VERDICT_LABEL.NOT_EQUIVALENT);
    expect(req).toContain('Pneumatic drive');
  });
});

describe('comparison table renderer (matrix → rows)', () => {
  it('projects one row per matrix row with the verdict label', () => {
    const rows = toComparisonTableRows(CLEAN_SE_MATRIX);
    expect(rows).toHaveLength(CLEAN_SE_MATRIX.comparison_rows.length);
    expect(rows[0]).toEqual({
      characteristic: 'Intended Use',
      subjectValue: 'Controlled IV fluid delivery',
      predicateValue: 'Controlled IV fluid delivery',
      verdict: 'Equivalent',
    });
    expect(rows[2].verdict).toBe('Discussion required');
  });

  it('renders a pipe-delimited markdown table with header + separator + one row each', () => {
    const md = renderComparisonTableMarkdown(CLEAN_SE_MATRIX);
    const lines = md.split('\n');
    expect(lines[0]).toContain('| Characteristic |');
    expect(lines[0]).toContain('AcuFlow Infusion Pump');
    expect(lines[0]).toContain('MedStream Volumetric Pump');
    expect(lines[1]).toBe('|---|---|---|---|');
    // header + separator + 4 data rows
    expect(lines).toHaveLength(2 + CLEAN_SE_MATRIX.comparison_rows.length);
  });

  it('escapes pipe characters in a value so the table grid is not broken', () => {
    const matrix = {
      ...CLEAN_SE_MATRIX,
      comparison_rows: [
        {
          ...CLEAN_SE_MATRIX.comparison_rows[0],
          subject_value: { value: 'A | B mode', evidence_ids: [], confidence: 1 },
        },
        ...CLEAN_SE_MATRIX.comparison_rows.slice(1),
      ],
    };
    const md = renderComparisonTableMarkdown(matrix);
    expect(md).toContain('A \\| B mode');
  });
});

describe('honesty guard', () => {
  it('marks an analyzed clean matrix sealable/exportable and supporting overall SE', () => {
    const h = evaluateHonesty({ matrix: CLEAN_SE_MATRIX, provenance: 'analyzed' });
    expect(h.sealable).toBe(true);
    expect(h.exportable).toBe(true);
    expect(h.supportsOverallEquivalence).toBe(true);
    expect(h.blockingReasons).toEqual([]);
  });

  it('never seals/exports a sample matrix even when internally clean', () => {
    const h = evaluateHonesty({ matrix: CLEAN_SE_MATRIX, provenance: 'sample' });
    expect(h.sealable).toBe(false);
    expect(h.exportable).toBe(false);
    expect(h.blockingReasons.join(' ')).toMatch(/sample data/i);
  });

  it('never seals/exports a not_assessed matrix', () => {
    const h = evaluateHonesty({ matrix: CLEAN_SE_MATRIX, provenance: 'not_assessed' });
    expect(h.sealable).toBe(false);
    expect(h.blockingReasons.join(' ')).toMatch(/not been assessed/i);
  });

  it('withholds overall SE when the matrix has an unresolved (NOT_EQUIVALENT) row', () => {
    const h = evaluateHonesty({ matrix: UNRESOLVED_SE_MATRIX, provenance: 'analyzed' });
    expect(h.supportsOverallEquivalence).toBe(false);
    expect(h.unresolvedCharacteristics).toContain('Energy Source');
  });

  it('blocks an empty matrix from being sealed', () => {
    const empty = { ...CLEAN_SE_MATRIX, comparison_rows: [] };
    const h = evaluateHonesty({ matrix: empty, provenance: 'analyzed' });
    expect(h.sealable).toBe(false);
    expect(h.blockingReasons.join(' ')).toMatch(/no comparison rows/i);
  });
});

describe('narrative reflects the matrix verdicts (no invention beyond matrix)', () => {
  it('asserts overall substantial equivalence only for a clean analyzed matrix', () => {
    const md = renderSEDiscussionMarkdown({ matrix: CLEAN_SE_MATRIX, provenance: 'analyzed' });
    expect(md).toMatch(/is found substantially equivalent/i);
    // It must name the predicate verbatim.
    expect(md).toContain('K201234');
    expect(md).toContain('MedStream Volumetric Pump');
    // Discussion-required characteristic surfaces as such, not as equivalent.
    expect(md).toMatch(/Discussion required/);
  });

  it('refuses to assert SE and lists the open characteristic for an unresolved matrix', () => {
    const md = renderSEDiscussionMarkdown({ matrix: UNRESOLVED_SE_MATRIX, provenance: 'analyzed' });
    expect(md).toMatch(/Substantial equivalence is NOT asserted/i);
    expect(md).toContain('Energy Source');
    expect(md).not.toMatch(/is found substantially equivalent/i);
  });

  it('adds an honesty notice (preview-only) for a sample matrix', () => {
    const md = renderSEDiscussionMarkdown({ matrix: CLEAN_SE_MATRIX, provenance: 'sample' });
    expect(md).toMatch(/Honesty notice/i);
    expect(md).toMatch(/cannot be sealed or exported/i);
  });
});

describe('SE conclusion does not contradict itself over discussion-required rows', () => {
  it('scopes the SE finding to the equivalent characteristics; the discussion-required one is not folded in', () => {
    // CLEAN_SE_MATRIX = 3 EQUIVALENT + 1 DISCUSSION_REQUIRED. The old code
    // concluded "Across all 4 characteristics ... found substantially
    // equivalent", contradicting the per-row "no conclusion of equivalence is
    // asserted for these".
    const md = renderSEDiscussionMarkdown({ matrix: CLEAN_SE_MATRIX, provenance: 'analyzed' });
    expect(md).not.toMatch(/Across all 4 characteristic/i);
    expect(md).toMatch(/for the 3 characteristics the matrix evaluated as equivalent/i);
    expect(md).toMatch(/not asserted as equivalent here/i);
    // The row-level disclaimer and the conclusion must now agree.
    expect(md).toMatch(/no\s+conclusion of equivalence is asserted for these/i);
  });

  it('still uses the unqualified "across all N" phrasing when every row is equivalent', () => {
    const allEquivalent = {
      ...CLEAN_SE_MATRIX,
      comparison_rows: CLEAN_SE_MATRIX.comparison_rows.filter(
        (r) => r.equivalence_status === 'EQUIVALENT',
      ),
    };
    const md = renderSEDiscussionMarkdown({ matrix: allEquivalent, provenance: 'analyzed' });
    expect(md).toMatch(/Across all 3 characteristics/i);
    expect(md).toMatch(/is found substantially equivalent/i);
  });
});

describe('evaluateHonesty fails closed on omitted provenance', () => {
  it('an omitted provenance is treated as not-assessed (never sealable)', () => {
    const h = evaluateHonesty({ matrix: CLEAN_SE_MATRIX }); // provenance omitted
    expect(h.sealable).toBe(false);
    expect(h.exportable).toBe(false);
    expect(h.blockingReasons.join(' ')).toMatch(/not been assessed/i);
  });
});

describe('buildSEDocumentPlan', () => {
  it('assembles a title, a body containing the narrative + comparison table, and required_strings', () => {
    const plan = buildSEDocumentPlan({ matrix: CLEAN_SE_MATRIX, provenance: 'analyzed' });
    expect(plan.title).toContain('AcuFlow Infusion Pump');
    expect(plan.title).toContain('K201234');
    expect(plan.content).toContain('Substantial Equivalence Discussion');
    expect(plan.content).toContain('| Characteristic |');
    expect(plan.requiredStrings.length).toBeGreaterThan(0);
    expect(plan.honesty.sealable).toBe(true);
  });

  it('every required string is present verbatim in the assembled body (the verification contract holds)', () => {
    const plan = buildSEDocumentPlan({ matrix: CLEAN_SE_MATRIX, provenance: 'analyzed' });
    // Normalise the body the same way the builder normalises facts (collapse
    // whitespace), mirroring the verify tool's substring check against
    // single-spaced extracted DOCX text.
    const body = plan.content.replace(/\s+/g, ' ');
    for (const s of plan.requiredStrings) {
      expect(body).toContain(s);
    }
  });
});
