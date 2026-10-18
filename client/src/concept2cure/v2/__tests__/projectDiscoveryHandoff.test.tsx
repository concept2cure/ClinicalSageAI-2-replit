// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDiscoveryAnswers } from '@shared/types/onboarding-discovery';
import { completeDiscovery } from './onboardingDiscoveryFixtures';

const { request, identity, registry } = vi.hoisted(() => ({
  request: vi.fn(), identity: { orgId: '7' }, registry: { device: false },
}));
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: request,
}));
vi.mock('@/utils/authToken', async original => ({
  ...(await original<typeof import('@/utils/authToken')>()), getJwtOrgId: () => identity.orgId,
}));
vi.mock('../surfaces/AnaVerbs', () => ({ RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => <button onClick={() => onChange(registry.device ? '510k' : 'us_ind')}>Pick filing</button> }));
vi.mock('../surfaces/RegistryBridge', () => ({ getSubmissionTypeContext: () => registry.device
  ? { id: '510k', displayName: '510(k)', pathwayKey: '510k', agency: 'FDA', region: 'US' }
  : { id: 'us_ind', displayName: 'IND', pathwayKey: 'ind', agency: 'FDA', region: 'US' },
}));
vi.mock('../MarketSupportLine', () => ({ MarketSupportLine: () => null }));

import { NewProjectWizard } from '../surfaces/Projects';
import { ProjectDiscoveryHandoff } from '../surfaces/ProjectDiscoveryHandoff';

const record = (answers = { ...completeDiscovery(), targetDate: '2027-03-15' }, completedAt: string | null = '2026-10-14T00:00:00.000Z') => ({
  schemaVersion: 1, revision: 3, answers, updatedAt: '2026-10-14T00:00:00.000Z', updatedBy: 9, completedAt,
});
const response = (discovery: unknown, canEdit = true) => ({ ok: true, json: async () => ({ success: true, data: { discovery, canEdit } }) });
const nameInput = () => screen.getByRole('textbox', { name: /^Project name/ }) as HTMLInputElement;
const indicationInput = () => screen.getByRole('textbox', { name: /^Indication/ }) as HTMLInputElement;
const targetInput = () => screen.getByLabelText('Target submission date') as HTMLInputElement;
const applyButton = () => screen.getByRole('button', { name: 'Use saved discovery in blank fields' });

function configure() {
  render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pick filing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}
async function review() {
  fireEvent.click(screen.getByRole('button', { name: 'Review saved discovery' }));
  await screen.findByRole('button', { name: 'Use saved discovery in blank fields' });
}
beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(response(record()));
  identity.orgId = '7';
  registry.device = false;
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

describe('saved discovery in the canonical new-project wizard', () => {
  it('reads only on request, previews context, and copies stated fields only after confirmation', async () => {
    configure();
    expect(request).not.toHaveBeenCalled();
    expect(nameInput().value).toBe('');
    await review();
    expect(nameInput().value).toBe('');
    expect(screen.getByText(completeDiscovery().projectGoal)).toBeTruthy();
    expect(screen.getByText('United States')).toBeTruthy();
    fireEvent.click(applyButton());
    expect(nameInput().value).toBe('Program Alpha');
    expect(indicationInput().value).toBe('Adults with advanced solid tumors.');
    expect(targetInput().value).toBe('2027-03-15');
    expect((screen.getByRole('textbox', { name: /^Product name$/ }) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('combobox', { name: /^Product type/ }) as HTMLSelectElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    expect(request.mock.calls).toEqual([['GET', '/api/onboarding/discovery']]);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('preserves manually entered fields, including entries typed after the preview was loaded', async () => {
    configure();
    fireEvent.change(nameInput(), { target: { value: 'My chosen name' } });
    await review();
    fireEvent.change(indicationInput(), { target: { value: 'My stated indication' } });
    fireEvent.click(applyButton());
    expect(nameInput().value).toBe('My chosen name');
    expect(indicationInput().value).toBe('My stated indication');
    expect(targetInput().value).toBe('2027-03-15');
  });

  it('allows a member to reuse a saved draft and never substitutes therapeutic area for indication', async () => {
    request.mockResolvedValue(response(record({ ...emptyDiscoveryAnswers(), projectName: 'Working program', therapeuticAreas: ['Oncology'], targetDate: '' }, null), false));
    configure();
    await review();
    expect(screen.getByText(/Saved discovery draft/)).toBeTruthy();
    fireEvent.click(applyButton());
    expect(nameInput().value).toBe('Working program');
    expect(indicationInput().value).toBe('');
    expect(targetInput().value).toBe('');
    expect(request.mock.calls.every(call => call[0] === 'GET')).toBe(true);
  });

  it('copies device purpose only into intended use and leaves classification fields unset', async () => {
    registry.device = true;
    request.mockResolvedValue(response(record({ ...completeDiscovery(), targetDate: '2027-03-15', devicePurpose: 'A device intended for use in clinical laboratories.' })));
    configure();
    await review();
    fireEvent.click(applyButton());
    expect((screen.getByRole('textbox', { name: 'Indications for use' }) as HTMLTextAreaElement).value).toBe('A device intended for use in clinical laboratories.');
    expect((screen.getByRole('combobox', { name: 'Device class' }) as HTMLSelectElement).value).toBe('');
    expect((screen.getByRole('textbox', { name: /^Product code/ }) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('textbox', { name: /^Predicate device/ }) as HTMLInputElement).value).toBe('');
  });

  it('keeps project creation on the separate review step and sends the reviewed copied wording', async () => {
    configure();
    await review();
    fireEvent.click(applyButton());
    fireEvent.change(screen.getByRole('combobox', { name: /^Product type/ }), { target: { value: 'drug' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Product name' }), { target: { value: 'User-stated product' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Review & create' })).toBeTruthy();
    expect(request.mock.calls.some(call => call[0] === 'POST')).toBe(false);
    request.mockResolvedValue({ ok: true, json: async () => ({ data: { id: '8a11b987-ac2d-4748-9e9c-5dc40c082662' } }) });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', '/api/c2c/projects', expect.objectContaining({
      name: 'Program Alpha', productName: 'User-stated product', productType: 'drug',
      indication: 'Adults with advanced solid tumors.', targetSubmissionDate: '2027-03-15',
    })));
  });

});

describe('discovery reads and tenant boundaries', () => {
  it('shows an honest unstarted state while manual project entry remains usable', async () => {
    request.mockResolvedValue(response(null));
    configure();
    fireEvent.click(screen.getByRole('button', { name: 'Review saved discovery' }));
    await screen.findByText(/no saved discovery yet/);
    expect(screen.queryByRole('button', { name: 'Use saved discovery in blank fields' })).toBeNull();
    fireEvent.change(nameInput(), { target: { value: 'Manual project' } });
    expect(nameInput().value).toBe('Manual project');
  });

  it.each(['network', 'invalid'])('reports a %s read failure and allows an explicit retry', async failure => {
    if (failure === 'network') request.mockRejectedValueOnce(new Error('sensitive driver error'));
    else request.mockResolvedValueOnce(response({ ...record(), updatedBy: -1 }));
    configure();
    fireEvent.click(screen.getByRole('button', { name: 'Review saved discovery' }));
    expect((await screen.findByText(/Saved discovery could not be read/)).getAttribute('role')).toBe('alert');
    expect(screen.queryByText(/sensitive driver/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry saved discovery' }));
    await screen.findByRole('button', { name: 'Use saved discovery in blank fields' });
  });

  it('drops a late tenant read and never applies another organization’s preview', async () => {
    let finish: (value: ReturnType<typeof response>) => void = () => {};
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const onApply = vi.fn();
    const props = { fields: { name: '', target: '', indication: '', intendedUse: '' }, isDeviceFiling: false, disabled: false, onApply };
    const view = render(<ProjectDiscoveryHandoff {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review saved discovery' }));
    identity.orgId = '8';
    view.rerender(<ProjectDiscoveryHandoff {...props} />);
    await act(async () => finish(response(record())));
    expect(screen.queryByText('Program Alpha')).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });
});
