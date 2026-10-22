// @vitest-environment jsdom
/**
 * No dead ends on the filing path (docs/design/FILING_SPINE.md F16).
 *
 * Five exits on the path from a project to a dispatched sequence left the
 * person on a screen with nothing to do, or sent them to one that is locked in
 * this release:
 *
 *   1. Submission Center, device filings: "Open 510(k) surface" on every row,
 *      while `device-510k` is outside the launch scope.
 *   2. Vault, with a project open: "Inspection readiness" opened `etmf`, also
 *      locked.
 *   3. Vault, with no project open: "Open a project to see its vault" and
 *      nothing to click.
 *   4. Submission Center, Builder: with no Co-Author documents it said to
 *      "author one in the eCTD Co-Author first", a surface that is locked and
 *      scrapped (FILING_SPINE.md §5). Documents reach a sequence from the
 *      editor's Place into filing or from the Vault, and the Builder did not
 *      say so.
 *   5. The launch-scope panel a deep link lands on: a sentence, and no way back.
 *
 * Each exit is shown here with the server's launch-scope verdicts as
 * production has them: a surface outside the scope reads 'launch-scope'.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../../hooks/useEsignature', () => ({
  useEsignature: () => ({
    verifyPassword: vi.fn(async () => ({ valid: true })), verifyMfa: vi.fn(async () => ({ valid: true })),
    sign: vi.fn(), verifyingPassword: false, verifyingMfa: false, signing: false, signError: null,
  }),
}));
vi.mock('../navEntitlements', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navEntitlements')>();
  const { isLaunchSurface: inScope } = await import('../../../../../shared/constants/launch-scope');
  return {
    ...real,
    useNavEntitlements: () => ({
      verdictFor: (id: string) =>
        inScope(id) ? null : { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null },
      resolved: true,
      masterAdmin: false,
      platformAdmin: false,
      tier: null,
    }),
  };
});

import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { Vault } from '../surfaces/Vault';
import { LaunchScopeGate } from '../LaunchScopeGate';

const PID = '11111111-1111-4111-8111-1111111111f6';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;

const SUBS = [{ id: 68, title: 'BX-204 IND', productName: 'BX-204', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'planning', lifecycleStage: 'original' }];
const SEQS = [{ id: 29, sequenceNumber: '0000', type: 'original', status: 'assembling', region: 'fda', validationStatus: null }];
const FILINGS = [{
  id: 'f1f1f1f1-0000-0000-0000-000000000001', catalogKey: 'k510_traditional', programType: '510k', variant: 'device',
  title: 'ZX-9 Glucose Sensor 510(k)', status: 'under_review', decision: null, fdaTrackingNumber: 'K261234',
  filedAt: '2026-07-01T00:00:00.000Z', decisionDueAt: '2026-10-29T00:00:00.000Z', projectId: 42,
}];

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions') return ok(SUBS);
    if (method === 'GET' && url === '/api/submissions/68/sequences') return ok(SEQS);
    if (method === 'GET' && url === '/api/submissions/sequences/29/leaves') return ok([]);
    if (method === 'GET' && url === '/api/510k/estar/submissions') return ok({ submissions: FILINGS });
    if (method === 'GET' && url === '/api/coauthor/documents') return ok({ documents: [] });
    if (method === 'GET' && url === `/api/c2c/project-vault/${PID}`) {
      return ok({ success: true, data: { program: 'BX-204', spine: 'IND · 21 CFR 312', standard: 'pharma', documentCount: 0, tree: [] } });
    }
    return ok([]);
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('No dead ends on the filing path (F16)', () => {
  it('the surfaces this test treats as locked are outside the launch scope, and the doors it expects are inside it', () => {
    expect(['device-510k', 'etmf', 'ectd-coauthor'].map(isLaunchSurface)).toEqual([false, false, false]);
    expect(['projects', 'vault', 'document-authoring'].map(isLaunchSurface)).toEqual([true, true, true]);
  });

  it('Submission Center: a device filing row does not offer the locked 510(k) surface', async () => {
    const onNav = vi.fn();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={onNav} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 Glucose Sensor 510(k)'));
    expect(screen.queryAllByTitle('Open the 510(k) surface — the device filing workspace')).toHaveLength(0);
    expect(screen.queryByText(/Open 510\(k\) surface/)).toBeNull();
  });

  /* Design review 2026-10-08: with no device filing tracked, the empty state
     sent the reader to "the 510(k) surface's filing panel", which is locked. */
  it('Submission Center: with no device filings, the empty state does not send the reader to the locked 510(k) surface', async () => {
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url === '/api/510k/estar/submissions' ? ok({ submissions: [] }) : base(method, url));
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(document.body.textContent).toContain('No device filings tracked yet'));
    expect(document.body.textContent).not.toMatch(/from the 510\(k\) surface's filing panel/);
    expect(document.body.textContent).toContain('which is not part of this release');
  });

  it('Vault, with a project open: no "Inspection readiness" door into the locked eTMF', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
    render(<Vault surface={{ id: 'vault', label: 'Vault' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
    expect(await screen.findByText(/No documents in this project's vault yet/)).toBeTruthy();
    expect(screen.queryByText(/Inspection readiness/)).toBeNull();
  });

  it('Vault, with no project open: one button opens Projects', async () => {
    const onNav = vi.fn();
    render(<Vault surface={{ id: 'vault', label: 'Vault' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
    expect(await screen.findByText('Open a project to see its vault')).toBeTruthy();
    // "Go to", not "Open": beside the header's "Open project" it read as a second door to the same place.
    fireEvent.click(screen.getByRole('button', { name: /Go to Projects/ }));
    expect(onNav).toHaveBeenCalledWith('projects');
    /* Design review 2026-10-08 (open item 10): with no project open, the
       header's "Open project" led to Project home's "No project selected". */
    expect(screen.queryByRole('button', { name: /^.?Open project$/ })).toBeNull();
  });

  it('Builder: says where documents come from, opens the editor and the Vault, and never points at the Co-Author', async () => {
    const onNav = vi.fn();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={onNav} />);
    await waitFor(() => expect(document.body.textContent).toContain('BX-204'));
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));

    const note = await screen.findByTestId('sc-builder-sources');
    expect(note.textContent).toMatch(/Place into filing/);
    expect(note.textContent).toMatch(/comes later/);
    fireEvent.click(screen.getByRole('button', { name: 'Open documents' }));
    expect(onNav).toHaveBeenLastCalledWith('document-authoring');
    fireEvent.click(screen.getByRole('button', { name: 'Open the Vault' }));
    expect(onNav).toHaveBeenLastCalledWith('vault');

    // With no Co-Author documents, the empty state no longer sends the person there.
    fireEvent.click(screen.getByRole('button', { name: /Place a Co-Author document as a leaf/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([, u]) => u === '/api/coauthor/documents')).toBe(true));
    await waitFor(() => expect(document.body.textContent).toMatch(/No Co-Author documents in this organization/));
    expect(document.body.textContent).not.toMatch(/author one in the eCTD Co-Author/);
  });

  it('the launch-scope panel has one way back: Projects', () => {
    const onNav = vi.fn();
    render(
      <LaunchScopeGate surfaceId="device-510k" surface={{ id: 'device-510k', label: '510(k)' } as never} onNav={onNav}>
        <div>the locked surface</div>
      </LaunchScopeGate>,
    );
    expect(screen.queryByText('the locked surface')).toBeNull();
    const back = screen.getAllByRole('button');
    expect(back).toHaveLength(1);
    expect(back[0].textContent).toMatch(/Back to Projects/);
    // A bare `.btn` has no border or fill: the one exit read as grey text
    // (design review 2026-10-08, review-launch-scope-gate-desktop-1280.png).
    expect(back[0].className).toMatch(/\bbtn\b.*\b(ghost|primary)\b/);
    fireEvent.click(back[0]);
    expect(onNav).toHaveBeenCalledWith('projects');
  });
});
