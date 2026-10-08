// @vitest-environment jsdom
/**
 * The submission header anchors a submission that records no project
 * (P-14's remedy, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08).
 *
 * P-14 refuses a project's document placed into a submission with no project
 * (409 UNANCHORED_SUBMISSION) and says the submission is "anchored first,
 * through the Submission Center". No screen did that. Under the header of such
 * a submission there is now "Anchor to a project": the project starts unstated
 * (P-21), a reason is required, POST /api/submissions/:id/program-anchor
 * decides, and its answer is shown in the server's words. A submission that
 * has a project offers nothing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const BX256 = '099991d1-dac8-43c5-b88a-8baab26194ee';
const BX204 = '11111111-2222-3333-4444-000000000204';
const LEGACY = { id: 3, title: 'BX-204 (NDA 212345)', productName: 'BX-204', applicationType: 'nda', clientType: 'pharma',
  primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: null as string | null };
const ANCHORED = { id: 5, title: 'BX-256 IND', productName: 'BX-256', applicationType: 'ind', clientType: 'biotech',
  primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: BX256 };
const PROGRAMS = [
  { id: BX256, code: 'BX-256', title: 'BX-256 · lupus' },
  { id: BX204, code: 'BX-204', title: 'BX-204 small molecule' },
];
const REASON = 'Legacy NDA created before submissions recorded their project.';

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() }) as unknown as Response;
let subs = [LEGACY, ANCHORED];
let anchorAnswer: () => Response = () => json({ ...LEGACY, programId: BX204 });

afterEach(cleanup);
beforeEach(() => {
  subs = [{ ...LEGACY }, { ...ANCHORED }];
  anchorAnswer = () => {
    subs = subs.map((s) => (s.id === 3 ? { ...s, programId: BX204 } : s));
    return json({ ...LEGACY, programId: BX204 });
  };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions') return json(subs);
    if (method === 'GET' && url === '/api/c2c/projects') return json({ data: PROGRAMS });
    if (method === 'GET' && url === '/api/510k/estar/submissions') return json({ submissions: [] });
    if (method === 'POST' && url === '/api/510k/estar/assemble') return json({ artifactKind: 'none', blockers: [] });
    if (method === 'POST' && url === '/api/submissions/3/program-anchor') return anchorAnswer();
    return json([]);
  });
});

const anchorCalls = () => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === '/api/submissions/3/program-anchor');

async function openAnchor() {
  render(<SubmissionCenter onAsk={vi.fn()} />);
  await waitFor(() => expect(document.body.textContent).toContain('Where BX-204 (NDA 212345) stands'));
  fireEvent.click(await screen.findByRole('button', { name: 'Anchor to a project' }));
}

describe('a submission with no project is anchored from its header', () => {
  it('says the submission has no project, and the project starts unstated', async () => {
    await openAnchor();
    expect(document.body.textContent).toContain('This submission is not anchored to a project');
    const project = screen.getByLabelText('Project') as HTMLSelectElement;
    expect(project.value).toBe('');
    expect(project.options[0].textContent).toBe('Not stated — choose');
    const submit = screen.getByRole('button', { name: 'Anchor submission' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(project, { target: { value: BX204 } });
    expect(submit.disabled).toBe(true); // no reason yet
    fireEvent.change(screen.getByLabelText(/Reason for anchoring/), { target: { value: 'short' } });
    expect(submit.disabled).toBe(true);
  });

  it('anchors with the chosen project and the reason; the server confirms it and the control goes', async () => {
    await openAnchor();
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: BX204 } });
    fireEvent.change(screen.getByLabelText(/Reason for anchoring/), { target: { value: `  ${REASON}  ` } });
    fireEvent.click(screen.getByRole('button', { name: 'Anchor submission' }));
    await waitFor(() => expect(document.body.textContent).toContain('BX-204 (NDA 212345) is now anchored to Program BX-204 — server-confirmed.'));
    expect(anchorCalls().map((c) => c[2])).toEqual([{ programId: BX204, reason: REASON }]);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Anchor to a project' })).toBeNull());
  });

  it('a refusal is shown in the server’s words, and nothing is claimed', async () => {
    anchorAnswer = () =>
      json({ error: { code: 'FORBIDDEN', message: 'Only the project’s lead or an organization manager can anchor a submission to it. Nothing was changed.' } }, 403);
    await openAnchor();
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: BX204 } });
    fireEvent.change(screen.getByLabelText(/Reason for anchoring/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Anchor submission' }));
    await waitFor(() => expect(document.body.textContent).toContain('Not anchored — Only the project’s lead or an organization manager can anchor a submission to it. Nothing was changed.'));
    expect(document.body.textContent).not.toContain('server-confirmed');
    // The form stays open with what was entered, so the person can act on the refusal.
    expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe(BX204);
    expect(document.body.textContent).toContain('This submission is not anchored to a project');
  });

  it('a submission that has a project offers no anchor control', async () => {
    subs = [{ ...ANCHORED }, { ...LEGACY }];
    render(<SubmissionCenter onAsk={vi.fn()} />);
    await waitFor(() => expect(document.body.textContent).toContain('Where BX-256 IND stands'));
    expect(screen.queryByRole('button', { name: 'Anchor to a project' })).toBeNull();
    expect(document.body.textContent).not.toContain('This submission is not anchored to a project');
  });
});
