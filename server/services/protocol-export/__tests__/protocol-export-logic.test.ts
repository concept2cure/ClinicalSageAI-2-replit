/**
 * Protocol Export pure logic — assemble, render Markdown, and CT.gov PRS draft.
 * Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  assembleProtocolExport,
  renderProtocolMarkdown,
  buildCtGovRegistrationDraft,
  type ExportDoc,
  type ExportObjective,
  type ExportCriterion,
} from '../protocol-export-logic';

const doc: ExportDoc = { title: 'A Phase 2 Study of Drug X', protocolNumber: 'PRO-001', protocolKind: 'clinical', designType: 'interventional', phase: 'Phase 2', version: '1.0', synopsis: 'A randomized study.' };
const objectives: ExportObjective[] = [
  { objectiveType: 'primary', objective: 'Assess efficacy', endpoint: 'ORR at 24 weeks', timepoint: '24 weeks' },
  { objectiveType: 'secondary', objective: 'Assess safety', endpoint: 'AE rate', timepoint: 'EOS' },
];
const eligibility: ExportCriterion[] = [
  { kind: 'inclusion', criterion: 'Age >= 18' }, { kind: 'exclusion', criterion: 'Prior therapy' },
];
const visits = [{ visitName: 'Screening', timepoint: 'Day -14', procedures: ['Consent', 'Labs'] }];

describe('assembleProtocolExport + renderProtocolMarkdown', () => {
  it('assembles ordered parts and renders markdown with all sections', () => {
    const p = assembleProtocolExport(doc, [{ sectionKey: 'background', title: 'Background', content: 'BG', orderIndex: 1 }, { sectionKey: 'synopsis', title: 'Synopsis', content: 'S', orderIndex: 0 }], objectives, eligibility, visits);
    expect(p.sections[0].sectionKey).toBe('synopsis'); // sorted by orderIndex
    expect(p.eligibility.inclusion).toEqual(['Age >= 18']);
    const md = renderProtocolMarkdown(p);
    expect(md).toMatch(/^# A Phase 2 Study of Drug X/);
    expect(md).toMatch(/## Objectives & Endpoints/);
    expect(md).toMatch(/## Eligibility/);
    expect(md).toMatch(/## Schedule of Assessments/);
  });
});

describe('buildCtGovRegistrationDraft', () => {
  it('maps to PRS elements and is ready when primary outcome + eligibility + synopsis present', () => {
    const p = assembleProtocolExport(doc, [], objectives, eligibility, visits);
    const d = buildCtGovRegistrationDraft(p);
    expect(d.studyType).toBe('Interventional');
    expect(d.primaryOutcomes[0].measure).toBe('ORR at 24 weeks');
    expect(d.secondaryOutcomes).toHaveLength(1);
    expect(d.completeness.ready).toBe(true);
    expect(d.completeness.basis).toMatch(/FDAAA 801/);
  });

  it('flags missing primary outcome', () => {
    const p = assembleProtocolExport(doc, [], [{ objectiveType: 'secondary', objective: 'x' }], eligibility, visits);
    const d = buildCtGovRegistrationDraft(p);
    expect(d.completeness.ready).toBe(false);
    expect(d.completeness.findings.some((f) => /primary outcome/i.test(f))).toBe(true);
  });

  it('marks observational study type', () => {
    const p = assembleProtocolExport({ ...doc, designType: 'observational' }, [], objectives, eligibility, visits);
    expect(buildCtGovRegistrationDraft(p).studyType).toBe('Observational');
  });
});
