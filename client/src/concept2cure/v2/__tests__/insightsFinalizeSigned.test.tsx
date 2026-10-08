// @vitest-environment jsdom
/**
 * Finalizing a report is an electronic signature, taken in the product's one
 * signing dialog (the shared EsignModal), and it is a separate act from Export.
 *
 * Reporting review 2026-10-01 (Part 11 lens): the canvas finalized as a side
 * effect of "Export report", with no reason, no meaning and no
 * re-authentication. The server now runs the signature ceremony on
 * POST /runs/:id/finalize (services/part11/governed-signature-ceremony.ts).
 * This drives the real dialog from the canvas's Finalize… button to the request
 * it sends, and pins what the canvas shows afterwards: the signature
 * manifestation (who, when, meaning) and the seal, or the refusal and no seal.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const auth = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => auth.user,
}));

import { InsightsCanvas } from '../surfaces/Insights';
// The catalog the overview answers with (the canvas holds no copy of its own).
import { CANVAS_REPORT_TYPES } from './_insights-catalog-fixture';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const RUN_ID = 77;
const REASON = 'Issued for the October board pack';
const HASH = 'abc123def4567890abc123def4567890abc123def4567890abc123def4567890';
const MANAGER = { id: 3, displayName: 'Dana Reyes', email: 'dana@example.com', mfaEnabled: false, permissions: ['governed:write', 'report:finalize'] };
const MEMBER = { ...MANAGER, displayName: 'Sam Lee', permissions: ['governed:write'] };

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const OVERVIEW = {
  data: {
    organizationId: 1, tier: 'standard', segments: ['biotech'], reportTypes: CANVAS_REPORT_TYPES,
    leadProgram: {
      projectId: 1, code: 'BX204', label: 'BX204', filing: 'NDA', indication: null,
      readiness: 73, scope: 'project', scopeId: '1', agency: null, pdufa: null, criticalBlockerCount: 0,
    },
    portfolio: { programs: null },
  },
};
const RENDERED = {
  data: {
    reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '1',
    generatedAt: '2026-10-01T08:00:00.000Z', status: 'partial',
    truthfulness: { allowedStatus: 'partial', downgradedFrom: 'final', reasons: [] },
    sections: [{ id: 's1', title: 'Readiness summary', blocks: [] }],
  },
};
const SEALED = {
  data: {
    runId: RUN_ID, status: 'final',
    seal: { algorithm: 'sha256', contentHash: HASH, atomCount: 12 },
    signature: { signatureId: 'sig_1', signedAt: '2026-10-01T09:00:00.000Z', meaning: 'authorship' },
  },
};

let finalizeReply: () => Response;
let finalizeBodies: unknown[];

beforeEach(() => {
  auth.user = MANAGER;
  finalizeBodies = [];
  finalizeReply = () => ok(SEALED);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (url.includes('/api/insights-canvas/overview')) return ok(OVERVIEW);
    if (method === 'POST' && url === '/api/report-os/runs') return ok({ data: { run: { id: RUN_ID } } });
    if (url === `/api/report-os/runs/${RUN_ID}/rendered`) return ok(RENDERED);
    if (url === `/api/report-os/runs/${RUN_ID}/finalize`) {
      finalizeBodies.push(body);
      return finalizeReply();
    }
    return ok({});
  });
  // The dialog pre-checks the password at /api/esignature/verify-password.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function runReport() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <InsightsCanvas {...PROPS} />
    </QueryClientProvider>,
  );
  const composer = await waitFor(() => {
    const el = document.querySelector('.rc-input textarea') as HTMLTextAreaElement | null;
    if (!el) throw new Error('composer not mounted');
    return el;
  });
  fireEvent.change(composer, { target: { value: 'Run the executive readiness digest report' } });
  fireEvent.click(screen.getByRole('button', { name: 'Find' }));
  await screen.findByText(/Export PDF/);
}

async function signInDialog(meaning = 'Authorship') {
  fireEvent.click(screen.getByRole('button', { name: /Finalize/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getAllByRole('radio').find((r) => (r.textContent ?? '').startsWith(meaning)) as HTMLElement);
  fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
  return dialog;
}

describe('Insights — Finalize is a signature, separate from Export', () => {
  it('offers the meanings a finalize can carry, sends reason, meaning and the password, and shows the manifestation', async () => {
    await runReport();
    fireEvent.click(screen.getByRole('button', { name: /Finalize/ }));
    const dialog = await screen.findByRole('dialog');
    const offered = within(dialog).getAllByRole('radio').map((r) => (r.textContent ?? '').replace(/You .*/, '').trim());
    expect(offered).toEqual(['Authorship', 'Approval', 'Responsibility']);
    fireEvent.click(within(dialog).getAllByRole('button', { name: /Cancel/ })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(finalizeBodies).toEqual([]);

    await signInDialog();
    await waitFor(() => expect(finalizeBodies).toHaveLength(1));
    expect(finalizeBodies[0]).toEqual({ reason: REASON, meaning: 'authorship', reauth: { password: 'correct horse' } });

    const seal = await screen.findByTestId('ro-seal');
    expect(seal.textContent).toMatch(/Final\. Signed by Dana Reyes as authorship/);
    expect(seal.textContent).toMatch(/Sealed sha256 abc123def456… over 12 provenance atoms/);
    expect(document.querySelector('.ro-status')?.textContent).toBe('final');
    // A final report is not offered Finalize again.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: /Finalize/ })).toBeNull();
  });

  it('a member, who writes reports but may not finalize them, is offered Export and no Finalize', async () => {
    auth.user = MEMBER;
    await runReport();
    expect(screen.getByText(/Export PDF/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Finalize/ })).toBeNull();
  });

  it('a report the gate holds below final is refused with its reasons, and nothing is shown as sealed', async () => {
    finalizeReply = () => {
      throw Object.assign(new Error('Report is not eligible to be finalized'), {
        status: 409,
        payload: { error: 'Report is not eligible to be finalized', reasons: ['3 critical blockers open'] },
      });
    };
    await runReport();
    const dialog = await signInDialog();
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/Not finalized — held below final: 3 critical blockers open/));
    expect(screen.queryByTestId('ro-seal')).toBeNull();
    expect(document.querySelector('.ro-status')?.textContent).toBe('partial');
  });

  it('a password the server does not accept is said in the dialog, and nothing is sealed', async () => {
    finalizeReply = () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: { code: 'REAUTH_PASSWORD_INVALID', message: 'The password was not accepted. Nothing was signed.' } }),
      }) as unknown as Response;
    await runReport();
    const dialog = await signInDialog();
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/The password was not accepted\. Nothing was signed\./));
    expect(screen.queryByTestId('ro-seal')).toBeNull();
  });

  it('separation of duties: an approval by the run\'s requester is refused with the server\'s sentence', async () => {
    finalizeReply = () => {
      throw Object.assign(new Error('refused'), {
        status: 403,
        payload: { success: false, error: { code: 'SEPARATION_OF_DUTIES_VIOLATION', message: 'You authored this record, so you cannot approve it. Nothing was signed.' } },
      });
    };
    await runReport();
    const dialog = await signInDialog('Approval');
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/You authored this record, so you cannot approve it/));
    expect(within(dialog).getByRole('alert').textContent).not.toMatch(/owners, admins and managers/);
  });

  /* P1-44b: finalizing signs, so a role in finalize's tier without signing
     authority (§11.10(g)) is refused by the server. The signer reads why, not
     the tier sentence, which would be wrong: they are in the tier. */
  it('a role without signing authority is refused with the server\'s sentence, and nothing is sealed', async () => {
    finalizeReply = () => {
      throw Object.assign(new Error('refused'), {
        status: 403,
        payload: {
          success: false,
          error: {
            code: 'ESIGNATURE_NO_AUTHORITY',
            message: 'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)), and finalizing a report signs it. Nothing was finalized.',
          },
        },
      });
    };
    await runReport();
    const dialog = await signInDialog();
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/Your role does not permit applying an electronic signature/));
    expect(within(dialog).getByRole('alert').textContent).not.toMatch(/owners, admins and managers/);
    expect(screen.queryByTestId('ro-seal')).toBeNull();
  });
});
