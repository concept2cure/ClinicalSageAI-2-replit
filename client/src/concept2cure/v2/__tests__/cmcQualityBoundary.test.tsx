// @vitest-environment jsdom
/**
 * CMC Quality shows the composition boundary's refusal as an answer about the
 * program, not as a register that failed to respond.
 *
 * GET /api/cmc/quality/qbd/:projectId answers 409 for a program outside the
 * boundary (decision P-28: small-molecule Module 3 for a US IND; 2026-10-22).
 * The surface rendered every failed read as "Couldn't derive the quality
 * attributes — The QbD register didn't respond (…)", so a monoclonal
 * antibody's program was told its register was down.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAuth: () => ({ user: { id: '7', email: 'cmc.lead@example.test', displayName: 'C. Lead' } }),
}));

import { CmQuality } from '../surfaces/CmcQuality';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const REFUSAL =
  'This project’s drug substance is biologically derived — CHO cell culture — and Module 3 for a biologic is not composed here.';

beforeEach(() => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('CmQuality — the QbD read', () => {
  it('shows the boundary’s refusal in the server’s words, not as an outage', async () => {
    apiRequest.mockImplementation(async (_m: string, u: string) => {
      if (u.startsWith('/api/cmc/quality/qbd/')) throw Object.assign(new Error(REFUSAL), { status: 409 });
      return { ok: true, status: 200, json: async () => ({ success: true, data: null }) } as Response;
    });
    render(<CmQuality ask={() => {}} />);
    expect(await screen.findByText('Quality attributes are not derived here for this project')).toBeTruthy();
    expect(screen.getByText(REFUSAL)).toBeTruthy();
    expect(screen.queryByText('Couldn’t derive the quality attributes')).toBeNull();
  });

  it('still reports a failed read as a failure', async () => {
    apiRequest.mockImplementation(async (_m: string, u: string) => {
      if (u.startsWith('/api/cmc/quality/qbd/')) throw Object.assign(new Error('service unavailable'), { status: 503 });
      return { ok: true, status: 200, json: async () => ({ success: true, data: null }) } as Response;
    });
    render(<CmQuality ask={() => {}} />);
    expect(await screen.findByText('Couldn’t derive the quality attributes')).toBeTruthy();
  });
});
