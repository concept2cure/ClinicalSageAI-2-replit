/**
 * useClinicalStudies adapters — the arithmetic behind the Clinical
 * studies surface.
 *
 * The surface reads trial readiness off these numbers, so the pure
 * selector/adapter functions are unit-tested directly: snake_case →
 * camelCase mapping that keeps a null count null (never a misleading
 * zero), and portfolio KPIs that sum only recorded sizes while still
 * counting every study.
 */

import { describe, it, expect } from 'vitest';
import { adaptStudy, deriveStudyKpis, type StudyRow } from '../useClinicalStudies';

function raw(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    study_id: 'CS-001',
    nct_id: null,
    title: 'Pivotal',
    phase: 'pivotal',
    study_type: 'rct',
    status: 'enrolling',
    sample_size_planned: 100,
    sample_size_enrolled: 40,
    sample_size_analyzed: null,
    ide_number: 'G210001',
    irb_approved: true,
    bimo_ready: false,
    primary_endpoint_met: null,
    start_date: '2026-01-01',
    program_id: 'p-uuid',
    ...over,
  } as Parameters<typeof adaptStudy>[0];
}

function row(over: Partial<StudyRow> = {}): StudyRow {
  return {
    id: 1,
    studyId: 'CS-001',
    nctId: null,
    title: 'Pivotal',
    phase: 'pivotal',
    studyType: 'rct',
    status: 'enrolling',
    samplePlanned: 100,
    sampleEnrolled: 40,
    sampleAnalyzed: null,
    ideNumber: 'G210001',
    irbApproved: true,
    bimoReady: false,
    primaryEndpointMet: null,
    startDate: '2026-01-01',
    programId: 'p-uuid',
    ...over,
  };
}

describe('adaptStudy', () => {
  it('maps snake_case columns to the camelCase row shape', () => {
    const r = adaptStudy(raw());
    expect(r).toMatchObject({
      id: 1,
      studyId: 'CS-001',
      title: 'Pivotal',
      phase: 'pivotal',
      studyType: 'rct',
      status: 'enrolling',
      samplePlanned: 100,
      sampleEnrolled: 40,
      ideNumber: 'G210001',
      programId: 'p-uuid',
    });
  });

  it('keeps an unrecorded count null rather than coercing it to zero', () => {
    const r = adaptStudy(raw({ sample_size_planned: null, sample_size_enrolled: null }));
    expect(r.samplePlanned).toBeNull();
    expect(r.sampleEnrolled).toBeNull();
  });

  it('coerces boolean flags strictly — only true is true', () => {
    const r = adaptStudy(raw({ irb_approved: null, bimo_ready: undefined }));
    expect(r.irbApproved).toBe(false);
    expect(r.bimoReady).toBe(false);
  });

  it('defaults a missing status to planning', () => {
    const r = adaptStudy(raw({ status: undefined }));
    expect(r.status).toBe('planning');
  });
});

describe('deriveStudyKpis', () => {
  it('is all zeros for an empty portfolio and does not divide by zero', () => {
    const k = deriveStudyKpis([]);
    expect(k).toEqual({
      total: 0,
      enrolling: 0,
      planned: 0,
      enrolled: 0,
      enrollmentPercent: 0,
      bimoReady: 0,
      irbApproved: 0,
    });
  });

  it('sums recorded sizes and computes portfolio enrollment percent', () => {
    const k = deriveStudyKpis([
      row({ samplePlanned: 100, sampleEnrolled: 40 }),
      row({ id: 2, samplePlanned: 100, sampleEnrolled: 60, status: 'follow_up' }),
    ]);
    expect(k.total).toBe(2);
    expect(k.planned).toBe(200);
    expect(k.enrolled).toBe(100);
    expect(k.enrollmentPercent).toBe(50);
  });

  it('counts enrolling and follow_up studies as active enrollment', () => {
    const k = deriveStudyKpis([
      row({ status: 'enrolling' }),
      row({ id: 2, status: 'follow_up' }),
      row({ id: 3, status: 'completed' }),
      row({ id: 4, status: 'planning' }),
    ]);
    expect(k.enrolling).toBe(2);
  });

  it('counts a study with a null planned size in total but not in the sums', () => {
    const k = deriveStudyKpis([
      row({ samplePlanned: null, sampleEnrolled: null }),
      row({ id: 2, samplePlanned: 50, sampleEnrolled: 25 }),
    ]);
    expect(k.total).toBe(2);
    expect(k.planned).toBe(50);
    expect(k.enrolled).toBe(25);
    expect(k.enrollmentPercent).toBe(50);
  });

  it('tallies BIMO-ready and IRB-approved counts', () => {
    const k = deriveStudyKpis([
      row({ bimoReady: true, irbApproved: true }),
      row({ id: 2, bimoReady: false, irbApproved: true }),
      row({ id: 3, bimoReady: true, irbApproved: false }),
    ]);
    expect(k.bimoReady).toBe(2);
    expect(k.irbApproved).toBe(2);
  });
});
