// @vitest-environment jsdom
/**
 * The orchestrator panels on eCTD Compile must not collapse three distinctions.
 *
 * These panels were briefly their own surface (`submission-orchestrator`) —
 * a duplicate of this one, deleted per CLAUDE.md's zero-duplication rule. The
 * duplication was the mistake; the honesty properties were not, so they move
 * with the panels and are asserted here.
 *
 * Each distinction, collapsed, makes a regulated claim nobody verified:
 *
 *  1. A FAILED READ IS NOT AN EMPTY RESULT. If the audit-trail GET fails and
 *     the panel renders "no events", the screen asserts that an eCTD
 *     submission has no recorded build history — a Part 11 statement about the
 *     record, made on the strength of a network error.
 *
 *  2. A SKIPPED STEP IS NOT A COMPLETED STEP. The orchestrator emits `skipped`
 *     when a step's inputs are absent or its gate does not apply. Rendered as
 *     done, a package missing its Module 2 summaries reads as fully built.
 *
 *  3. AN UNSIGNED PACKAGE IS NOT A TAMPERED ONE. A package whose digest
 *     drifted after signing is not merely "unsigned" — it is an integrity
 *     failure, a different and louder fact.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

const publishedContext = vi.hoisted(() => ({ current: null as any }));
vi.mock('../surfaceContext', () => ({
  usePublishSurfaceContext: (_id: string, ctx: unknown) => {
    publishedContext.current = ctx;
  },
}));

import { EctdCompile } from '../surfaces/EctdCompile';
import type { SurfaceViewProps } from '../surfaceViews';

const RUN_ID = 'run-abc-123';

/* This surface is project-scoped: with no open program it returns the "Open a
   program to compile its eCTD" empty and renders nothing else — correctly, and
   the orchestrator panels live inside that. Seed a program so the panels under
   test actually mount. */
beforeEach(() => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = {
    id: '9a7f0b10-0000-4000-8000-0000000000aa',
    title: 'Compound X',
    code: 'CPX',
  };
});

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
    { key: 'm3.compose', status: 'complete', durationMs: 1200 },
    { key: 'm2.3.qos', status: 'skipped', outputRef: 'skipped (no inputs)' },
    { key: 'm2.7.clinical', status: 'skipped', outputRef: 'skipped (no inputs)' },
    { key: 'package.assemble', status: 'complete', durationMs: 800 },
  ],
};

/**
 * Route every read this surface issues. The compile-side panels (status,
 * history) are given honest empties so they neither fail nor distract; the
 * orchestrator reads are what each test varies.
 */
function routeReads(opts: {
  run?: unknown | 'fail';
  audit?: unknown | 'fail';
  signed?: { throw: number; payload?: unknown } | unknown;
}) {
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('/submission-orchestrator/runs/') && path.endsWith('/audit')) {
      if (opts.audit === 'fail') throw httpError(500);
      return ok(opts.audit ?? { events: [] });
    }
    if (path.includes('/by-run/') && path.endsWith('/signed')) {
      const s = opts.signed as any;
      if (s && typeof s === 'object' && 'throw' in s) throw httpError(s.throw, s.payload);
      return ok(s ?? {});
    }
    if (path.includes('/submission-orchestrator/runs/')) {
      if (opts.run === 'fail') throw httpError(500);
      return ok(opts.run ?? RUN_WITH_SKIPS);
    }
    // Compile-side reads — honest empties.
    if (path.includes('/history')) return ok({ compilations: [] });
    return ok({});
  });
}

function renderAndLoadRun() {
  const utils = render(<EctdCompile {...({ onAsk: () => {} } as unknown as SurfaceViewProps)} />);
  const input = utils.container.querySelector('input[aria-label="Orchestrator run id"]') as HTMLInputElement;
  expect(input, 'the orchestrator run-id field must exist on eCTD Compile').toBeTruthy();
  fireEvent.change(input, { target: { value: RUN_ID } });
  fireEvent.keyDown(input, { key: 'Enter' });
  return utils;
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  publishedContext.current = null;
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('1. a failed audit read is not an empty audit trail', () => {
  it('reports the audit trail as unreadable, never as zero events', async () => {
    routeReads({ audit: 'fail' });
    renderAndLoadRun();

    await waitFor(() => expect(screen.getByText(/Couldn’t read the audit trail/i)).toBeTruthy());
    expect(screen.queryByText(/No audit events recorded/i)).toBeNull();
  });

  it('tells the assistant the audit history is unknown, not absent', async () => {
    routeReads({ audit: 'fail' });
    renderAndLoadRun();

    await waitFor(() => expect(publishedContext.current?.facts?.orchestratorAuditReadFailed).toBe(true));
    // null, not 0 — a count nobody has is not a count of zero.
    expect(publishedContext.current.facts.orchestratorAuditEventCount).toBeNull();
  });

  it('still distinguishes a genuine empty trail that READ successfully', async () => {
    routeReads({ audit: { events: [] } });
    renderAndLoadRun();

    await waitFor(() => expect(screen.getByText(/No audit events recorded/i)).toBeTruthy());
    expect(screen.queryByText(/Couldn’t read the audit trail/i)).toBeNull();
    expect(publishedContext.current.facts.orchestratorAuditEventCount).toBe(0);
  });
});

describe('2. a skipped step is not a completed step', () => {
  it('counts only completed steps as ran, excluding skipped', async () => {
    routeReads({});
    renderAndLoadRun();

    // 2 complete of 4 — the 2 skipped must NOT be counted as ran.
    await waitFor(() => expect(screen.getByText('2/4')).toBeTruthy());
    expect(screen.queryByText('4/4')).toBeNull();
  });

  it('says explicitly that skipped steps never ran', async () => {
    routeReads({});
    renderAndLoadRun();

    await waitFor(() => expect(screen.getByText(/were skipped, not completed/i)).toBeTruthy());
    expect(screen.getAllByText(/Never attempted/i).length).toBeGreaterThan(0);
  });

  it('reports skipped separately to the assistant, with its meaning', async () => {
    routeReads({});
    renderAndLoadRun();

    await waitFor(() => expect(publishedContext.current?.facts?.orchestratorStepCounts).toBeTruthy());
    const c = publishedContext.current.facts.orchestratorStepCounts;
    expect(c.complete).toBe(2);
    expect(c.skipped).toBe(2);
    expect(c.complete + c.skipped).toBe(c.total);
    // The assistant must be told what skipped means, or it summarizes it as done.
    expect(publishedContext.current.facts.orchestratorSkippedMeansNeverAttempted).toBe(true);
  });
});

describe('3. signature state distinguishes unsigned from tampered', () => {
  it('renders an integrity failure as a failure, not as "not signed yet"', async () => {
    routeReads({
      signed: { throw: 422, payload: { error: 'digest-drift', message: 'The package content changed after signing.' } },
    });
    renderAndLoadRun();

    // "Integrity failure" is the distinguishing phrase; "changed after signing"
    // appears in both the title and the server's detail message.
    await waitFor(() => expect(screen.getByText(/^Integrity failure/i)).toBeTruthy());
    expect(screen.queryByText(/No release signature on this run/i)).toBeNull();
  });

  it('distinguishes an unsigned run from a drifted one', async () => {
    routeReads({
      signed: { throw: 409, payload: { error: 'not-signed', message: 'Run has no package.sign step.' } },
    });
    renderAndLoadRun();

    await waitFor(() => expect(screen.getByText(/No release signature on this run/i)).toBeTruthy());
    expect(publishedContext.current.facts.signedPackageRefusal.error).toBe('not-signed');
  });

  it('surfaces a verified signature with its bound digest', async () => {
    routeReads({
      signed: {
        totalSizeBytes: 4096,
        gatewayReady: true,
        hardenedScore: 96,
        signature: { payloadDigest: 'a'.repeat(64), signatureId: 7, sealVerdict: 'ok' },
        leaves: [{ filePath: 'm3/x.pdf' }],
      },
    });
    renderAndLoadRun();

    await waitFor(() => expect(screen.getByText(/Bound digest/i)).toBeTruthy());
    expect(publishedContext.current.facts.signedPackage.signatureId).toBe(7);
  });
});

describe('a failed run read is not a run without steps', () => {
  it('reports the run as unreadable rather than rendering an empty pipeline', async () => {
    routeReads({ run: 'fail' });
    renderAndLoadRun();

    await waitFor(() => expect(screen.getByText(/Couldn’t load this run/i)).toBeTruthy());
    expect(publishedContext.current.facts.orchestratorRunReadFailed).toBe(true);
  });
});

describe('no run loaded is its own state', () => {
  it('does not describe an unloaded pipeline as a clean one', async () => {
    routeReads({});
    render(<EctdCompile {...({ onAsk: () => {} } as unknown as SurfaceViewProps)} />);

    await waitFor(() => expect(screen.getByText(/No orchestrator run loaded/i)).toBeTruthy());
    expect(publishedContext.current?.facts?.orchestratorRunLoaded).toBe(false);
  });
});
