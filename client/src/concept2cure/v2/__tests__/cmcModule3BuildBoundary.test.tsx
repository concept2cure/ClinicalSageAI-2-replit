// @vitest-environment jsdom
/**
 * The Module 3 build board says what the composition boundary answered
 * (decision P-28: small-molecule Module 3 for a US IND), by the refusal's code:
 *
 *   • outside the boundary (a biologic, a marketing application): an answer
 *     about the program, in the server's words, with no retry;
 *   • modality not recorded yet: a record still to make;
 *   • a read the boundary could not make (503): a failure, with its retry.
 *
 * The board used to render every failed read as "Couldn't load… sign in and
 * retry", which would have told a biologic's program its board was down
 * (2026-10-22). Split from cmcSuiteWrites.test.tsx, whose mocks it mirrors.
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
  useAuth: () => ({ user: { id: '7', email: 'analyst@example.test', displayName: 'A. Analyst' } }),
}));

import { CmModule3Build } from '../surfaces/CmcModule3Build';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

beforeEach(() => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('CmModule3Build — the composition boundary’s answers', () => {
  it('shows the composition boundary’s refusal as an answer about the program, not as a failed read', async () => {
    /* apiRequest throws the server's own sentence with the status
       (assertApiResponseOk); the build state answers 409 for a program outside
       the boundary (decision P-28). */
    const refusal =
      'This project’s drug substance is biologically derived — CHO cell culture — and Module 3 for a biologic is not composed here.';
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (u.startsWith('/api/cmc/module3-os/build-state/')) throw Object.assign(new Error(refusal), { status: 409 });
      return res({ success: true, data: null });
    });
    render(<CmModule3Build ask={() => {}} />);
    expect(await screen.findByText('Module 3 is not composed here for this project')).toBeTruthy();
    expect(screen.getByText(refusal)).toBeTruthy();
    expect(screen.queryByText('Couldn’t load the Module 3 build state')).toBeNull();
  });

  it('titles a substance whose modality is not recorded yet as a record still to make, by the refusal’s code', async () => {
    const notYet =
      'Whether this project’s drug substance is a small molecule is not established — no manufacturing route is recorded. Record the manufacturing route on the drug substance, then compile again.';
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (u.startsWith('/api/cmc/module3-os/build-state/')) {
        throw Object.assign(new Error(notYet), { status: 409, code: 'CMC_MODALITY_NOT_ESTABLISHED' });
      }
      return res({ success: true, data: null });
    });
    render(<CmModule3Build ask={() => {}} />);
    expect(await screen.findByText('This project’s drug substance is not established yet')).toBeTruthy();
    expect(screen.getByText(notYet)).toBeTruthy();
    expect(screen.queryByText('Module 3 is not composed here for this project')).toBeNull();
  });

  it('reports a read the boundary could not make (503) as a failure, with its retry, never as a verdict', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (u.startsWith('/api/cmc/module3-os/build-state/')) {
        throw Object.assign(new Error('This project’s submission could not be read … Try again.'), { status: 503, code: 'CMC_APPLICATION_NOT_READABLE' });
      }
      return res({ success: true, data: null });
    });
    render(<CmModule3Build ask={() => {}} />);
    expect(await screen.findByText('Couldn’t load the Module 3 build state')).toBeTruthy();
    expect(screen.queryByText('Module 3 is not composed here for this project')).toBeNull();
  });

});
