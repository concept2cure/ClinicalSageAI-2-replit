// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CatalogPanel } from '../surfaces/InsightsCatalogPanel';
import type { LibraryReportType } from '../surfaces/insightsLibraryShared';
import { InsightsCanvas } from '../surfaces/Insights';
import { getSurface } from '../../../../../shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));

const base: LibraryReportType = { typeId: 'readiness.executive_digest', label: 'Executive digest', family: 'readiness',
  scopes: ['project'], computedScopes: ['project'], segments: [], runnable: true, entitled: true, availabilityState: 'available' };
const types: LibraryReportType[] = [base,
  { ...base, typeId: 'locked', label: 'Engine requiring a plan', entitled: false },
  { ...base, typeId: 'context', label: 'Document engine', runnable: false, computedScopes: ['document'], availabilityState: 'scope-required' },
  { ...base, typeId: 'missing', label: 'Uncomputed audit pack', runnable: false, computedScopes: [], availabilityState: 'not-computed' },
  { ...base, typeId: 'prediction.regulatory_forecast', label: 'Regulatory forecast', family: 'prediction', runnable: false, computedScopes: [], availabilityState: 'not-computed' },
];
afterEach(cleanup);
describe('current-context report capability disclosure', () => {
  it('mounts Insights with the real surface registry and reaches its catalog without masking shared imports', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {
      organizationId: 7, tier: 'enterprise', tierResolved: true, segments: ['pharma'],
      reportTypes: [{ ...base, allowedScopes: base.scopes, allowedClientSegments: [], truthfulnessRules: { allowPartial: true } }],
      leadProgram: { projectId: 11, code: 'OWN', label: 'Chosen program', readiness: 70,
        scope: 'project', scopeId: '11', criticalBlockerCount: 0, filing: null, agency: null, pdufa: null },
      portfolio: { programs: null },
    } }) });
    const props: React.ComponentProps<typeof InsightsCanvas> = { surface: getSurface('insights')!, segment: 'pharma', onNav: vi.fn() };
    render(<InsightsCanvas {...props} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Catalog' }));
    expect(await screen.findByText(/1 report applies\. 1 is computed in this release, and 1 can be run now\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Run / })).toBeTruthy();
  });
  it('counts applicable definitions separately from engine-backed and currently runnable types', () => {
    render(<CatalogPanel types={types} programLabel="Selected program" canRun onRun={vi.fn()} />);
    /* P-122 (docs/evidence/DESIGN/P-122/reporting/, "Found, not fixed"): the lines read "5 applicable definitions ·
       3 engine-backed", "0 unregistered", "1 uncomputed · 1 prediction unavailable". Every number stays; the words
       are a reader's. */
    expect(screen.getByText(/5 reports apply\. 3 are computed in this release, and 1 can be run now\./)).toBeTruthy();
    expect(screen.getByText(/1 needs a higher plan, 1 needs a record chosen first, 0 are switched off and 0 are not registered\./)).toBeTruthy();
    expect(screen.getByText(/1 is not computed in this release, and 1 prediction is not offered\./)).toBeTruthy();
    const page = document.body.textContent ?? '';
    for (const internal of ['applicable definitions', 'engine-backed', 'unregistered', 'uncomputed', 'prediction unavailable', 'output gates']) expect(page).not.toContain(internal);
  });
  it('says where a report runs in words, never the stored scope names', () => {
    const wide = { ...base, typeId: 'wide', label: 'Wide report', computedScopes: ['project', 'submission', 'program', 'account'] };
    const declared = { ...base, typeId: 'declared', label: 'Declared only', runnable: false, computedScopes: [], scopes: ['program', 'account'], availabilityState: 'not-computed' as const };
    render(<CatalogPanel types={[base, wide, declared]} programLabel="Selected program" canRun onRun={vi.fn()} />);
    const card = (title: string) => Array.from(document.querySelectorAll('.rl-card')).find((c) => c.querySelector('.rl-card-h')?.textContent === title) as HTMLElement;
    expect(card('Executive digest').textContent).toContain('Runs over a project');
    expect(card('Wide report').textContent).toContain('Runs over a project, a submission, a project group or the account');
    expect(document.body.textContent).not.toMatch(/Runs over: |Declared for: |\bprogram, account/);
    // The filter by scope offers the same words, and still filters by the stored value.
    const scope = screen.getByLabelText('Data scope') as HTMLSelectElement;
    expect(Array.from(scope.options).map((o) => [o.value, o.text])).toEqual([['', 'All'], ['account', 'Account'], ['project', 'Project'], ['program', 'Project group'], ['submission', 'Submission']]);
    fireEvent.change(scope, { target: { value: 'program' } });
    expect(card('Wide report')).toBeTruthy();
    expect(card('Executive digest')).toBeUndefined();
  });
  it('tells the account scope from organization-wide counts in the scope filter', () => {
    // A register engine counts the organization's records whatever scope it runs at; the option read "organization"
    // beside "account". It says what the cards say.
    const register = { ...base, typeId: 'register', label: 'Register', computedScopes: ['project', 'account'], computedScope: 'organization' as const };
    render(<CatalogPanel types={[base, register]} programLabel="Selected program" canRun onRun={vi.fn()} />);
    const scope = screen.getByLabelText('Data scope') as HTMLSelectElement;
    expect(Array.from(scope.options).map((o) => [o.value, o.text])).toEqual([['', 'All'], ['organization', 'Organization-wide records'], ['project', 'Project']]);
  });
  it('offers each availability in words, and still filters by the stored value', () => {
    render(<CatalogPanel types={types} programLabel="Selected program" canRun onRun={vi.fn()} />);
    const select = screen.getByLabelText('Availability') as HTMLSelectElement;
    const offered = Object.fromEntries(Array.from(select.options).map((o) => [o.value, o.text]));
    expect(offered).toMatchObject({
      available: 'Can be run', locked: 'Needs a higher plan', 'scope-required': 'Needs a record chosen first',
      'not-computed': 'Not computed in this release', 'prediction-unavailable': 'Prediction not offered',
      disabled: 'Switched off', unregistered: 'Not registered',
    });
    for (const text of Object.values(offered)) expect(text).not.toMatch(/^[a-z]+(-[a-z]+)+$/);
  });
  it('qualifies predictions separately and never suggests a plan unlocks a validated prediction', () => {
    const run = vi.fn();
    render(<CatalogPanel types={types} programLabel="Selected program" canRun onRun={run} />);
    expect(screen.getByRole('region', { name: 'Prediction availability' }).textContent).toMatch(/no validated prediction model/i);
    expect(screen.getByRole('region', { name: 'Prediction availability' }).textContent).toMatch(/plan does not make/i);
    expect(screen.getAllByRole('button', { name: /^Run / })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Availability'), { target: { value: 'prediction-unavailable' } });
    expect(screen.getByText('Regulatory forecast')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Run / })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
