// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: request }));
import { RegistryPicker } from '../surfaces/AnaVerbs';
import { GLOBAL_REGISTRY } from '../surfaces/RegistryBridge';
import { FILING_CATALOG, FILING_CATEGORY_METADATA, filingWfCode, filingAskPrompt } from '@shared/regulatory/filing-catalog';
const typeOf = (entry: { id: string }) => entry.id === 'eu_maa' ? 'blocked' : 'ind';
const props = { value: '', onChange: vi.fn(), applicationTypeOf: typeOf, initialSegment: 'pharma_biotech' };
async function ready() { return screen.findByRole('textbox', { name: 'Search filing types' }); }
beforeEach(() => {
  props.onChange.mockClear();
  request.mockReset().mockImplementation(async (_method: string, raw: string) => {
    const url = new URL(raw, 'http://test');
    const blocked = url.searchParams.get('applicationType') === 'blocked';
    return { ok: true, status: 200, json: async () => ({ markets: [{ agency: url.searchParams.get('market') || 'FDA',
      offer: { tier: blocked ? 'not_offered' : 'author_only', label: blocked ? 'Not offered' : 'Author documents for this market', reason: blocked ? 'Recorded server refusal' : 'Recorded server authoring offer' } }] }) };
  });
});
afterEach(cleanup);
describe('filing catalogue functions reached in the canonical picker', () => {
  it('shows category descriptions and identifies the segment on cross-segment results', async () => {
    render(<RegistryPicker {...props} />); await ready();
    const category = FILING_CATEGORY_METADATA.find(c => c.id === GLOBAL_REGISTRY.find(e => e.id === 'us_ind')!.category)!;
    expect(screen.getByText(category.description)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search filing types' }), { target: { value: '510(k) Premarket Notification' } });
    const card = screen.getByRole('button', { name: /510\(k\) Premarket Notification/ });
    expect(card.textContent).toContain('Medical Devices');
  });
  it('searches by the existing workflow display label as well as descriptions', async () => {
    render(<RegistryPicker {...props} />); await ready();
    const filing = FILING_CATALOG.find(e => filingWfCode(e) === 'clindoc' && !JSON.stringify(e).toLowerCase().includes('clinical doc'))!;
    expect(filing).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search filing types' }), { target: { value: 'Clinical Doc' } });
    expect(screen.getByRole('button', { name: new RegExp(filing.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeTruthy();
  });
  it('shows exact filing metadata and authored lifecycle content for an offered selection', async () => {
    render(<RegistryPicker {...props} value="us_ind" />); await ready();
    const note = screen.getByTestId('rpk-chosen-offer');
    expect(within(note).getByTestId('filing-reference-metadata').textContent).toContain('eCTD');
    expect(note.textContent).toContain('M1–M5');
    expect(note.textContent).toContain('FDA');
    const lifecycle = within(note).getByTestId('filing-lifecycle-reference');
    expect(lifecycle.textContent).toContain('Authored lifecycle reference');
    expect(lifecycle.textContent).toContain('IND: 30-day default review');
    expect(lifecycle.textContent).toContain('Pre-IND meeting');
    expect(lifecycle.textContent).toContain('Clinical Hold');
    expect(lifecycle.textContent).toMatch(/not this project.s status, deadline or agency commitment/i);
    expect(props.onChange).not.toHaveBeenCalled();
  });
  it('lets every unavailable filing be inspected without selecting or starting it', async () => {
    const onAsk = vi.fn(); render(<RegistryPicker {...props} onAsk={onAsk} />); await ready();
    const refused = screen.getByTestId('rpk-not-offered');
    expect(refused.textContent).toContain('Recorded server refusal');
    const entry = GLOBAL_REGISTRY.find(e => e.id === 'eu_maa')!;
    fireEvent.click(within(refused).getByText(`Reference details for ${entry.displayName}`));
    expect(refused.textContent).toContain(entry.description);
    expect(within(refused).getByTestId('filing-reference-metadata').textContent).toContain(entry.submissionFormat);
    expect(within(refused).getByTestId('filing-lifecycle-reference').textContent).toContain('Response to deficiencies');
    fireEvent.click(within(refused).getByRole('button', { name: 'Ask AnA' }));
    expect(onAsk).toHaveBeenCalledExactlyOnceWith(filingAskPrompt(entry.displayName));
    expect(within(refused).queryByRole('button', { name: /Start|Continue|Create|Open workflow/ })).toBeNull();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('reports only the actual segment and search to its caller', async () => {
    const browse = vi.fn(); render(<RegistryPicker {...props} onBrowseChange={browse} />); await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search filing types' }), { target: { value: 'Clinical Hold' } });
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith(expect.objectContaining({ segment: 'pharma_biotech', searchTerm: 'Clinical Hold' })));
  });
  it('publishes the opened unavailable reference separately and clears it when closed', async () => {
    const browse = vi.fn(); render(<RegistryPicker {...props} onBrowseChange={browse} />); await ready();
    const entry = GLOBAL_REGISTRY.find(e => e.id === 'eu_maa')!;
    const summary = screen.getByText(`Reference details for ${entry.displayName}`);
    fireEvent.click(summary);
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith(expect.objectContaining({ inspectedReference: expect.objectContaining({ id: entry.id, name: entry.displayName, agency: entry.agency }) })));
    expect(props.onChange).not.toHaveBeenCalled();
    fireEvent.click(summary);
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith(expect.objectContaining({ inspectedReference: null })));
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('retires an inspected reference when search or segment removes its detail', async () => {
    const browse = vi.fn(); render(<RegistryPicker {...props} onBrowseChange={browse} />); await ready();
    const entry = GLOBAL_REGISTRY.find(e => e.id === 'eu_maa')!;
    fireEvent.click(screen.getByText(`Reference details for ${entry.displayName}`));
    await waitFor(() => expect(browse.mock.calls.at(-1)?.[0].inspectedReference?.id).toBe(entry.id));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search filing types' }), { target: { value: 'Investigational New Drug Application' } });
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith(expect.objectContaining({ inspectedReference: null })));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search filing types' }), { target: { value: '' } });
    const summary = screen.getByText(`Reference details for ${entry.displayName}`);
    expect(summary.closest('details')!.open).toBe(false);
    fireEvent.click(summary);
    await waitFor(() => expect(browse.mock.calls.at(-1)?.[0].inspectedReference?.id).toBe(entry.id));
    fireEvent.click(screen.getByRole('button', { name: /Medical Devices/ }));
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith(expect.objectContaining({ segment: 'medical_devices', inspectedReference: null })));
    expect(screen.queryByText(`Reference details for ${entry.displayName}`)).toBeNull();
    expect(props.onChange).not.toHaveBeenCalled();
  });

});
