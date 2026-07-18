import { describe, it, expect } from 'vitest';
import {
  SMPC_QRD_SECTIONS,
  buildSmpcReadiness,
  isKnownSmpcSection,
  isValidSmpcStatus,
  type SmpcSectionStatus,
} from '../smpc-qrd-catalog';

describe('SmPC QRD catalog', () => {
  it('encodes the full QRD section tree with the section-4 clinical sub-sections', () => {
    const numbers = SMPC_QRD_SECTIONS.map((s) => s.number);
    expect(numbers).toEqual(
      expect.arrayContaining(['1', '2', '3', '4', '4.1', '4.8', '4.9', '5', '5.3', '6', '6.1', '7', '10']),
    );
    // 4.1 is a sub-section (depth 1), 4 is top-level (depth 0).
    expect(SMPC_QRD_SECTIONS.find((s) => s.number === '4.1')?.depth).toBe(1);
    expect(SMPC_QRD_SECTIONS.find((s) => s.number === '4')?.depth).toBe(0);
  });

  it('validates section numbers and statuses', () => {
    expect(isKnownSmpcSection('4.8')).toBe(true);
    expect(isKnownSmpcSection('99')).toBe(false);
    expect(isValidSmpcStatus('final')).toBe(true);
    expect(isValidSmpcStatus('signed')).toBe(false);
  });
});

describe('buildSmpcReadiness', () => {
  it('reports an empty label as all-missing and not ready', () => {
    const r = buildSmpcReadiness({});
    expect(r.ready).toBe(false);
    expect(r.finalRequired).toBe(0);
    expect(r.completenessPct).toBe(0);
    expect(r.sections.every((s) => s.status === 'missing')).toBe(true);
    expect(r.outstanding).toContain('4.1');
  });

  it('counts only FINAL required sections toward readiness (draft/review do not count)', () => {
    const statuses: Record<string, SmpcSectionStatus> = { '1': 'final', '2': 'final', '4.1': 'draft', '4.2': 'review' };
    const r = buildSmpcReadiness(statuses);
    expect(r.finalRequired).toBe(2);
    expect(r.ready).toBe(false);
    expect(r.outstanding).toContain('4.1'); // draft is not ready
    expect(r.outstanding).toContain('4.2'); // review is not ready
  });

  it('is ready only when every required section is final', () => {
    const all: Record<string, SmpcSectionStatus> = {};
    for (const s of SMPC_QRD_SECTIONS) if (s.required) all[s.number] = 'final';
    const r = buildSmpcReadiness(all);
    expect(r.ready).toBe(true);
    expect(r.completenessPct).toBe(100);
    expect(r.outstanding).toEqual([]);
  });

  it('non-required sections (8/9/10) do not block readiness', () => {
    const all: Record<string, SmpcSectionStatus> = {};
    for (const s of SMPC_QRD_SECTIONS) if (s.required) all[s.number] = 'final';
    // Leave 8/9/10 missing.
    const r = buildSmpcReadiness(all);
    expect(r.ready).toBe(true);
    expect(r.sections.find((s) => s.number === '10')?.status).toBe('missing');
  });
});
