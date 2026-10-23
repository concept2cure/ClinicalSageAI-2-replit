// @vitest-environment jsdom
/**
 * The New project wizard when creation refuses the filing (FILING_SPINE F19b).
 *
 * POST /api/c2c/projects answers 422 FILING_NOT_OFFERED, with the market
 * verdict's reason, for a filing the product does not offer in that market. The
 * picker hides those filings, but the refusal is still reachable: the scaffold
 * reads the pack at creation, after the picker read, so a pack retired in
 * between is refused then. The same request gets the same answer, so "Try
 * again" cannot do its job. Before this file: the wizard showed the reason under
 * "The project was not created" with a "Try again" button that re-sent it.
 *
 * Now: the reason, a title that says the filing is not offered, and one way
 * out, "Choose another filing", which returns to step 1 without sending again.
 */
import React from 'react';
import { intakeFixtureRequest, waitForIntakeWorkspace } from './projectIntakeFixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...args: unknown[]) => intakeFixtureRequest(apiRequest, args),
}));
vi.mock('../surfaces/AnaVerbs', () => ({
  RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('ca_nds')}>Pick NDS</button>
  ),
}));
vi.mock('../surfaces/RegistryBridge', () => ({
  getSubmissionTypeContext: () => ({
    id: 'ca_nds', displayName: 'New Drug Submission', pathwayKey: 'ctd',
    agency: 'Health Canada', region: 'CA', submissionFormat: 'eCTD',
  }),
}));

import { ApiRequestError } from '@/lib/queryClient';
import { NewProjectWizard } from '../surfaces/Projects';

const REASON = 'Health Canada has no governed NDA outline here, so a project would have nothing to author and no channel to send it.';

async function advanceToCreate() {
  fireEvent.click(screen.getByRole('button', { name: /pick nds/i }));
  fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
  await waitForIntakeWorkspace();
  fireEvent.change(await screen.findByRole('textbox', { name: /project name/i }), { target: { value: 'BX-204 Canada' } });
  fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
  return screen.findByRole('button', { name: /create project/i });
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('New project wizard — a filing creation refuses', () => {
  it('states the reason, offers no "Try again", and "Choose another filing" returns to step 1 without sending again', async () => {
    apiRequest.mockRejectedValue(new ApiRequestError(REASON, 422, { error: 'FILING_NOT_OFFERED', message: REASON }, 'FILING_NOT_OFFERED'));
    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    const create = await advanceToCreate();
    await act(async () => { fireEvent.click(create); });
    const outcome = await screen.findByTestId('new-project-outcome');
    expect(outcome.textContent).toContain('This filing is not offered here');
    expect(outcome.textContent).toContain(REASON);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    const sent = apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && path === '/api/c2c/projects').length;
    fireEvent.click(screen.getByRole('button', { name: 'Choose another filing' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /pick nds/i })).toBeTruthy());
    expect(screen.queryByTestId('new-project-outcome')).toBeNull();
    expect(apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && path === '/api/c2c/projects').length).toBe(sent);
  });

  it('another confirmed refusal keeps "Try again"', async () => {
    apiRequest.mockRejectedValue(new ApiRequestError('The project name is already in use.', 409));
    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    const create = await advanceToCreate();
    await act(async () => { fireEvent.click(create); });
    await screen.findByTestId('new-project-outcome');
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose another filing' })).toBeNull();
  });
});
