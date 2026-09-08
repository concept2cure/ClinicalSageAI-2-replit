// @vitest-environment jsdom
/**
 * The surface for running workflows can run one — and says so honestly when it
 * cannot.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Five controls on Orchestration.tsx, all permanently dead:
 *   "New run"  — the PRIMARY header CTA of the whole screen, hardcoded
 *                `disabled` with no onClick at all. A user could never start a
 *                run on the surface whose entire purpose is workflow runs.
 *   "Retry"    — primary-styled, permanently greyed, handler `() => undefined`.
 *   "Replay"   — the page header advertises runs as "versioned, pausable,
 *                replayable"; this was a `noop`.
 *   "Pause" / "Resume" — `noop` behind a constant reason.
 * POST /api/orchestration/execute and GET /api/orchestration/templates both
 * existed and were mounted; the surface was ALREADY reading the templates, to
 * title the rows in its own list.
 *
 * ── What this asserts (the CHAIN, not the render) ────────────────────────────
 * That a CLICK reaches POST /api/orchestration/execute with the right body —
 * the chosen templateId and the open program's projectId — for all three of
 * New run, Retry and Replay; that the board is RE-READ afterwards rather than
 * patched with a client-built row; that a refused start is reported and creates
 * nothing; and that Pause/Resume, which genuinely have no backend, are disabled
 * with the reason stated AND carry a real disabled visual state.
 *
 * The last one is the defect being fixed, not a nicety: a `disabled` button
 * with no `:disabled` rule is pixel-identical to a live one, and "Resume"
 * carries `.pri`, so it rendered as a full accent-filled primary button that
 * still lit up on hover. jsdom applies no stylesheet, so that criterion is
 * asserted against the stylesheet source itself.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// `connected()` gates the checkpoint read on a session token existing.
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 'test-token',
}));

import { Orchestration } from '../surfaces/Orchestration';

const PID = 301;

const TEMPLATES = {
  templates: [
    {
      templateId: 'submission_readiness_review',
      name: 'Submission Readiness Review',
      description: 'Assemble context, evaluate readiness rules, summarize findings.',
    },
    { templateId: 'ind_initial_filing', name: 'IND Initial Filing' },
  ],
};

const exec = (over: Record<string, unknown>) => ({
  executionId: 'wf-x',
  templateId: 'submission_readiness_review',
  status: 'completed',
  projectId: PID,
  organizationId: 7,
  progressPercent: 100,
  startedAt: '2026-08-01T10:00:00Z',
  requestedBy: { userId: 42, userName: 'R. Patel' },
  steps: [{ stepId: 's1', name: 'Assemble cross-object context', status: 'completed' }],
  ...over,
});

/* Newest-first is how the surface sorts, so the FIRST row is the selected one.
   Each test picks its row by clicking it, so the order only has to be stable. */
const RUNS = {
  workflows: [
    exec({ executionId: 'wf-failed', status: 'failed', startedAt: '2026-08-04T10:00:00Z', progressPercent: 40 }),
    exec({ executionId: 'wf-done', status: 'completed', startedAt: '2026-08-03T10:00:00Z' }),
    exec({ executionId: 'wf-running', status: 'running', startedAt: '2026-08-02T10:00:00Z', progressPercent: 20 }),
    exec({ executionId: 'wf-paused', status: 'paused', startedAt: '2026-08-01T10:00:00Z', progressPercent: 20 }),
    // A run the engine did not record a template for: it cannot be started
    // again, and the control has to say that rather than fail on click.
    exec({ executionId: 'wf-notpl', status: 'failed', startedAt: '2026-07-31T10:00:00Z', templateId: undefined }),
  ],
};

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/** POST /execute answers recorded per test so a refusal can be injected. */
let executeReply: () => unknown = () => ok(exec({ executionId: 'wf-new', status: 'running' }));

function route(method: string, url: string) {
  if (method === 'POST' && url === '/api/orchestration/execute') return executeReply();
  if (url === '/api/report-os/portfolio/org') {
    return ok({ attentionRanked: [{ projectId: PID, code: 'PRG-1' }] });
  }
  if (url === '/api/orchestration/templates') return ok(TEMPLATES);
  if (url === `/api/orchestration/project/${PID}`) return ok(RUNS);
  if (url === '/api/orchestration/checkpoints') return ok({ data: [], meta: { count: 0 } });
  if (url === `/api/orchestration/projects/${PID}/readiness`) {
    return ok({ overallScore: 71, status: 'at_risk', blockers: [], assessedAt: '2026-08-04T10:00:00Z' });
  }
  return { ok: false, status: 404, json: async () => ({ error: 'not routed: ' + url }), text: async () => '' };
}

function mount() {
  return render(
    <Orchestration
      surface={'orchestration' as never}
      onAsk={() => {}}
      onNav={() => {}}
      segment=""
    />,
  );
}

/** The run rows are buttons carrying the execution id. */
async function selectRun(id: string) {
  const row = await screen.findByText(id);
  fireEvent.click(row.closest('button')!);
}

/** The picker's own entries. Scoped to the dialog because the run rows in the
 *  board carry the SAME template display names — an unscoped query matches both. */
async function pickTemplate(name: string) {
  const dlg = await screen.findByRole('dialog');
  fireEvent.click(within(dlg).getByText(name).closest('button')!);
}

const ctrl = (label: string) =>
  screen.getAllByRole('button').find((b) => b.textContent?.trim() === label);

const executeCalls = () =>
  apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === '/api/orchestration/execute');

const boardReads = () =>
  apiRequest.mock.calls.filter((c) => c[1] === `/api/orchestration/project/${PID}`);

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  executeReply = () => ok(exec({ executionId: 'wf-new', status: 'running' }));
  apiRequest.mockImplementation(async (m: string, url: string) => route(String(m), String(url)));
});

describe('Orchestration — "New run" starts a run', () => {
  it('opens the template picker and POSTs the chosen template with the open program', async () => {
    mount();
    const cta = await screen.findByRole('button', { name: /New run/ });
    await waitFor(() => expect((cta as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(cta);
    await pickTemplate('Submission Readiness Review');

    await waitFor(() => expect(executeCalls()).toHaveLength(1));
    expect(executeCalls()[0][2]).toEqual({
      templateId: 'submission_readiness_review',
      projectId: PID,
    });
  });

  it('re-reads the board from the engine instead of appending a client-built row', async () => {
    mount();
    const cta = await screen.findByRole('button', { name: /New run/ });
    await waitFor(() => expect((cta as HTMLButtonElement).disabled).toBe(false));
    const before = boardReads().length;

    fireEvent.click(cta);
    await pickTemplate('IND Initial Filing');

    await waitFor(() => expect(boardReads().length).toBeGreaterThan(before));
    // The picker closes only on a confirmed start.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('reports a refused start and creates nothing', async () => {
    executeReply = () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'DISPATCH_BLOCKED', message: 'This program is locked for submission.' }),
      text: async () => '',
    });
    mount();
    const cta = await screen.findByRole('button', { name: /New run/ });
    await waitFor(() => expect((cta as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(cta);
    await pickTemplate('Submission Readiness Review');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('This program is locked for submission.');
    expect(alert.textContent).toContain('No run was created');
    // The picker stays open — nothing was started, so nothing is dismissed.
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });

  it('never claims the deployment has no templates while the registry read is in flight', async () => {
    mount();
    const cta = await screen.findByRole('button', { name: /New run/ });
    // Whatever the transient state, the reason on offer is never the settled
    // claim "no templates are registered" until the read has actually settled.
    if (cta.hasAttribute('disabled')) {
      expect(cta.getAttribute('title') ?? '').not.toBe(
        'No workflow templates are registered in this deployment.',
      );
    }
    await waitFor(() => expect((cta as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('Orchestration — Retry and Replay re-run the same template', () => {
  it('Retry on a failed run POSTs that run’s template against the same program', async () => {
    mount();
    await selectRun('wf-failed');
    const retry = await waitFor(() => {
      const b = ctrl('Retry');
      expect(b).toBeTruthy();
      return b!;
    });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(retry);

    await waitFor(() => expect(executeCalls()).toHaveLength(1));
    expect(executeCalls()[0][2]).toEqual({
      templateId: 'submission_readiness_review',
      projectId: PID,
    });
  });

  it('Replay on a completed run POSTs a NEW run of the same template', async () => {
    mount();
    await selectRun('wf-done');
    const replay = await waitFor(() => {
      const b = ctrl('Replay');
      expect(b).toBeTruthy();
      return b!;
    });
    expect((replay as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(replay);

    await waitFor(() => expect(executeCalls()).toHaveLength(1));
    expect(executeCalls()[0][2]).toEqual({
      templateId: 'submission_readiness_review',
      projectId: PID,
    });
    // The completed run is left exactly as it was — no cancel, no mutation of it.
    expect(apiRequest.mock.calls.some((c) => String(c[1]).includes('/cancel/'))).toBe(false);
  });

  it('says "Starting…" while a re-run is in flight, not "Cancelling…"', async () => {
    let release: (v: unknown) => void = () => {};
    executeReply = () => new Promise((r) => { release = r; });
    mount();
    await selectRun('wf-failed');
    const retry = await waitFor(() => {
      const b = ctrl('Retry');
      expect(b).toBeTruthy();
      return b!;
    });
    fireEvent.click(retry);
    await waitFor(() => expect(ctrl('Starting…')).toBeTruthy());
    expect(ctrl('Cancelling…')).toBeUndefined();
    release(ok(exec({ executionId: 'wf-new' })));
  });

  it('refuses, with the reason stated, a run that does not record its template', async () => {
    mount();
    await selectRun('wf-notpl');
    const retry = await waitFor(() => {
      const b = ctrl('Retry');
      expect(b).toBeTruthy();
      return b!;
    });
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    expect(retry.getAttribute('title')).toMatch(/does not record which template/i);
    fireEvent.click(retry);
    expect(executeCalls()).toHaveLength(0);
  });
});

describe('Orchestration — Pause and Resume have no backend and do not pretend to', () => {
  it.each([
    ['wf-running', 'Pause'],
    ['wf-paused', 'Resume'],
  ])('%s: %s is disabled and names the reason', async (runId, label) => {
    mount();
    await selectRun(runId);
    const b = await waitFor(() => {
      const found = ctrl(label);
      expect(found).toBeTruthy();
      return found!;
    });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    const why = b.getAttribute('title') ?? '';
    // Not a placeholder and not a generic "unavailable" — the specific reason.
    expect(why).toMatch(/no pause/i);
    expect(why).toMatch(/one pass|no resumable state/i);
  });

  it('a disabled run control is visually disabled, not pixel-identical to a live one', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(path.join(here, '../styles/app-v2.css'), 'utf8');
    // The rule that makes a permanently-dead control read as dead.
    expect(css).toMatch(/\.orch-ctrl:disabled\s*\{[^}]*opacity/);
    // "Resume" carries .pri — an accent-filled primary button. Without its own
    // disabled rule it stays a full-colour CTA that can never act.
    expect(css).toMatch(/\.orch-ctrl\.pri:disabled\s*\{/);
    // ...and neither may light up on hover.
    expect(css).not.toMatch(/\.orch-ctrl:hover\s*\{/);
    expect(css).not.toMatch(/\.orch-ctrl\.pri:hover\s*\{/);
  });
});
