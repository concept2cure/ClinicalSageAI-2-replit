// @vitest-environment jsdom
/**
 * The Submission Orchestrator surface must not collapse three distinctions.
 *
 * Each one, collapsed, produces a regulated claim nobody verified:
 *
 *  1. A FAILED READ IS NOT AN EMPTY RESULT. If the audit-trail GET fails and
 *     the panel renders "no events", the screen asserts that an eCTD
 *     submission has no recorded build history. That is a Part 11 statement
 *     about the record, made on the strength of a network error.
 *
 *  2. A SKIPPED STEP IS NOT A COMPLETED STEP. The orchestrator emits `skipped`
 *     when a step's inputs are absent or its gate does not apply. Rendered as
 *     done, a package missing its Module 2 summaries reads as fully built.
 *
 *  3. AN UNSIGNED PACKAGE IS NOT A SIGNED ONE, and a package whose digest
 *     drifted after signing is not merely "unsigned" — it is an integrity
 *     failure, which is a different and louder fact.
 *
 * These are the assertions. Rendering details are deliberately not pinned.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// The surface publishes context for the assistant; capture it rather than
// standing up the real provider.
const publishedContext = vi.hoisted(() => ({ current: null as any }));
vi.mock('../surfaceContext', () => ({
  usePublishSurfaceContext: (_id: string, ctx: unknown) => {
    publishedContext.current = ctx;
  },
}));

import { SubmissionOrchestrator } from '../surfaces/SubmissionOrchestrator';
import type { SurfaceViewProps } from '../surfaceViews';

const RUN_ID = 'run-abc-123';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
function httpError(status: number, payload?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), { name: 'ApiRequestError', status, payload });
}

const RUN_WITH_SKIPS = {
  runId: RUN_ID,
  submissionId: 'sub-001',
  applicationNumber: 'IND123456',
  region: 'US',
  submissionType: 'IND',
  startedAt: '2026-09-01T00:00:00Z',
  completedAt: '2026-09-01T00:04:00Z',
  status: 'partial',
  steps: [
    { key: 'm3.compose', status: 'complete', durationMs: 1200, dependsOn: [] },
    { key: 'm2.3.qos', status: 'skipped', outputRef: 'skipped (no inputs)', dependsOn: ['m3.compose'] },
    { key: 'm2.7.clinical', status: 'skipped', outputRef: 'skipped (no inputs)', dependsOn: [] },
    { key: 'package.assemble', status: 'complete', durationMs: 800, dependsOn: [] },
  ],
};

/** Route the three parallel reads the surface issues on load. */
function routeReads(opts: {
  run?: unknown | 'fail';
  audit?: unknown | 'fail';
  signed?: unknown | { throw: number; payload?: unknown };
}) {
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('/audit')) {
      if (opts.audit === 'fail') throw httpError(500);
      return ok(opts.audit ?? { events: [] });
    }
    if (path.includes('/signed')) {
      const s = opts.signed as any;
      if (s && typeof s === 'object' && 'throw' in s) throw httpError(s.throw, s.payload);
      return ok(s ?? {});
    }
    if (opts.run === 'fail') throw httpError(500);
    return ok(opts.run ?? RUN_WITH_SKIPS);
  });
}

function renderSurface() {
  return render(<SubmissionOrchestrator {...({} as SurfaceViewProps)} />);
}

/** Type a run id into the loader so the surface fetches. */
async function loadRun(container: HTMLElement) {
  const input = container.querySelector('input[aria-label="Run id"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  const { fireEvent } = await import('@testing-library/react');
  fireEvent.change(input, { target: { value: RUN_ID } });
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  publishedContext.current = null;
});

describe('1. a failed audit read is not an empty audit trail', () => {
  it('reports the audit trail as unreadable, never as zero events', async () => {
    routeReads({ audit: 'fail' });
    const { container } = renderSurface();
    await loadRun(container);

    await waitFor(() => {
      expect(screen.getByText(/Couldn’t read the audit trail/i)).toBeTruthy();
    });

    // The forbidden claim: that this submission has no recorded history.
    expect(screen.queryByText(/No audit events recorded/i)).toBeNull();
  });

  it('tells the assistant the audit history is unknown, not absent', async () => {
    routeReads({ audit: 'fail' });
    const { container } = renderSurface();
    await loadRun(container);

    await waitFor(() => expect(publishedContext.current?.facts?.auditReadFailed).toBe(true));
    // null, not 0 — a count nobody has is not a count of zero.
    expect(publishedContext.current.facts.auditEventCount).toBeNull();
    expect(publishedContext.current.summary).toMatch(/not absent/i);
  });

  it('still distinguishes a genuine empty trail that READ successfully', async () => {
    routeReads({ audit: { events: [] } });
    const { container } = renderSurface();
    await loadRun(container);

    await waitFor(() => {
      expect(screen.getByText(/No audit events recorded/i)).toBeTruthy();
    });
    expect(screen.queryByText(/Couldn’t read the audit trail/i)).toBeNull();
    expect(publishedContext.current.facts.auditEventCount).toBe(0);
  });
});

describe('2. a skipped step is not a completed step', () => {
  it('counts only completed steps as ran, excluding skipped', async () => {
    routeReads({});
    const { container } = renderSurface();
    await loadRun(container);

    // 2 complete of 4 total — the 2 skipped must NOT be counted as ran.
    await waitFor(() => expect(screen.getByText('2/4')).toBeTruthy());
    expect(screen.queryByText('4/4')).toBeNull();
  });

  it('says explicitly that skipped steps never ran', async () => {
    routeReads({});
    const { container } = renderSurface();
    await loadRun(container);

    await waitFor(() => {
      expect(screen.getByText(/were skipped, not completed/i)).toBeTruthy();
    });
    expect(screen.getAllByText(/Never attempted/i).length).toBeGreaterThan(0);
  });

  it('reports skipped separately to the assistant, with its meaning', async () => {
    routeReads({});
    const { container } = renderSurface();
    await loadRun(container);

    await waitFor(() => expect(publishedContext.current?.facts?.stepCounts).toBeTruthy());
    const c = publishedContext.current.facts.stepCounts;
    expect(c.complete).toBe(2);
    expect(c.skipped).toBe(2);
    expect(c.complete + c.skipped).toBe(c.total);
    // The assistant must be told what skipped means, or it will summarize it as done.
    expect(publishedContext.current.summary).toMatch(/never attempted, not succeeded/i);
  });
});

describe('3. signature state distinguishes unsigned from tampered', () => {
  it('renders an integrity failure as a failure, not as "not signed yet"', async () => {
    routeReads({
      signed: {
        throw: 422,
        payload: {
          error: 'digest-drift',
          message: 'The package content changed after signing.',
        },
      },
    });
    const { container } = renderSurface();
    await loadRun(container);

    // "Integrity failure" is the distinguishing word. The phrase "changed after
    // signing" appears in both the title and the server's own detail message,
    // so match the title's prefix rather than a substring they share.
    await waitFor(() => {
      expect(screen.getByText(/^Integrity failure/i)).toBeTruthy();
    });
    expect(screen.getAllByText(/changed after signing/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No release signature on this run/i)).toBeNull();
  });

  it('distinguishes an unsigned run from a drifted one', async () => {
    routeReads({
      signed: { throw: 409, payload: { error: 'not-signed', message: 'Run has no package.sign step.' } },
    });
    const { container } = renderSurface();
    await loadRun(container);

    await waitFor(() => {
      expect(screen.getByText(/No release signature on this run/i)).toBeTruthy();
    });
    expect(publishedContext.current.facts.signedPackageRefusal.error).toBe('not-signed');
  });

  it('surfaces a verified signature with its bound digest', async () => {
    routeReads({
      signed: {
        runId: RUN_ID,
        applicationNumber: 'IND123456',
        sequenceNumber: '0000',
        totalSizeBytes: 4096,
        gatewayReady: true,
        hardenedScore: 96,
        signature: { payloadDigest: 'a'.repeat(64), signatureId: 7, sealVerdict: 'ok' },
        leaves: [{ filePath: 'm3/x.pdf', sectionCode: 'm3.2.S.1', checksum: 'b'.repeat(32), fileSize: 2048 }],
      },
    });
    const { container } = renderSurface();
    await loadRun(container);

    await waitFor(() => expect(screen.getByText(/Bound digest/i)).toBeTruthy());
    expect(publishedContext.current.facts.signedPackage.signatureId).toBe(7);
  });
});

describe('a failed run read is not a run without steps', () => {
  it('reports the run as unreadable rather than rendering an empty pipeline', async () => {
    routeReads({ run: 'fail' });
    const { container } = renderSurface();
    await loadRun(container);

    await waitFor(() => {
      expect(screen.getByText(/Couldn’t load this run/i)).toBeTruthy();
    });
    expect(screen.getByText(/Step status unavailable/i)).toBeTruthy();
    expect(publishedContext.current.summary).toMatch(/failed read, not a run with no steps/i);
  });
});

describe('no run loaded is its own state', () => {
  it('does not describe an unloaded surface as a clean pipeline', async () => {
    routeReads({});
    renderSurface();

    await waitFor(() => expect(publishedContext.current?.summary).toBeTruthy());
    expect(publishedContext.current.summary).toMatch(/missing selection, not a clean or empty pipeline/i);
    expect(screen.getByText(/No run loaded/i)).toBeTruthy();
  });
});
