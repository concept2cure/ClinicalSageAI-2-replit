// @vitest-environment jsdom
/**
 * The reviewer picker offers only people who can sign the review it assigns
 * (follow-up decision "Protocol reviewers", docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * The server assigns a review only to someone who can sign its disposition,
 * and refuses anyone else with 409 REVIEWER_CANNOT_SIGN
 * (protocol-reviews-service.ts). The picker left out viewers alone, so it
 * offered a member or a manager whom the server then refused. It now offers
 * the members GET /api/tenant-users marks `canSign` (the signing policy applied
 * to their membership role), and no one the list does not mark.
 *
 * Only the transport (`apiRequest`) and the signed-in user are replaced.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

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

import { ProtocolDevForm } from '../surfaces/ProtocolDevForms';

beforeEach(() => {
  session.user = { id: '11', email: 'me@c2c.test', organizationId: '42', mfaEnabled: false };
});
afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  session.user = null;
});

/** The organization's member list, as GET /api/tenant-users/42 answers it. */
function members(rows: Array<Record<string, unknown>>): void {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/tenant-users/42') return { ok: true, status: 200, json: async () => rows } as Response;
    return { ok: true, status: 201, json: async () => ({ assignmentId: 1 }) } as Response;
  });
}

function openRequestDrawer() {
  render(<ProtocolDevForm kind="review-request" documentId={2} onCancel={vi.fn()} onDone={vi.fn()} onError={vi.fn()} />);
  const dialog = screen.getByRole('dialog');
  return { dialog, account: within(dialog).getByLabelText(/Reviewer account/) as HTMLSelectElement };
}

/** The accounts the picker offers, by user id (the no-account choice has none). */
const offered = (account: HTMLSelectElement) =>
  within(account).getAllByRole('option').map((o) => (o as HTMLOptionElement).value).filter(Boolean);

describe('the reviewer picker', () => {
  it('offers only the members the server says can sign, so no choice ends at a refusal', async () => {
    members([
      { id: 21, name: 'Dr Amara Okafor', email: 'okafor@c2c.test', role: 'reviewer', canSign: true },
      { id: 23, name: 'Lead Manager', email: 'lead@c2c.test', role: 'manager', canSign: false },
      { id: 24, name: 'Plain Member', email: 'member@c2c.test', role: 'member', canSign: false },
      { id: 25, name: 'Unmarked Row', email: 'unmarked@c2c.test', role: 'reviewer' },
      { id: 26, name: 'Ade Approver', email: 'ade@c2c.test', role: 'approver', canSign: true },
    ]);
    const { account } = openRequestDrawer();
    await waitFor(() => expect(within(account).getByRole('option', { name: /Dr Amara Okafor/ })).toBeTruthy());
    expect(offered(account)).toEqual(['21', '26']);
  });

  it('when no member can sign, it offers no account and says why', async () => {
    members([
      { id: 23, name: 'Lead Manager', email: 'lead@c2c.test', role: 'manager', canSign: false },
      { id: 24, name: 'Plain Member', email: 'member@c2c.test', role: 'member', canSign: false },
    ]);
    const { dialog, account } = openRequestDrawer();
    expect(await within(dialog).findByText(/No member of this organization can sign a review/)).toBeTruthy();
    expect(within(account).getByRole('option', { name: /No account here/ })).toBeTruthy();
    expect(offered(account)).toEqual([]);
  });
});
