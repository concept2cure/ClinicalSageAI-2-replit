// @vitest-environment jsdom
/**
 * The Truth Engine's findings, on a screen — and the one thing the panel may
 * never say.
 *
 * ## The gap
 *
 * `GET /api/submissions/:id/consistency` returns every recorded cross-document
 * check on a submission: the dimension, the claim, the source it was checked
 * against, the verdict. The route has said so in its own comment the whole
 * time — *"No browser client calls this route today (AnA's check_consistency is
 * the reachable path)"*. So a reviewer could be told in chat that §2.7.4
 * disagrees with the CSR and then find nothing about it anywhere in Submission
 * Center. The same shape as CMC's stability trending and process capability:
 * a deterministic engine with a door only in conversation.
 *
 * Found by sweeping Submission Center's claimed prefixes the way CMC's were
 * swept (docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/pass9/).
 *
 * ## What must stay true
 *
 * **An empty table is not a finding of consistency.** Nothing compared and
 * nothing conflicting are opposite claims to a reviewer deciding whether to
 * file, and the first is the one this panel is at risk of making. Every case
 * below exists for that sentence.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionConsistency, isFindingRows, isConflict } from '../surfaces/SubmissionConsistency';

const PATH = '/api/submissions/42/consistency';
const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json }) as Response;
const thrown = (status: number) => Object.assign(new Error('Request failed'), { status });

const MATCH = {
  id: 1, dimension: 'subject-counts', leftRef: '§2.7.3 Table 4', rightRef: 'CSR-0042 §10.1',
  status: 'match', detail: null, createdAt: '2026-10-20T09:00:00.000Z',
};
const CONFLICT = {
  id: 2, dimension: 'spec-vs-qos', leftRef: '§3.2.P.5.1', rightRef: '§2.3.P',
  status: 'conflict', detail: 'Release limit 95.0–105.0 % in the specification; 90.0–110.0 % in the QOS.',
  createdAt: '2026-10-21T11:30:00.000Z',
};

function show(answer: () => Response | Promise<Response> | never) {
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) => {
    if (url !== PATH) throw new Error(`unexpected call: ${url}`);
    return answer();
  });
  return render(<SubmissionConsistency submissionId={42} />);
}

afterEach(() => cleanup());

describe('an unchecked submission is never shown as a consistent one', () => {
  it('says no check has run, and says that is not a finding of consistency', async () => {
    show(() => ok([]));
    await screen.findByTestId('consistency-none');
    expect(screen.getByText(/No consistency check has been run/i)).toBeTruthy();
    expect(screen.getByText(/not a finding of consistency/i)).toBeTruthy();
    /* The words that would be the lie. */
    expect(screen.queryByText(/no conflict/i)).toBeNull();
    expect(screen.queryByText(/consistent\b/i)).toBeNull();
  });

  it('counts what was checked rather than asserting a state', async () => {
    show(() => ok([]));
    await screen.findByTestId('consistency-none');
    expect(screen.getByText('no check recorded')).toBeTruthy();
  });

  it('tells the reader how a check is run', async () => {
    show(() => ok([]));
    await screen.findByTestId('consistency-none');
    expect(screen.getByText(/check_consistency/)).toBeTruthy();
  });
});

describe('a failed read is the failure, never an absence of conflicts', () => {
  it('reports the status the server gave and claims nothing', async () => {
    show(() => { throw thrown(500); });
    await screen.findByTestId('consistency-error');
    expect(screen.getByText(/could not be read/i)).toBeTruthy();
    expect(screen.getByText(/Nothing is being claimed about whether this submission agrees with itself/i)).toBeTruthy();
    expect(screen.queryByTestId('consistency-none')).toBeNull();
  });

  it('treats a 200 of the wrong shape as a failure too', async () => {
    /* A body that is not an array of findings is a mismatch. Rendering it as
       an empty list would be the same lie by another route. */
    show(() => ok({ findings: [] }));
    await screen.findByTestId('consistency-error');
  });

  it('guards the shape it was given', () => {
    expect(isFindingRows([MATCH, CONFLICT])).toBe(true);
    expect(isFindingRows([])).toBe(true);
    expect(isFindingRows({ rows: [] })).toBe(false);
    expect(isFindingRows([{ id: 1 }])).toBe(false);
  });
});

describe('what the findings say, said as recorded', () => {
  it('shows each check with its claim, its source and its verdict', async () => {
    show(() => ok([MATCH, CONFLICT]));
    await screen.findByTestId('submission-consistency');
    expect(screen.getByText('§2.7.3 Table 4')).toBeTruthy();
    expect(screen.getByText('CSR-0042 §10.1')).toBeTruthy();
    expect(screen.getByText('Subject counts')).toBeTruthy();
    expect(screen.getByText('Specification vs QOS')).toBeTruthy();
    expect(screen.getByText(/Release limit 95\.0–105\.0 %/)).toBeTruthy();
  });

  it('counts the conflicts and says what a conflict is', async () => {
    show(() => ok([MATCH, CONFLICT]));
    await screen.findByTestId('submission-consistency');
    await waitFor(() => expect(screen.getByText(/2 check\(s\) recorded · 1 conflict\(s\)/)).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/resolved in the documents, not here/);
  });

  it('raises no alarm when every recorded check matched', async () => {
    show(() => ok([MATCH]));
    await screen.findByTestId('submission-consistency');
    expect(screen.queryByRole('alert')).toBeNull();
    /* And still does not claim the submission is consistent — only that one
       check was recorded and it matched. */
    expect(screen.getByText(/1 check\(s\) recorded · 0 conflict\(s\)/)).toBeTruthy();
  });

  it('says a dimension absent from the table was not compared', async () => {
    show(() => ok([MATCH]));
    await screen.findByTestId('submission-consistency');
    expect(screen.getByText(/has not been compared on this submission/i)).toBeTruthy();
  });

  it('shows a status the engine did not write, rather than reinterpreting it', async () => {
    /* `status` is a text column. An unknown value is displayed as recorded and
       is not a conflict — guessing either way would be inventing a verdict. */
    show(() => ok([{ ...MATCH, status: 'superseded' }]));
    await screen.findByTestId('submission-consistency');
    expect(screen.getByText('superseded')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reads the verdict however it is cased', () => {
    for (const s of ['conflict', 'CONFLICT', ' Conflict ']) expect(isConflict(s), s).toBe(true);
    for (const s of ['match', 'MATCH', 'superseded', '']) expect(isConflict(s), s).toBe(false);
  });

  it('shows a conflict with no recorded detail as a conflict still', async () => {
    show(() => ok([{ ...CONFLICT, detail: null }]));
    await screen.findByTestId('submission-consistency');
    expect(screen.getByText(/1 conflict\(s\)/)).toBeTruthy();
  });
});

describe('the workspace contract names the route it now calls', () => {
  it('lists it under Validation, with the AnA tool that writes the findings', async () => {
    const { SUBMISSION_WORKSPACES } = await import('@shared/types/submission-ui');
    const validation = SUBMISSION_WORKSPACES.find((w) => w.id === 'validation');
    expect(validation?.endpoints).toContain('GET /api/submissions/:id/consistency');
    expect(validation?.anaTools).toContain('check_consistency');
  });
});
