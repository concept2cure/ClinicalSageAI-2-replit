// @vitest-environment jsdom
/**
 * "Export report" must produce a report.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Insights.tsx:681 — the control carried `I.download`, was labelled "Export
 * report", and its entire effect was
 *
 *   POST /api/report-os/runs/:id/finalize   → fireToast('Sealed · sha256 …')
 *
 * The run really was sealed, and the toast really did say so — which is exactly
 * why nobody noticed that no FILE was ever produced. A regulatory reporting
 * surface offered Export and could not hand the user a document.
 * GET /api/report-os/runs/:id/export.pdf had existed the whole time
 * (server/routes/report-os.ts:1323, `createRunPdf`, entitlement-gated) with no
 * caller in this surface.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The CHAIN, not the control: that a click reaches the seal AND the render
 * endpoint for the SAME run id, that the bytes the server returned are the
 * bytes handed to the canonical `downloadBlob` helper (v2/download.ts — not a
 * local copy of the anchor dance), and — the two that matter — that a report
 * held below final is still exported, while a REFUSED export produces no file
 * and says so instead of a green tick over nothing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadBlob,
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const RUN_ID = 77;
const PDF = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const fail = (status: number, obj: unknown) =>
  ({ ok: false, status, json: async () => obj }) as unknown as Response;

const OWNED_PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

const OVERVIEW = {
  data: {
    organizationId: 1,
    tier: 'standard',
    segments: ['biotech'],
    leadProgram: {
      projectId: 1, code: 'BX204', label: 'BX204', filing: 'NDA', indication: null,
      readiness: 73, scope: 'project', scopeId: '1', agency: null,
      pdufa: '2027-03-14', criticalBlockerCount: 0,
    },
    portfolio: { programs: null },
  },
};

const RENDERED = {
  data: {
    reportTypeId: 'readiness.executive_digest',
    scopeType: 'project',
    scopeId: '1',
    generatedAt: '2026-08-01T10:00:00.000Z',
    status: 'partial',
    truthfulness: { allowedStatus: 'partial', downgradedFrom: 'final', reasons: ['3 blockers open'] },
    sections: [{ id: 's1', title: 'Readiness summary', blocks: [] }],
  },
};

/** Route every call this surface makes; `overrides` replaces the two the
 *  export path depends on, per test. */
function wire(overrides: { finalize?: () => Response; exportPdf?: () => unknown } = {}) {
  apiRequest.mockImplementation((method: string, url: string) => {
    if (url.includes('/api/insights-canvas/overview')) return Promise.resolve(ok(OVERVIEW));
    if (method === 'POST' && url === '/api/report-os/runs') {
      return Promise.resolve(ok({ data: { run: { id: RUN_ID } } }));
    }
    if (url === `/api/report-os/runs/${RUN_ID}/rendered`) return Promise.resolve(ok(RENDERED));
    if (url === `/api/report-os/runs/${RUN_ID}/finalize`) {
      return Promise.resolve(
        overrides.finalize
          ? overrides.finalize()
          : ok({ data: { seal: { algorithm: 'sha256', contentHash: 'abc123def4567890', atomCount: 12 } } }),
      );
    }
    if (url === `/api/report-os/runs/${RUN_ID}/export.pdf`) {
      return Promise.resolve(
        (overrides.exportPdf
          ? overrides.exportPdf()
          : { ok: true, status: 200, blob: async () => PDF }) as Response,
      );
    }
    return Promise.resolve(ok({}));
  });
}

/** Drive the surface to a rendered governed run, then click Export report. */
async function runThenExport() {
  render(<InsightsCanvas {...OWNED_PROPS} />);
  const composer = await waitFor(() => {
    const el = document.querySelector('.rc-input textarea') as HTMLTextAreaElement | null;
    if (!el) throw new Error('composer not mounted');
    return el;
  });
  fireEvent.change(composer, { target: { value: 'Run the executive readiness digest report' } });
  fireEvent.click(screen.getByLabelText('Send'));
  const btn = await waitFor(() => screen.getByText(/Export report/));
  apiRequest.mockClear();
  downloadBlob.mockClear();
  fireEvent.click(btn);
  return btn;
}

beforeEach(() => {
  apiRequest.mockReset();
  downloadBlob.mockReset();
  downloadBlob.mockReturnValue(true);
});
afterEach(() => cleanup());

describe('Insights — Export report produces a file', () => {
  it('seals the run AND fetches the governed PDF for the same run, handing the bytes to downloadBlob', async () => {
    wire();
    await runThenExport();

    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());

    const calls = apiRequest.mock.calls.map((c) => `${c[0]} ${c[1]}`);
    expect(calls).toContain(`POST /api/report-os/runs/${RUN_ID}/finalize`);
    expect(calls).toContain(`GET /api/report-os/runs/${RUN_ID}/export.pdf`);

    const [filename, blob] = downloadBlob.mock.calls[0] as unknown as [string, Blob];
    expect(filename).toBe(`Executive_Readiness_Digest_run${RUN_ID}.pdf`);
    // The FILE is the server's bytes, not something assembled here.
    expect(blob).toBe(PDF);
    expect(document.body.textContent).toMatch(/saved Executive_Readiness_Digest_run77\.pdf/);
  });

  it('still exports a report the truthfulness gate holds below final, and says both things', async () => {
    wire({ finalize: () => fail(409, { reasons: ['3 critical blockers open'] }) });
    await runThenExport();

    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Not sealed — held below final: 3 critical blockers open/);
    expect(text).toMatch(/saved Executive_Readiness_Digest_run77\.pdf/);
  });

  it('reads the gate’s reasons off the THROWN 409 too — which is how production sees it', async () => {
    // The real `apiRequest` throws ApiRequestError for every non-OK status but
    // 401, so the `res.status === 409` branch never runs outside a test that
    // returns the response. Without this the user would have been told
    // "Not sealed — <generic>" and never which blockers held the report.
    wire({
      finalize: () => {
        throw Object.assign(new Error('Report is held below final.'), {
          status: 409,
          payload: { reasons: ['3 critical blockers open'] },
        });
      },
    });
    await runThenExport();

    await waitFor(() =>
      expect(document.body.textContent).toMatch(
        /Not sealed — held below final: 3 critical blockers open/,
      ),
    );
    expect(downloadBlob).toHaveBeenCalled();
  });

  it('hands over NO file when the export is refused, and reports it as a failure', async () => {
    wire({
      exportPdf: () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Exporting this report requires the professional plan.' }),
      }),
    });
    await runThenExport();

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/no file saved — Exporting this report requires the professional plan/),
    );
    expect(downloadBlob).not.toHaveBeenCalled();
    // A refusal is never dressed as a success: the pill carries the error tone
    // (and role="alert"), not the green tick.
    const pill = document.querySelector('.de-toast');
    expect(pill?.getAttribute('data-tone')).toBe('error');
  });

  it('reports a browser that refuses the download rather than claiming a saved file', async () => {
    wire();
    downloadBlob.mockReturnValue(false);
    await runThenExport();

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/no file saved — this browser refused the download/),
    );
    expect(document.body.textContent).not.toMatch(/saved Executive_Readiness_Digest/);
    expect(document.querySelector('.de-toast')?.getAttribute('data-tone')).toBe('error');
  });
});
