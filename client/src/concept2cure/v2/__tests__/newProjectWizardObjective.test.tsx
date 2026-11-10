// @vitest-environment jsdom
/**
 * New project asks for the project's objective (optional, at most 4,000 characters, as the server says), shows it on
 * the review, and sends it WITH the create: POST /api/c2c/projects records it as version 1 of the project's charter
 * in the creation's own transaction (S1, 505449d7a; D2 §2.4 item 6). There is no second write, so a project can no
 * longer exist without the objective it was given: a refused objective refuses the creation, in the server's own
 * words, and nothing is created.
 */
import React from 'react';
import { intakeFixtureRequest, waitForIntakeWorkspace } from './projectIntakeFixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

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

const REFUSAL = 'The objective must be at most 4,000 characters, with at most 20 sources. Each source needs a kind and a title; an address, if given, must be http or https.';

async function createWith(objective: string, refuse = false) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/c2c/projects' && refuse) throw new ApiRequestError(REFUSAL, 400, { error: REFUSAL });
    return { ok: true, status: 201, json: async () => ({ data: { id: ID, title: 'HLV-334 — IND', code: 'HLV-334' }, meta: {} }) };
  });
  const onNav = vi.fn();
  render(<NewProjectWizard onClose={() => {}} onNav={onNav} />);
  fireEvent.click(screen.getByRole('button', { name: /pick ind/i }));
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  await waitForIntakeWorkspace();
  fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'HLV-334 — IND' } });
  fireEvent.change(screen.getByRole('combobox', { name: /product type/i }), { target: { value: 'drug' } });
  fireEvent.change(screen.getByRole('textbox', { name: /objective/i }), { target: { value: objective } });
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  const shown = reviewValue('Objective');
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /create project/i })); });
  return { shown, onNav };
}
const createCall = () => apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/c2c/projects');
const charterWrite = () => apiRequest.mock.calls.find((c) => String(c[1]).startsWith('/api/charters/'));

describe('New project — the objective', () => {
  it('is labelled optional and held to the server\'s 4,000 characters', () => {
    apiRequest.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /pick ind/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    const field = screen.getByRole('textbox', { name: 'Objective (optional)' }) as HTMLTextAreaElement;
    expect(field.maxLength).toBe(4000);
  });

  it('shows it on the review and sends it with the create, in one write', async () => {
    const { shown, onNav } = await createWith(OBJECTIVE);
    expect(shown).toBe(OBJECTIVE);
    await vi.waitFor(() => expect(createCall()).toBeTruthy());
    expect(createCall()![2]).toMatchObject({ objective: OBJECTIVE });
    await vi.waitFor(() => expect(onNav).toHaveBeenCalledWith('project-home'));
    expect(charterWrite()).toBeUndefined();
  });

  it('sends none when none is stated', async () => {
    const { shown } = await createWith('   ');
    expect(shown).toBe('Not stated');
    await vi.waitFor(() => expect(createCall()).toBeTruthy());
    expect(createCall()![2]).not.toHaveProperty('objective');
    expect(charterWrite()).toBeUndefined();
  });

  it('says a refused objective in the server\'s own words, and opens no project', async () => {
    const { onNav } = await createWith(OBJECTIVE, true);
    expect((await screen.findAllByText(REFUSAL)).length).toBeGreaterThan(0);
    expect(onNav).not.toHaveBeenCalledWith('project-home');
    expect(charterWrite()).toBeUndefined();
  });
});
