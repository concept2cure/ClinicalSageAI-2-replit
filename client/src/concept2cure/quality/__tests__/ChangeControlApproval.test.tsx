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
import { createHash, webcrypto } from 'node:crypto';
import { stableStringify } from '@shared/canonical-json';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  signed: null as unknown,
  asked: [] as string[],
  program: null as string | null,
  userId: undefined as string | undefined,
  owner: { actor: '7:8', key: 1, sameRevision: () => true },
}));
vi.mock('../../v2/editor/authoringCurrentRead', async original => ({ ...await original<typeof import('../../v2/editor/authoringCurrentRead')>(), useAuthoringReadSession: () => H.owner }));
vi.mock('../../v2/shellProject', async original => ({ ...await original<typeof import('../../v2/shellProject')>(), shellProgramId: () => H.program, useShellProject: () => null }));
vi.mock('../ControlledDocumentWorkbench', () => ({ ControlledDocumentWorkbench: ({ documentId }: { documentId: number }) => <div>editing-document-{documentId}</div> }));

vi.mock('../changeHooks', async () => {
  const { CHANGE_SUMMARY: FIXTURE_SUMMARY } = await import('./changeRows');
  return { useChangeSummary: () => ({ summary: FIXTURE_SUMMARY, loading: false, error: null }) };
});
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ name: 'R. Approver', id: H.userId }) }));
// C4: the shared failure panel (ErrorState) redacts internals through this module, so keep the real one underneath.
vi.mock('@/lib/queryClient', async (original) => ({
  ...(await original<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null,
}));
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: (u: { name?: string } | null) => (u?.name ? { name: u.name } : undefined),
  EsignModal: (p: {
    action: string;
    meanings?: string[];
    onSign: (i: { meaning: string; reason: string; password: string }) => Promise<unknown>;
    commitRefusal?: string | null;
    renderMeaningDetails?: (meaning: 'approval', committing: boolean) => React.ReactNode;
  }) => (
    <div role="dialog" aria-label={p.action} data-meanings={(p.meanings ?? []).join(',')}>
      {p.renderMeaningDetails?.('approval', false)}
      {p.commitRefusal && <p role="alert">{p.commitRefusal}</p>}
      <button disabled={!!p.commitRefusal} onClick={() => p.onSign({ meaning: 'approval', reason: 'Impact assessment reviewed and accepted.', password: 'pw' }).then((m) => { H.signed = m; })}>
        stub-sign
      </button>
    </div>
  ),
}));

import { ChangeControl } from '../ChangeControl';
import { CHANGE_ROWS as FIXTURE_CHANGES } from './changeRows';

function renderLog(changes = FIXTURE_CHANGES) {
  return render(
    <ChangeControl
      onAsk={(q) => H.asked.push(q)}
      stage="all"
      onStageChange={() => {}}
      openId={null}
      onOpenIdChange={() => {}}
      changes={changes}
      loading={false}
      onRetry={H.refresh}
    />,
  );
}

beforeEach(() => {
  H.apiRequest.mockReset();
  H.refresh.mockReset();
  H.signed = null;
  H.asked = [];
  H.program = null; H.userId = undefined; H.owner = { actor: '7:8', key: 1, sameRevision: () => true };
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ChangeControl — approving a change is a signature taken here', () => {
  it('offers Approve only on the change under assessment', () => {
    renderLog();
    const approves = screen.getAllByRole('button', { name: /^Approve$/ });
    expect(approves).toHaveLength(FIXTURE_CHANGES.filter((c) => c.status === 'under_assessment').length);
  });

  // C8: the server refuses the proposer's approval (the two-person rule), so the row does not offer it to them.
  it("offers Approve to anyone but the change's proposer", () => {
    const assessed = FIXTURE_CHANGES.find((c) => c.status === 'under_assessment')!;
    H.userId = '7';
    const { unmount } = renderLog(FIXTURE_CHANGES.map((c) => (c.id === assessed.id ? { ...c, proposedBy: 7 } : c)));
    const row = screen.getByText(assessed.changeNumber).closest('tbody') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /^Approve$/ })).toBeNull();
    // Their next step is the unsigned moves the server lists (reject, cancel).
    expect(within(row).getByRole('button', { name: 'Advance' })).toBeTruthy();
    unmount();
    renderLog(FIXTURE_CHANGES.map((c) => (c.id === assessed.id ? { ...c, proposedBy: 8 } : c)));
    const other = screen.getByText(assessed.changeNumber).closest('tbody') as HTMLElement;
    expect(within(other).getByRole('button', { name: /^Approve$/ })).toBeTruthy();
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
    // C9: what the signature binds is read inside the ceremony, before signing.
    const record = screen.getByTestId('change-approval-record');
    expect(record.textContent).toContain('What you approve');
    expect(record.textContent).toContain('Filter qualification and an extractables study; no filing change.');
    expect(record.textContent).toContain('Qualify the second source, then update the aseptic fill batch record.');
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

  it('no longer tells AnA to capture an e-signature it cannot capture', () => {
    renderLog();
    fireEvent.click(screen.getAllByRole('button', { name: /Advance/ })[0]);
    expect(H.asked.join(' ')).not.toMatch(/e-signature/i);
  });
});

describe('the exact aggregate artifact is an additional explicit signature invariant', () => {
  const artifact = { kind: 'aggregate_learning_v1' as const, libraryVersionId: '11111111-1111-4111-8111-111111111111', classKey: 'independent_review',
    agency: 'fda', documentType: 'cer', cohortMinimum: 3, tenantCount: 3, eventCount: 4 };
  const hash = createHash('sha256').update(stableStringify(artifact)).digest('hex');
  const changes = (digest = hash) => FIXTURE_CHANGES.map(c => c.status === 'under_assessment' ? { ...c,
    learningReview: { artifact, artifactSha256: digest, instructions: 'Obtain independent review before approval.' } } : c);
  it('holds until browser hash verification AND the named human invariant checkbox', async () => {
    H.apiRequest.mockImplementation(async (method: string) => method === 'GET'
      ? { ok: true, json: async () => ({ learningContribution: { canCurate: false } }) }
      : { status: 200, ok: true, json: async () => ({ data: { id: 1 }, meta: { signature: { id: 51, signedAt: '2026-11-06T09:00:00Z' } } }) });
    renderLog(changes()); fireEvent.click(screen.getAllByRole('button', { name: /^Approve$/ })[0]);
    const checkbox = screen.getByRole('checkbox', { name: /No client facts, identity or strategy/ }) as HTMLInputElement;
    expect((screen.getByText('stub-sign') as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(checkbox.disabled).toBe(false));
    fireEvent.click(checkbox); fireEvent.click(screen.getByText('stub-sign'));
    await waitFor(() => expect(H.signed).toBeTruthy());
    expect(H.apiRequest.mock.calls.find(call => call[0] === 'POST')?.[2]).toMatchObject({ learningReview: { expectedArtifactSha256: hash, invariantAccepted: true } });
    expect(screen.getByLabelText('Exact aggregate artifact').textContent).toBe(stableStringify(artifact));
  });
  it('refuses a one-byte hash change and never posts an approval', async () => {
    renderLog(changes('0'.repeat(64))); fireEvent.click(screen.getAllByRole('button', { name: /^Approve$/ })[0]);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be verified/));
    expect((screen.getByText('stub-sign') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    expect(H.apiRequest.mock.calls.filter(call => call[0] === 'POST')).toEqual([]);
  });
  it('prepares an unsigned candidate with controlled bins and real reauthentication, then opens its existing editor', async () => {
    H.program = '22222222-2222-4222-8222-222222222222';
    H.apiRequest.mockImplementation(async (method: string) => ({ ok: true, json: async () => method === 'GET'
      ? { learningContribution: { canCurate: true } } : { audited: true, learningContribution: { documentId: 61, changeId: 62 } } }));
    renderLog(); fireEvent.click(await screen.findByRole('button', { name: 'Prepare reviewed learning' }));
    for (const [label, value] of [['Pattern class', 'independent_review'], ['Agency group', 'fda'], ['Document group', 'cer'],
      ['Reason for preparing this candidate', 'Review generic independent guidance'], ['Current password', 'REA_WINDOW_PRIVATE_CANARY']] as const) {
      fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Prepare unsigned candidate' }));
    await screen.findByText('editing-document-61');
    expect(H.apiRequest.mock.calls.find(call => call[0] === 'PUT')?.[2]).toEqual({ action: 'learning_prepare', programId: H.program,
      classKey: 'independent_review', agency: 'fda', documentType: 'cer', reasonForChange: 'Review generic independent guidance', reauth: { password: 'REA_WINDOW_PRIVATE_CANARY' } });
    expect(H.asked).toEqual([]); expect(document.body.innerHTML).not.toContain('REA_WINDOW_PRIVATE_CANARY');
  });
});
