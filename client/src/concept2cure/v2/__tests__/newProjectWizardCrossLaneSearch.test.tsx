// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/utils/authToken', async (original) => ({ ...(await original<typeof import('@/utils/authToken')>()), getAuthToken: () => 'synthetic-test-session' }));
import { NewProjectWizard } from '../surfaces/Projects';
import { getSubmissionTypeContext } from '../surfaces/RegistryBridge';

const ids = ['eu_mdr_techdoc', 'eu_cer', 'us_510k_ivd', 'us_510k'];
const originalRegistry = (window as unknown as { GLOBAL_REGISTRY: unknown }).GLOBAL_REGISTRY;
beforeEach(() => {
  Object.assign(window, { GLOBAL_REGISTRY: ids.map(id => getSubmissionTypeContext(id)) });
  apiRequest.mockImplementation(async (method: string, path: string) => {
    const url = new URL(path, 'http://localhost');
    const markets = ['FDA', 'EU / Notified Body'].filter(market => !url.searchParams.get('market') || url.searchParams.get('market') === market);
    const data = method === 'POST' ? { data: { id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' } }
      : { applicationType: url.searchParams.get('applicationType'), markets: markets.map(market => ({
          market, agency: market, summary: 'Outline only', line: 'Authoring outline available', offered: true, buildable: false,
          offer: { tier: 'author_only', label: 'Author documents for this market', reason: 'Test authoring offer.', appliesTo: null },
        })) };
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
    const title = getSubmissionTypeContext(id)!.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${title}(?:\\s|$)`) }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'Cross-lane device preparation' } });
    fireEvent.change(screen.getByRole('combobox', { name: classLabel }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(screen.getByText(new RegExp(` · ${product}$`))).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    const posted = () => apiRequest.mock.calls.find(c => c[0] === 'POST' && c[1] === '/api/c2c/projects');
    await vi.waitFor(() => expect(posted()).toBeDefined());
    expect(posted()![2]).toMatchObject({ productType: product, submissionTypeId: id });
  });
});
