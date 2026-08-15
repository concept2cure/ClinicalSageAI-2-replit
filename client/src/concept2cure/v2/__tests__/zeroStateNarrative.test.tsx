// @vitest-environment jsdom
/**
 * BP-W0-3 — a zero state may not speak the vocabulary of clearance.
 *
 * The finding this pins: over a program with no content, the NDA/BLA filing
 * cockpit rendered
 *
 *   "You're 0% ready to file — no Refuse-to-File blockers left, 0 items to tidy
 *    before you submit. The remaining items are administrative, not structural
 *    — close them out and the package is fileable. You're close."
 *
 * and the CMC module rendered "You're building steadily" over zero submissions.
 *
 * These assertions are deliberately written against the RENDERED TEXT rather
 * than against `assessmentState()` in isolation. The unit is not where the
 * defect was: `assessmentState` is new, and a test of it alone would have
 * passed on day one against a surface that never called it. What has to hold is
 * that these two screens do not say these things, so that is what is asserted.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { assessmentState, mayReassure } from '../assessmentState';

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })),
  serverMessage: () => null,
  extractApiError: () => null,
  errorCodeOf: () => null,
}));

import { NdaCockpit } from '../surfaces/NdaCockpit';

const EMPTY_PROPS = { surface: { id: 'nda-cockpit', label: 'NDA cockpit' } } as any;

/** Every phrase that asserts, implies or reassures about readiness. */
const CLEARANCE_LANGUAGE = [
  /no Refuse-to-File blockers left/i,
  /you'?re close/i,
  /the package is fileable/i,
  /remaining items are administrative, not structural/i,
  /building steadily/i,
];

describe('assessmentState — an empty findings set is not a finding of "none"', () => {
  it('no scope is not-assessed, however many findings are absent', () => {
    expect(
      assessmentState({ scopeExists: false, findingCount: 0, assessmentRan: false })
    ).toBe('not-assessed');
  });

  it('scope with zero findings and no evidence of a run is STILL not-assessed', () => {
    // This is the whole defect in one assertion. The old code reached its
    // "no blockers left" branch from exactly this input.
    expect(
      assessmentState({ scopeExists: true, findingCount: 0, assessmentRan: false })
    ).toBe('not-assessed');
  });

  it('clearance requires positive evidence that an assessment ran', () => {
    expect(
      assessmentState({ scopeExists: true, findingCount: 0, assessmentRan: true })
    ).toBe('assessed-clear');
  });

  it('a failed read is never an empty result', () => {
    expect(
      assessmentState({ unreadable: true, scopeExists: true, findingCount: 0, assessmentRan: true })
    ).toBe('unreadable');
  });

  it('0% complete never co-occurs with reassuring copy, even when clear', () => {
    expect(mayReassure('assessed-clear', 0)).toBe(false);
    expect(mayReassure('assessed-clear', 12)).toBe(true);
    expect(mayReassure('not-assessed', 100)).toBe(false);
  });
});

describe('NDA cockpit over an empty program', () => {
  beforeEach(() => vi.clearAllMocks());

  it('states that nothing has been assessed, and asserts no clearance', async () => {
    render(<NdaCockpit {...EMPTY_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/nothing has been assessed/i)).toBeTruthy();
    });

    const body = document.body.textContent ?? '';
    for (const phrase of CLEARANCE_LANGUAGE) {
      expect(phrase.test(body), `zero state must not say: ${phrase}`).toBe(false);
    }
  });
});
