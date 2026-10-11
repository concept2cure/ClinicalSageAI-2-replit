// @vitest-environment jsdom
/**
 * QA 2026-10-08, walk 2, j3 (b): emily sent a Vault version for review and it
 * was in nobody's queue — not raj's "Awaiting my review", not "All open" — and
 * the board said "Nothing is in review". Send for review on a Vault version
 * assigns nobody: any member with signing authority other than its uploader
 * and sender signs it. The board now lists those versions (GET
 * /api/review/board `vaultReviews`) and says who has each one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Raj Patel', email: 'raj@test.co', roles: ['approver'] } }),
}));

import { Review } from '../surfaces/Review';

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const meta = { scope: 'mine', programId: null, total: 0, threadItemId: null, threadDocumentId: null, generatedAt: '2026-10-08T00:00:00Z' };
const vaultItem = (over: Record<string, unknown> = {}) => ({
  canonicalId: 'baa4bb8e', vaultId: '8bfafea9', programId: 'p-1', program: 'QA-W2 Tolvexa',
  title: 'Tolvexa-DS-Stability-Protocol-STB-0101', version: '3.0', step: 'review', sentBy: 'Emily Watson',
  sentAt: '2026-10-08T12:23:23.157Z', eligibleSigners: ['JM Smith', 'Raj Patel', 'QA Onboard 3'], mine: true, sentByMe: false, ...over,
});
let vaultReviews: unknown;
const props = () => ({ surface: { id: 'review', label: 'Review & approval' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    String(url).startsWith('/api/review/board') ? ok({ queue: [], workflows: {}, thread: [], meta, vaultReviews }) : ok([]));
});
afterEach(() => cleanup());

describe('a Vault version in review is on the board, with who has it', () => {
  it('lists it with the people who can sign it, and does not claim nothing is in review', async () => {
    vaultReviews = [vaultItem()];
    const p = props();
    render(<Review {...p} />);
    const row = await screen.findByTestId('review-vault-item-baa4bb8e');
    expect(row.textContent).toContain('Tolvexa-DS-Stability-Protocol-STB-0101 v3.0');
    expect(row.textContent).toContain('You can sign the review. Not assigned to one person. Can sign the review: JM Smith, Raj Patel or QA Onboard 3.');
    expect(row.textContent).toContain('Sent for review by Emily Watson');
    expect(screen.queryByText('Nothing is in review')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open in the Vault' }));
    expect(p.onNav).toHaveBeenCalledWith('vault');
  });

  it('says plainly when nobody in the organization can sign it', async () => {
    vaultReviews = [vaultItem({ eligibleSigners: [], mine: false })];
    render(<Review {...props()} />);
    const row = await screen.findByTestId('review-vault-item-baa4bb8e');
    expect(row.textContent).toMatch(/No one in this organization can sign the review/);
  });

  it('a failed Vault read is said, never shown as an empty list', async () => {
    vaultReviews = null;
    render(<Review {...props()} />);
    expect((await screen.findByTestId('review-vault-queue')).textContent).toMatch(/could not be read/);
  });
});
