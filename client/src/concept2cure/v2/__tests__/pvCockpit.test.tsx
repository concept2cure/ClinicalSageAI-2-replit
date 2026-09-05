// @vitest-environment jsdom
/**
 * PvCockpit — proves the safety-surveillance workbench is wired to the real
 * /api/pharmacovigilance engine: loads live KPIs, runs the real
 * disproportionality math (PRR/ROR/EBGM) via /signals/screen, and computes an
 * expedited-reporting deadline via /calculate-deadline. Non-finite stats render
 * as ∞/n/a, never a fabricated number.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { PvCockpit } from '../surfaces/PvCockpit';

function ok(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ success: true, data }) } as Response;
}
const props = () => ({ surface: { id: 'pv-cockpit', label: 'PV' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const OVERVIEW = { kpis: { totalAdverseEvents: 128, seriousEvents: 14, expeditedReports: 6, overdueReports: 2, pendingSignals: 3, upcomingPeriodicReports: 1, complianceRate: 96 }, recentOverdue: [], activeSignals: [], upcomingDeadlines: [] };

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (url === '/api/pharmacovigilance/overview') return ok(OVERVIEW);
    if (url === '/api/pharmacovigilance/compliance-matrix') return ok([{ region: 'FDA', totalEvents: 40, overdueCount: 1, complianceStatus: 'non_compliant' }]);
    if (url === '/api/pharmacovigilance/signals/screen') return ok({ rows: [{ drug: body.pairs[0].drug, event: body.pairs[0].event, result: { prr: 3.2, ror: 3.5, rorCi: { lower: 1.8, upper: 6.7 }, chiSquared: 12.4, ebgm: 2.9, eb05: 1.7, signalDetected: true } }], summary: { total: 1, signals: 1 } });
    if (url === '/api/pharmacovigilance/calculate-deadline') return ok({ deadline: '2026-08-05T00:00:00.000Z', expeditedReport: true, daysRemaining: 15, region: body.region, eventType: body.eventType, seriousnessCriteria: body.seriousnessCriteria });
    return ok({});
  });
});

describe('PvCockpit — real PV engine', () => {
  it('loads live safety KPIs and the compliance matrix', async () => {
    render(<PvCockpit {...props()} />);
    expect(await screen.findByText('128')).toBeTruthy();               // totalAdverseEvents KPI
    expect(await screen.findByText('non compliant')).toBeTruthy();     // compliance row
  });

  it('runs the real disproportionality screener and renders PRR/ROR/EBGM', async () => {
    render(<PvCockpit {...props()} />);
    await screen.findByText('128');
    // Textboxes in order: drug, event, then the 2×2 cells a,b,c,d.
    const tb = screen.getAllByRole('textbox');
    fireEvent.change(tb[0], { target: { value: 'DrugX' } });
    fireEvent.change(tb[1], { target: { value: 'Hepatotoxicity' } });
    fireEvent.change(tb[2], { target: { value: '20' } }); // a
    fireEvent.change(tb[3], { target: { value: '80' } }); // b
    fireEvent.change(tb[4], { target: { value: '10' } }); // c
    fireEvent.change(tb[5], { target: { value: '890' } }); // d
    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/pharmacovigilance/signals/screen');
      expect(call).toBeTruthy();
      expect(call![2].pairs[0].counts).toEqual({ a: 20, b: 80, c: 10, d: 890 });
    });
    expect(await screen.findByText('Signal detected')).toBeTruthy();
    expect(screen.getByText('3.2')).toBeTruthy(); // PRR
  });

  it('computes an expedited-reporting deadline via the real endpoint', async () => {
    render(<PvCockpit {...props()} />);
    await screen.findByText('128');
    fireEvent.click(screen.getByRole('button', { name: /Calculate deadline/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/pharmacovigilance/calculate-deadline')).toBe(true));
    expect(await screen.findByText(/Expedited report required/)).toBeTruthy();
    expect(screen.getByText(/15 day/)).toBeTruthy();
  });
});

describe('PvCockpit — a failed compliance-matrix read is an error, not an empty matrix', () => {
  it('says the matrix could not be read instead of "No compliance data yet"', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/pharmacovigilance/overview') return ok(OVERVIEW);
      if (url === '/api/pharmacovigilance/compliance-matrix') throw new Error('503 Service Unavailable');
      return ok({});
    });
    render(<PvCockpit {...props()} />);
    expect(await screen.findByText(/Couldn’t load the compliance matrix/)).toBeTruthy();
    expect(screen.queryByText(/No compliance data yet/)).toBeNull();
  });
});
