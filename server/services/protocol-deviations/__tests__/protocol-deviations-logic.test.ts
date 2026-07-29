/**
 * Protocol Deviations & CAPA pure logic — reportability assessment and the CAPA
 * closure gate. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import { assessReportability, evaluateCapaClosure } from '../protocol-deviations-logic';

describe('assessReportability', () => {
  it('makes critical deviations reportable within ~3 days', () => {
    const r = assessReportability({ severity: 'critical', category: 'procedure' });
    expect(r.reportable).toBe(true);
    expect(r.timelinessDays).toBe(3);
    expect(r.basis).toMatch(/45 CFR 46\.108/);
  });

  it('makes major deviations reportable within ~10 days', () => {
    const r = assessReportability({ severity: 'major', category: 'data' });
    expect(r.reportable).toBe(true);
    expect(r.timelinessDays).toBe(10);
  });

  it('treats safety category or affectsSafety as reportable even when minor', () => {
    expect(assessReportability({ severity: 'minor', category: 'safety' }).reportable).toBe(true);
    expect(assessReportability({ severity: 'minor', category: 'data', affectsSafety: true }).reportable).toBe(true);
    expect(assessReportability({ severity: 'minor', category: 'data', affectsSafety: true }).timelinessDays).toBe(10);
  });

  it('does not report a minor, non-safety deviation', () => {
    const r = assessReportability({ severity: 'minor', category: 'enrollment' });
    expect(r.reportable).toBe(false);
    expect(r.timelinessDays).toBe(0);
    expect(r.basis).toMatch(/ICH E6/);
  });
});

describe('evaluateCapaClosure', () => {
  it('is ready when every CAPA action is completed/verified', () => {
    const r = evaluateCapaClosure({ deviationStatus: 'capa_pending', capaActions: [{ status: 'completed' }, { status: 'verified' }] });
    expect(r.readyToClose).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('blocks when a CAPA action is still open/in_progress', () => {
    const r = evaluateCapaClosure({ deviationStatus: 'capa_pending', capaActions: [{ status: 'completed' }, { status: 'in_progress' }] });
    expect(r.readyToClose).toBe(false);
    expect(r.blockers.some((b) => /not yet completed/i.test(b))).toBe(true);
  });

  it('blocks when there are no CAPA actions', () => {
    const r = evaluateCapaClosure({ deviationStatus: 'open', capaActions: [] });
    expect(r.readyToClose).toBe(false);
    expect(r.blockers.some((b) => /No CAPA actions/i.test(b))).toBe(true);
  });

  it('blocks closing an already-closed deviation', () => {
    const r = evaluateCapaClosure({ deviationStatus: 'closed', capaActions: [{ status: 'verified' }] });
    expect(r.readyToClose).toBe(false);
    expect(r.blockers.some((b) => /already closed/i.test(b))).toBe(true);
  });
});
