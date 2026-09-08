// @vitest-environment jsdom
/**
 * The "What AnA checked" card may not report a clean cross-reference record
 * over a project nothing has scanned.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * The card's body was a two-branch conditional on `checks.length`:
 *
 *   checks.length > 0 ? <the verified list> : <EmptyState
 *     title="No contradictions across this project's governed records"
 *     hint="AnA found nothing that contradicts anything else. ..." />
 *
 * and the card itself rendered on the single condition `!hasFindings`
 * (`findings.length === 0`). Both halves of that are the same defect
 * assessmentState.ts exists to make unrepresentable:
 *
 *  • `checks` is documented in Inconsistency.tsx's own board contract as ALWAYS
 *    `[]` — the engine persists the contradictions it DETECTS, never the
 *    cross-references it verified as consistent — so the first branch is dead
 *    and the clearance copy is what always renders.
 *  • an empty findings array is the state of a scanned-and-clean project AND of
 *    a project the engine has never run against, and nothing in the block
 *    distinguished them.
 *
 * So on a never-scanned board the surface said "AnA found nothing that
 * contradicts anything else" a few elements below its own gate panel reading
 * "Submission gate — NOT ASSESSED". One screen, two opposite claims, and the
 * reassuring one is the one a regulatory director acts on.
 *
 * The signal was already in scope: `giState` / `neverScanned`, computed from the
 * same live read, and already branched on by the gate panel and the AnswerLead.
 * The card now branches on it too.
 *
 * ── What these tests drive ───────────────────────────────────────────────────
 * The real component against a mocked board read. Every assertion below reads
 * the rendered card (`.gi-checks`) or the rendered page — no source-string
 * matching except in the one place noted, where the state being asserted is not
 * reachable through a render and the comment says why.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest,
  serverMessage: () => null,
  extractApiError: () => null,
  errorCodeOf: () => null,
  redactInternals: (s: unknown) => s,
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
 * A contradiction that was DETECTED and then resolved — the board's only
 * positive evidence that the engine ever ran against this program, and so the
 * only route to `assessed-clear`. Complete rather than minimal because the
 * surface renders the finding row itself; a partial fixture would make the test
 * a measurement of the fixture.
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

function board(findings: unknown[], checks: unknown[] = []) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: { program: PROGRAM, findings, assumptions: [], decisions: [], checks },
    }),
  };
}

function mount() {
  render(<Inconsistency {...({ surface: { id: 'inconsistency' }, onAsk: vi.fn(), onNav: vi.fn() } as any)} />);
}

/** The card under test, read as the user sees it. */
function card(): string {
  return document.querySelector('.gi-checks')?.textContent ?? '';
}

/** The exact sentences the finding named. */
const CLEARANCE = /found nothing that contradicts anything else/i;
const CLEARANCE_TITLE = /No contradictions across this project's governed records/i;

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: '1', code: 'C2C-101' };
});
afterEach(() => cleanup());

describe('Inconsistency — "what AnA checked" over a board with no scan record', () => {
  it('does not report a clean cross-reference record when nothing has been checked', async () => {
    apiRequest.mockImplementation(async () => board([]));
    mount();

    await waitFor(() => expect(document.querySelector('.gi-checks')).not.toBeNull());

    // The claim that was false: the board holds no findings because nothing has
    // reported on it, not because AnA looked and found none.
    expect(CLEARANCE.test(card()), 'must not claim AnA found nothing').toBe(false);
    expect(CLEARANCE_TITLE.test(card()), 'must not claim there are no contradictions').toBe(false);
    // "AnA re-runs these checks every time content changes" is upkeep of a check
    // set that does not exist in this state.
    expect(/re-runs these checks/i.test(card()), 'must not describe upkeep of a set that does not exist').toBe(false);

    // And it must say which state IS true — silence would be its own defect.
    expect(card()).toMatch(/No contradiction scan has reported on this project/i);
    expect(card()).toMatch(/neither open nor resolved/i);
  });

  it('leaves the card agreeing with the submission gate above it', async () => {
    apiRequest.mockImplementation(async () => board([]));
    mount();

    await waitFor(() => expect(screen.getAllByText(/NOT ASSESSED/i).length).toBeGreaterThan(0));

    // The on-screen contradiction the finding described: gate NOT ASSESSED,
    // card asserting clearance, at the same moment on the same screen.
    const body = document.body.textContent ?? '';
    expect(/NOT ASSESSED/i.test(body)).toBe(true);
    expect(CLEARANCE.test(body), 'nothing on the page may claim clearance here').toBe(false);
    expect(CLEARANCE_TITLE.test(body), 'nothing on the page may claim clearance here').toBe(false);
  });

  /**
   * An in-flight read is not a result.
   *
   * `useLiveData` keeps the rows it already read while a refetch is in flight,
   * so pressing "Re-scan findings" produces a real render with
   * `loading === true` over a zero-finding board. Before the fix that render
   * took the clearance branch as well — worse, mid-scan.
   */
  it('does not resolve an in-flight re-scan into a clean result', async () => {
    let boardReads = 0;
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (String(url).includes('/inconsistency')) {
        boardReads += 1;
        if (boardReads > 1) return new Promise(() => {}); // the refetch never settles
        return board([]);
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
    });

    mount();
    await waitFor(() => expect(card()).toMatch(/No contradiction scan has reported/i));

    fireEvent.click(screen.getByRole('button', { name: /Re-scan findings/i }));

    await waitFor(() => expect(card()).toMatch(/Re-reading the contradiction board/i));
    expect(CLEARANCE.test(card()), 'a pending read must not read as clean').toBe(false);
    expect(CLEARANCE_TITLE.test(card()), 'a pending read must not read as clean').toBe(false);
  });
});

describe('Inconsistency — the reassuring state is still reachable', () => {
  /**
   * OVER-CORRECTION GUARD (rendered).
   *
   * A card that can never read clear is the same defect wearing a different
   * face. This drives the surface with the one thing that IS positive evidence
   * on this board — a contradiction the engine detected and a reviewer resolved
   * — and requires the reassuring verdict to come back.
   */
  it('still reads CLEAR when a detected contradiction has been resolved', async () => {
    apiRequest.mockImplementation(async () => board([RESOLVED_FINDING]));
    mount();

    await waitFor(() => expect(screen.getAllByText(/Submission gate — CLEAR/).length).toBeGreaterThan(0));

    const body = document.body.textContent ?? '';
    expect(/NOT ASSESSED/i.test(body), 'evidence exists — this is not the unassessed state').toBe(false);
    expect(/No contradiction scan has reported/i.test(body), 'a scan demonstrably reported').toBe(false);
  });

  /**
   * OVER-CORRECTION GUARD (source contract) — and why it is not a render.
   *
   * The card's own reassuring branch cannot be reached today, and that is a
   * property of the board rather than of the fix: the card renders only when
   * `!hasFindings`, and `assessmentRan` on this board IS `hasFindings`, so
   * `giState` inside the card is never `assessed-clear`. Rendering it would
   * mean constructing a board state the product cannot produce — a test of the
   * fixture, not of the fix.
   *
   * What matters, and what this pins, is that the clearance sentence is now
   * GATED ON THE STATE THAT WOULD EARN IT rather than deleted or left on
   * emptiness. If the board ever persists a scan record, the copy is correct
   * where it stands; if someone re-attaches it to `checks.length === 0`, this
   * fails.
   */
  it('gates the clearance sentence on assessed-clear, not on an empty list', () => {
    const src = readFileSync(
      path.resolve(process.cwd(), 'client/src/concept2cure/v2/surfaces/Inconsistency.tsx'),
      'utf8',
    );

    const idx = src.indexOf('AnA found nothing that contradicts anything else');
    expect(idx, 'the clearance copy should be kept for the state that earns it').toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, idx - 300), idx)).toContain("giState === 'assessed-clear'");

    // The honest state must be a real branch, not a reworded clearance claim.
    expect(src).toContain('No contradiction scan has reported on this project');
  });
});
