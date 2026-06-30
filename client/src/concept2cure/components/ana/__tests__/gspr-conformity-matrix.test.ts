/**
 * Tests for the GSPR (EU MDR Annex I) conformity-matrix exporter (E7):
 *   - the 23-requirement checklist completeness (count + ids + ordering);
 *   - required_strings derivation from the checklist;
 *   - rendering of the conformity matrix (all 23 rows, applicability columns);
 *   - the verify pass/fail relationship — required strings vs. rendered rows;
 *   - the not_assessed / sample non-exportable guard (honesty contract).
 */
import { describe, it, expect } from 'vitest';
import {
  MDR_ANNEX_I_GSPR_CHECKLIST,
  MDR_ANNEX_I_GSPR_COUNT,
  deriveRequiredStrings,
  renderGsprConformityMarkdown,
  resolveMatrixRows,
  evaluateExportability,
  assertExportable,
  GsprNotExportableError,
  buildGsprConformityAuthoringPlan,
  type GsprMatrixInput,
} from '../gsprConformityMatrix';

/** A fully-assessed device input: all 23 clauses decided. */
function fullyAssessedInput(): GsprMatrixInput {
  return {
    deviceName: 'AcmeMonitor X1',
    rows: MDR_ANNEX_I_GSPR_CHECKLIST.map((item, i) =>
      // Make a couple not_applicable (with justification), the rest applicable.
      i % 11 === 0
        ? { id: item.id, applicability: 'not_applicable' as const, justification: 'Not an active implantable device.' }
        : {
            id: item.id,
            applicability: 'applicable' as const,
            method: 'EN ISO 14971:2019 risk management file',
            evidenceRefs: [`DOC-${item.clause}`],
          },
    ),
  };
}

describe('MDR_ANNEX_I_GSPR_CHECKLIST completeness', () => {
  it('has exactly 23 requirements', () => {
    expect(MDR_ANNEX_I_GSPR_CHECKLIST).toHaveLength(23);
    expect(MDR_ANNEX_I_GSPR_COUNT).toBe(23);
    expect(MDR_ANNEX_I_GSPR_CHECKLIST.length).toBe(MDR_ANNEX_I_GSPR_COUNT);
  });

  it('numbers the clauses 1..23 in order with GSPR-N ids', () => {
    MDR_ANNEX_I_GSPR_CHECKLIST.forEach((item, i) => {
      const n = i + 1;
      expect(item.clause).toBe(String(n));
      expect(item.id).toBe(`GSPR-${n}`);
      expect(item.title.length).toBeGreaterThan(0);
    });
  });

  it('maps the clauses to the three Annex I chapters (I:1-9, II:10-22, III:23)', () => {
    const chapterFor = (clause: number) =>
      MDR_ANNEX_I_GSPR_CHECKLIST.find(c => c.clause === String(clause))!.chapter;
    expect(chapterFor(1)).toBe('I');
    expect(chapterFor(9)).toBe('I');
    expect(chapterFor(10)).toBe('II');
    expect(chapterFor(22)).toBe('II');
    expect(chapterFor(23)).toBe('III');
  });

  it('has unique ids', () => {
    const ids = MDR_ANNEX_I_GSPR_CHECKLIST.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('deriveRequiredStrings', () => {
  it('returns all 23 clause ids in canonical order', () => {
    const required = deriveRequiredStrings();
    expect(required).toHaveLength(23);
    expect(required[0]).toBe('GSPR-1');
    expect(required[22]).toBe('GSPR-23');
    expect(required).toEqual(MDR_ANNEX_I_GSPR_CHECKLIST.map(c => c.id));
  });

  it('is independent of the device decisions (always the full checklist)', () => {
    // Even an empty device input must still require every clause string.
    expect(deriveRequiredStrings()).toHaveLength(23);
  });
});

describe('resolveMatrixRows', () => {
  it('always returns 23 rows in checklist order, defaulting missing to not_assessed', () => {
    const input: GsprMatrixInput = {
      deviceName: 'Partial',
      rows: [{ id: 'GSPR-1', applicability: 'applicable', method: 'm', evidenceRefs: ['E1'] }],
    };
    const rows = resolveMatrixRows(input);
    expect(rows).toHaveLength(23);
    expect(rows[0].row.applicability).toBe('applicable');
    expect(rows[1].row.applicability).toBe('not_assessed');
    expect(rows.map(r => r.id)).toEqual(MDR_ANNEX_I_GSPR_CHECKLIST.map(c => c.id));
  });
});

describe('renderGsprConformityMarkdown', () => {
  it('renders a table containing every required clause id verbatim', () => {
    const md = renderGsprConformityMarkdown(fullyAssessedInput());
    const required = deriveRequiredStrings();
    // This is the contract verify_docx_against_source proves: every required
    // string is present in the rendered document.
    for (const id of required) {
      expect(md).toContain(id);
    }
  });

  it('emits 23 data rows plus header + separator', () => {
    const md = renderGsprConformityMarkdown(fullyAssessedInput());
    const tableRows = md.split('\n').filter(l => l.startsWith('|'));
    // header + separator + 23 data rows
    expect(tableRows).toHaveLength(25);
  });

  it('shows the device name and Annex I reference in the heading', () => {
    const md = renderGsprConformityMarkdown(fullyAssessedInput());
    expect(md).toContain('# GSPR Conformity Matrix — AcmeMonitor X1');
    expect(md).toContain('EU MDR 2017/745, Annex I');
  });

  it('surfaces the not_applicable justification and an applicable method/evidence', () => {
    const md = renderGsprConformityMarkdown({
      deviceName: 'D',
      rows: [
        { id: 'GSPR-1', applicability: 'applicable', method: 'Bench test report', evidenceRefs: ['TR-001'] },
        { id: 'GSPR-19', applicability: 'not_applicable', justification: 'Not implantable' },
      ],
    });
    expect(md).toContain('Bench test report');
    expect(md).toContain('TR-001');
    expect(md).toContain('Not implantable');
    expect(md).toContain('Not assessed'); // the remaining clauses
  });

  it('escapes pipes in cell content so the table is not corrupted', () => {
    const md = renderGsprConformityMarkdown({
      deviceName: 'D',
      rows: [{ id: 'GSPR-1', applicability: 'applicable', method: 'A | B', evidenceRefs: ['E'] }],
    });
    expect(md).toContain('A \\| B');
  });

  it('flags a sample matrix as not-for-submission in the body', () => {
    const md = renderGsprConformityMarkdown({ deviceName: 'D', rows: [], isSample: true });
    expect(md).toContain('SAMPLE — not for submission');
  });
});

describe('verify pass/fail surfacing (required strings vs. rendered rows)', () => {
  it('a complete render satisfies all required strings', () => {
    const md = renderGsprConformityMarkdown(fullyAssessedInput());
    const missing = deriveRequiredStrings().filter(s => !md.includes(s));
    expect(missing).toEqual([]);
  });

  it('a dropped clause row is detectable as a missing required string', () => {
    // Simulate a corrupted/edited document that lost the GSPR-12 row.
    const md = renderGsprConformityMarkdown(fullyAssessedInput()).replace(/GSPR-12.*\n/, '');
    const missing = deriveRequiredStrings().filter(s => !md.includes(s));
    expect(missing).toContain('GSPR-12');
    expect(missing).toHaveLength(1);
  });
});

describe('export guard (honesty contract)', () => {
  it('blocks a sample matrix even when otherwise complete', () => {
    const input = { ...fullyAssessedInput(), isSample: true };
    const block = evaluateExportability(input);
    expect(block.exportable).toBe(false);
    if (!block.exportable) expect(block.reason).toBe('sample');
    expect(() => assertExportable(input)).toThrow(GsprNotExportableError);
  });

  it('blocks a matrix with any not_assessed clause and lists them', () => {
    const input: GsprMatrixInput = {
      deviceName: 'D',
      rows: [{ id: 'GSPR-1', applicability: 'applicable', method: 'm', evidenceRefs: ['E'] }],
    };
    const block = evaluateExportability(input);
    expect(block.exportable).toBe(false);
    if (!block.exportable) {
      expect(block.reason).toBe('not_assessed');
      expect(block.clauseIds).toContain('GSPR-2');
      expect(block.clauseIds).toHaveLength(22);
    }
    try {
      assertExportable(input);
      throw new Error('expected assertExportable to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GsprNotExportableError);
      expect((err as GsprNotExportableError).reason).toBe('not_assessed');
    }
  });

  it('allows a fully-assessed, non-sample matrix to export', () => {
    const input = fullyAssessedInput();
    expect(evaluateExportability(input)).toEqual({ exportable: true });
    expect(() => assertExportable(input)).not.toThrow();
  });
});

describe('buildGsprConformityAuthoringPlan', () => {
  it('packages the title, markdown, required strings, rows and export verdict', () => {
    const plan = buildGsprConformityAuthoringPlan(fullyAssessedInput());
    expect(plan.title).toBe('GSPR Conformity Matrix — AcmeMonitor X1');
    expect(plan.requiredStrings).toHaveLength(23);
    expect(plan.rows).toHaveLength(23);
    expect(plan.export.exportable).toBe(true);
    // The required strings are all present in the markdown it would author.
    for (const s of plan.requiredStrings) expect(plan.matrixMarkdown).toContain(s);
  });
});
