// @vitest-environment jsdom
/**
 * Approvals & audit states no figure over a read that did not resolve.
 *
 * The tab's grey counts line printed
 *   "0 governed events · 0 sections tracked · 0 contradictions resolved · 0 still open"
 * unconditionally — over reads still in flight, and over reads that had failed,
 * directly above "Couldn't load contradiction history". "Still open" is the
 * figure the export gate refuses on, so a zero there reads as a cleared gate.
 * The card's own header ("0 resolved — 0 open") did the same. Found by the
 * honest-state read of the CMC screens on 2026-11-12 and confirmed in the file.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';
import { chainCount, readCount } from '../surfaces/cmcShared';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const SECTIONS = `/api/cmc/module3-os/sections/${PROJECT}`;
const CONTRADICTIONS = `/api/cmc/module3-os/contradictions/${PROJECT}`;

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
const failed = () => res({ success: false, error: 'store unavailable' }, 500);
const pending = () => new Promise<Response>(() => {});

function wire(over: { sections?: () => Response | Promise<Response>; contradictions?: () => Response | Promise<Response> } = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === SECTIONS) return over.sections ? over.sections() : res({ success: true, data: [] });
    if (method === 'GET' && url === CONTRADICTIONS) return over.contradictions ? over.contradictions() : res({ success: true, data: [] });
    return res({ success: true, data: [] });
  });
}
function openAudit() {
  render(
    <CmcModule
      surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
      onAsk={vi.fn()}
      onNav={vi.fn()}
      segment="biotech"
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Approvals & audit' }));
}
const line = () => screen.getByTestId('cmc-audit-counts').textContent ?? '';

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the two count helpers', () => {
  it('state a count only over a read that resolved', () => {
    expect(readCount({ loading: true }, '3 x', 'sections')).toBe('reading sections…');
    expect(readCount({ loading: false, error: 'boom' }, '3 x', 'sections')).toBe('sections not read');
    expect(readCount({ loading: false }, '3 x', 'sections')).toBe('3 x');
  });
  it('call a chain with an unread section a floor, not a total', () => {
    expect(chainCount('ready', false, 4)).toBe('4 governed events');
    expect(chainCount('ready', true, 4)).toBe('at least 4 governed events');
    expect(chainCount('ready', false, 1)).toBe('1 governed event');
    expect(chainCount('loading', false, 0)).toBe('reading the audit chain…');
    expect(chainCount('error', false, 0)).toBe('audit chain not read');
  });
});

describe('Approvals & audit — the counts line', () => {
  it('states true zeros over reads that resolved and hold nothing', async () => {
    wire();
    openAudit();
    await waitFor(() => expect(line()).toContain('0 governed events'));
    expect(line()).toContain('0 sections tracked');
    expect(line()).toContain('0 contradictions resolved');
    expect(line()).toContain('0 still open');
  });

  // The defect: "0 contradictions resolved · 0 still open" over a failed read.
  it('states no contradiction count when the contradictions read failed', async () => {
    wire({ contradictions: failed });
    openAudit();
    await waitFor(() => expect(line()).toContain('contradictions not read'));
    expect(line()).not.toContain('still open');
    expect(line()).not.toMatch(/\d+ contradictions? resolved/);
    expect(screen.queryByText('0 resolved — 0 open')).toBeNull();
  });

  it('states no section or event count when the sections read failed', async () => {
    wire({ sections: failed });
    openAudit();
    await waitFor(() => expect(line()).toContain('sections not read'));
    expect(line()).toContain('audit chain not read');
    expect(line()).not.toContain('0 sections tracked');
    expect(line()).not.toContain('0 governed events');
  });

  it('says it is reading while the contradictions read is in flight', async () => {
    wire({ contradictions: pending });
    openAudit();
    await waitFor(() => expect(line()).toContain('reading contradictions…'));
    expect(line()).not.toContain('still open');
  });
});

/* The same rule on the two other tabs that print a count line. On a failed
   read the Stability tab said "0 active studies · 0 outside limits" and the
   Batch tab "0 batches · 0 pending release · 0 open deviations · average
   yield 0%": three zeros nobody counted and a yield nobody measured. */
describe('Stability and Batch records — the counts lines', () => {
  const STABILITY = `/api/cmc/stability-studies?projectId=${PROJECT}`;
  const BATCHES = `/api/cmc/batch-records/${PROJECT}`;
  function wireTab(url: string, answer: () => Response | Promise<Response>) {
    apiRequest.mockImplementation(async (method: string, u: string) =>
      (method === 'GET' && u === url ? answer() : res({ success: true, data: [] })));
  }
  function openTab(name: string) {
    render(
      <CmcModule
        surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
        onAsk={vi.fn()}
        onNav={vi.fn()}
        segment="biotech"
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name }));
  }
  const text = (id: string) => screen.getByTestId(id).textContent ?? '';

  it('Stability states no count over a failed read', async () => {
    wireTab(STABILITY, failed);
    openTab('Stability');
    await waitFor(() => expect(text('cmc-stability-counts')).toBe('stability studies not read'));
  });

  it('Stability states true zeros over a read that resolved empty', async () => {
    wireTab(STABILITY, () => res({ success: true, data: [] }));
    openTab('Stability');
    await waitFor(() => expect(text('cmc-stability-counts')).toContain('0 active studies'));
    expect(text('cmc-stability-counts')).toContain('0 outside limits');
  });

  it('Batch records states no count, and no yield, over a failed read', async () => {
    wireTab(BATCHES, failed);
    openTab('Batch records');
    await waitFor(() => expect(text('cmc-batch-counts')).toBe('batch records not read'));
  });

  it('Batch records prints no average yield over zero batches', async () => {
    wireTab(BATCHES, () => res({ success: true, data: [] }));
    openTab('Batch records');
    await waitFor(() => expect(text('cmc-batch-counts')).toContain('0 batches'));
    expect(text('cmc-batch-counts')).toContain('average yield —');
    expect(text('cmc-batch-counts')).not.toContain('0%');
  });
});

/* The register says what is due (P-122 inventory B2): the next pull and its
   planned date from the server's schedule, and how many pulls are overdue. */
describe('Stability — what is due', () => {
  const STABILITY = `/api/cmc/stability-studies?projectId=${PROJECT}`;
  const study = (id: number, pullSchedule: unknown) => ({
    id, studyTitle: `Study ${id}`, productName: 'C2C-201 tablets', studyType: 'long-term', storageConditions: ['LT'],
    duration: 24, status: 'ACTIVE', timePoints: ['0', '3', '6'], testParameters: ['Assay'], stabilityData: { results: [] }, pullSchedule,
  });
  function openStability(rows: unknown[]) {
    apiRequest.mockImplementation(async (method: string, u: string) =>
      (method === 'GET' && u === STABILITY ? res({ success: true, data: rows }) : res({ success: true, data: [] })));
    render(
      <CmcModule
        surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
        onAsk={vi.fn()}
        onNav={vi.fn()}
        segment="biotech"
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Stability' }));
  }

  it('prints what the recorded results predict at the next pull, per test, with the interval', async () => {
    openStability([
      study(1, { overdue: 0, incomplete: 0, points: [{ label: '12', plannedDate: '2027-02-01', state: 'planned', outstanding: [] }],
        next: { label: '12', plannedDate: '2027-02-01', state: 'planned', outstanding: [], forecast: [
          { parameter: 'Assay', ok: true, predicted: 97.6, interval: { lower: 97.1, upper: 98.1 }, verdict: 'within', pointsUsed: 4, criterion: '95.0-105.0%' },
          { parameter: 'Total impurities', ok: true, predicted: 0.52, interval: { lower: 0.44, upper: 0.6 }, verdict: 'outside', pointsUsed: 4, criterion: 'NMT 0.5%' },
          { parameter: 'Water content', ok: false, detail: 'a forecast needs at least 3 numeric results at 2 or more time points; 0 are recorded' },
        ] } }),
    ]);
    const list = await screen.findByTestId('cmc-pull-forecast');
    expect(list.textContent).toBe('predicted: Assay 97.6 (97.1 to 98.1); Total impurities 0.52 (0.44 to 0.6) — outside');
    expect(list.getAttribute('title')).toContain('Water content: no forecast — a forecast needs at least 3 numeric results');
    expect(screen.getByText(/Total impurities 0\.52/).getAttribute('data-tone')).toBe('warn');
  });

  it('shows each study’s next pull and its date, and counts what is behind', async () => {
    openStability([
      study(1, { overdue: 2, incomplete: 1, next: { label: '12', plannedDate: '2027-02-01', state: 'planned', outstanding: ['Assay'] },
        points: [{ label: '6', plannedDate: '2026-08-01', state: 'overdue', outstanding: ['Assay'] }] }),
      study(2, { overdue: 0, incomplete: 0, next: { label: '9', plannedDate: '2026-12-01', state: 'planned', outstanding: ['Assay'] },
        points: [{ label: '9', plannedDate: '2026-12-01', state: 'planned', outstanding: ['Assay'] }] }),
      study(3, { overdue: 0, incomplete: 0, next: null, reason: 'No pull points are recorded on this study.', points: [] }),
    ]);
    expect(await screen.findByRole('columnheader', { name: 'Next pull' })).toBeTruthy();
    const behind = await screen.findByText('· 2 overdue · 1 incomplete');
    expect(behind.getAttribute('data-tone')).toBe('warn');
    expect(behind.parentElement?.textContent).toContain('12 mo · 2027-02-01');
    expect(behind.parentElement?.getAttribute('title')).toContain('6 mo (2026-08-01): Assay');
    expect(screen.getByText('9 mo · 2026-12-01')).toBeTruthy();
    expect(screen.getByText('no pull points')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('cmc-stability-counts').textContent).toContain('2 pulls overdue · 1 pull incomplete'));
  });
});
