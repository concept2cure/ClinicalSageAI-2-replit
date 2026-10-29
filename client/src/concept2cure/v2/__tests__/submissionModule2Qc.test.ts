/**
 * The Module 2 QC panel trusts only the saved-content shape, and its heading
 * says what was checked, never "ready" over nothing (slice G5).
 */
import { describe, it, expect } from 'vitest';
import { isSavedModule2Qc, module2QcStatus, type SavedModule2QcView } from '../surfaces/SubmissionModule2Qc';

const view = (over: Partial<SavedModule2QcView['qc']> = {}): SavedModule2QcView => ({
  basis: 'SAVED_PROGRAM_CONTENT',
  qc: { ready: false, checked: ['2.5', '2.7'], missingSummaries: ['2.3', '2.4'], completenessByKey: {}, findings: [], counts: { errors: 2, warnings: 1 }, ...over },
  notBuilt: [{ summaryKey: '2.4', reason: 'R-1' }],
  sources: { completedCsrStudies: 1, cmcGate: 'closed', module3Sections: 0 },
});

describe('Module 2 QC panel', () => {
  it('accepts only the saved-content shape', () => {
    expect(isSavedModule2Qc(view())).toBe(true);
    expect(isSavedModule2Qc({ ...view(), basis: 'CALLER_SUPPLIED_UNVERIFIED' })).toBe(false);
    expect(isSavedModule2Qc({ qc: { ready: true } })).toBe(false);
  });

  it('never reports ready over nothing built', () => {
    expect(module2QcStatus(view({ checked: [], ready: true }))).toBe('nothing built to check');
    expect(module2QcStatus(view())).toBe('2 summary(ies) checked · 2 blocking · 1 warning(s)');
    expect(module2QcStatus(view({ ready: true, counts: { errors: 0, warnings: 0 } }))).toBe('2 summary(ies) checked · no blocking finding');
  });
});
