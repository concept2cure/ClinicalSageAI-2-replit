/**
 * CTD authoring-readiness aggregator — composes M2 + M4 QC verdicts and the
 * M2.4←M4 feed-forward link into one cross-module rollup.
 */

import { describe, it, expect } from 'vitest';
import { aggregateCtdAuthoringReadiness } from '../ctd-authoring-readiness';
import type { M2QcResult } from '../m2-summary-qc';
import type { M4QcResult } from '../m4-nonclinical-qc';
import type { M5QcResult } from '../m5-clinical-qc';
import type { M1QcResult } from '../../ind-forms/ind-form-qc';
import type { M2Summary } from '../../m2-summary-builders';
import { runM1FormsQc } from '../../ind-forms/ind-form-qc';
import { runM2SummaryQc } from '../m2-summary-qc';
import { runM4NonclinicalQc } from '../m4-nonclinical-qc';
import { runM5ClinicalQc } from '../m5-clinical-qc';

const m2Ready: M2QcResult = { ready: true, checked: ['2.3', '2.4'], missingSummaries: [], completenessByKey: {}, findings: [], counts: { errors: 0, warnings: 0 } };
const m2NotReady: M2QcResult = { ...m2Ready, ready: false, findings: [
  { summaryKey: '2.3', severity: 'error', code: 'CONTENT', message: '2.3 has no narrative.' },
  { summaryKey: '2.4', severity: 'error', code: 'CONTENT', message: '2.4 has no narrative.' },
], counts: { errors: 2, warnings: 0 } };
const m4Ready: M4QcResult = { ready: true, assessed: true, checked: ['TX-1'], disciplinesPresent: ['toxicology'], missingCoverage: [], findings: [{ studyId: 'TX-1', severity: 'warning', code: 'GLP', message: 'Study TX-1 is non-GLP.' }], counts: { errors: 0, warnings: 1 } };
const m4NotReady: M4QcResult = { ...m4Ready, ready: false, findings: [{ studyId: 'TX-1', severity: 'error', code: 'SECTION_MISSING', message: 'Study TX-1 has a missing required section.' }], counts: { errors: 1, warnings: 0 } };
const m5Ready: M5QcResult = { ready: true, assessed: true, checked: ['STUDY-1'], phasesPresent: ['1'], missingPhases: [], findings: [], counts: { errors: 0, warnings: 0 } };
const m5NotReady: M5QcResult = { ...m5Ready, ready: false, findings: [{ studyId: 'STUDY-1', severity: 'error', code: 'SECTION_EMPTY', message: 'Study STUDY-1 has an empty required section.' }], counts: { errors: 1, warnings: 0 } };
const m1Ready: M1QcResult = { ready: true, present: ['FDA_1571', 'FDA_1572', 'FDA_3674'], missingForms: [], findings: [], counts: { errors: 0, warnings: 0 } };
const m1NotReady: M1QcResult = { ...m1Ready, ready: false, findings: [{ formId: 'FDA_1571', severity: 'error', code: 'COMPLETENESS', message: 'FDA_1571 is missing a required field.' }], counts: { errors: 1, warnings: 0 } };

function m24(inputs: string[]): M2Summary {
  return { sectionKey: '2.4', title: 'Nonclinical Overview', narrative: 'x', tables: [], inputSectionKeys: inputs, completeness: 100, gaps: [], generatedAt: new Date(0).toISOString() };
}

describe('aggregateCtdAuthoringReadiness', () => {
  it('has no blocking supplied QC findings when all supplied module verdicts are clean', () => {
    const res = aggregateCtdAuthoringReadiness({ m1: m1Ready, m2: m2Ready, m4: m4Ready, m5: m5Ready });
    expect(res.ready).toBe(false);
    expect(res.suppliedQc.status).toBe('NO_BLOCKING_FINDINGS');
    expect(res.modules.find((m) => m.module === 'M1')?.ready).toBe(true);
    expect(res.modules.find((m) => m.module === 'M2')?.ready).toBe(true);
    expect(res.modules.find((m) => m.module === 'M5')?.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
  });

  it('not ready when the Module 1 forms verdict is not ready', () => {
    const res = aggregateCtdAuthoringReadiness({ m1: m1NotReady, m2: m2Ready, m4: m4Ready, m5: m5Ready });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.area === 'M1' && f.code === 'COMPLETENESS')).toBe(true);
  });

  it('not ready when the Module 5 verdict is not ready', () => {
    const res = aggregateCtdAuthoringReadiness({ m2: m2Ready, m4: m4Ready, m5: m5NotReady });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.area === 'M5' && f.code === 'SECTION_EMPTY')).toBe(true);
  });

  it('not ready when a module verdict is not ready', () => {
    const res = aggregateCtdAuthoringReadiness({ m2: m2NotReady, m4: m4Ready });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.area === 'M2' && f.code === 'CONTENT')).toBe(true);
  });

  it('rolls up errors from multiple not-ready modules', () => {
    const res = aggregateCtdAuthoringReadiness({ m2: m2NotReady, m4: m4NotReady });
    expect(res.ready).toBe(false);
    expect(res.counts.errors).toBe(3);
  });

  it('warns (non-blocking) when a module QC verdict is absent', () => {
    const res = aggregateCtdAuthoringReadiness({ m2: m2Ready });
    expect(res.modules.find((m) => m.module === 'M4')?.present).toBe(false);
    expect(res.findings.some((f) => f.code === 'MODULE_ABSENT' && f.area === 'M4')).toBe(true);
    expect(res.ready).toBe(false);
    expect(res.suppliedQc.status).toBe('NO_BLOCKING_FINDINGS'); // no invented stage-specific requirements
    expect(res.assessed).toBe(true);
  });

  it('is not ready when no module QC verdict was supplied at all', () => {
    // Absence is a warning, and only errors gated readiness, so an empty input
    // read "READY — no blocking findings" on a filing-readiness report.
    const res = aggregateCtdAuthoringReadiness({});
    expect(res.assessed).toBe(false);
    expect(res.ready).toBe(false);
    expect(res.counts.errors).toBe(0);
    expect(res.findings.filter((f) => f.code === 'MODULE_ABSENT')).toHaveLength(4);
  });

});

describe('M2.4 ← M4 feed-forward', () => {
    it('passes when every cited 4.2.x section has a corresponding report', () => {
      const res = aggregateCtdAuthoringReadiness({
        m2: m2Ready,
        m4: m4Ready,
        m24Summary: m24(['4.2.3.2', '4.2.2']),
        m4ReportSections: ['4.2.3.2', '4.2.2', '4.2.1.1'],
      });
      expect(res.findings.some((f) => f.code === 'FEED_FORWARD')).toBe(false);
      expect(res.suppliedQc.status).toBe('NO_BLOCKING_FINDINGS');
    });

    it('errors when the overview cites a section with no Module 4 report', () => {
      const res = aggregateCtdAuthoringReadiness({
        m2: m2Ready,
        m4: m4Ready,
        m24Summary: m24(['4.2.3.2', '4.2.3.4']), // 4.2.3.4 carcinogenicity not in program
        m4ReportSections: ['4.2.3.2', '4.2.2'],
      });
      expect(res.ready).toBe(false);
      const ff = res.findings.find((f) => f.code === 'FEED_FORWARD');
      expect(ff?.message).toContain('4.2.3.4');
    });

    it('a report at the module ROOT does not vouch for every 4.2.x citation', () => {
      /* THE CHECK THAT DEFEATED ITSELF. The trace test was
         `s === cited || s.startsWith(cited) || cited.startsWith(s)` — a
         BIDIRECTIONAL prefix match. The third clause lets a general section
         stand in for a specific citation, so a single report recorded at the
         bare '4.2' traced every 4.2.x citation in the overview.

         '4.2' is not a hypothetical value. `ctdSection()` in
         nonclinical-study-report-builder returns `map[studyType] ?? '4.2'`, so
         every study type outside its 17-key map — immunotoxicity,
         phototoxicity, juvenile toxicity, antigenicity, dependence, metabolite
         and impurity studies, all ordinary in a real program — lands there.
         runM4NonclinicalQc's PLACEMENT check then requires the report be filed
         at exactly that section, so the QC itself pushes '4.2' into
         m4ReportSections. From that point the feed-forward check passed over
         every citation in Module 4 and the report printed
         "READY — no blocking findings". */
      const res = aggregateCtdAuthoringReadiness({
        m2: m2Ready,
        m4: m4Ready,
        // Neither repeat-dose toxicology nor genotoxicity exists in this program.
        m24Summary: m24(['4.2.3.2', '4.2.3.3']),
        m4ReportSections: ['4.2'],
      });
      const ff = res.findings.filter((f) => f.code === 'FEED_FORWARD');
      expect(ff.map((f) => f.message).join(' ')).toContain('4.2.3.2');
      expect(ff.map((f) => f.message).join(' ')).toContain('4.2.3.3');
      expect(ff).toHaveLength(2);
      expect(res.ready).toBe(false);
    });

    it('a MORE SPECIFIC report still satisfies a broader citation', () => {
      // The other direction is legitimate and must keep working: an overview
      // citing 4.2.3.2 is answered by a report filed at 4.2.3.2.1.
      const res = aggregateCtdAuthoringReadiness({
        m2: m2Ready,
        m4: m4Ready,
        m24Summary: m24(['4.2.3.2']),
        m4ReportSections: ['4.2.3.2.1'],
      });
      expect(res.findings.some((f) => f.code === 'FEED_FORWARD')).toBe(false);
    });

    it('matches on section boundaries, not on characters', () => {
      // '4.2.3' must not be traced by a report at '4.2.30' — a raw startsWith
      // says it is.
      const res = aggregateCtdAuthoringReadiness({
        m2: m2Ready,
        m4: m4Ready,
        m24Summary: m24(['4.2.3']),
        m4ReportSections: ['4.2.30'],
      });
      expect(res.findings.some((f) => f.code === 'FEED_FORWARD')).toBe(true);
    });

    it('is skipped when the feed-forward inputs are not supplied', () => {
      const res = aggregateCtdAuthoringReadiness({ m2: m2Ready, m4: m4Ready });
      expect(res.findings.some((f) => f.code === 'FEED_FORWARD')).toBe(false);
    });
  });

describe('M2.5/2.7 ← M5 feed-forward', () => {
    const clinical = (key: string, inputs: string[]): M2Summary => ({
      sectionKey: key, title: `Module ${key}`, narrative: 'x', tables: [], inputSectionKeys: inputs, completeness: 100, gaps: [], generatedAt: new Date(0).toISOString(),
    });

    it('passes when every cited CSR exists in the M5 program', () => {
      const res = aggregateCtdAuthoringReadiness({
        m2: m2Ready,
        m5: m5Ready,
        clinicalSummaries: [clinical('2.5', ['m5.3.5/STUDY-1']), clinical('2.7', ['m5.3.5/STUDY-1'])],
        m5StudyIds: ['STUDY-1', 'STUDY-2'],
      });
      expect(res.findings.some((f) => f.code === 'FEED_FORWARD')).toBe(false);
      expect(res.suppliedQc.status).toBe('NO_BLOCKING_FINDINGS');
    });

    it('errors when a clinical summary cites a CSR with no Module 5 report', () => {
      const res = aggregateCtdAuthoringReadiness({
        m2: m2Ready,
        m5: m5Ready,
        clinicalSummaries: [clinical('2.5', ['m5.3.5/GHOST-9'])],
        m5StudyIds: ['STUDY-1'],
      });
      expect(res.ready).toBe(false);
      const ff = res.findings.find((f) => f.code === 'FEED_FORWARD');
      expect(ff?.message).toContain('GHOST-9');
      expect(ff?.area).toBe('M2.5←M5');
    });
  });

describe('supplied QC scope', () => {
  it('keeps a clean partial module useful without claiming full dossier readiness', () => {
    const res = aggregateCtdAuthoringReadiness({ m2: m2Ready });
    expect(res).toMatchObject({
      ready: false,
      assessed: true,
      scope: { kind: 'SUPPLIED_MODULE_QC', basis: 'CALLER_SUPPLIED_UNVERIFIED', suppliedModules: ['M2'], assessedModules: ['M2'], omittedModules: ['M1', 'M3', 'M4', 'M5'] },
      suppliedQc: { status: 'NO_BLOCKING_FINDINGS' },
      fullDossier: { status: 'NOT_ASSESSED' },
      scientificApproval: { status: 'NOT_ASSESSED' },
      dispatchReadiness: { status: 'NOT_ASSESSED' },
      reportQualification: { status: 'NOT_ESTABLISHED' },
    });
    expect(res.modules.find((m) => m.module === 'M3')).toMatchObject({ present: false, assessed: false });
    expect(res.findings.some((f) => f.area === 'M5' && f.severity === 'error')).toBe(false);
  });

  it('four clean caller verdicts cannot establish complete CTD readiness', () => {
    const res = aggregateCtdAuthoringReadiness({ m1: m1Ready, m2: m2Ready, m4: { ...m4Ready, findings: [], counts: { errors: 0, warnings: 0 } }, m5: m5Ready });
    expect(res.ready).toBe(false);
    expect(res).toMatchObject({ scope: { omittedModules: ['M3'] }, fullDossier: { status: 'NOT_ASSESSED' } });
  });

  it.each([
    { ready: true, counts: { errors: 1, warnings: 0 }, findings: [] },
    { ready: true, counts: { errors: 0, warnings: 0 }, findings: [{ summaryKey: '2.4', severity: 'error', code: 'CONTENT', message: 'Missing narrative.' }] },
    { ready: true, counts: { errors: 1, warnings: 0 }, findings: [{ summaryKey: '2.4', severity: 'error', code: 'CONTENT', message: 'Missing narrative.' }] },
    { ready: 'true', counts: { errors: 0, warnings: 0 }, findings: [] },
    { ready: true, counts: { errors: -1, warnings: 0 }, findings: [] },
    { ready: true, counts: { errors: 0, warnings: 0.5 }, findings: [] },
  ])('refuses contradictory or invalid supplied counts/verdicts: %j', (value) => {
    expect(() => aggregateCtdAuthoringReadiness({ m2: value as M2QcResult })).toThrow(/M2/);
  });

  it('does not treat an empty, explicitly unassessed M5 QC as an assessed module', () => {
    const res = aggregateCtdAuthoringReadiness({ m5: { ...m5Ready, assessed: false, ready: false, checked: [] } });
    expect(res.assessed).toBe(false);
    expect(res).toMatchObject({ suppliedQc: { status: 'NOT_ASSESSED' }, scope: { suppliedModules: ['M5'], assessedModules: [], unassessedModules: ['M1', 'M2', 'M3', 'M4', 'M5'] } });
  });
});

describe('supplied QC scope — canonical QC outputs', () => {
  it('retains the exact checked subsection from a legitimate partial Module 2 QC', () => {
    const qc = runM2SummaryQc({ summaries: [{ ...m24(['3.2.S']), sectionKey: '2.3' }], expectedSummaries: ['2.3'], availableUpstreamKeys: ['3.2.S'] });
    const res = aggregateCtdAuthoringReadiness({ m2: qc });
    expect(res.modules.find((module) => module.module === 'M2')).toMatchObject({ assessed: true, checkedReferences: ['2.3'], ready: true });
    expect(res.suppliedQc.status).toBe('NO_BLOCKING_FINDINGS');
    expect(res.fullDossier.status).toBe('NOT_ASSESSED');
  });

  it('preserves empty results from all four canonical QCs as unassessed inputs', () => {
    const res = aggregateCtdAuthoringReadiness({
      m1: runM1FormsQc({ forms: [], requiredForms: [] }),
      m2: runM2SummaryQc({ summaries: [], expectedSummaries: [] }),
      m4: runM4NonclinicalQc({ reports: [], expectedStudyTypes: [] }),
      m5: runM5ClinicalQc({ csrs: [] }),
    });
    expect(res.assessed).toBe(false);
    expect(res.suppliedQc.status).toBe('NOT_ASSESSED');
    expect(res.scope.assessedModules).toEqual([]);
    expect(res.modules.filter((module) => module.present).every((module) => module.checkedReferences?.length === 0)).toBe(true);
  });

  it('retains actual missing-input findings/counts without a fabricated late-stage CSR rule', () => {
    const res = aggregateCtdAuthoringReadiness({
      m1: runM1FormsQc({ forms: [] }),
      m2: runM2SummaryQc({ summaries: [] }),
      m4: runM4NonclinicalQc({ reports: [], requireCoverage: true }),
      m5: runM5ClinicalQc({ csrs: [] }),
    });
    expect(res.counts.errors).toBe(12); // 3 supplied form + 4 summary + 5 explicit nonclinical requirements
    expect(res.suppliedQc.status).toBe('BLOCKING_FINDINGS');
    expect(res.findings.filter((finding) => finding.area === 'M5' && finding.severity === 'error')).toEqual([]);
  });

  it('does not turn missing or empty feed-forward reference inputs into an assessment', () => {
    for (const input of [{ m24Summary: m24(['4.2.3.2']) }, { m24Summary: m24([]), m4ReportSections: [], clinicalSummaries: [], m5StudyIds: [] }]) {
      const res = aggregateCtdAuthoringReadiness(input);
      expect(res.feedForward.every((check) => check.status === 'NOT_ASSESSED' && check.checkedCitations === 0)).toBe(true);
    }
  });

  it.each([
    { m24Summary: { ...m24([]), inputSectionKeys: '4.2.3.2' } },
    { m24Summary: { ...m24([]), sectionKey: '2.3' } },
    { m4ReportSections: [42] },
    { clinicalSummaries: {} },
    { clinicalSummaries: [{ ...m24([]), sectionKey: '2.3' }] },
    { m5StudyIds: [''] },
  ])('refuses invalid feed-forward input instead of reporting a clean check: %j', (input) => {
    expect(() => aggregateCtdAuthoringReadiness(input as never)).toThrow();
  });
});
