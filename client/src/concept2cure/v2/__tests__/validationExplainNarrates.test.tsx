// @vitest-environment jsdom
/**
 * The Validation tab's "Explain the findings (AI)": the findings and their
 * severities are the validator's, and the model's prose is labelled as the
 * model's (CLAUDE.md Rule 2; filing-spine design review 2026-10-08, open item 2).
 *
 * The panel printed "Blocking." from the model's own `blocking` flag, and a
 * severity chip from the model's echo of each finding, with no model label: a
 * verdict from a model on the screen that decides dispatch. The server now
 * returns the model's prose bound to the validator's findings
 * (submission-ai-service.ts explainValidation), and the panel shows it under
 * its label; with no model, the findings stand and the panel says why.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ValidationWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const CLEAR = { cleared: true, blockers: [] };
const BLOCKED = { cleared: false, blockers: ['1 open error-severity validation finding(s) must be resolved before dispatch.'] };
const ASSESSMENT = {
  sequenceId: 21, region: 'fda', sequenceStatus: 'draft', validationErrors: 1, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, gate: BLOCKED, freezeGate: BLOCKED, dispatchGateOnSigning: CLEAR,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  readiness: {
    errors: 1, warnings: 1, infos: 0,
    findings: [
      { code: 'MISSING_REQUIRED_SECTION', severity: 'error', message: 'm1.2 is missing', sectionCode: 'm1.2' },
      { code: 'LEAF_TITLE_EMPTY', severity: 'warning', message: 'A leaf has no title', sectionCode: 'm2.5' },
    ],
  },
  leafCount: 6, signer: { state: 'independent', sources: [] }, validatedStage: { holds: true, verdictRecorded: true },
};
const LABEL = "Model narrative — advisory only. The findings and their severities are the deterministic validator's; the model explains each one in plain language, changes none, and decides nothing about dispatch.";
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, headers: new Headers() }) as unknown as Response;

function serve(explainReply: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') return ok(ASSESSMENT);
    if (method === 'POST' && url === '/api/submissions/7/validation/explain') return ok(explainReply);
    return ok([]);
  });
}

async function explain() {
  render(<ValidationWorkspace sub={{ id: 7 } as never} seq={{ id: 21, sequenceNumber: '0000', region: 'fda', status: 'draft' } as never} />);
  fireEvent.click(await screen.findByRole('button', { name: /Explain the findings \(AI\)/ }));
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe("Validation explain: the validator's verdict, the model's prose", () => {
  it('shows the explanation under its model label, with each severity from the validator, and no "Blocking."', async () => {
    serve({
      narrative: {
        source: 'model', label: LABEL, promptVersion: 'validation-explain@v1.1',
        summary: 'One section is missing and one leaf needs a title.',
        explained: [
          { index: 0, ruleId: 'MISSING_REQUIRED_SECTION', severity: 'error', leaf: 'm1.2', cause: 'The cover letter is not in the sequence.', fix: 'Place the cover letter at 1.2.' },
        ],
      },
      narrativeUnavailable: null,
    });
    await explain();
    const note = await screen.findByRole('note');
    expect(note.textContent).toContain(LABEL);
    expect(note.textContent).toContain('One section is missing and one leaf needs a title.');
    expect(note.textContent).toContain('The cover letter is not in the sequence.');
    expect(note.textContent).toContain('Fix: Place the cover letter at 1.2.');
    expect(document.body.textContent).not.toMatch(/Blocking\./);
  });

  it('with no model, the findings stand and the panel says why', async () => {
    serve({ narrative: null, narrativeUnavailable: { code: 'PROVIDER_UNAVAILABLE', message: 'No AI provider is configured.' } });
    await explain();
    await waitFor(() => expect(document.body.textContent).toContain('No model explanation: No AI provider is configured.'));
    expect(document.body.textContent).toContain('MISSING_REQUIRED_SECTION');
  });

  it("an old-shape reply carrying the model's own blocking flag is not shown as a verdict", async () => {
    serve({ blocking: true, summary: 'Blocked.', explained: [{ ruleId: 'X', severity: 'error', leaf: null, cause: 'c', fix: 'f' }] });
    await explain();
    await waitFor(() => expect(document.body.textContent).toMatch(/could not be explained/));
    expect(document.body.textContent).not.toMatch(/Blocking\./);
  });
});
