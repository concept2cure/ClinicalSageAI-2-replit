// @vitest-environment jsdom
/**
 * A signed register record, at render level: its content is closed to edits
 * and it is retired with a reason.
 *
 * The API refuses an ordinary edit of a qualified or validated record and
 * retires one only with a governed reason (server/services/cmc/signed-record.ts).
 * The register says so before the person tries: Update is disabled with the
 * reason, and Retire asks for one and sends it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'qa@example.test', displayName: 'Q. Assurance' } }),
}));

import { CmContainerClosures } from '../surfaces/cmcRegisters';
import { retireSignedBody, signedUpdateBlocked } from '../surfaces/cmcRegisterForms';
import { specUpdateBody } from '../surfaces/cmcSpec';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const READ = `/api/cmc/container-closures?projectId=${encodeURIComponent(PROJECT)}`;

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const system = (id: number, status: string) => ({
  id,
  systemName: `CCS-${id}`,
  scope: 'drug_product',
  componentType: 'vial',
  containerDescription: '2R glass vial',
  status,
  projectId: PROJECT,
});

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('a signed register record', () => {
  it('a qualified system offers no edit, says why, and offers Retire', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === READ) return res({ success: true, data: [system(1, 'qualified')] });
      return res({});
    });
    render(<CmContainerClosures />);
    await screen.findByText('CCS-1');
    const update = screen.getByRole('button', { name: /Update/ }) as HTMLButtonElement;
    expect(update.disabled).toBe(true);
    expect(update.title).toMatch(/Qualified under a recorded signature/);
    expect(screen.getByRole('button', { name: /Retire/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Qualify/ })).toBeNull();
  });

  it('an unsigned system is editable and has nothing to retire under a signature', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === READ) return res({ success: true, data: [system(2, 'draft')] });
      return res({});
    });
    render(<CmContainerClosures />);
    await screen.findByText('CCS-2');
    expect((screen.getByRole('button', { name: /Update/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /Retire/ })).toBeNull();
  });

  it('Retire sends the retirement and the reason, and shows the server’s row', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === READ) return res({ success: true, data: [system(3, 'qualified')] });
      if (m === 'PUT' && u === '/api/cmc/container-closures/3') return res({ success: true, data: system(3, 'retired') });
      return res({});
    });
    render(<CmContainerClosures />);
    await screen.findByText('CCS-3');
    fireEvent.click(screen.getByRole('button', { name: /Retire/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText((c) => c.startsWith('Reason')), {
      target: { value: 'Supplier change; replaced by CCS-4.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Retire$/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[0] === 'PUT')).toBe(true));
    const put = apiRequest.mock.calls.find((c) => c[0] === 'PUT')!;
    expect(put[1]).toBe('/api/cmc/container-closures/3');
    expect(put[2]).toEqual({ status: 'retired', reason: 'Supplier change; replaced by CCS-4.' });
    expect(await screen.findByText('retired')).toBeTruthy();
  });
});

describe('the signed-record helpers', () => {
  it('blocks Update only in the signed state', () => {
    expect(signedUpdateBlocked('qualified', 'qualified', 'standard')).toMatch(/Retire it/);
    expect(signedUpdateBlocked('Validated', 'validated', 'process')).toMatch(/^Validated under/);
    expect(signedUpdateBlocked('draft', 'qualified', 'standard')).toBeNull();
    expect(signedUpdateBlocked('retired', 'qualified', 'standard')).toBeNull();
  });

  it('a process retires on its own status column', () => {
    expect(retireSignedBody({ reason: '  Superseded by PPQ-2.  ' }, 'validationStatus'))
      .toEqual({ validationStatus: 'retired', reason: 'Superseded by PPQ-2.' });
  });

  it('a specification edit carries the reason the approved form asks for', () => {
    expect(specUpdateBody({ attr: 'Assay', reason: ' Limit tightened after trend review. ' }).reason)
      .toBe('Limit tightened after trend review.');
    expect(specUpdateBody({ attr: 'Assay' }).reason).toBeUndefined();
  });
});
