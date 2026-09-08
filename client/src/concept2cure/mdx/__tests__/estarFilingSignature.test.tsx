// @vitest-environment jsdom
/**
 * Filing is a signature, on screen.
 *
 * The filing panel advanced a submission to `filed` with one unlabelled button
 * and an empty PATCH body. Declaring a submission made to FDA asked for no
 * reason, no §11.50 meaning, no re-authentication, and named no artifact — and
 * the server accepted a filing date the client chose
 * (docs/reports/device-market-readiness-2026-09-07.md §5).
 *
 * What is pinned here is what an operator can and cannot do:
 *   - filing opens a signature form rather than filing;
 *   - the signature names the retained eSTAR, and sends no filing date;
 *   - with no retained eSTAR the form says so instead of offering an empty
 *     picker — you cannot sign a binding to nothing;
 *   - a refusal keeps the form open with the SERVER's reason, so a mistyped
 *     password does not cost the whole signing session.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, screen } from '@testing-library/react';

import { EstarFilingPanel } from '../surfaces/EstarFilingPanel';

const ARTIFACT = {
  documentId: 'a2b4c6d8-0000-4000-8000-000000000002',
  programId: '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70',
  documentCode: 'eSTAR-510k-device',
  version: 'sha256-a1b2c3d4e5f60718',
  contentHash: 'a'.repeat(64),
  fileName: 'BX-204_eSTAR.pdf',
  fileSize: 5_280_666,
  createdAt: '2026-09-07T10:00:00.000Z',
};

const SUBMISSION = {
  id: 'sub-1',
  catalogKey: '510k-traditional',
  programType: '510k',
  variant: 'device',
  title: 'BX-204 Traditional 510(k)',
  status: 'draft',
  decision: null,
  fdaTrackingNumber: null,
  filedAt: null,
  reviewGoalDays: 90,
  decisionDueAt: null,
  filedArtifactDocumentId: null,
  filedArtifactSha256: null,
};

interface StubOptions {
  artifacts?: unknown[];
  /** Response for the filing PATCH. */
  patch?: { status: number; body: unknown };
}

function stubApi(options: StubOptions = {}) {
  const patches: Array<{ url: string; body: any }> = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PATCH') {
        patches.push({ url, body: JSON.parse(String(init.body)) });
        const p = options.patch ?? { status: 200, body: { ...SUBMISSION, status: 'filed' } };
        return json(p.body, p.status);
      }
      if (url.includes('/retained-artifacts')) {
        return json({ artifacts: options.artifacts ?? [ARTIFACT] });
      }
      if (url.includes('/api/510k/estar/submissions')) return json({ submissions: [SUBMISSION] });
      if (url.includes('/api/510k/estar/registration')) {
        return json({ registered: true, registration: null, clientRegistration: null });
      }
      return json({ data: [] });
    }),
  );
  return patches;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Fill the form and submit it. */
async function signAndFile(reason = 'Filed the cleared 510(k) package with CDRH.') {
  fireEvent.click(await screen.findByText('Sign and file…'));
  const select = await screen.findByLabelText('eSTAR being filed');
  fireEvent.change(select, { target: { value: ARTIFACT.documentId } });
  fireEvent.change(screen.getByLabelText('Reason for signing'), { target: { value: reason } });
  fireEvent.click(screen.getByLabelText('Responsibility'));
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
  fireEvent.click(screen.getByText('Sign and file'));
}

describe('filing an eSTAR from the panel', () => {
  it('opens a signature form instead of filing on the first click', async () => {
    const patches = stubApi();
    render(<EstarFilingPanel />);

    fireEvent.click(await screen.findByText('Sign and file…'));

    expect(await screen.findByLabelText('Reason for signing')).toBeTruthy();
    expect(patches.length).toBe(0);
  });

  it('sends the artifact, the reason, the meaning and the credential — and no filing date', async () => {
    const patches = stubApi();
    render(<EstarFilingPanel />);

    await signAndFile();

    await waitFor(() => expect(patches.length).toBe(1));
    expect(patches[0].body).toEqual({
      status: 'filed',
      filedArtifactDocumentId: ARTIFACT.documentId,
      reason: 'Filed the cleared 510(k) package with CDRH.',
      meaning: 'responsibility',
      reauth: { password: 'correct-horse' },
    });
    expect(patches[0].body).not.toHaveProperty('filedAt');
  });

  it('will not offer an empty picker when nothing has been retained', async () => {
    const patches = stubApi({ artifacts: [] });
    render(<EstarFilingPanel />);

    fireEvent.click(await screen.findByText('Sign and file…'));

    expect(await screen.findByText(/No retained eSTAR to file against/)).toBeTruthy();
    expect(screen.queryByLabelText('eSTAR being filed')).toBeNull();
    expect(patches.length).toBe(0);
  });

  it("keeps the form open with the server's reason when the credential is refused", async () => {
    stubApi({ patch: { status: 401, body: { error: 'REAUTH_PASSWORD_INVALID' } } });
    render(<EstarFilingPanel />);

    await signAndFile();

    expect(await screen.findByText(/That password was not accepted/)).toBeTruthy();
    /* Still open, still holding what was typed. */
    expect((screen.getByLabelText('Reason for signing') as HTMLTextAreaElement).value).toContain(
      'Filed the cleared',
    );
  });
});
