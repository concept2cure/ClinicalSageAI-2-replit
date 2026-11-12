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

/* ONE_DESIGN_PLAN §2 retires ids and enum values on screen. The registry's region codes are not
   uniform (US, USA_FDA, fda, USA_OLAW) and its reporting roles are ids (ra_lead, qa): the catalog
   printed both as stored, on each card and in its two filters. */
describe('the catalog says a region and a reporting role in words, never as the registry stores them', () => {
  const withRoles = () => render(<CatalogPanel canRun onRun={onRun} programLabel="LMN-201" projectId={11} types={[
    { ...row('iacuc.protocol_status', 'IACUC Protocol Status Summary', 'available', '', 'USA_OLAW'), allowedPersonas: ['iacuc_coordinator', 'ra_lead', 'qa'] },
    { ...row('usa_fda.ind_safety', 'FDA IND assessment', 'available', '', 'fda'), allowedPersonas: ['pv_lead'] },
    { ...row('ema.maa', 'EMA MAA assessment', 'available', '', 'EU_EMA') },
    { ...row('global.matrix', 'Cross-region matrix', 'available', '', 'Global'), allowedPersonas: ['reg_strategy', 'pm'] },
  ]} />);
  const card = (title: string) => Array.from(document.querySelectorAll('.rl-card')).find(c => c.textContent?.includes(title)) as HTMLElement;

  it('on a card: the country and the agency, then who the report is for', () => {
    withRoles();
    expect(card('IACUC Protocol Status Summary').textContent).toContain('US · OLAW · For IACUC coordinator, regulatory affairs lead, quality assurance');
    expect(card('FDA IND assessment').textContent).toContain('US · FDA · For pharmacovigilance lead');
    expect(card('EMA MAA assessment').textContent).toContain('EU · EMA');
    expect(card('Cross-region matrix').textContent).toContain('Global · For regulatory strategy, project manager');
    for (const c of Array.from(document.querySelectorAll('.rl-card'))) expect(c.textContent).not.toMatch(/USA_|EU_EMA|\bra lead\b|\bqa\b|\bpv lead\b/);
  });

  it('in the Region and Reporting role filters: words to read, the stored value to filter by', () => {
    withRoles();
    const region = screen.getByRole('combobox', { name: 'Region' });
    expect(within(region).getAllByRole('option').map(o => o.textContent)).toEqual(['All', 'EU · EMA', 'Global', 'US · FDA', 'US · OLAW']);
    expect((within(region).getByRole('option', { name: 'US · OLAW' }) as HTMLOptionElement).value).toBe('USA_OLAW');
    const role = screen.getByRole('combobox', { name: 'Reporting role' });
    expect(within(role).getAllByRole('option').map(o => o.textContent)).toEqual(
      ['All', 'IACUC coordinator', 'Pharmacovigilance lead', 'Project manager', 'Quality assurance', 'Regulatory affairs lead', 'Regulatory strategy']);
    // Filtering still works by the stored value.
    fireEvent.change(region, { target: { value: 'USA_OLAW' } });
    expect(document.querySelectorAll('.rl-card')).toHaveLength(1);
  });
});

describe('a report that is not offered is named once', () => {
  it('shows the server’s sentence as it is when it opens with the report’s name', () => {
    const reason = 'EMA MAA assessment assesses an EU filing. This project is recorded as an IND, so it was not assessed under this market’s name.';
    render(<CatalogPanel canRun onRun={onRun} programLabel="LMN-201" projectId={11}
      types={[row('ema.maa_readiness_assessment', 'EMA MAA assessment', 'not-applicable', reason, 'EU_EMA')]} />);
    const note = screen.getByRole('note');
    expect(note.textContent?.trim()).toBe(reason);
    expect(note.textContent?.match(/EMA MAA assessment/g)).toHaveLength(1);
  });
});
