// @vitest-environment jsdom
/**
 * Part11SignModal — proves the reusable e-signature dialog drives the REAL
 * /api/esignature chain and never fabricates a signature:
 *   • happy path: verify-password → sign → renders the §11.50 manifestation
 *     (server signature hash + UTC time) and reports the manifest
 *   • a failed password stops before /sign and is surfaced honestly
 *   • a §11.10(g) authority denial (403) is surfaced honestly; nothing signed
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Dr. Jordan Lee', email: 'jordan@acme.co', firstName: 'Jordan' } }),
}));

import { Part11SignModal, type Part11SignRequest } from '../Part11SignModal';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const REQUEST: Part11SignRequest = {
  documentId: 42, versionId: 7, signaturePurpose: 'approval', action: 'approved',
  title: 'Approve M2.3 Quality Overall Summary',
};

afterEach(() => cleanup());
beforeEach(() => apiRequest.mockReset());

function selectApproverAndPassword() {
  fireEvent.click(screen.getByRole('radio', { name: 'Approval' }));
  fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'hunter2' } });
}

describe('Part11SignModal — real /api/esignature signing', () => {
  it('verifies the password, signs, and renders the §11.50 manifestation from the server response', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/esignature/verify-password') return ok({ valid: true });
      if (url === '/api/esignature/sign') return ok({ signatureId: 9, signatureHash: 'deadbeefcafe', signedAt: '2026-07-21T12:00:00.000Z' }, 201);
      return ok({});
    });
    const onSigned = vi.fn();
    render(<Part11SignModal request={REQUEST} onSigned={onSigned} onCancel={vi.fn()} />);

    selectApproverAndPassword();
    fireEvent.click(screen.getByRole('button', { name: /^Sign$/ }));

    // The manifestation shows the server hash and the signer identity.
    expect(await screen.findByText('Electronically signed')).toBeTruthy();
    expect(screen.getByText(/deadbeefcafe/)).toBeTruthy();
    expect(screen.getByText(/Dr\. Jordan Lee/)).toBeTruthy();

    // /sign was called with the numeric doc/version and the re-auth password.
    const sign = apiRequest.mock.calls.find((c) => c[1] === '/api/esignature/sign');
    expect(sign).toBeTruthy();
    expect(sign![2]).toMatchObject({ documentId: 42, versionId: 7, action: 'approved', password: 'hunter2' });
    expect(onSigned).toHaveBeenCalledTimes(1);
  });

  it('stops before /sign and surfaces the error when the password is wrong', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/esignature/verify-password') return ok({ valid: false });
      return ok({});
    });
    const onSigned = vi.fn();
    render(<Part11SignModal request={REQUEST} onSigned={onSigned} onCancel={vi.fn()} />);

    selectApproverAndPassword();
    fireEvent.click(screen.getByRole('button', { name: /^Sign$/ }));

    expect(await screen.findByText(/Password verification failed/i)).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/esignature/sign')).toBe(false);
    expect(onSigned).not.toHaveBeenCalled();
  });

  it('surfaces a §11.10(g) authority denial honestly and signs nothing', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/esignature/verify-password') return ok({ valid: true });
      if (url === '/api/esignature/sign') return ok({ error: 'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)).', code: 'ESIGNATURE_NO_AUTHORITY' }, 403);
      return ok({});
    });
    const onSigned = vi.fn();
    render(<Part11SignModal request={REQUEST} onSigned={onSigned} onCancel={vi.fn()} />);

    selectApproverAndPassword();
    fireEvent.click(screen.getByRole('button', { name: /^Sign$/ }));

    expect(await screen.findByText(/does not permit applying an electronic signature/i)).toBeTruthy();
    expect(onSigned).not.toHaveBeenCalled();
    expect(screen.queryByText('Electronically signed')).toBeNull();
  });
});
