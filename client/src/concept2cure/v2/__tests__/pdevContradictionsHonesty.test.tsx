// @vitest-environment jsdom
/**
 * The PDEV contradictions registry may not report a scan it cannot know about.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * The empty branch read "No contradictions detected." — a claim that a
 * detection RAN and came back clean. Nothing available to this surface
 * establishes that.
 *
 * The registry is a read over contradictionEngineService.searchFindings
 * (server/services/pdev/pdev-contradiction-bridge.ts), which returns
 * contradictions the engine has already DETECTED and persisted. So an empty
 * list is equally the shape of a program nothing has ever scanned, and the two
 * were rendered by the same branch.
 *
 * ── Why this is the narrow case, not the whole four-state one ────────────────
 * Unlike most surfaces in this audit, the caller here is already honest: PDEV's
 * App.tsx renders a failure state for `contradictions.error` and a busy state
 * for `contradictions.loading || !payload`, so neither ever reaches this
 * component. The only ambiguity left is the one this fixes — the read
 * succeeded, and returned nothing.
 *
 * The payload type is `{ contradictions: PdevContradiction[] }` and carries no
 * scan-completion signal of any kind, so per assessmentState.ts's rule there is
 * no honest route to 'assessed-clear' here: the copy states the fact and
 * declines the inference.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { PdevContradictionsSurface } from '../../pdev/surfaces/Contradictions';

const CONTRADICTION = {
  id: 'c1',
  severity: 'high' as const,
  type: 'dosage_conflict',
  objectA: '2.5 Clinical Overview',
  objectB: '2.7 Clinical Summary',
  authorityState: 'blocks_promotion' as const,
  reviewState: 'unresolved' as const,
  when: '2026-08-20T10:00:00.000Z',
  desc: 'The stated dose differs between the two summaries.',
  regulatoryBody: 'FDA',
};

const props = (contradictions: unknown[]) => ({
  programCode: 'C2C-101',
  payload: { contradictions } as never,
  onAskAna: vi.fn(),
});

afterEach(() => cleanup());

describe('PDEV contradictions — an empty registry is not a completed scan', () => {
  it('does not claim a detection ran when the registry is empty', () => {
    render(<PdevContradictionsSurface {...props([])} />);

    const body = document.body.textContent ?? '';
    // The exact claim that was unfounded.
    expect(/no contradictions detected/i.test(body), 'must not report a clean detection').toBe(false);
    // And it must say what IS true, including the disclaimer that makes the
    // empty registry interpretable.
    expect(/registry is empty/i.test(body)).toBe(true);
    expect(/does not confirm a scan has run/i.test(body)).toBe(true);
  });

  /**
   * The over-correction guard. Test one would also pass if the surface simply
   * stopped rendering contradictions at all, which would destroy its purpose.
   */
  it('still renders the registry when the engine HAS detected something', () => {
    render(<PdevContradictionsSurface {...props([CONTRADICTION])} />);

    const body = document.body.textContent ?? '';
    expect(screen.getByText(/All contradictions/i)).toBeTruthy();
    expect(/2\.5 Clinical Overview/.test(body)).toBe(true);
    // The empty-state copy must be gone in this state.
    expect(/registry is empty/i.test(body)).toBe(false);
  });
});
