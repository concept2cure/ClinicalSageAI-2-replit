// @vitest-environment jsdom
/**
 * The approval card's signature meaning is one of the server's closed
 * vocabulary (§11.50(a)(3); audit DP-55, plan P1-42). It used to be a
 * free-text input ("e.g. Reviewed and approved"); since P1-42 the server
 * refuses any meaning outside GOVERNED_SIGN_MEANINGS, so a typed meaning
 * would only ever earn a 400. The card now offers the same five meanings the
 * shared EsignModal offers, and sends the selected id.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';

const { signSpy } = vi.hoisted(() => ({ signSpy: vi.fn(async () => null) }));
vi.mock('../../hooks/useElectronicSignature', () => ({
  useElectronicSignature: () => ({ sign: signSpy, receipt: null, submitting: false, error: null, reset: () => {} }),
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

import { ApprovalCard } from '../pathway/PathwayPanes';
import type { Approval } from '../../types';

const APPROVAL: Approval = {
  id: 'a-1',
  stage: 'qa',
  target: 'Module 2.7 Clinical summary',
  requested: '2026-09-30T10:00:00Z',
  requested_by: 'Rae',
  signer: 'You',
  role: 'QA',
  status: 'pending',
  meaning: 'Reviewed and approved',
  document_id: 41,
  version_id: 7,
} as Approval;

afterEach(() => { cleanup(); signSpy.mockClear(); });

describe('ApprovalCard — the meaning of a signature is chosen, not typed', () => {
  it('offers exactly the governed meanings, and sends the selected id', async () => {
    render(<ApprovalCard a={APPROVAL} mine onOpenSection={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));

    const select = screen.getByRole('combobox', { name: /Meaning of signature/ }) as HTMLSelectElement;
    const offered = Array.from(select.options).map((o) => o.value);
    expect(offered).toEqual(['authorship', 'review', 'approval', 'responsibility', 'release']);
    // Free text from the approval feed is not a meaning; the card starts on approval.
    expect(select.value).toBe('approval');

    fireEvent.change(select, { target: { value: 'review' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply signature/ }));

    expect(signSpy).toHaveBeenCalledTimes(1);
    expect(signSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ signatureMeaning: 'review', documentId: 41, versionId: 7 }));
  });
});
