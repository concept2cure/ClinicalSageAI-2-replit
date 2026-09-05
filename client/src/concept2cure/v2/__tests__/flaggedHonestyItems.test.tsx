// @vitest-environment jsdom
/**
 * Two reported-but-unfixed honesty defects, each asserted from what a reader sees.
 *
 * ── Nonclinical — the SEND conformance row rendered the raw throw ────────────
 * `<span className="nc-send-f err">Not checked — {r.error}</span>`, and
 * `r.error` was `e instanceof Error ? e.message : String(e)` taken from the
 * catch around the per-study read. `apiRequest` throws `ApiRequestError` for a
 * non-2xx and that message HAS been through `extractApiError`, so it is display
 * copy. Nothing else that lands in that catch is: a fetch that never reaches
 * the server rejects with a TypeError, and any unexpected throw inside the
 * block rejects with its own. Those went to screen verbatim, on a surface whose
 * reader is a regulatory director and under a guardrail that forbids exception
 * text, routes, paths and env vars in client UI.
 *
 * ── Orchestration — a rejected payload reported as a confirmed absence ───────
 * `mapReadiness` returns null for two unrelated facts — there is no assessment,
 * and there IS a body that failed its four type checks — and the readiness view
 * had a single `!r` branch reading "No readiness evaluation yet". On a
 * submission-readiness surface that turns an unreadable response into a claim
 * about the program: nothing has assessed it. assessmentState.ts names the rule
 * this breaks — a failed read is never rendered as an empty result.
 *
 * ── Reachability ─────────────────────────────────────────────────────────────
 * Half the cases here exist to prove the fixes did not erase the branches next
 * to them. Going quiet on a failed conformance check reads as a study that
 * passed, and a surface that never says "No readiness evaluation yet" has lost
 * the one state where that sentence is true. Both are driven and both must
 * still appear, alongside the untouched success paths.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// `connected()` gates Orchestration's reads on a session token existing.
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 'test-token',
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Nonclinical } from '../surfaces/Nonclinical';
import { Orchestration } from '../surfaces/Orchestration';

const ok = (body: unknown, status = 200) => ({
  ok: true,
  status,
  headers: { get: () => null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const body = () => document.body.textContent ?? '';

afterEach(() => cleanup());

/* ══════════════════════════════════════════════════════════════════════════
   Nonclinical — a failed conformance check is reported, its exception is not
   ══════════════════════════════════════════════════════════════════════════ */

const STUDY = {
  id: 'TOX-14-002',
  type: '13-week repeat dose',
  species: 'Rat',
  dur: '13 wk',
  finding: null,
  cls: null,
  send: 'in progress',
};

/** What the per-study SEND read does. Set per test. */
let sendReadiness: () => unknown = () => ok({ riskLevel: 'low', findings: [] });

function nonclinicalRoutes(method: string, url: string) {
  if (method === 'GET' && url === '/api/nonclinical/studies') return ok([STUDY]);
  if (method === 'GET' && url.includes('/send-readiness')) return sendReadiness();
  return ok({ data: null });
}

const ncProps = () => ({
  surface: { id: 'nonclinical' },
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

/** Render, wait for the registry, and press "Run SEND conformance". */
async function runConformance() {
  render(<Nonclinical {...(ncProps() as any)} />);
  // The button is disabled until the org's registry has resolved with a study.
  const btn = await screen.findByRole('button', { name: /Run SEND conformance/ });
  await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(btn);
  await waitFor(() => expect(body()).toMatch(/SEND conformance —/));
}

describe('Nonclinical — the SEND conformance row may not render the exception', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (m: string, u: string) => nonclinicalRoutes(m, u) as unknown as Response);
    sendReadiness = () => ok({ riskLevel: 'low', findings: [] });
  });

  it('does not put a raw thrown message on screen, and still says the check did not run', async () => {
    /* Not an ApiRequestError. This is the shape the catch actually receives
       when the request never completes or the block throws on its own: a
       TypeError carrying internal text nobody outside the codebase can act on. */
    sendReadiness = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'findings') at sendReadinessProbe");
    };
    await runConformance();

    expect(body()).not.toMatch(/Cannot read properties of undefined/i);
    expect(body()).not.toMatch(/sendReadinessProbe/);
    expect(body()).not.toMatch(/TypeError/);
    // …and the failure is still visible and still attributed to its study.
    expect(body()).toMatch(/Not checked/);
    expect(body()).toMatch(/TOX-14-002/);
  });

  it('does not put a transport status on screen for the 401 branch', async () => {
    // The one non-OK status apiRequest does not throw for, whose fallback was
    // the literal string `HTTP 401`.
    sendReadiness = () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => '',
    });
    await runConformance();

    expect(body()).not.toMatch(/HTTP 401/);
    expect(body()).toMatch(/Not checked/);
  });

  it("still shows the server's own sentence when the server sent one", async () => {
    /* The over-correction guard. An ApiRequestError message has already been
       through extractApiError — it IS display copy, and blanking it would
       replace a usable reason with a generic one. */
    sendReadiness = () => {
      throw new ApiRequestError(
        'The SEND package for this study has not been provisioned.',
        409,
        {},
        'PENDING_STORE',
      );
    };
    await runConformance();

    expect(body()).toMatch(/The SEND package for this study has not been provisioned\./);
    expect(body()).toMatch(/Not checked/);
    // The machine code beside it is not copy and must not ride along.
    expect(body()).not.toMatch(/PENDING_STORE/);
  });

  it('still reports a clean check as clean', async () => {
    // The untouched success path.
    sendReadiness = () => ok({ riskLevel: 'low', findings: [] });
    await runConformance();

    expect(body()).toMatch(/No findings/);
    expect(body()).not.toMatch(/Not checked/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Orchestration — unreadable is not the same fact as not-assessed
   ══════════════════════════════════════════════════════════════════════════ */

const PID = 412;
const NOT_ASSESSED = /No readiness evaluation yet/i;
const UNREADABLE = /Couldn't read the readiness evaluation/i;

/** A real ReadinessAssessment — the shape mapReadiness accepts. */
const ASSESSMENT = {
  projectId: PID,
  organizationId: 7,
  overallScore: 74,
  status: 'at_risk',
  scores: { completeness: 80, quality: 80, compliance: 70, routing: 80, consistency: 70 },
  moduleBreakdown: [],
  documentInventory: [{ documentId: 3, title: 'CSR-9', isValidated: true }],
  blockers: [],
  recommendations: [],
  assessedAt: '2026-08-20T10:00:00Z',
};

let readiness: () => unknown = () => ok(ASSESSMENT);

function orchestrationRoutes(url: string) {
  if (url === '/api/report-os/portfolio/org') {
    return ok({ attentionRanked: [{ projectId: PID, code: 'PRG-9' }] });
  }
  if (url === '/api/orchestration/templates') return ok({ templates: [] });
  if (url === `/api/orchestration/project/${PID}`) return ok({ workflows: [] });
  if (url === '/api/orchestration/checkpoints') return ok({ data: [], meta: { count: 0 } });
  if (url === `/api/orchestration/projects/${PID}/readiness`) return readiness();
  return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ error: 'not routed' }), text: async () => '' };
}

async function openReadiness() {
  render(<Orchestration {...({ surface: 'orchestration', onAsk: () => {}, onNav: () => {}, segment: '' } as any)} />);
  fireEvent.click(await screen.findByRole('button', { name: /^Readiness$/ }));
}

describe('Orchestration — a payload it cannot read is not an absence of assessment', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, u: string) => orchestrationRoutes(u) as unknown as Response);
    readiness = () => ok(ASSESSMENT);
  });

  it('says the evaluation could not be read when the payload is rejected', async () => {
    /* A 200 that is not a ReadinessAssessment: `overallScore` arrives as a
       string, which is one of the four checks mapReadiness fails closed on.
       The trailing fields are internals the copy must not repeat. */
    readiness = () =>
      ok({
        overallScore: '74',
        status: 'at_risk',
        blockers: [],
        assessedAt: '2026-08-20T10:00:00Z',
        _source: '/api/orchestration/projects/412/readiness',
        _detail: 'relation "readiness_assessments" does not exist',
      });
    await openReadiness();

    await waitFor(() => expect(body()).toMatch(UNREADABLE));
    // The defect: this state used to be reported as a confirmed absence.
    expect(body()).not.toMatch(NOT_ASSESSED);
    // …and it does not describe the payload it failed on.
    expect(body()).not.toMatch(/relation "/);
    expect(body()).not.toMatch(/_source|_detail|overallScore/);
    expect(body()).not.toMatch(/\/api\//);
  });

  it('offers a way to re-evaluate from that state', async () => {
    readiness = () => ok({ overallScore: '74', status: 'at_risk', blockers: [], assessedAt: 'x' });
    await openReadiness();
    await waitFor(() => expect(body()).toMatch(UNREADABLE));

    const reads = () =>
      apiRequest.mock.calls.filter((c) => String(c[1]).endsWith('/readiness')).length;
    const before = reads();
    fireEvent.click(screen.getByRole('button', { name: /Re-evaluate/ }));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it('still says nothing has been evaluated when there genuinely is no evaluation', async () => {
    // The reachability guard for the branch the fix narrowed. A 204 is an
    // honest empty: the read succeeded and returned no assessment.
    readiness = () => ({ ok: true, status: 204, headers: { get: () => null }, json: async () => null, text: async () => '' });
    await openReadiness();

    await waitFor(() => expect(body()).toMatch(NOT_ASSESSED));
    expect(body()).not.toMatch(UNREADABLE);
  });

  it('still renders the score when the engine returns a real assessment', async () => {
    // The untouched normal path.
    readiness = () => ok(ASSESSMENT);
    await openReadiness();

    await waitFor(() => expect(body()).toMatch(/74%/));
    expect(body()).not.toMatch(UNREADABLE);
    expect(body()).not.toMatch(NOT_ASSESSED);
  });
});
