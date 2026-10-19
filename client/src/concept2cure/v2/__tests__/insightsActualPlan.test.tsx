// @vitest-environment jsdom
/** Actual plan governs execution; plan previews remain read-only discovery. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ permissions: ['governed:write'] as string[] }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ id: 7, permissions: auth.permissions }),
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const PROPS: OwnedSurfaceViewProps = { surface: { id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface'], segment: 'pharma', onNav: () => {} };
const BASE = { typeId: 'readiness.executive_digest', label: 'Executive Readiness Digest', family: 'readiness', allowedScopes: ['project'], computedScopes: ['project'], allowedClientSegments: ['pharma'], runnable: true, availabilityState: 'available', computedScope: 'project', runScopeType: 'project', runScopeId: '11' };
const DOCUMENT = { typeId: 'provenance.evidence_trace_report', label: 'Evidence & Provenance Trace Report', family: 'evidence_provenance', allowedScopes: ['document'], computedScopes: ['document'], allowedClientSegments: ['pharma'], runnable: false, availabilityState: 'scope-required', availabilityReason: 'Choose a governed document for this report.', computedScope: 'document' };
const WRONG_FILING = { typeId: 'usa_fda.ind_safety_readiness', label: 'FDA IND assessment', family: 'usa_fda_ind', allowedScopes: ['project'], computedScopes: ['project'], allowedClientSegments: ['pharma'], runnable: false, availabilityState: 'not-applicable', availabilityReason: 'This report assesses a US filing; the recorded filing is EU MAA.', reasonCode: 'REGIONAL_REPORT_MARKET_MISMATCH', region: 'USA_FDA' };
const RENDERED = { reportTypeId: BASE.typeId, scopeType: 'project', scopeId: '11', generatedAt: '2026-10-14T08:00:00.000Z', status: 'partial', sections: [{ id: 'summary', title: 'Readiness summary', blocks: [] }] };
const DOCUMENT_ID = 'cccccccc-0000-4000-8000-000000000001';
type Plan = 'free' | 'standard' | 'professional' | 'enterprise';
let plan: Plan;
let resolved: boolean | undefined;
let explicitAllowed: boolean | undefined;
let requiredTier: string;
let includeDocument: boolean;
let includeWrongFiling: boolean;
let accountScope: boolean;

function overview() {
  const entitlement = { entitled: explicitAllowed ?? plan !== 'free', requiredTier, tierResolved: resolved };
  return { data: {
    organizationId: 1, tier: plan, ...(resolved === undefined ? {} : { tierResolved: resolved }), segments: ['pharma'],
    reportTypes: [{ ...BASE, ...(accountScope ? { allowedScopes: ['account'], computedScopes: ['account'] } : {}), ...entitlement }, ...(includeDocument ? [{ ...DOCUMENT, ...entitlement }] : []), ...(includeWrongFiling ? [{ ...WRONG_FILING, ...entitlement }] : [])],
    leadProgram: { projectId: 11, scope: 'project', scopeId: '11', code: 'BX204', label: 'BX204', filing: 'EU MAA', readiness: null, agency: 'EMA', pdufa: null, criticalBlockerCount: 0 },
    portfolio: { entitled: plan === 'enterprise', programs: null },
  } };
}

beforeEach(() => {
  plan = 'free'; resolved = true; explicitAllowed = undefined; requiredTier = 'standard'; includeDocument = false; includeWrongFiling = false; accountScope = false;
  auth.permissions = ['governed:write'];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith('/api/insights-canvas/overview')) return ok(overview());
    if (method === 'POST' && url === '/api/report-os/runs') return ok({ data: { run: { id: 41 } } });
    if (url === '/api/report-os/runs/41/rendered') return ok({ data: RENDERED });
    if (url.startsWith('/api/report-os/runs')) return ok({ data: [{ id: 41, runUuid: 'aaaaaaaa-0000-4000-8000-000000000001', reportTypeId: BASE.typeId, reportTypeLabel: BASE.label, scopeType: 'project', scopeId: '11', status: 'partial', confidence: null, createdAt: RENDERED.generatedAt }] });
    if (url === '/api/concept2cure/projects/11/artifacts') return ok({ data: [{ id: DOCUMENT_ID, title: 'Retained protocol' }] });
    return ok({});
  });
});
afterEach(cleanup);
const runs = () => apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && url === '/api/report-os/runs');
async function canvas() {
  render(<InsightsCanvas {...PROPS} />);
  await screen.findByLabelText('Find a report');
}
function ask() {
  const field = screen.getByLabelText('Find a report');
  fireEvent.change(field, { target: { value: 'Generate the Executive Readiness Digest' } });
  fireEvent.keyDown(field, { key: 'Enter' });
}
function preview(name: string) {
  fireEvent.click(within(screen.getByRole('group', { name: 'Subscription tier' })).getByRole('button', { name }));
}
async function catalog() {
  fireEvent.click(screen.getByRole('tab', { name: 'Report catalog' }));
  await screen.findByRole('heading', { name: 'Report catalog' });
}
async function pack() {
  fireEvent.click(document.querySelector('.rc-preset-btn') as HTMLElement);
  await waitFor(() => expect(document.querySelector('.ro-pack-grid')).not.toBeNull());
}

function expectPlanRefusal(text: string | null | undefined) {
  expect(text).toMatch(/Standard plan/);
  expect(text).not.toMatch(/needs an editor role|could not be verified/);
  expect(runs()).toHaveLength(0);
}

describe('actual known Free plan — generation controls', () => {
  it('refuses base-report Find/Enter under the actual Free plan', async () => {
    await canvas(); ask();
    expectPlanRefusal(screen.getByTestId('rc-find-result').textContent);
  });
  it('shows a known plan requirement instead of runnable pack tiles', async () => {
    await canvas(); await pack();
    expect(document.querySelectorAll('button.ro-pack-card')).toHaveLength(0);
    expectPlanRefusal(document.querySelector('.ro-pack-grid')?.textContent);
  });
  it('keeps the catalog readable and locks base execution on Free', async () => {
    await canvas(); await catalog();
    expect(document.querySelectorAll('button.rl-card-run:not(:disabled)')).toHaveLength(0);
    expectPlanRefusal(document.querySelector('.rc-canvas')?.textContent);
  });
  it.each(['Standard', 'Enterprise'])('a %s preview cannot grant a Find request', async name => {
    await canvas(); preview(name); ask();
    expect(runs()).toHaveLength(0);
    expectPlanRefusal(document.querySelector('.rc-ana-scroll')?.textContent);
    expect(screen.getByTestId('rc-tier-preview').textContent).toMatch(/plan is Free/);
  });
  it.each(['Standard', 'Enterprise'])('a %s preview keeps packs browsable without runnable tiles', async name => {
    await canvas(); preview(name); await pack();
    expect(document.querySelectorAll('button.ro-pack-card')).toHaveLength(0);
    expectPlanRefusal(document.querySelector('.ro-pack-grid')?.textContent);
  });
  it.each(['Standard', 'Enterprise'])('a %s preview keeps catalog controls disabled with the actual plan reason', async name => {
    await canvas(); preview(name); await catalog();
    const control = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement;
    expect(control.disabled).toBe(true);
    expectPlanRefusal(control.getAttribute('title'));
    expect(document.querySelector('.rl-card')?.textContent).toMatch(/Standard plan/);
    fireEvent.click(control); expect(runs()).toHaveLength(0);
  });
});

describe('actual per-type plan decision and supported context', () => {
  it('honors an explicit canonical denial despite a higher local preview', async () => {
    plan = 'standard'; explicitAllowed = false; requiredTier = 'enterprise';
    await canvas(); preview('Enterprise'); ask();
    expect(runs()).toHaveLength(0);
    expect(document.querySelector('.rc-ana-scroll')?.textContent).toMatch(/Enterprise plan/);
  });
  it('keeps a document-bound Run disabled with its actual plan reason', async () => {
    includeDocument = true;
    await canvas(); preview('Standard'); await catalog();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a document' }));
    fireEvent.change(await screen.findByRole('combobox', { name: /Document/ }), { target: { value: DOCUMENT_ID } });
    const control = screen.getByRole('button', { name: /Run document trace/ }) as HTMLButtonElement;
    expect(control.disabled).toBe(true);
    expectPlanRefusal(control.getAttribute('title'));
    fireEvent.click(control); expect(runs()).toHaveLength(0);
  });
  it.each(['Standard', 'Enterprise'])('a %s preview preserves the exact wrong-filing reason without enabling it', async name => {
    includeWrongFiling = true;
    await canvas(); preview(name); await catalog();
    expect(document.body.textContent).toContain(WRONG_FILING.availabilityReason);
    const note = screen.getByText(`${WRONG_FILING.label} — ${WRONG_FILING.availabilityReason}`);
    expect(note.closest('.ro-dash-note')?.getAttribute('role')).toBe('note');
    expect(note.closest('.rl-card')).toBeNull();
    expect(runs()).toHaveLength(0);
  });
  it('preserves an unsupported pack scope before giving a plan explanation', async () => {
    accountScope = true;
    await canvas(); preview('Standard'); await pack();
    expect(document.querySelector('.ro-pack-grid')?.textContent).toMatch(/Runs over account, not a single project/);
    expect(document.querySelectorAll('button.ro-pack-card')).toHaveLength(0);
    expect(runs()).toHaveLength(0);
  });
});

describe('actual plan — existing reads and positive execution', () => {
  it.each(['standard', 'professional', 'enterprise'] as const)('a known %s plan retains base-report execution', async actual => {
    plan = actual;
    await canvas(); ask();
    await waitFor(() => expect(document.querySelector('.ro-report')).not.toBeNull());
    expect(runs()).toHaveLength(1);
  });
  it('preserves omitted-flag legacy execution', async () => {
    plan = 'standard'; resolved = undefined;
    await canvas(); ask();
    await waitFor(() => expect(document.querySelector('.ro-report')).not.toBeNull());
    expect(runs()).toHaveLength(1);
  });
  it('preserves verification failure before a known-plan explanation', async () => {
    resolved = false;
    await canvas(); ask();
    expect(screen.getByTestId('rc-find-result').textContent).toMatch(/plan could not be verified/);
    expect(document.querySelector('.rc-lock')).toBeNull(); expect(runs()).toHaveLength(0);
  });
  it('opens a retained history report on Free without generating one', async () => {
    await canvas();
    fireEvent.click(screen.getByRole('tab', { name: 'Run history' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    await waitFor(() => expect(document.querySelector('.ro-report')).not.toBeNull());
    expect(runs()).toHaveLength(0);
  });
  it('preserves the existing role explanation for a view-only known entitled plan', async () => {
    plan = 'standard'; auth.permissions = [];
    await canvas(); await pack();
    expect(document.querySelector('.ro-pack-grid')?.textContent).toMatch(/needs an editor role/);
    expect(document.querySelectorAll('button.ro-pack-card')).toHaveLength(0);
  });
  it('keeps exactly the three existing plan preview choices', async () => {
    await canvas();
    expect(within(screen.getByRole('group', { name: 'Subscription tier' })).getAllByRole('button').map(button => button.textContent)).toEqual(['Standard', 'Professional', 'Enterprise']);
  });
});
