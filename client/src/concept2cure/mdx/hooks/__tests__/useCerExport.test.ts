/**
 * @vitest-environment jsdom
 */
/**
 * useCerExport — the CER export contract.
 *
 * What matters: the request always anchors on meta.ident (server resolves it
 * org-scoped) and useProjectContent (server assembles from REAL authored
 * sections), the governance attestation is honest input (never silently set
 * true), the base64 payload becomes a real download, and refusals — the
 * production human-review gate, the no-authored-content 422 — surface
 * verbatim instead of being retried around.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCerExport, type CerExportOutcome } from '../useCerExport';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'a2b4c6d8-0000-0000-0000-00000000cer1',
  code: 'IV-415',
  title: 'IV-415 Companion Diagnostic',
};

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
});

const GOVERNED_OK = {
  governed: true,
  source_type: 'export_pdf',
  artifact_id: 'artifact_1',
  downloadable_output_ref: {
    encoding: 'base64',
    mime_type: 'application/pdf',
    filename: 'CER.pdf',
    data: btoa('pdf-bytes'),
  },
};

let fetchMock: ReturnType<typeof vi.fn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  createObjectURL = vi.fn(() => 'blob:cer');
  revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL as never;
  URL.revokeObjectURL = revokeObjectURL as never;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useCerExport', () => {
  it('POSTs the ident + useProjectContent body with auth headers and an HONEST unreviewed attestation', async () => {
    fetchMock.mockResolvedValue(jsonResponse(GOVERNED_OK));
    const { result } = renderHook(() => useCerExport());

    await act(async () => {
      await result.current.exportCer(PROGRAM, 'pdf', { humanReviewApproved: false });
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/cerv2/export/pdf');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['x-organization-id']).toBe('7');

    const body = JSON.parse(init.body as string);
    expect(body.docType).toBe('cerv2_cer');
    expect(body.meta).toEqual({ id: 'IV-415', ident: PROGRAM.id, title: PROGRAM.title });
    expect(body.useProjectContent).toBe(true);
    /* No client-side content — the server assembles from authored sections. */
    expect(body.content).toBeUndefined();
    /* Honest attestation: unchecked stays false, and no reviewer is invented. */
    expect(body.governance.humanReviewApproved).toBe(false);
    expect(body.governance.reviewerName).toBeUndefined();
    expect(body.governance.reviewTimestamp).toBeUndefined();
  });

  it('carries the reviewer attestation only when actually given', async () => {
    fetchMock.mockResolvedValue(jsonResponse(GOVERNED_OK));
    const { result } = renderHook(() => useCerExport());

    await act(async () => {
      await result.current.exportCer(PROGRAM, 'docx', {
        humanReviewApproved: true,
        reviewerName: '  QA Reviewer ',
      });
    });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.governance.humanReviewApproved).toBe(true);
    expect(body.governance.reviewerName).toBe('QA Reviewer');
    expect(typeof body.governance.reviewTimestamp).toBe('string');
  });

  it('turns downloadable_output_ref into a browser download and reports governed', async () => {
    fetchMock.mockResolvedValue(jsonResponse(GOVERNED_OK));
    vi.useFakeTimers();
    const { result } = renderHook(() => useCerExport());

    let outcome: CerExportOutcome | null = null;
    await act(async () => {
      outcome = await result.current.exportCer(PROGRAM, 'pdf', { humanReviewApproved: true });
    });

    expect(outcome).toEqual({
      ok: true,
      delivered: true,
      governed: true,
      audited: false,
      filename: 'CER.pdf',
      error: null,
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    /* The shared helper (v2/download.ts) revokes the object URL on a 1s timer,
       NOT synchronously after click() — a synchronous revoke races the download
       in Safari and yields a zero-byte file. So the revoke must be deferred... */
    expect(revokeObjectURL).not.toHaveBeenCalled();
    /* ...and must still happen exactly once, so the blob is not leaked. */
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('reports the audited-unplaced delivery state distinctly from governed', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        governed: false,
        audited: true,
        artifact_id: null,
        sha256: 'abc',
        downloadable_output_ref: {
          encoding: 'base64',
          mime_type: 'application/zip',
          filename: 'CER_export.zip',
          data: btoa('zip'),
        },
      }),
    );
    const { result } = renderHook(() => useCerExport());

    let outcome: CerExportOutcome | null = null;
    await act(async () => {
      outcome = await result.current.exportCer(PROGRAM, 'zip', { humanReviewApproved: true });
    });
    expect(outcome).toMatchObject({ ok: true, governed: false, audited: true, filename: 'CER_export.zip' });
  });

  it('surfaces the production human-review refusal verbatim, with no download', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: 'HUMAN_REVIEW_REQUIRED',
          message: 'Human review approval is required before export in this environment',
        },
        false,
        403,
      ),
    );
    const { result } = renderHook(() => useCerExport());

    let outcome: CerExportOutcome | null = null;
    await act(async () => {
      outcome = await result.current.exportCer(PROGRAM, 'pdf', { humanReviewApproved: false });
    });
    expect(outcome).toMatchObject({
      ok: false,
      delivered: false,
      governed: false,
      audited: false,
      error: 'Human review approval is required before export in this environment',
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('surfaces the no-authored-content 422 as the server states it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: 'NO_AUTHORED_CONTENT',
          message: 'No authored sections found for this organization — author section content before exporting.',
        },
        false,
        422,
      ),
    );
    const { result } = renderHook(() => useCerExport());

    let outcome: CerExportOutcome | null = null;
    await act(async () => {
      outcome = await result.current.exportCer(PROGRAM, 'pdf', { humanReviewApproved: true });
    });
    expect(outcome!.ok).toBe(false);
    expect(outcome!.error).toMatch(/No authored sections/);
  });

  it('reports a network failure without fabricating a download', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCerExport());

    let outcome: CerExportOutcome | null = null;
    await act(async () => {
      outcome = await result.current.exportCer(PROGRAM, 'pdf', { humanReviewApproved: true });
    });
    /* The hook's own wording, NOT the thrown message.
       This asserted `error: 'offline'` — the raw text of the rejection — and had
       been failing since 9a5e892 routed every error path through one envelope
       reader. The hook substitutes its own sentence deliberately: a `fetch`
       rejection's native message is "Failed to fetch" / "Load failed" / a DNS
       string, which is plumbing, and this session has spent most of its length
       removing exactly that from what a regulatory user reads. The mock's
       "offline" is only legible here because a test author chose a tidy word;
       the real value is not a sentence.

       So the code is right and the assertion was left behind. What matters and
       is still asserted: the failure is reported as a failure, and no download
       is fabricated. */
    expect(outcome).toMatchObject({ ok: false, error: 'Export request failed', filename: null });
    expect(outcome!.error).not.toContain('offline');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
