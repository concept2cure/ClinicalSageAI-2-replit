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
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    expect(await screen.findByText(/1 applicable definitions · 1 engine-backed · 1 available to run/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Run$/ })).toBeTruthy();
  });
  it('counts applicable definitions separately from engine-backed and currently runnable types', () => {
    render(<CatalogPanel types={types} programLabel="Selected program" canRun onRun={vi.fn()} />);
    expect(screen.getByText(/5 applicable definitions · 3 engine-backed · 1 available to run/)).toBeTruthy();
    expect(screen.getByText(/1 requires a plan · 1 requires context/)).toBeTruthy();
    expect(screen.getByText(/1 uncomputed · 1 prediction unavailable/)).toBeTruthy();
  });
  it('qualifies predictions separately and never suggests a plan unlocks a validated prediction', () => {
    const run = vi.fn();
    render(<CatalogPanel types={types} programLabel="Selected program" canRun onRun={run} />);
    expect(screen.getByRole('region', { name: 'Prediction availability' }).textContent).toMatch(/no validated prediction model/i);
    expect(screen.getByRole('region', { name: 'Prediction availability' }).textContent).toMatch(/plan does not make/i);
    expect(screen.getAllByRole('button', { name: /Run$/ })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Availability'), { target: { value: 'prediction-unavailable' } });
    expect(screen.getByText('Regulatory forecast')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Run$/ })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
