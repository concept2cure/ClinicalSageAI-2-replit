// @vitest-environment jsdom
/**
 * Two surfaces that said "nothing" where they meant "nothing was reported".
 *
 * ── ConversationThread — the draft workflow control ──────────────────────────
 * The disabled "Route to review" control read:
 *
 *   "This draft is not in the governed record, so there is nothing to route."
 *
 * That is a verdict on the governed record, asserted from the absence of one
 * SSE event. The stream emits `artifact_version_saved` only from inside
 * `if (saved.created)` in its post-processing, so it is withheld in three
 * states the client cannot tell apart: the turn is still running and the write
 * has not been attempted; the write ran and found the content hash identical to
 * the stored head, so the draft IS in the record under an id this turn was
 * never told; or the write failed. In the second the sentence was simply false.
 *
 * The surface already knew this — `conversationArtifacts`' own note refuses the
 * diagnosis in those words — and the control's reason was the one place the
 * claim survived. The evidence it is now gated on is the producing turn having
 * FINISHED, after which no further save report is coming; that is not the
 * missing id, which is the inference that caused the bug.
 *
 * ── Orchestration — the readiness findings groups ────────────────────────────
 * Both groups rendered `list.length === 0 ? "No findings in this class."`. The
 * groups are a PARTITION of one blocker list, not the output of two checks that
 * each ran, so the size of a group says nothing about whether its subject was
 * examined. The readiness engine raises a validation-class blocker only for a
 * document that CARRIES a recorded validation result, so a program in which
 * nothing has ever been validated produces zero of them — and the group headed
 * "eCTD · CDISC · hyperlink integrity" read as a clean validation pass over
 * documents no validator had ever opened.
 *
 * The evidence is the assessment's own `documentInventory`: documents
 * inventoried for the rules class, documents carrying a validation result for
 * the validation class. Neither is the emptiness of the group.
 *
 * ── Reachability ─────────────────────────────────────────────────────────────
 * Half of these cases exist to prove the reassuring branches SURVIVE. A fix
 * that simply never says "No findings in this class." would pass a
 * must-not-say test and destroy the panel. So each surface is also driven
 * through the state in which the claim is earned, and the claim must appear.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

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

/* The chat hook is replaced so the turn — and the draft it produced, and
   whether that turn has FINISHED — are inputs to this test rather than an SSE
   stream. Everything below the hook is the real surface. */
const chat = vi.hoisted(() => ({ messages: [] as unknown[], isStreaming: false }));
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: chat.messages,
    isStreaming: chat.isStreaming,
    isLoadingThread: false,
    threadId: 'thr-1',
    send: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    interject: vi.fn(),
    reset: vi.fn(),
    loadThread: vi.fn(),
    runStatus: undefined,
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import { Orchestration } from '../surfaces/Orchestration';

/* ══════════════════════════════════════════════════════════════════════════
   ConversationThread — a missing save report is not a fact about the record
   ══════════════════════════════════════════════════════════════════════════ */

const DRAFT_TITLE = 'Clinical Overview 2.5';

/** A turn that produced a draft. `over` sets whether it has finished, and
 *  whether the server got as far as reporting a stored version for it. */
const turnWithDraft = (over: Record<string, unknown> = {}) => ({
  id: 'a-1',
  role: 'assistant',
  text: 'Drafted the clinical overview.',
  groundingSources: ['CSR-201 section 7.4'],
  generatedDraft: {
    title: DRAFT_TITLE,
    content: '# Clinical Overview\n\nThe objective response rate was 42.1%.',
    documentType: 'Clinical Overview',
  },
  ...over,
});

function mountThread() {
  render(
    <ConversationThread
      {...({ onNav: () => {}, onAsk: () => {} } as any)}
    />,
  );
  // The card body — and the workflow control on it — exist only once expanded.
  fireEvent.click(screen.getByText(DRAFT_TITLE).closest('button')!);
}

const routeButton = () =>
  screen.getByText(/Route to review/).closest('button') as HTMLButtonElement;

describe('ConversationThread — the un-routable draft states what was reported', () => {
  it('does not call the draft absent from the governed record while its turn is still running', () => {
    chat.messages = [turnWithDraft({ streaming: true })];
    chat.isStreaming = true;
    mountThread();

    const btn = routeButton();
    expect(btn.disabled).toBe(true);
    // The claim the finding named. The save is emitted from the turn's
    // post-processing, so at this instant it has not been attempted yet.
    expect(btn.title).not.toMatch(/not in the governed record/i);
    expect(btn.title).toMatch(/has not been reported yet/i);
    expect(document.body.textContent ?? '').toMatch(/still running/i);
  });

  it('states only that no stored version was reported once the turn has finished', () => {
    chat.messages = [turnWithDraft({ streaming: false })];
    mountThread();

    const btn = routeButton();
    expect(btn.disabled).toBe(true);
    // Still not a diagnosis: an identical content hash leaves the draft IN the
    // record with no event emitted, and the client cannot tell that apart from
    // a failed or unattempted write.
    expect(btn.title).not.toMatch(/not in the governed record/i);
    expect(btn.title).toMatch(/No stored version was reported for this draft/i);
    // …and it no longer claims the turn is still in flight, which it is not.
    expect(btn.title).not.toMatch(/still running/i);
  });

  it('still routes a draft the server DID report a stored version for', async () => {
    chat.messages = [
      turnWithDraft({
        generatedDraft: {
          ...turnWithDraft().generatedDraft,
          artifactId: 'artifact_1755_ab12cd34',
          version: 2,
        },
      }),
    ];
    mountThread();

    // The over-correction guard: the control is live, carries no blocked
    // reason, and reaches the governed transition route.
    const btn = routeButton();
    expect(btn.disabled).toBe(false);
    expect(btn.title).toBe('');
    fireEvent.click(btn);
    await waitFor(() =>
      expect(apiRequest.mock.calls.some((c) => String(c[0]) === 'PUT')).toBe(true),
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Orchestration — an empty findings class is not a clean findings class
   ══════════════════════════════════════════════════════════════════════════ */

const PID = 301;
const CLEAR = 'No findings in this class.';

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const doc = (over: Record<string, unknown> = {}) => ({
  documentId: 12,
  title: 'CSR-201',
  type: 'csr',
  status: 'approved',
  module: 'Module 5',
  isDrafted: true,
  isValidated: false,
  isRouted: true,
  isApproved: true,
  isExportReady: true,
  criticalFindings: 0,
  ...over,
});

/** A real ReadinessAssessment, varied only in what it inventoried. */
const assessment = (documentInventory: unknown[], blockers: unknown[] = []) => ({
  projectId: PID,
  organizationId: 7,
  overallScore: 88,
  status: 'at_risk',
  scores: { completeness: 90, quality: 90, compliance: 85, routing: 90, consistency: 85 },
  moduleBreakdown: [],
  documentInventory,
  blockers,
  recommendations: [],
  assessedAt: '2026-08-20T10:00:00Z',
});

let readiness: () => unknown = () => ok(assessment([]));

function route(method: string, url: string) {
  if (url === '/api/report-os/portfolio/org') {
    return ok({ attentionRanked: [{ projectId: PID, code: 'PRG-1' }] });
  }
  if (url === '/api/orchestration/templates') return ok({ templates: [] });
  if (url === `/api/orchestration/project/${PID}`) return ok({ workflows: [] });
  if (url === '/api/orchestration/checkpoints') return ok({ data: [], meta: { count: 0 } });
  if (url === `/api/orchestration/projects/${PID}/readiness`) return readiness();
  return { ok: false, status: 404, json: async () => ({ error: 'not routed' }), text: async () => '' };
}

/** The rendered text of one findings group, heading included. */
const groupText = (label: string) => {
  const heading = Array.from(document.querySelectorAll('.orch-sec-l')).find((el) =>
    (el.textContent ?? '').startsWith(label),
  );
  return heading?.parentElement?.textContent ?? '';
};

async function openReadiness() {
  render(
    <Orchestration {...({ surface: 'orchestration', onAsk: () => {}, onNav: () => {}, segment: '' } as any)} />,
  );
  fireEvent.click(await screen.findByRole('button', { name: /^Readiness$/ }));
  await waitFor(() => expect(groupText('Validation findings')).not.toBe(''));
}

describe('Orchestration — a findings class with nothing behind it is not a pass', () => {
  it('does not report a clean validation class when no document carries a validation result', async () => {
    // Documents exist and the rules examined them; none has ever been
    // validated, so the engine could not have raised a validation blocker.
    readiness = () => ok(assessment([doc({ isValidated: false })]));
    await openReadiness();

    const validation = groupText('Validation findings');
    expect(validation).not.toContain(CLEAR);
    expect(validation).toMatch(/carries a recorded validation result/i);
    expect(validation).toMatch(/not a clean validation pass/i);
  });

  it('still reports the rules class clear in that same render', async () => {
    // The over-correction guard, and the proof that the two classes are judged
    // on their own evidence rather than on one shared flag: the rules DID have
    // documents to examine and raised nothing.
    readiness = () => ok(assessment([doc({ isValidated: false })]));
    await openReadiness();

    expect(groupText('Rules-based findings')).toContain(CLEAR);
  });

  it('reports the validation class clear once documents carry validation results', async () => {
    readiness = () => ok(assessment([doc({ isValidated: true, validationScore: 96 })]));
    await openReadiness();

    expect(groupText('Validation findings')).toContain(CLEAR);
    expect(groupText('Rules-based findings')).toContain(CLEAR);
  });

  it('reports neither class clear when the evaluation inventoried nothing', async () => {
    readiness = () => ok(assessment([]));
    await openReadiness();

    expect(groupText('Rules-based findings')).not.toContain(CLEAR);
    expect(groupText('Rules-based findings')).toMatch(/nothing to examine/i);
    expect(groupText('Validation findings')).not.toContain(CLEAR);
  });

  it('shows the class its findings when the assessment produced some', async () => {
    readiness = () =>
      ok(
        assessment(
          [doc({ isValidated: true, criticalFindings: 2 })],
          [
            {
              severity: 'critical',
              category: 'validation_failure',
              message: 'CSR-201 has 2 critical validation finding(s)',
              targetTitle: 'CSR-201',
              suggestedResolution: 'Resolve the critical findings before promoting the document',
            },
          ],
        ),
      );
    await openReadiness();

    const validation = groupText('Validation findings');
    expect(validation).not.toContain(CLEAR);
    expect(validation).toContain('CSR-201 has 2 critical validation finding(s)');
  });
});

afterEach(() => cleanup());
beforeEach(() => {
  chat.messages = [];
  chat.isStreaming = false;
  readiness = () => ok(assessment([]));
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 12, title: 'BX-204' };
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'new' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (m: string, url: string) => route(String(m), String(url)));
});
