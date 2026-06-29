/**
 * Protocol SoA pure logic — matrix build + validation. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import { buildSoaMatrix, validateSoa, type SoaAssessment, type SoaVisit, type SoaCell } from '../protocol-soa-logic';

const assessments: SoaAssessment[] = [
  { id: 1, name: 'Informed consent', category: 'eligibility', orderIndex: 0 },
  { id: 2, name: 'CBC', category: 'lab', orderIndex: 1 },
  { id: 3, name: 'ECG', category: 'procedure', orderIndex: 2 },
];
const visits: SoaVisit[] = [
  { id: 10, visitName: 'Screening', timepoint: 'Day -14', orderIndex: 0 },
  { id: 11, visitName: 'Baseline', timepoint: 'Day 1', orderIndex: 1 },
  { id: 12, visitName: 'Week 4', timepoint: 'Day 28', orderIndex: 2 },
];

describe('buildSoaMatrix', () => {
  it('builds rows × ordered columns and counts marked cells', () => {
    const cells: SoaCell[] = [
      { assessmentId: 1, visitId: 10 },
      { assessmentId: 2, visitId: 10 }, { assessmentId: 2, visitId: 11 }, { assessmentId: 2, visitId: 12 },
      { assessmentId: 3, visitId: 11, required: false },
    ];
    const m = buildSoaMatrix(assessments, visits, cells);
    expect(m.columns.map((c) => c.visitId)).toEqual([10, 11, 12]); // ordered
    expect(m.totalCells).toBe(5);
    const cbc = m.rows.find((r) => r.assessmentId === 2)!;
    expect(cbc.visitCount).toBe(3);
    const ecg = m.rows.find((r) => r.assessmentId === 3)!;
    expect(ecg.cells.find((c) => c.visitId === 11)!.required).toBe(false);
    expect(ecg.cells.find((c) => c.visitId === 10)!.present).toBe(false);
  });
});

describe('validateSoa', () => {
  it('passes a well-formed grid with eligibility coverage', () => {
    const cells: SoaCell[] = [
      { assessmentId: 1, visitId: 10 }, { assessmentId: 2, visitId: 10 },
      { assessmentId: 2, visitId: 11 }, { assessmentId: 3, visitId: 11 }, { assessmentId: 2, visitId: 12 },
    ];
    const v = validateSoa(buildSoaMatrix(assessments, visits, cells), assessments);
    expect(v.valid).toBe(true);
    expect(v.emptyVisits).toEqual([]);
    expect(v.unscheduledAssessments).toEqual([]);
  });

  it('warns on empty visits and unscheduled assessments', () => {
    const cells: SoaCell[] = [{ assessmentId: 1, visitId: 10 }]; // only screening has anything; ECG/CBC unscheduled; baseline+wk4 empty
    const v = validateSoa(buildSoaMatrix(assessments, visits, cells), assessments);
    expect(v.emptyVisits.sort()).toEqual([11, 12]);
    expect(v.unscheduledAssessments.sort()).toEqual([2, 3]);
    expect(v.findings.some((f) => /no scheduled assessments/i.test(f.message))).toBe(true);
  });

  it('flags critical when there are no visits or assessments', () => {
    const v = validateSoa(buildSoaMatrix([], [], []), []);
    expect(v.valid).toBe(false);
    expect(v.findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('emits an info finding when no eligibility assessment is categorized', () => {
    const noElig: SoaAssessment[] = [{ id: 2, name: 'CBC', category: 'lab' }];
    const m = buildSoaMatrix(noElig, visits, [{ assessmentId: 2, visitId: 10 }]);
    const v = validateSoa(m, noElig);
    expect(v.findings.some((f) => f.severity === 'info' && /eligibility|screening/i.test(f.message))).toBe(true);
  });
});
