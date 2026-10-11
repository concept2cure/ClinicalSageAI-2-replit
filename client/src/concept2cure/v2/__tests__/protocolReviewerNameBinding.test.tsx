// @vitest-environment jsdom
/**
 * A review bound to an account is shown under the signer, not under a label
 * someone typed (periodic review 2026-09-28, editor family, SEC-C-7).
 *
 * The server now stores the account's own name on an account-bound assignment
 * and refuses a different one (protocol-reviews-service.ts). Rows written
 * before that can still carry a typed label, and the signing dialog printed it
 * as what the signer was signing: "Dr A · protocol" above B's own name. Only
 * the assigned account can sign such a review, so the dialog names no one but
 * the signer. A reviewer with no account keeps the name: it is the only name
 * that person has here, and the dialog says the decision is recorded for them.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const session = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => session.user,
}));
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolSignModal } from '../surfaces/ProtocolDevSigning';
import { ProtocolDevForm } from '../surfaces/ProtocolDevForms';

const PROTOCOL = 'Phase 2 dose-ranging study of C2C-101';

beforeEach(() => {
  session.user = { id: '21', displayName: 'Dr Amara Okafor', email: 'okafor@c2c.test', organizationId: '42', mfaEnabled: false };
});
afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  session.user = null;
});

function openSigning(reviewer: string, reviewerUserId: number | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProtocolSignModal
        signing={{ kind: 'disposition', assignmentId: 5, reviewer, disposition: 'approve', reviewerUserId }}
        documentId={2}
        documentTitle={PROTOCOL}
        onClose={vi.fn()}
        onSigned={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return screen.getByRole('dialog');
}

describe('the disposition signing dialog', () => {
  it('for a review bound to an account, names the signer only, never a stored label', () => {
    const dialog = openSigning('Dr Someone Else', 21);
    expect(within(dialog).queryByText(/Dr Someone Else/)).toBeNull();
    expect(within(dialog).getByText(PROTOCOL)).toBeTruthy();
    expect(within(dialog).getByText('Dr Amara Okafor')).toBeTruthy();
  });

  it('for a reviewer with no account, keeps the name the decision is recorded for', () => {
    const dialog = openSigning('Dr Iyer', null);
    expect(within(dialog).getByText('Dr Iyer · ' + PROTOCOL)).toBeTruthy();
    expect(within(dialog).getByText(/Dr Iyer has no account here/)).toBeTruthy();
  });
});

describe('the request-a-review drawer', () => {
  it('says a chosen account is listed under its own name, before anything is typed', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/tenant-users/42') {
        return { ok: true, status: 200, json: async () => [{ id: 21, name: 'Dr Amara Okafor', email: 'okafor@c2c.test', role: 'reviewer', canSign: true }] } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    render(<ProtocolDevForm kind="review-request" documentId={2} onCancel={vi.fn()} onDone={vi.fn()} onError={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Dr Amara Okafor/ })).toBeTruthy());
    expect(within(dialog).getByText(/listed under the account’s own name/)).toBeTruthy();
    const name = within(dialog).getByLabelText(/Reviewer name/) as HTMLInputElement;
    // No longer "leave blank for an account": a chosen account now fills this
    // field and locks it (SEC-C-7 follow-on (b), protocolReviewerNameReadOnly.test.tsx).
    expect(name.placeholder).toMatch(/Required when the reviewer has no account/);
  });
});
