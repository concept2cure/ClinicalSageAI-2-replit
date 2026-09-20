// @vitest-environment jsdom
/**
 * DispatchReadiness — the verdict shown is the SERVER's composed gate.
 *
 * This surface used to RECOMPUTE the dispatch verdict from the server's raw
 * inputs, merging a local copy of evaluateDispatchGate with the
 * external-validation result. Two gates — while the server composes FOUR
 * (assess-dispatch-readiness.ts: structural, external, shadowPresence,
 * releaseSignature).
 *
 * So a sequence with zero validation errors, no external validator configured,
 * and ZERO completed Shadow Review runs had the server answering
 * `gate.cleared: false` — never-reviewed is UNASSESSED, not clean — while this
 * surface rendered "cleared to dispatch" and published `facts.cleared: true` to
 * AnA. That is the exact scenario assess-dispatch-readiness.ts §6b exists to
 * prevent: "a dossier that was never adversarially reviewed is transmitted to
 * the agency with a `cleared: true` verdict".
 *
 * The local copy had also drifted: it did `Number.isFinite(x) ? x : 0`, the
 * coercion the server deliberately inverted.
 *
 * These tests pin the surface to the server's verdict. They fail against the
 * recomputation.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchReadiness } from '../surfaces/DispatchReadiness';

const ok = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data: payload }) } as Response);

/**
 * Raw inputs that the OLD two-gate client math reads as CLEARED: no validation
 * errors, no unacknowledged criticals, external validation cleared. The server
 * nonetheless blocks, because no Shadow Review has ever run.
 */
const SHADOW_BLOCKED = {
  sequenceId: 7,
  region: 'fda',
  sequenceStatus: 'validated',
  validationErrors: 0,
  unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 0,
  shadowReviewMissing: true,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] },
  leafCount: 4,
  gate: {
    cleared: false,
    blockers: ['No completed Shadow Review has run for this sequence, so it has not been adversarially reviewed.'],
  },
};

function serve(assessment: unknown) {
  apiRequest.mockImplementation(async (_m: string, rawUrl: unknown) => {
    const url = String(rawUrl ?? '');
    if (url === '/api/submissions') return ok([{ id: 3, title: 'NDA 2026' }]);
    if (url === '/api/submissions/3/sequences') return ok([{ id: 7, sequenceNumber: '0001' }]);
    if (url.endsWith('/dispatch-readiness')) return ok(assessment);
    return ok([]);
  });
}

const props = () =>
  ({ surface: { id: 'dispatch-readiness', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'regulatory' });
const text = () => document.body.textContent ?? '';

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('DispatchReadiness — renders the server gate, not a local recomputation', () => {
  /* The surface's own verdict strings. The page title is always
     "Cleared to dispatch?", so the verdict must be matched on these. */
  const CLEARED = /Your sequence is\s*cleared to dispatch/i;
  const BLOCKED = /blocker[s]? stand[s]? between you and dispatch/i;

  it('does NOT clear an unreviewed sequence the server blocks', async () => {
    serve(SHADOW_BLOCKED);
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(BLOCKED));
    // Pre-fix this rendered "Your sequence is cleared to dispatch — but nothing
    // has adversarially reviewed it yet", because both LOCAL gates passed on
    // these inputs while the server's shadowPresence gate blocked.
    expect(text()).not.toMatch(CLEARED);
    // …and the server's reason is shown.
    expect(text()).toMatch(/Shadow Review/i);
  });

  it('clears only when the SERVER says every composed gate is clear', async () => {
    serve({
      ...SHADOW_BLOCKED,
      shadowReviewRunCount: 1,
      shadowReviewMissing: false,
      gate: { cleared: true, blockers: [] },
    });
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(CLEARED));
    expect(text()).not.toMatch(BLOCKED);
  });

  it('treats a response carrying no gate as UNANSWERED, never as cleared', async () => {
    const { gate: _omitted, ...noGate } = SHADOW_BLOCKED;
    serve(noGate);
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Sequence 7/));
    expect(text()).not.toMatch(CLEARED);
  });
});
