// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/utils/authToken', async (original) => ({ ...(await original<typeof import('@/utils/authToken')>()), getAuthToken: () => 'synthetic-test-session' }));
import { NewProjectWizard } from '../surfaces/Projects';
import { getSubmissionTypeContext } from '../surfaces/RegistryBridge';

const ids = ['us_hde', 'ca_mdl', 'ca_ivd_licence', 'jp_shonin', 'jp_nintei', 'jp_todokede', 'jp_ivd_approval', 'jp_cdx', 'us_cdx_pma', 'us_cdx_510k', 'eu_cdx_ivdr_d', 'us_510k', 'eu_mdr_techdoc'];
const originalRegistry = (window as unknown as { GLOBAL_REGISTRY: unknown }).GLOBAL_REGISTRY;
beforeEach(() => {
  Object.assign(window, { GLOBAL_REGISTRY: ids.map(id => getSubmissionTypeContext(id)) });
  apiRequest.mockImplementation(async (method: string, path: string) => {
    const url = new URL(path, 'http://localhost');
    const markets = ['FDA', 'Health Canada', 'PMDA', 'Registered certification body', 'EU / Notified Body'].filter(market => !url.searchParams.get('market') || url.searchParams.get('market') === market);
    const data = method === 'POST' ? { data: { id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' } }
      : { applicationType: url.searchParams.get('applicationType'), markets: markets.map(market => ({
          market, agency: market, summary: 'Outline only', line: 'Authoring outline available', offered: true, buildable: false,
          offer: { tier: 'author_only', label: 'Author documents for this market', reason: 'Test authoring offer.', appliesTo: null },
        })) };
    return { ok: true, status: method === 'POST' ? 201 : 200, json: async () => data };
  });
});

async function configure(id: string) {
  fireEvent.change(await screen.findByRole('textbox', { name: 'Search filing types' }), { target: { value: id } });
  const title = getSubmissionTypeContext(id)!.displayName;
  fireEvent.click(await screen.findByRole('button', { name: (name: string) => name === title || (name.startsWith(title) && /^\s/.test(name.slice(title.length))) }));
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'Device identity verification' } });
}
async function submit() {
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  fireEvent.click(screen.getByRole('button', { name: /create project/i }));
  const posted = () => apiRequest.mock.calls.find(c => c[0] === 'POST' && c[1] === '/api/c2c/projects');
  await vi.waitFor(() => expect(posted()).toBeDefined());
  return posted()![2];
}

describe('a person records the device subtype that the project retains', () => {
  it.each(['us_cdx_pma', 'us_cdx_510k', 'eu_cdx_ivdr_d'])('%s retains CDx in review and create across arrival lanes', async id => {
    render(<NewProjectWizard segment="medtech" onClose={() => {}} onNav={() => {}} />);
    await configure(id);
    expect(screen.queryByRole('combobox', { name: /product type/i })).toBeNull();
    const body = await submit();
    expect(body.productType).toBe('cdx');
    expect(document.querySelector('.npw-review')?.textContent ?? document.body.textContent).toContain('cdx');
  });
  it.each([
    ['us_510k', 'samd'], ['ca_mdl', 'samd'], ['ca_ivd_licence', 'cdx'], ['jp_ivd_approval', 'cdx'],
  ])('%s permits the supported %s refinement and sends the reviewed value', async (id, product) => {
    render(<NewProjectWizard segment="medtech" onClose={() => {}} onNav={() => {}} />);
    await configure(id);
    const select = screen.getByRole('combobox', { name: /product type/i }) as HTMLSelectElement;
    if (id === 'ca_mdl') expect(Array.from(select.options).map(o => o.value)).toEqual(['device', 'samd']);
    if (id === 'ca_ivd_licence') expect(Array.from(select.options).map(o => o.value)).toEqual(['ivd', 'cdx']);
    fireEvent.change(select, { target: { value: product } });
    expect((await submit()).productType).toBe(product);
    expect(document.body.textContent).toContain(product);
  });
  it('retires a previous subtype when the person changes filing', async () => {
    render(<NewProjectWizard segment="medtech" onClose={() => {}} onNav={() => {}} />);
    await configure('ca_mdl');
    fireEvent.change(screen.getByRole('combobox', { name: /product type/i }), { target: { value: 'samd' } });
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    await configure('ca_ivd_licence');
    expect((screen.getByRole('combobox', { name: /product type/i }) as HTMLSelectElement).value).toBe('ivd');
    expect((await submit()).productType).toBe('ivd');
  });
});
afterEach(() => { cleanup(); apiRequest.mockReset(); Object.assign(window, { GLOBAL_REGISTRY: originalRegistry }); });

describe('existing registry search reaches exact regional authoring projects', () => {
  it.each([
    { lane: 'medtech', id: 'us_hde', product: 'device', type: 'hde', agency: 'FDA' },
    { lane: 'diagnostics', id: 'us_hde', product: 'ivd', type: 'hde', agency: 'FDA' },
    { lane: 'diagnostics', id: 'ca_mdl', product: 'device', type: 'mdl', agency: 'Health Canada' },
    { lane: 'medtech', id: 'ca_ivd_licence', product: 'ivd', type: 'ivd_licence', agency: 'Health Canada' },
    { lane: 'diagnostics', id: 'jp_shonin', product: 'device', type: 'shonin', agency: 'PMDA' },
    { lane: 'diagnostics', id: 'jp_nintei', product: 'device', type: 'ninsho', agency: 'Registered certification body' },
    { lane: 'diagnostics', id: 'jp_todokede', product: 'device', type: 'todokede', agency: 'PMDA' },
    { lane: 'medtech', id: 'jp_ivd_approval', product: 'ivd', type: 'ivd_approval', agency: 'PMDA' },
    { lane: 'medtech', id: 'jp_cdx', product: 'cdx', type: 'jp_cdx', agency: 'PMDA' },
  ])('$lane search for $id retains $type/$product/$agency', async ({ lane, id, product, type, agency }) => {
    render(<NewProjectWizard segment={lane} onClose={() => {}} onNav={() => {}} />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Search filing types' }), { target: { value: id } });
    const title = getSubmissionTypeContext(id)!.displayName;
    fireEvent.click(await screen.findByRole('button', { name: (accessibleName: string) => accessibleName === title || (accessibleName.startsWith(title) && /^\s/.test(accessibleName.slice(title.length))) }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'Regional device preparation' } });
    if (agency !== 'FDA') {
      expect(screen.queryByRole('combobox', { name: /^device class/i })).toBeNull();
      expect(screen.queryByRole('textbox', { name: /^product code/i })).toBeNull();
      expect(screen.queryAllByRole('textbox', { name: /predicate/i })).toHaveLength(0);
    }
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    const posted = () => apiRequest.mock.calls.find(c => c[0] === 'POST' && c[1] === '/api/c2c/projects');
    await vi.waitFor(() => expect(posted()).toBeDefined());
    expect(posted()![2]).toMatchObject({ programType: type, productType: product, submissionTypeId: id, primaryAgency: agency });
    expect(posted()![2].euMdrClass).toBeUndefined(); expect(posted()![2].euIvdrClass).toBeUndefined();
    if (agency !== 'FDA') expect(posted()![2].deviceClassification).toEqual({ intendedUse: '' });
  });
});
