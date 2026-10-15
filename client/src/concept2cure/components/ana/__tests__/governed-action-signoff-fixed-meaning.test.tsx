// @vitest-environment jsdom
/**
 * An act that fixes its §11.50 meaning is signed with that meaning only
 * (2026-10-01, D5).
 *
 * AnA approving an artifact is signed 'approval' and locking one 'release'
 * (the status route's ARTIFACT_ACT_MEANING; server part11-governance.ts
 * requiredSignatureMeaning). The server refuses any other before the password
 * is checked, so a dialog that offered Authorship / Review / Approval for a
 * lock would ask for a password it could only refuse, and offered no Release
 * at all. The proposal carries the meaning; the dialog offers that one,
 * already chosen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { extractPendingSignoffs, pendingSignoffFromApproval, type PendingSignoff } from '../useGovernedAction';
import { GovernedActionSignoff } from '../GovernedActionSignoff';
import { GOVERNED_SIGNATURE_ATTESTATION } from '@shared/constants/signature-attestation';

afterEach(cleanup);

const lockProposal = {
  success: false,
  error: 'HUMAN_CONFIRMATION_REQUIRED',
  message: 'This action changes the official record…',
  data: {
    tier: 'esignature',
    signatureRequired: true,
    signatureMeaning: 'RELEASE',
    retry: { command: 'update_artifact_status', params: { projectId: 3, artifactId: 'artifact_abc', status: 'locked' } },
  },
};

describe('the proposal carries the meaning the act fixes', () => {
  it('end of turn: extractPendingSignoffs keeps it', () => {
    const [pending] = extractPendingSignoffs([lockProposal]);
    expect(pending.signatureMeaning).toBe('RELEASE');
  });

  it('live: pendingSignoffFromApproval keeps it', () => {
    const pending = pendingSignoffFromApproval({ ...lockProposal, type: 'approval_required', runId: 'run-1', toolUseId: 'tu-1' });
    expect(pending?.signatureMeaning).toBe('RELEASE');
  });

  it('a value that is not a meaning the dialog has is dropped, not offered', () => {
    const [pending] = extractPendingSignoffs([{ ...lockProposal, data: { ...lockProposal.data, signatureMeaning: 'Released' } }]);
    expect(pending.signatureMeaning).toBeUndefined();
  });
});

describe('GovernedActionSignoff — an act that fixes its meaning', () => {
  beforeEach(() => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { success: true, message: 'Locked at version 2.' } }),
    });
  });
  const lock: PendingSignoff = {
    command: 'update_artifact_status',
    params: { projectId: 3, artifactId: 'artifact_abc', status: 'locked' },
    signatureRequired: true,
    tier: 'esignature',
    signatureMeaning: 'RELEASE',
    message: 'Lock the approved version for the submission.',
  };

  it('offers that meaning only, already chosen', () => {
    render(<GovernedActionSignoff signoff={lock} onResolved={() => {}} onCancel={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map(r => r.textContent)).toEqual(['Release']);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
  });

  it('signs with it: the reason and the password are all that is asked for', async () => {
    const onResolved = vi.fn();
    render(<GovernedActionSignoff signoff={lock} onResolved={onResolved} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Approved version released for filing' } });
    fireEvent.change(screen.getByLabelText('Password (electronic signature)'), { target: { value: 'pw-secret' } });
    const sign = screen.getByRole('button', { name: 'Sign and run' }) as HTMLButtonElement;
    expect(sign.disabled).toBe(false);

    fireEvent.click(sign);
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.params).toMatchObject({ status: 'locked', signatureMeaning: 'RELEASE' });
  });

  it('an act that fixes none still offers the three, and no Release', () => {
    render(<GovernedActionSignoff signoff={{ ...lock, signatureMeaning: undefined }} onResolved={() => {}} onCancel={() => {}} />);
    expect(screen.getAllByRole('radio').map(r => r.textContent)).toEqual(['Authorship', 'Review', 'Approval']);
  });

  it('shows the statement of intent the server records with the signature', () => {
    render(<GovernedActionSignoff signoff={lock} onResolved={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(GOVERNED_SIGNATURE_ATTESTATION)).toBeTruthy();
  });
});
