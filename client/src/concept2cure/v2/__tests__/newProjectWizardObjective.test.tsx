// @vitest-environment jsdom
/**
 * New project asks for the project's objective (optional), shows it on the
 * review, and records it as the project's objective of record once the project
 * is confirmed created (S1, P-80: PUT /api/charters/by-project/:id/objectives).
 * It is a second write, so a refusal is said and the project still exists.
 */
import React from 'react';
import { intakeFixtureRequest, waitForIntakeWorkspace } from './projectIntakeFixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...args: unknown[]) => intakeFixtureRequest(apiRequest, args),
}));
vi.mock('../surfaces/AnaVerbs', () => ({
  RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('us_ind')}>Pick IND</button>
  ),
}));
vi.mock('../surfaces/RegistryBridge', () => ({
  getSubmissionTypeContext: () => ({ id: 'us_ind', displayName: 'Investigational New Drug Application', pathwayKey: 'ind',
    agency: 'FDA', region: 'US', submissionFormat: 'eCTD' }),
}));

import { NewProjectWizard } from '../surfaces/Projects';

const ID = 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05';
const OBJECTIVE = 'Show HLV-334 is safe at the proposed doses, and open the IND.';
const reviewValue = (term: string) =>
  Array.from(document.querySelectorAll('.npw-review-row')).find((r) => r.querySelector('dt')?.textContent === term)
    ?.querySelector('dd')?.textContent ?? null;

afterEach(() => { cleanup(); apiRequest.mockReset(); });

async function createWith(objective: string, objectiveAnswer: { ok: boolean; status: number; body: unknown }) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'PUT' && path.startsWith('/api/charters/')) {
      return { ok: objectiveAnswer.ok, status: objectiveAnswer.status, json: async () => objectiveAnswer.body };
    }
    return { ok: true, status: 201, json: async () => ({ data: { id: ID, title: 'HLV-334 — IND', code: 'HLV-334' }, meta: {} }) };
  });
  render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /pick ind/i }));
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  await waitForIntakeWorkspace();
  fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'HLV-334 — IND' } });
  fireEvent.change(screen.getByRole('combobox', { name: /product type/i }), { target: { value: 'drug' } });
  fireEvent.change(screen.getByRole('textbox', { name: /objective/i }), { target: { value: objective } });
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  const shown = reviewValue('Objective');
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /create project/i })); });
  return shown;
}
const objectiveCall = () => apiRequest.mock.calls.find((c) => c[0] === 'PUT' && String(c[1]).startsWith('/api/charters/'));

describe('New project — the objective', () => {
  it('shows it on the review and records it on the new project, after the create', async () => {
    const shown = await createWith(OBJECTIVE, { ok: true, status: 200, body: { success: true } });
    expect(shown).toBe(OBJECTIVE);
    await vi.waitFor(() => expect(objectiveCall()).toBeTruthy());
    const [, path, body] = objectiveCall()!;
    expect(path).toBe(`/api/charters/by-project/${ID}/objectives`);
    expect(body).toEqual({ objective: OBJECTIVE, sources: [], reason: 'Stated when the project was created' });
    const createIndex = apiRequest.mock.calls.findIndex((c) => c[0] === 'POST' && c[1] === '/api/c2c/projects');
    expect(createIndex).toBeGreaterThan(-1);
    expect(apiRequest.mock.calls.indexOf(objectiveCall()!)).toBeGreaterThan(createIndex);
  });

  it('records nothing when none is stated', async () => {
    const shown = await createWith('', { ok: true, status: 200, body: {} });
    expect(shown).toBe('Not stated');
    await vi.waitFor(() => expect(apiRequest.mock.calls.some((c) => c[0] === 'POST' && c[1] === '/api/c2c/projects')).toBe(true));
    expect(objectiveCall()).toBeUndefined();
  });

  it('says so when the objective is refused, and the project still exists', async () => {
    await createWith(OBJECTIVE, { ok: false, status: 409, body: { success: false, message: 'This project’s charter cannot be started.' } });
    // Said in the visible notice and in its live region.
    expect((await screen.findAllByText(/The project is created and open\. Its objective was not recorded: This project’s charter cannot be started\./)).length).toBeGreaterThan(0);
  });
});
