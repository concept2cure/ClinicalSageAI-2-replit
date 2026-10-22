// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
import { CatalogPanel } from '../surfaces/InsightsCatalogPanel';
import type { LibraryReportType } from '../surfaces/insightsLibraryShared';
const onRun = vi.fn();
const row = (typeId: string, label: string, state: LibraryReportType['availabilityState'], availabilityReason: string, region: string): LibraryReportType => ({
  typeId, label, family: 'regional', scopes: ['project'], computedScopes: ['project'], segments: ['pharma'],
  region, runnable: state === 'available', entitled: true, requiredTier: 'standard', computedScope: 'project',
  runScopeType: 'project', runScopeId: '11', availabilityState: state, availabilityReason,
  reasonCode: state === 'not-applicable' ? 'REGIONAL_REPORT_MARKET_MISMATCH' : null,
});
const rows = [
  row('usa_fda.ind_safety_readiness', 'FDA IND assessment', 'not-applicable', 'This report assesses a US filing; the recorded filing is EU MAA.', 'USA_FDA'),
  row('usa_fda.nda_bla_filing_readiness', 'FDA NDA/BLA assessment', 'filing-context-required', 'Record a verified filing before this assessment can run.', 'USA_FDA'),
  row('japan_pmda.jnda_shonin_readiness', 'Japan JNDA assessment', 'context-unavailable', 'The recorded filing could not be verified.', 'JP_PMDA'),
  row('ema.maa_readiness_assessment', 'EMA MAA assessment', 'available', '', 'EU_EMA'),
];
const panel = (canRun = true, entitled = true) => render(<CatalogPanel types={rows.map(type => ({ ...type, entitled }))} canRun={canRun} onRun={onRun} programLabel="Recorded EU MAA" projectId={11} />);
beforeEach(() => { onRun.mockReset(); apiRequest.mockReset(); });
afterEach(cleanup);

describe('regional catalog unavailable states retain existing UI treatment', () => {
  it('places exact reasons in current notes and offers only the admitted regional run', () => {
    panel();
    expect(screen.getAllByRole('note')).toHaveLength(3);
    for (const type of rows.filter(type => !type.runnable)) expect(screen.getByText(`${type.label} — ${type.availabilityReason}`, { exact: false })).toBeTruthy();
    const cards = document.querySelectorAll('.rl-card'); expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('EMA MAA assessment');
    expect(document.querySelector('[data-testid="rl-not-computed"]')?.textContent ?? '').not.toContain('FDA IND assessment');
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toEqual([]);
  });
  it.each(['not-applicable', 'filing-context-required', 'context-unavailable'] as const)('filters %s by its real availability without offering a Run action', state => {
    panel();
    const select = screen.getByRole('combobox', { name: 'Availability' });
    expect(within(select).getByRole('option', { name: state.replaceAll('-', ' ') })).toBeTruthy();
    fireEvent.change(select, { target: { value: state } });
    const expected = rows.find(type => type.availabilityState === state)!;
    expect(document.body.textContent).toContain(expected.availabilityReason);
    expect(document.querySelectorAll('.rl-card')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Run/ })).toBeNull();
    expect(onRun).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toEqual([]);
  });
  it('treats Region as discovery; selecting USA never changes the recorded filing or makes FDA actionable', () => {
    panel(); fireEvent.change(screen.getByRole('combobox', { name: 'Region' }), { target: { value: 'USA_FDA' } });
    expect(document.body.textContent).toContain('the recorded filing is EU MAA');
    expect(document.querySelectorAll('.rl-card')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Run/ })).toBeNull(); expect(onRun).not.toHaveBeenCalled();
  });
  it.each([[true, true], [false, true], [true, false]])('role/plan presentation never repairs a wrong-market filing (%s/%s)', (canRun, entitled) => {
    panel(canRun, entitled);
    expect(document.body.textContent).toContain('the recorded filing is EU MAA');
    expect(document.querySelectorAll('.rl-card')).toHaveLength(1);
    expect(document.querySelector('.rl-card')?.textContent).toContain('EMA MAA assessment');
    expect(onRun).not.toHaveBeenCalled();
  });
});
