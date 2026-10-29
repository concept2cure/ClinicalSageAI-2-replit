// @vitest-environment jsdom
/**
 * Approving a labeling translation is an electronic signature, on the screen
 * as on the server (D5, 2026-10-29;
 * docs/evidence/D5-LABELING-TRANSLATION-SIGNATURE/2026-10-29/).
 *
 * The board's last step was an "Advance" button that sent
 * PATCH /api/mdx/labeling/translations/:id { status: 'approved' } and nothing
 * else. The server now refuses that unless it carries a password, a meaning
 * and a reason, so the screen asks for them through the shared signature
 * dialog. Here:
 *   - a translation in review offers Approve, and opens the dialog without
 *     sending anything;
 *   - signing sends the approval and the signature components to the signed
 *     route, and the row shows as approved only after the server confirms it;
 *   - a refusal keeps the dialog open with the server's sentence, and a
 *     dropped connection is not called "nothing was signed";
 *   - the other steps still advance without a signature, and never to approved.
 *
 * EsignModal's own re-authentication is covered by its own tests. Here it is a
 * stub that hands over what a signer typed, as in SopRegisterPeriodicReview.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  calls: [] as Array<{ method: string; path: string; body?: unknown }>,
  signed: null as unknown,
  signError: null as string | null,
}));

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ name: 'A. Approver', mfaEnabled: false }) }));
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: (u: { name?: string } | null) => (u?.name ? { name: u.name } : undefined),
  EsignModal: (p: {
    action: string; target: string; targetMeta?: string; meanings?: string[]; defaultMeaning?: string;
    signer?: { name: string }; requireMfa?: boolean; onClose: () => void;
    onSign: (i: { meaning: string; reason: string; password: string; totp?: string }) => Promise<unknown>;
  }) => (
    <div role="dialog" aria-label={p.action} data-meanings={(p.meanings ?? []).join(',')} data-default={p.defaultMeaning}
      data-signer={p.signer?.name} data-mfa={String(p.requireMfa)}>
      <p>{p.target}</p><p>{p.targetMeta}</p>
      <button onClick={() => p.onSign({ meaning: 'approval', reason: 'Back-translation checked against the English IFU', password: 'pw', totp: '123456' })
        .then((m) => { H.signed = m; }).catch((e: Error) => { H.signError = e.message; })}>stub-sign</button>
      <button onClick={p.onClose}>stub-close</button>
    </div>
  ),
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Labeling } from '../surfaces/Labeling';
import { clearShellProject, publishShellProject } from '../shellProject';

const DOC = { id: 4, device_name: 'Aurora CGM', doc_kind: 'ifu', version: '3', organization_id: 7, status: 'draft' };
const PROGRAM_ID = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const KEYED = `/api/mdx/labeling?program_id=${PROGRAM_ID}`;
const row = (id: number, language: string, status: string) => ({
  id, language, translation_method: 'human', back_translation_verified: true, status,
});
const REVIEW = row(12, 'de', 'review');
const PENDING = row(13, 'fr', 'pending');
const SIGNED_ANSWER = {
  data: { ...REVIEW, status: 'approved', approved_by: 5, approved_at: '2026-10-29T10:00:00.000Z' },
  signatureId: 314, signedAt: '2026-10-29T10:00:00.000Z', meaning: 'approval', sha256Chain: 'c'.repeat(64),
};
const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json });

/** What the PATCH answers; the reads always answer the document and its two translations. */
let patchAnswer: () => Promise<unknown>;

beforeEach(() => {
  H.calls.length = 0;
  H.signed = null;
  H.signError = null;
  patchAnswer = async () => answer(201, SIGNED_ANSWER);
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string, body?: unknown) => {
    H.calls.push({ method, path, body });
    if (method === 'PATCH') return patchAnswer();
    if (path === KEYED) return answer(200, { data: [DOC] });
    if (path.endsWith('/translations')) return answer(200, { data: [REVIEW, PENDING] });
    return answer(200, { data: [] });
  });
});
afterEach(() => { cleanup(); clearShellProject(); });

const patches = () => H.calls.filter((c) => c.method === 'PATCH');

async function renderBoard() {
  publishShellProject({ id: PROGRAM_ID });
  render(<Labeling {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof Labeling>)} />);
  await screen.findByText('German');
}
/** The board row for a language name. */
function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('.ct-row') as HTMLElement;
}
async function openApproval() {
  await renderBoard();
  fireEvent.click(within(rowOf('German')).getByRole('button', { name: /Approve/ }));
  return screen.getByRole('dialog', { name: 'Approve the German translation' });
}

describe('approving a translation opens the signature dialog', () => {
  it('a translation in review offers Approve, not Advance; one still pending offers Advance', async () => {
    await renderBoard();
    expect(within(rowOf('German')).getByRole('button', { name: /Approve/ })).toBeTruthy();
    expect(within(rowOf('German')).queryByRole('button', { name: /Advance/ })).toBeNull();
    expect(within(rowOf('French')).getByRole('button', { name: /Advance/ })).toBeTruthy();
    expect(within(rowOf('French')).queryByRole('button', { name: /Approve/ })).toBeNull();
  });

  it('opens the dialog for what is signed, with the approval meanings, and sends nothing yet', async () => {
    const dialog = await openApproval();
    expect(dialog.getAttribute('data-meanings')).toBe('approval,responsibility');
    expect(dialog.getAttribute('data-default')).toBe('approval');
    expect(dialog.getAttribute('data-signer')).toBe('A. Approver');
    expect(dialog.textContent).toContain('Aurora CGM');
    expect(dialog.textContent).toContain('German (de)');
    expect(dialog.textContent).toContain('approves this translation as it stands');
    expect(patches()).toEqual([]);
  });

  it('closing the dialog sends nothing and leaves the translation in review', async () => {
    const dialog = await openApproval();
    fireEvent.click(within(dialog).getByText('stub-close'));
    expect(screen.queryByRole('dialog', { name: 'Approve the German translation' })).toBeNull();
    expect(patches()).toEqual([]);
    expect(within(rowOf('German')).getByRole('button', { name: /Approve/ })).toBeTruthy();
  });
});

describe('the signed approval', () => {
  it('sends the approval and the signature components to the signed route', async () => {
    const dialog = await openApproval();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(H.signed).not.toBeNull());
    expect(patches()).toEqual([{
      method: 'PATCH',
      path: '/api/mdx/labeling/translations/12',
      body: {
        status: 'approved', meaning: 'approval', reason: 'Back-translation checked against the English IFU',
        password: 'pw', mfaToken: '123456',
      },
    }]);
    // The confirmation carries the signature row's time, never the browser's.
    expect(H.signed).toEqual({
      meaning: 'approval', reason: 'Back-translation checked against the English IFU',
      signedAt: '2026-10-29T10:00:00.000Z', hash: 'c'.repeat(64),
    });
  });

  it('shows the translation approved once the server confirms it', async () => {
    const dialog = await openApproval();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(within(rowOf('German')).queryByRole('button', { name: /Approve/ })).toBeNull());
    expect(within(rowOf('German')).queryByRole('button', { name: /Advance/ })).toBeNull();
    expect(screen.getByText(/1\/2 approved/)).toBeTruthy();
  });

  it("a refusal keeps the dialog open with the server's sentence, and the translation stays in review", async () => {
    patchAnswer = async () => {
      throw new ApiRequestError(
        'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)). Nothing was signed.',
        403, null, 'ESIGNATURE_NO_AUTHORITY',
      );
    };
    const dialog = await openApproval();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(H.signError).not.toBeNull());
    expect(H.signError).toBe('Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)). Nothing was signed.');
    expect(screen.getByRole('dialog', { name: 'Approve the German translation' })).toBeTruthy();
    expect(within(rowOf('German')).getByRole('button', { name: /Approve/ })).toBeTruthy();
  });

  it('a password the ceremony did not accept (401) is said once, ending "Nothing was signed."', async () => {
    patchAnswer = async () => answer(401, { error: { code: 'PASSWORD_VERIFICATION_FAILED', message: 'The password was not accepted. Nothing was signed.' } });
    const dialog = await openApproval();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(H.signError).not.toBeNull());
    expect(H.signError).toBe('The password was not accepted. Nothing was signed.');
    expect(within(rowOf('German')).getByRole('button', { name: /Approve/ })).toBeTruthy();
  });

  it('a dropped connection says the outcome is unconfirmed, not that nothing was signed', async () => {
    patchAnswer = async () => { throw new TypeError('Failed to fetch'); };
    const dialog = await openApproval();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(H.signError).not.toBeNull());
    expect(H.signError).toMatch(/did not confirm the approval/);
    expect(H.signError).not.toMatch(/Failed to fetch|Nothing was signed/);
  });

  it('an answer that carries no signature is not shown as approved', async () => {
    patchAnswer = async () => answer(200, { data: { ...REVIEW, status: 'approved' } });
    const dialog = await openApproval();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(H.signError).not.toBeNull());
    expect(H.signError).toMatch(/did not confirm the approval/);
    expect(within(rowOf('German')).getByRole('button', { name: /Approve/ })).toBeTruthy();
  });
});

describe('the other steps need no signature, as before', () => {
  it('Advance moves a pending translation to in progress, and no step sends approved unsigned', async () => {
    patchAnswer = async () => answer(200, { data: { ...PENDING, status: 'in_progress' } });
    await renderBoard();
    fireEvent.click(within(rowOf('French')).getByRole('button', { name: /Advance/ }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual({ method: 'PATCH', path: '/api/mdx/labeling/translations/13', body: { status: 'in_progress' } });
    expect(H.calls.some((c) => (c.body as { status?: string } | undefined)?.status === 'approved')).toBe(false);
  });
});
