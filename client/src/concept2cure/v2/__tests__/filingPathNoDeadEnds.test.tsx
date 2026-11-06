// @vitest-environment jsdom
/**
 * No dead ends on the filing path (docs/design/FILING_SPINE.md F16).
 *
 * Five exits on the path from a project to a dispatched sequence left the
 * person on a screen with nothing to do, or sent them to one that is locked in
 * this release:
 *
 *   1. Submission Center, device filings: "Open 510(k) surface" on every row,
 *      while `device-510k` was outside the launch scope. The founder's request
 *      of 2026-10-23 made device surfaces features of the client's project
 *      (Projects, shared/constants/launch-scope.ts). So the row now offers the
 *      door and it opens the surface. The rule that kept the door off a locked
 *      surface (offered only where surfaceAvailable says it can be opened) is
 *      pinned with the verdict a release without it returns.
 *   2. Vault, with a project open: "Inspection readiness" opened `etmf`, also
 *      locked.
 *   3. Vault, with no project open: each project's Vault is listed (2026-11-06; it read "Open a project to see its vault") and
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
 * `lockedHere` adds a surface to that set for one case, to show a door
 * follows the verdict rather than a hard-coded id.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
const lockedHere = vi.hoisted(() => new Set<string>());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
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
        inScope(id) && !lockedHere.has(id) ? null : { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null },
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
    if (method === 'GET' && url === `/api/c2c/project-vault/${PID}`) {
      return ok({ success: true, data: { program: 'BX-204', spine: 'IND · 21 CFR 312', standard: 'pharma', documentCount: 0, tree: [] } });
    }
    return ok([]);
  });
});
afterEach(() => {
  cleanup();
  lockedHere.clear();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('No dead ends on the filing path (F16)', () => {
  it('the surfaces this test treats as locked are outside the launch scope, and the doors it expects are inside it', () => {
    expect(['etmf', 'ectd-coauthor'].map(isLaunchSurface)).toEqual([false, false]);
    // device-510k: a feature of the client's project since the founder's request of 2026-10-23.
    expect(['projects', 'vault', 'document-authoring', 'device-510k'].map(isLaunchSurface)).toEqual([true, true, true, true]);
  });

  it('Submission Center: a device filing row opens the 510(k) surface, which is in this release', async () => {
    const onNav = vi.fn();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={onNav} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 Glucose Sensor 510(k)'));
    const doors = screen.getAllByTitle('Open the 510(k) surface — the device filing workspace');
    expect(doors).toHaveLength(1);
    fireEvent.click(doors[0]);
    expect(onNav).toHaveBeenCalledWith('device-510k');
  });

  it('Submission Center: where the 510(k) surface is not in the release, a device filing row does not offer it', async () => {
    lockedHere.add('device-510k');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 Glucose Sensor 510(k)'));
    expect(screen.queryAllByTitle('Open the 510(k) surface — the device filing workspace')).toHaveLength(0);
    expect(screen.queryByText(/Open 510\(k\) surface/)).toBeNull();
  });

  /* Design review 2026-10-08: with no device filing tracked, the empty state
     sent the reader to "the 510(k) surface's filing panel" while it was locked.
     It names that panel only where the surface can be opened. */
  describe('Submission Center, with no device filings', () => {
    beforeEach(() => {
      const base = apiRequest.getMockImplementation()!;
      apiRequest.mockImplementation(async (method: string, url: string) =>
        method === 'GET' && url === '/api/510k/estar/submissions' ? ok({ submissions: [] }) : base(method, url));
    });

    it('the empty state names the 510(k) surface\'s filing panel, which is in this release', async () => {
      render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
      await waitFor(() => expect(document.body.textContent).toContain('No device filings tracked yet'));
      expect(document.body.textContent).toMatch(/from the 510\(k\) surface's filing panel/);
      expect(document.body.textContent).not.toContain('which is not part of this release');
    });

    /* J4 human test, 2026-11-06 (docs/evidence/HUMAN-TEST/J4/): the empty state
       named the filing panel and gave no way to it. */
    it('the empty state opens the 510(k) surface it names', async () => {
      const onNav = vi.fn();
      render(<SubmissionCenter onAsk={vi.fn()} onNav={onNav} />);
      await waitFor(() => expect(document.body.textContent).toContain('No device filings tracked yet'));
      fireEvent.click(screen.getByRole('button', { name: 'Open the 510(k) filing panel' }));
      expect(onNav).toHaveBeenCalledWith('device-510k');
    });

    it('where the 510(k) surface is not in the release, the empty state says so and sends no one there', async () => {
      lockedHere.add('device-510k');
      render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
      await waitFor(() => expect(document.body.textContent).toContain('No device filings tracked yet'));
      expect(document.body.textContent).not.toMatch(/from the 510\(k\) surface's filing panel/);
      expect(document.body.textContent).toContain('which is not part of this release');
    });
  });

  it('Vault, with a project open: no "Inspection readiness" door into the locked eTMF', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
    render(<Vault surface={{ id: 'vault', label: 'Vault' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
    expect(await screen.findByText(/No documents in this project's vault yet/)).toBeTruthy();
    expect(screen.queryByText(/Inspection readiness/)).toBeNull();
  });

  it('Vault, with no project open: lists each project\'s Vault, and a row opens that project and its Vault', async () => {
    /* The founder, 2026-11-06: Vault "should be accessible all the time, not just from within the project, but on
       the left rail". It read "Open a project to see its vault" and sent the person to Projects. */
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url === '/api/c2c/projects?limit=200' ? ok([{ id: PID, title: 'BX-204', code: 'BX-204' }]) : base(method, url));
    const onNav = vi.fn();
    render(<Vault surface={{ id: 'vault', label: 'Vault' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
    expect(await screen.findByText("Choose a project's Vault")).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Open the Vault of BX-204' }));
    expect(onNav).toHaveBeenCalledWith('vault');
    expect((window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT?.id).toBe(PID);
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

    // The form places the project's documents (2026-10-31). This submission
    // names no project, so it says so and points at the Vault — never at the
    // Co-Author, whose list it no longer reads.
    fireEvent.click(screen.getByRole('button', { name: /Place a project document as a leaf/ }));
    await waitFor(() => expect(document.body.textContent).toMatch(/This submission is not in a project/));
    expect(apiRequest.mock.calls.some(([, u]) => String(u).startsWith('/api/coauthor/documents'))).toBe(false);
    expect(document.body.textContent).not.toMatch(/author one in the eCTD Co-Author/);
  });

  it('the launch-scope panel has one way back: Projects', () => {
    const onNav = vi.fn();
    render(
      <LaunchScopeGate surfaceId="etmf" surface={{ id: 'etmf', label: 'eTMF' } as never} onNav={onNav}>
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
