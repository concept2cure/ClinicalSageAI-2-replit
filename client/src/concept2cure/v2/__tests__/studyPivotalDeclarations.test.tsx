// @vitest-environment jsdom
/**
 * Pivotal studies on the CSR board: the sponsor declares, per study, whether
 * it is pivotal, with a reason (D5, founder's decision of 2026-10-29).
 * Undeclared studies say so; the declaration names who made it and when; the
 * server's refusal is shown in its own words.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest: api }));
const authUser = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock('@/services/portal/authService', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => authUser.current,
}));

import { StudyPivotalDeclarations, pivotalScopeOf } from '../surfaces/StudyPivotalDeclarations';
import { ApiRequestError } from '@/lib/queryClient';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: { get: () => null } }) as unknown as Response;
const PART_B = { studyId: 'LMN-201-PART-B', protocolNumber: 'LMN-201-CDI02', title: 'RePreve Part B', phase: 'Phase 2/3', declaration: null };
const DECLARED = { ...PART_B, declaration: { pivotal: true, reason: 'Agreed with FDA at the Type B meeting', declaredBy: 5, declaredByName: 'Rena Author', declaredAt: '2026-10-29T10:00:00Z' } };

let listing: unknown[] = [PART_B];
beforeEach(() => {
  api.mockReset();
  authUser.current = null;
  listing = [PART_B];
  api.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'GET' && url === `/api/csr-workflow/pivotal?programId=${PROGRAM}`) return json({ projectId: 11, studies: listing });
    if (method === 'POST' && url === '/api/csr-workflow/pivotal') {
      if (body?.studyId !== 'LMN-201-PART-B') throw new ApiRequestError('This project has no CSR for that study, so there is nothing to declare. Nothing was recorded.', 404, { error: 'This project has no CSR for that study, so there is nothing to declare. Nothing was recorded.', code: 'STUDY_NOT_IN_PROJECT' }, 'STUDY_NOT_IN_PROJECT');
      listing = [DECLARED];
      return json({ projectId: 11, declaration: DECLARED.declaration }, 201);
    }
    return json(null, 404);
  });
});
afterEach(() => cleanup());

describe('Pivotal studies', () => {
  it('lists an undeclared study as not declared, and records a declaration with its reason', async () => {
    render(<StudyPivotalDeclarations scope={{ programId: PROGRAM }} />);
    expect(await screen.findByText(/LMN-201-CDI02 · RePreve Part B · Phase 2\/3/)).toBeTruthy();
    expect(screen.getByText(/Not declared\. Module 2 lists it as a gap/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Declare' }));
    const record = screen.getByRole('button', { name: 'Record declaration' }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Yes, pivotal/));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Agreed' } });
    expect(record.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: '  Agreed with FDA at the Type B meeting  ' } });
    expect(record.disabled).toBe(false);
    fireEvent.click(record);
    await waitFor(() => expect(api.mock.calls.find(c => c[0] === 'POST')?.slice(0, 3)).toEqual(['POST', '/api/csr-workflow/pivotal',
      { programId: PROGRAM, studyId: 'LMN-201-PART-B', pivotal: true, reason: 'Agreed with FDA at the Type B meeting' }]));
    expect(await screen.findByText(/declared by Rena Author on/)).toBeTruthy();
    expect(screen.getByText('Pivotal')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change declaration' })).toBeTruthy();
  });

  it('shows the server’s refusal in its own words, and keeps the form open', async () => {
    listing = [{ ...PART_B, studyId: 'NOT-A-STUDY' }];
    render(<StudyPivotalDeclarations scope={{ programId: PROGRAM }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Declare' }));
    fireEvent.click(screen.getByLabelText(/No, not pivotal/));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Open-label part, supportive only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record declaration' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/Nothing was recorded/));
    expect(screen.getByRole('button', { name: 'Record declaration' })).toBeTruthy();
  });

  it('offers no declaration to someone without the write permission, and still shows what is declared', async () => {
    authUser.current = { permissions: [] };
    listing = [DECLARED];
    render(<StudyPivotalDeclarations scope={{ programId: PROGRAM }} />);
    expect(await screen.findByText(/declared by Rena Author on/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Declare|Change declaration/ })).toBeNull();
  });

  it('says so when the declarations cannot be read, never “none declared”', async () => {
    api.mockImplementation(async () => json({ error: 'boom' }, 500));
    render(<StudyPivotalDeclarations scope={{ programId: PROGRAM }} />);
    expect(await screen.findByText(/could not be read, so whether any study is pivotal is not shown/)).toBeTruthy();
  });

  it('is scoped to the board’s project, and absent for an organization-wide board', () => {
    expect(pivotalScopeOf('/api/csr-workflow/board?programId=x', PROGRAM)).toEqual({ programId: PROGRAM });
    expect(pivotalScopeOf('/api/csr-workflow/board?projectId=11', null)).toEqual({ projectId: 11 });
    expect(pivotalScopeOf('/api/csr-workflow/board', null)).toBeNull();
  });
});
