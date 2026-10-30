// @vitest-environment jsdom
/**
 * Design controls (DHF) — the fixture-free contract, pinned.
 *
 * This surface renders 21 CFR 820.30(c) design inputs a reviewer may rely on in
 * an audit. It was previously `live ?? fixture`: on any backend failure it fell
 * back to seven inline DI-0x design inputs and a hardcoded 820.30 completeness
 * checklist, behind a "Sample data" pill. These tests pin the migration:
 *
 *   - the traceability matrix renders the org's REAL rows (GET /api/design-controls);
 *   - the 820.30 completeness checklist is DERIVED from those rows — elements the
 *     design-input store cannot evidence are shown as honestly "not tracked",
 *     never a fabricated present/absent claim;
 *   - an org with no design inputs sees an honest EmptyState, not seed rows;
 *   - a failed load is an honest error, not a cached sample;
 *   - no "Sample data" pill and no fixture symbols survive in the source.
 *
 * 2026-10-29 (D2, fold F1c): the Design controls screen folded into Engineering
 * evidence, which mounts the same trace (v2/surfaces/DesignControlsTrace.tsx)
 * for the open project. These cases run against it as Engineering mounts it
 * (./engineeringPanels.harness.tsx): the read names the project, and the answer
 * is keyed to it.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DC_READ, EngineeringDesignControlsPanel, keyedToPanelProject } from './engineeringPanels.harness';

/** The route's success envelope for an admitted project: `{ data, meta: { count, scope, programId } }`. */
function ok(data: unknown[], status = 200) {
  return { ok: status < 400, status, json: async () => keyedToPanelProject(data) } as Response;
}
function fail(status = 503) {
  return { ok: false, status, json: async () => ({ error: { code: 'INTERNAL' } }) } as Response;
}


/* TEST data — lives only in this file, never importable by the surface. The
   surface itself ships no design-input fixture at all. */
const ROWS = [
  { id: 'DI-01', cat: 'intended_use', req: 'Continuously measure interstitial glucose over a 14-day wear period.', riskRef: 'HZ-01',
    outputs: [{ id: 'DO-01', desc: 'Sensor + algorithm spec' }], ver: 'pass', verRef: 'V&V-114 accuracy', val: 'pass', valRef: 'HF summative' },
  { id: 'DI-07', cat: 'functional', req: 'Report a reading every 5 minutes with < 0.5% data loss.', riskRef: null,
    outputs: [], ver: null, verRef: null, val: null, valRef: null },
];

beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(() => cleanup());

describe('DesignControls — real rows render', () => {
  it("renders the project's design inputs from GET /api/design-controls", async () => {
    apiRequest.mockResolvedValue(ok(ROWS));
    render(<EngineeringDesignControlsPanel onAsk={vi.fn()} />);

    // The read hits the real endpoint, for the open project.
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(String(apiRequest.mock.calls[0][0])).toBe('GET');
    expect(String(apiRequest.mock.calls[0][1])).toBe(DC_READ);

    // Real rows appear in the traceability matrix.
    expect(await screen.findByText('DI-01')).toBeTruthy();
    expect(screen.getByText('DI-07')).toBeTruthy();
    expect(screen.getByText(/Continuously measure interstitial glucose/)).toBeTruthy();
  });

  it('derives the 820.30 checklist from the real rows (no hardcoded have/have-not)', async () => {
    apiRequest.mockResolvedValue(ok(ROWS));
    render(<EngineeringDesignControlsPanel onAsk={vi.fn()} />);
    await screen.findByText('DI-01');

    // Elements the design-input store evidences are present/absent from the rows:
    //  - design inputs present (2 rows), outputs present (DI-01 has an output),
    //    verification + validation present (DI-01 passes both),
    //  - traceability ABSENT because DI-07 is untraced.
    const traceRow = screen.getByText('Full requirements<->V&V traceability').closest('.dc-820-row') as HTMLElement;
    expect(traceRow.querySelector('.dc-820-dot.tone-err')).toBeTruthy();

    // Elements no store backs are honestly "not tracked", not fabricated.
    expect(screen.getAllByText('Not tracked in this store').length).toBe(4); // plan, reviews, transfer, changes
    const planRow = screen.getByText('Design & development plan').closest('.dc-820-row') as HTMLElement;
    expect(planRow.getAttribute('data-untracked')).toBe('true');
  });

  it('never presents a "Sample data" pill', async () => {
    apiRequest.mockResolvedValue(ok(ROWS));
    render(<EngineeringDesignControlsPanel onAsk={vi.fn()} />);
    await screen.findByText('DI-01');
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    expect(screen.queryByText('Sample data')).toBeNull();
  });
});

describe('DesignControls — honest empty and error states', () => {
  it('shows an honest empty state (no seed rows) when the project has no design inputs', async () => {
    apiRequest.mockResolvedValue(ok([]));
    render(<EngineeringDesignControlsPanel onAsk={vi.fn()} />);
    expect(await screen.findByText('No design inputs defined yet')).toBeTruthy();
    // No fabricated seed content leaks in as a fallback.
    expect(screen.queryByText('DI-01')).toBeNull();
    expect(document.body.textContent).not.toMatch(/MARD/);
    expect(document.body.textContent).not.toMatch(/interstitial glucose/);
  });

  it('shows an honest error (no cached sample) when the store fails', async () => {
    apiRequest.mockResolvedValue(fail(503));
    render(<EngineeringDesignControlsPanel onAsk={vi.fn()} />);
    expect(await screen.findByText("Couldn't load the design history file")).toBeTruthy();
    expect(screen.queryByText('DI-01')).toBeNull();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
  });
});

describe('DesignControls — no fixture symbols survive in source', () => {
  /* The screen's read, matrix and checklist moved into the trace Engineering
     mounts (fold F1 slice B, 2026-10-29; the screen folded in F1c), which reads
     through useProjectScopedRead over useLiveData, the hook useLiveRows wraps. */
  const src = ['../surfaces/DesignControlsTrace.tsx', '../projectScopedRead.tsx']
    .map((f) => fs.readFileSync(path.resolve(__dirname, f), 'utf8'))
    .join('\n');
  it('imports the fixture-free hooks, not the live-or-fixture ones', () => {
    expect(src).toMatch(/\buseLive(Rows|Data)\b/);
    expect(src).toMatch(/EmptyState/);
    expect(src).not.toMatch(/useLiveList/);
    expect(src).not.toMatch(/SampleTag/);
  });
  it('carries no inline design-input fixture and no sample-state branch', () => {
    expect(src).not.toMatch(/const DC_INPUTS/);
    expect(src).not.toMatch(/\bsample\b/);
    // The 820.30 checklist is a derivation, not a table of hardcoded have flags.
    expect(src).not.toMatch(/have:\s*(true|false)/);
  });
});
