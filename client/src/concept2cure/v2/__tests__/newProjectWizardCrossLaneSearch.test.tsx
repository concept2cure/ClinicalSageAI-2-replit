// @vitest-environment jsdom
import React from 'react';
import { intakeFixtureRequest, waitForIntakeWorkspace } from './projectIntakeFixture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: (...args: unknown[]) => intakeFixtureRequest(apiRequest, args) }));
vi.mock('@/utils/authToken', async (original) => ({ ...(await original<typeof import('@/utils/authToken')>()), getAuthToken: () => 'synthetic-test-session' }));
import { NewProjectWizard } from '../surfaces/Projects';
import { PRODUCT_TYPES } from '@shared/constants/domain/product-types';
import { getSubmissionTypeContext } from '../surfaces/RegistryBridge';

const ids = ['eu_mdr_techdoc', 'eu_cer', 'us_510k_ivd', 'us_510k'];
const originalRegistry = (window as unknown as { GLOBAL_REGISTRY: unknown }).GLOBAL_REGISTRY;
beforeEach(() => {
  Object.assign(window, { GLOBAL_REGISTRY: ids.map(id => getSubmissionTypeContext(id)) });
  apiRequest.mockImplementation(async (method: string, path: string) => {
    const url = new URL(path, 'http://localhost');
    const asked = (url.searchParams.get('market') ?? '').split(',').filter(Boolean);
    const markets = ['FDA', 'EU / Notified Body'].filter(market => !asked.length || asked.includes(market));
    const rows = () => markets.map(market => ({
      market, agency: market, summary: 'Outline only', line: 'Authoring outline available', offered: true, buildable: false,
      offer: { tier: 'author_only', label: 'Author documents for this market', reason: 'Test authoring offer.', appliesTo: null },
    }));
    // A comma-separated list of types is answered by type, as the route answers it (2026-11-09).
    const types = (url.searchParams.get('applicationType') ?? '').split(',');
    const data = method === 'POST' ? { data: { id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' } }
      : types.length > 1 ? { applicationTypes: types, byType: Object.fromEntries(types.map(t => [t, rows()])) }
        : { applicationType: types[0], markets: rows() };
    return { ok: true, status: method === 'POST' ? 201 : 200, json: async () => data };
  });
});
afterEach(() => { cleanup(); apiRequest.mockReset(); Object.assign(window, { GLOBAL_REGISTRY: originalRegistry }); });

describe('actual registry search preserves the selected product family across lanes', () => {
  it.each([
    { lane: 'diagnostics', id: 'eu_mdr_techdoc', product: 'device', classLabel: 'EU MDR class', value: 'IIa' },
    { lane: 'diagnostics', id: 'eu_cer', product: 'device', classLabel: 'EU MDR class', value: 'IIa' },
    { lane: 'medtech', id: 'us_510k_ivd', product: 'ivd', classLabel: 'Device class', value: 'II' },
    { lane: 'diagnostics', id: 'us_510k', product: 'ivd', classLabel: 'Device class', value: 'II' },
  ])('$lane search for $id records $product', async ({ lane, id, product, classLabel, value }) => {
    render(<NewProjectWizard segment={lane} onClose={() => {}} onNav={() => {}} />);
    // The actual RegistryPicker searches all segments; selecting a result does
    // not switch its tab. No picker or RegistryBridge replacement is involved.
    const search = await screen.findByRole('textbox', { name: 'Search filing types' });
    fireEvent.change(search, { target: { value: id } });
    const title = getSubmissionTypeContext(id)!.displayName;
    fireEvent.click(await screen.findByRole('button', { name: (accessibleName: string) => accessibleName === title || (accessibleName.startsWith(title) && /^\s/.test(accessibleName.slice(title.length))) }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await waitForIntakeWorkspace();
    fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'Cross-lane device preparation' } });
    fireEvent.change(screen.getByRole('combobox', { name: classLabel }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    // The review names the product type by its label (2026-10-31), the create sends its value.
    expect(screen.getByText((content: string) => content.endsWith(` · ${PRODUCT_TYPES.find(t => t.value === product)!.label}`))).toBeDefined();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /create project/i })); });
    const posted = () => apiRequest.mock.calls.find(c => c[0] === 'POST' && c[1] === '/api/c2c/projects');
    await vi.waitFor(() => expect(posted()).toBeDefined());
    expect(posted()![2]).toMatchObject({ productType: product, submissionTypeId: id });
  });
});
