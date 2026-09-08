// @vitest-environment jsdom
/**
 * What Mission Control tells AnA about a program's readiness — honestly.
 *
 * The surface's own promise (its header): "a readiness of 0% and a readiness
 * that could not be loaded are different facts, and only one of them means the
 * program is in trouble." The on-screen render already keeps that promise (each
 * <Section load={...}> branches on load.state). These guards pin that the
 * PUBLISHED channel keeps it too — the facts handed to AnA must inherit the same
 * read-state gate, or the model is told "0 blockers, 0 risks" during an outage
 * and repeats a clean bill of health nobody issued.
 *
 * Two findings this pins (both were live regressions in the anaContext memo):
 *   1. readiness/artifacts/risks/stale facts were read from `.data` alone, never
 *      gated on `.state` — 0/[] during load or on failure, indistinguishable
 *      from assessed-and-clear.
 *   2. the "no program selected" branch never checked `programs.state` — a
 *      loading or failed program list read as a genuinely empty org.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { MissionControl } from '../surfaces/MissionControl';

function ok(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ data }) } as Response;
}
function fail(status: number, error?: string) {
  return { ok: false, status, json: async () => ({ error }) } as Response;
}
/** A read that never settles — the in-flight state, held open for the test. */
const pending = () => new Promise<Response>(() => {});

let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('mission-control');
  return null;
}

const props = () => ({
  surface: { id: 'mission-control', label: 'Mission Control' } as unknown as SurfaceViewProps['surface'],
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

function renderMc() {
  return render(
    <>
      <MissionControl {...props()} />
      <Probe />
    </>,
  );
}

const PROGRAMS = [{ id: 7, name: 'C2C-101', code: 'IND-2201', customerTrack: 'biotech', modality: 'mab' }];
const READINESS = { overallConfidence: 61, readiness: { artifactCompleteness: 62 }, blockers: [], nextActions: [] };

beforeEach(() => { seen = null; apiRequest.mockReset(); });
afterEach(cleanup);

const settledOnProgram = () =>
  waitFor(() => {
    expect(seen?.summary).toMatch(/program "C2C-101"/);
  });

describe('Mission Control publishes read-state, never a false clear', () => {
  it('gates each sub-read fact on its OWN state — a failed artifacts/risks/stale read is null, not 0', async () => {
    // Program + readiness answer; the three list reads fail. The counts must be
    // UNKNOWN (null), never 0 — 0 reads as "assessed and found clear."
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.endsWith('/programs')) return ok(PROGRAMS);
      if (url.endsWith('/readiness')) return ok(READINESS);
      if (url.endsWith('/artifacts') || url.endsWith('/risks') || url.endsWith('/dependencies/stale')) {
        return fail(503, 'store unavailable');
      }
      return ok([]);
    });
    renderMc();
    await settledOnProgram();
    await waitFor(() => {
      expect(seen!.facts!.artifactCount).toBeNull();
      expect(seen!.facts!.riskCount).toBeNull();
      expect(seen!.facts!.staleDependencyCount).toBeNull();
    });
  });

  it('publishes blockers as null (unknown), not [] , when the readiness read failed', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.endsWith('/programs')) return ok(PROGRAMS);
      if (url.endsWith('/readiness')) return fail(503, 'readiness store unavailable');
      return ok([]);
    });
    renderMc();
    await settledOnProgram();
    await waitFor(() => {
      expect(seen!.facts!.readinessLoaded).toBe(false);
      expect(seen!.facts!.blockers).toBeNull();
      expect(seen!.facts!.nextActions).toBeNull();
      expect(seen!.facts!.overallConfidence).toBeNull();
    });
  });

  it('a still-loading program list is "still loading", never "no program selected"', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url.endsWith('/programs') ? pending() : ok([]));
    renderMc();
    await waitFor(() => expect(seen?.summary).toMatch(/still loading/i));
    expect(seen!.summary).not.toMatch(/no program selected/i);
    // No fabricated programCount:0 while the list is in flight.
    expect(seen!.facts?.programCount).toBeUndefined();
  });

  it('a failed program list is a failed read, never "no program selected" over programCount:0', async () => {
    apiRequest.mockImplementation(async () => fail(503, 'program store down'));
    renderMc();
    await waitFor(() => expect(seen?.summary).toMatch(/could not be loaded/i));
    expect(seen!.summary).not.toMatch(/no program selected/i);
    expect(seen!.facts?.programCount).toBeUndefined();
  });
});
