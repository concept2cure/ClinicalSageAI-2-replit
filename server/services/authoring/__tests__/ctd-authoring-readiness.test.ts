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

const m2Ready: M2QcResult = { ready: true, checked: ['2.3', '2.4'], missingSummaries: [], completenessByKey: {}, findings: [], counts: { errors: 0, warnings: 0 } };
const m2NotReady: M2QcResult = { ...m2Ready, ready: false, counts: { errors: 2, warnings: 0 } };
const m4Ready: M4QcResult = { ready: true, checked: ['TX-1'], disciplinesPresent: ['toxicology'], missingCoverage: [], findings: [], counts: { errors: 0, warnings: 1 } };
const m4NotReady: M4QcResult = { ...m4Ready, ready: false, counts: { errors: 1, warnings: 0 } };
const m5Ready: M5QcResult = { ready: true, checked: ['STUDY-1'], phasesPresent: ['1'], missingPhases: [], findings: [], counts: { errors: 0, warnings: 0 } };
const m5NotReady: M5QcResult = { ...m5Ready, ready: false, counts: { errors: 1, warnings: 0 } };
const m1Ready: M1QcResult = { ready: true, present: ['FDA_1571', 'FDA_1572', 'FDA_3674'], missingForms: [], findings: [], counts: { errors: 0, warnings: 0 } };
const m1NotReady: M1QcResult = { ...m1Ready, ready: false, counts: { errors: 1, warnings: 0 } };

function m24(inputs: string[]): M2Summary {
  return { sectionKey: '2.4', title: 'Nonclinical Overview', narrative: 'x', tables: [], inputSectionKeys: inputs, completeness: 100, gaps: [], generatedAt: new Date(0).toISOString() };
}

describe('aggregateCtdAuthoringReadiness', () => {
  it('ready when all supplied module verdicts are ready', () => {
    const res = aggregateCtdAuthoringReadiness({ m1: m1Ready, m2: m2Ready, m4: m4Ready, m5: m5Ready });
    expect(res.ready).toBe(true);
    expect(res.modules.find((m) => m.module === 'M1')?.ready).toBe(true);
    expect(res.modules.find((m) => m.module === 'M2')?.ready).toBe(true);
    expect(res.modules.find((m) => m.module === 'M5')?.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
  });

  it('not ready when the Module 1 forms verdict is not ready', () => {
    const res = aggregateCtdAuthoringReadiness({ m1: m1NotReady, m2: m2Ready, m4: m4Ready, m5: m5Ready });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.area === 'M1' && f.code === 'MODULE_NOT_READY')).toBe(true);
  });

  it('not ready when the Module 5 verdict is not ready', () => {
    const res = aggregateCtdAuthoringReadiness({ m2: m2Ready, m4: m4Ready, m5: m5NotReady });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.area === 'M5' && f.code === 'MODULE_NOT_READY')).toBe(true);
  });

  it('not ready when a module verdict is not ready', () => {
    const res = aggregateCtdAuthoringReadiness({ m2: m2NotReady, m4: m4Ready });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.area === 'M2' && f.code === 'MODULE_NOT_READY')).toBe(true);
  });

  it('rolls up errors from multiple not-ready modules', () => {
    const res = aggregateCtdAuthoringReadiness({ m2: m2NotReady, m4: m4NotReady });
    expect(res.ready).toBe(false);
    expect(res.counts.errors).toBe(2);
  });

  it('warns (non-blocking) when a module QC verdict is absent', () => {
    const res = aggregateCtdAuthoringReadiness({ m2: m2Ready });
    expect(res.modules.find((m) => m.module === 'M4')?.present).toBe(false);
    expect(res.findings.some((f) => f.code === 'MODULE_ABSENT' && f.area === 'M4')).toBe(true);
    expect(res.ready).toBe(true); // absence is a warning, not an error
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

  describe('M2.4 ← M4 feed-forward', () => {
    it('passes when every cited 4.2.x section has a corresponding report', () => {
      const res = aggregateCtdAuthoringReadiness({
        m2: m2Ready,
        m4: m4Ready,
        m24Summary: m24(['4.2.3.2', '4.2.2']),
        m4ReportSections: ['4.2.3.2', '4.2.2', '4.2.1.1'],
      });
      expect(res.findings.some((f) => f.code === 'FEED_FORWARD')).toBe(false);
      expect(res.ready).toBe(true);
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
      expect(res.ready).toBe(true);
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
});
