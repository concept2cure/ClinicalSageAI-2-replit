// @vitest-environment jsdom
/**
 * Approving a change is an electronic signature, taken in the change log.
 *
 * Security review 2026-09-24, DP-31 (plan P1-28). The change log's only way to
 * approve a change was "Advance", a prompt that asked AnA to "capture the reason
 * and e-signature". AnA cannot collect a password, and the tool approved with
 * segregation of duties as its only check. The server now refuses approval
 * everywhere except POST /api/mdx/qms/changes/:id/approve, so this button is the
 * one way the UI approves a change. It opens the shared EsignModal and posts
 * there.
 *
 * EsignModal is a stub that hands over what a signer typed, as in
 * SopRegisterApproval.test.tsx: what is under test is where the log sends it.
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  signed: null as unknown,
  asked: [] as string[],
}));

vi.mock('../changeHooks', async () => {
  const { FIXTURE_SUMMARY } = await import('../changeData');
  return { useChangeSummary: () => ({ summary: FIXTURE_SUMMARY, loading: false, error: null }) };
});
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ name: 'R. Approver' }) }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null,
}));
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: (u: { name?: string } | null) => (u?.name ? { name: u.name } : undefined),
  EsignModal: (p: {
    action: string;
    meanings?: string[];
    onSign: (i: { meaning: string; reason: string; password: string }) => Promise<unknown>;
  }) => (
    <div role="dialog" aria-label={p.action} data-meanings={(p.meanings ?? []).join(',')}>
      <button onClick={() => p.onSign({ meaning: 'approval', reason: 'Impact assessment reviewed and accepted.', password: 'pw' }).then((m) => { H.signed = m; })}>
        stub-sign
      </button>
    </div>
  ),
}));

import { ChangeControl } from '../ChangeControl';
import { FIXTURE_CHANGES } from '../changeData';

function renderLog(showingSample = false) {
  return render(
    <ChangeControl
      onAsk={(q) => H.asked.push(q)}
      stage="all"
      onStageChange={() => {}}
      openId={null}
      onOpenIdChange={() => {}}
      changes={FIXTURE_CHANGES}
      loading={false}
      showingSample={showingSample}
      onRetry={H.refresh}
    />,
  );
}

beforeEach(() => {
  H.apiRequest.mockReset();
  H.refresh.mockReset();
  H.signed = null;
  H.asked = [];
});
afterEach(cleanup);

describe('ChangeControl — approving a change is a signature taken here', () => {
  it('offers Approve only on the change under assessment', () => {
    renderLog();
    const approves = screen.getAllByRole('button', { name: /^Approve$/ });
    expect(approves).toHaveLength(FIXTURE_CHANGES.filter((c) => c.status === 'under_assessment').length);
  });

  it('opens the e-signature dialog with the approval meaning only, and posts to the signed route', async () => {
    H.apiRequest.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: { id: 1, status: 'approved' }, meta: { signature: { id: 51, signedAt: '2026-09-25T09:00:00.000Z' } } }),
    });
    renderLog();
    fireEvent.click(screen.getAllByRole('button', { name: /^Approve$/ })[0]);
    expect(screen.getByRole('dialog', { name: 'Approve change' }).getAttribute('data-meanings')).toBe('approval');
    fireEvent.click(screen.getByText('stub-sign'));

    await waitFor(() => expect(H.signed).toBeTruthy());
    const target = FIXTURE_CHANGES.find((c) => c.status === 'under_assessment')!;
    expect(H.apiRequest).toHaveBeenCalledWith('POST', `/api/mdx/qms/changes/${target.id}/approve`, {
      password: 'pw',
      meaning: 'APPROVED',
      reason: 'Impact assessment reviewed and accepted.',
    });
    expect(H.signed).toMatchObject({ signedAt: '2026-09-25T09:00:00.000Z' });
    expect(H.refresh).toHaveBeenCalled();
  });

  it('cannot approve a sample change', () => {
    renderLog(true);
    const btn = screen.getAllByRole('button', { name: /^Approve$/ })[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('no longer tells AnA to capture an e-signature it cannot capture', () => {
    renderLog();
    fireEvent.click(screen.getAllByRole('button', { name: /Advance/ })[0]);
    expect(H.asked.join(' ')).not.toMatch(/e-signature/i);
  });
});
