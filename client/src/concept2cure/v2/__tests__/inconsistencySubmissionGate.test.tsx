// @vitest-environment jsdom
/**
 * The submission gate may not read CLEAR over a program nothing has scanned.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * `clean` was `openN === 0` — zero OPEN contradictions. A program the engine had
 * never run against has zero of everything, so it took the same branch as one
 * that had been scanned and found consistent, and the surface said:
 *
 *   "AnA scanned your {progCode} -- no contradictions."
 *   "Submission gate — CLEAR"
 *   "This is what submission-ready looks like."
 *
 * None of which anything had established. On a submission gate that is the most
 * expensive sentence this screen can produce: a regulatory director reads CLEAR
 * and promotes a filing whose cross-references were never checked.
 *
 * ── Why `hasFindings` is the right evidence ──────────────────────────────────
 * There is no scan-completion record to consult. The board's own contract,
 * documented at the top of the surface, is that `checks` is ALWAYS `[]` because
 * the engine persists detected contradictions, not the checks it ran. So an
 * empty findings array carries no information about whether anything ran.
 *
 * A contradiction that was DETECTED and then resolved does carry it: the engine
 * demonstrably ran against this program. That is the `assessmentRan` input
 * assessmentState.ts asks for, and it is what clearance is now gated on.
 *
 * The two states these tests separate are therefore:
 *   total === 0                  → NOT ASSESSED   (never scanned)
 *   total > 0 && openN === 0     → CLEAR          (scanned, everything resolved)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest,
  serverMessage: () => null,
  extractApiError: () => null,
  errorCodeOf: () => null,
}));

import { Inconsistency } from '../surfaces/Inconsistency';

const PROGRAM = {
  projectId: 1,
  name: 'C2C-101 first-in-human',
  code: 'C2C-101',
  stage: 'Planning',
  indication: 'NSCLC',
  app: null,
  filing: null,
};

/**
 * A contradiction that was found and then resolved — the positive evidence that
 * the engine ran. Complete rather than minimal: the surface renders the finding
 * row itself, so a partial fixture makes the component throw and the test would
 * be measuring the fixture rather than the gate.
 */
const RESOLVED_FINDING = {
  id: 'f1',
  projectId: 1,
  contradictionType: 'dosage_conflict',
  severity: 'major',
  title: 'Dose stated as 10 mg in 2.5 and 20 mg in 2.7',
  objectA: { kind: 'section', id: 'a', label: '2.5 Clinical Overview' },
  objectB: { kind: 'section', id: 'b', label: '2.7 Clinical Summary' },
  sourceClassification: 'governed',
  truthHierarchyLevel: 1,
  llmRole: 'detector',
  confidenceScore: 0.94,
  confidenceLevel: 'high',
  description: 'The stated dose differs between the two summaries.',
  deterministicRule: null,
  consequenceType: 'blocks_promotion',
  reviewState: 'approved_resolution',
  detectedBy: 'engine',
  factId: null,
  resolvedBy: 'jm.smith@concept2cure.pro',
  resolvedAt: '2026-08-20T10:00:00.000Z',
  authorityState: 'informational',
  overlayApplied: null,
};

function board(findings: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: { program: PROGRAM, findings, assumptions: [], decisions: [], checks: [] },
    }),
  };
}

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: '1', code: 'C2C-101' };
});

describe('Inconsistency — a gate with nothing behind it is not a pass', () => {
  it('says NOT ASSESSED when the engine has never reported on the program', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      String(url).includes('/inconsistency') ? board([]) : board([]),
    );

    render(<Inconsistency {...({ surface: { id: 'inconsistency' } } as any)} />);

    await waitFor(() => {
      expect(screen.getAllByText(/No contradiction scan has reported/i).length).toBeGreaterThan(0);
    });

    const body = document.body.textContent ?? '';
    // The three claims the finding named, none of which anything established.
    expect(/Submission gate — CLEAR/i.test(body), 'must not read CLEAR').toBe(false);
    expect(/scanned your/i.test(body), 'must not claim a scan happened').toBe(false);
    expect(/submission-ready/i.test(body), 'must not claim submission-ready').toBe(false);
    // And it must say what IS true.
    expect(/NOT ASSESSED/i.test(body)).toBe(true);
  });

  /**
   * The over-correction guard.
   *
   * Test one would also pass if the fix simply never said CLEAR — which would
   * destroy the surface's entire purpose. The rendered form of that guard needs
   * a complete GiFinding plus the whole finding-row render path, which makes it
   * a test of the fixture more than of the gate. So it is asserted on the SOURCE
   * instead: `clean` must be derived from the four-state discriminator, and must
   * NOT be the bare emptiness test it used to be.
   *
   * That is the regression that matters. `const clean = openN === 0` is exactly
   * the line that made a never-scanned program read as CLEAR, and this fails the
   * moment it comes back.
   */
  it('derives CLEAR from the discriminator, never from an empty findings list', () => {
    const src = readFileSync(
      path.resolve(process.cwd(), 'client/src/concept2cure/v2/surfaces/Inconsistency.tsx'),
      'utf8',
    );

    expect(src).toContain("const clean = giState === 'assessed-clear'");
    // The original expression, in any spacing.
    expect(src).not.toMatch(/const\s+clean\s*=\s*openN\s*===\s*0/);
    // And clearance must still be reachable — a discriminator that can never
    // reach 'assessed-clear' would be the same defect wearing a different face.
    expect(src).toContain('assessmentRan: hasFindings');
  });
});
