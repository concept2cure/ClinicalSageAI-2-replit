// @vitest-environment jsdom
/**
 * The study's load history, in the load dialog (2026-11-12).
 *
 * Every extract loaded for a study is recorded: the feed, the date the extract represents, what landed and what was
 * refused, and whether a later load replaced it and why (`rbm_data_runs`). GET /api/mdx/rbm-data-runs has served
 * that since loads were recorded and no screen called it: the overview said only how old each feed's newest load
 * was, so a monitor could not see that last week's extract had been replaced, or by what.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest: h.request }));

import { RbmLoadHistory } from '../surfaces/RbmIngest';
import { getSurface } from '@shared/constants/ui-surface-registry';

const PROGRAM = '11111111-2222-4333-8444-555555555555';
const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data }), { status, headers: { 'Content-Type': 'application/json' } });
const run = (over: Record<string, unknown>) => ({ id: 1, source: 'edc', source_ref: null, data_cutoff: '2026-10-31', status: 'succeeded', rows_accepted: 78, rows_rejected: 0,
  started_at: '2026-11-01T09:00:00.000Z', supersedes_run_id: null, superseded_at: null, reprocess_reason: null, error: null, ...over });

beforeEach(() => { h.request.mockReset(); });
afterEach(() => cleanup());

describe('the load history', () => {
  it('reads the study’s own runs and lists them as recorded', async () => {
    h.request.mockResolvedValue(envelope([
      run({ id: 14, source: 'edc', source_ref: 'edc-export-2026-11.csv', supersedes_run_id: 12, reprocess_reason: 'the unit mapping for query rate was corrected', rows_accepted: 80, rows_rejected: 2, status: 'partial' }),
      run({ id: 13, source: 'ctms', data_cutoff: null, status: 'failed', rows_accepted: 0, error: 'No usable row.' }),
      run({ id: 12, superseded_at: '2026-11-02T10:00:00.000Z' }),
    ]));
    render(<RbmLoadHistory programId={PROGRAM} />);
    const table = await screen.findByRole('table', { name: 'Every extract loaded for this study, newest first' });
    expect(h.request.mock.calls[0].slice(0, 2)).toEqual(['GET', `/api/mdx/rbm-data-runs?program_id=${PROGRAM}`]);
    expect(within(table).getAllByRole('rowheader').map(c => c.textContent)).toEqual(['14', '13', '12']);
    const rows = within(table).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows[0]).toContain('EDCedc-export-2026-11.csv');
    expect(rows[0]).toContain('2026-10-31');
    expect(rows[0]).toContain('80 accepted, 2 rejected');
    expect(rows[0]).toContain('Loaded, some rows rejected');
    expect(rows[0]).toContain('Replaced run 12: the unit mapping for query rate was corrected');
    expect(rows[1]).toContain('CTMS');
    expect(rows[1]).toContain('Not stated');
    expect(rows[1]).toContain('FailedNo usable row.');
    expect(rows[2]).toContain('Replaced by a later load; its readings were retracted');
    expect(within(table).getAllByRole('row')[3].hasAttribute('data-superseded')).toBe(true);
  });

  it('says a study has no loads, in words', async () => {
    h.request.mockResolvedValue(envelope([]));
    render(<RbmLoadHistory programId={PROGRAM} />);
    expect(await screen.findByText('No extract has been loaded for this study yet.')).toBeTruthy();
  });

  it('reports a read that failed, or came back malformed, as a failure and not as an empty history', async () => {
    h.request.mockResolvedValue(envelope({ error: 'down' }, 503));
    render(<RbmLoadHistory programId={PROGRAM} />);
    expect(await screen.findByText('The load history could not be read')).toBeTruthy();
    expect(screen.queryByText('No extract has been loaded for this study yet.')).toBeNull();
    cleanup();
    h.request.mockResolvedValue(envelope([{ source: 'edc' }]));
    render(<RbmLoadHistory programId={PROGRAM} />);
    expect(await screen.findByText('The load history could not be read')).toBeTruthy();
  });

  it('is claimed by the monitoring screen, so a release does not refuse it', () => {
    expect(getSurface('rbm')!.apiPrefixes).toContain('/api/mdx/rbm-data-runs');
  });
});
