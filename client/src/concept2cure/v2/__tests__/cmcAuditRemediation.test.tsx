// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({ enforced: true as boolean | null, api: vi.fn(), rows: [] as unknown[], links: null as unknown }));
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: state.api }));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: { id: '7', role: 'admin', email: 'qa@example.test' } }) }));
vi.mock('../navEntitlements', () => ({ useNavEntitlements: () => ({ launchScopeEnforced: state.enforced, resolved: true, verdictFor: () => null }) }));
vi.mock('../dataConnect', async (original) => ({
  ...await original<typeof import('../dataConnect')>(),
  useLiveData: (path: string | null) => ({ data: path?.includes('/register-links/') ? state.links : null, loading: false, error: null }),
  useLiveRows: () => ({ rows: state.rows, loading: false, error: null, empty: true, meta: {} }),
}));

import { CmcModule, CmChange } from '../surfaces/CmcModule';
import { RegisterCard } from '../surfaces/cmcRegisters';
import { CmcRegisterLinks } from '../surfaces/CmcRegisterLinks';
import { getSurface } from '@shared/constants/ui-surface-registry';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const WARNING = 'Saved to the register. The Module 3 canonical write did not complete; retry the link.';
beforeEach(() => {
  state.api.mockReset(); state.enforced = true; state.links = null;
  (window as any).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('CMC audited workflow gaps', () => {
  it.each([true, null])('refuses postapproval filing classification when launch scope is %s', (enforced) => {
    state.enforced = enforced;
    render(<CmChange ask={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Simulate change/i })).toBeNull();
    expect(screen.getByText(/Postapproval variation assessment is outside this release/i)).toBeTruthy();
    expect(screen.getByText(/small-molecule Module 3 for a US IND/i)).toBeTruthy();
    expect(state.api).not.toHaveBeenCalled();
  });

  it('opens the reachable Module 3 build from the dossier control without leaving CMC', async () => {
    const nav = vi.fn();
    const surface = getSurface('cmc');
    if (!surface) throw new Error('CMC surface is missing from the canonical registry');
    render(<CmcModule surface={surface} segment="biopharma" onAsk={vi.fn()} onNav={nav} />);
    fireEvent.click(screen.getByRole('button', { name: /^Module 3 dossier$/i }));
    expect(await screen.findByRole('button', { name: /Compile Module 3/i })).toBeTruthy();
    expect(nav).not.toHaveBeenCalledWith('dossier');
    expect((window as any).C2C_PROJECT.id).toBe(PROJECT);
  });

  it('retains the saved row while visibly reporting a failed Module 3 link', async () => {
    state.api.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { id: 31, name: 'Recorded method' }, module3Linked: false, module3Warning: WARNING }) });
    render(<RegisterCard path="/api/cmc/analytical-methods" title="Methods" meta={() => ''} icon={null} loadingTitle="Loading" emptyTitle="No methods" emptyHint="" errorTitle="Error" errorHint="" columns={[{ header: 'Name', render: (r: any) => r.name }]} rowKey={(r: any) => r.id} create={{ label: 'Add method', subject: 'method', path: '/api/cmc/analytical-methods', form: () => ({ title: 'Record method', submitLabel: 'Save method', fields: [] }), toBody: () => ({ projectId: PROJECT }) }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add method' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save method' }));
    await waitFor(() => expect(screen.getByText('Recorded method')).toBeTruthy());
    expect(await screen.findByText(WARNING)).toBeTruthy();
  });

  it('dispatches the deferred scale-up assessment to the canonical classifier with actual scale', async () => {
    state.enforced = false;
    state.api.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { fdaReportingCategory: 'annual_report', emaVariationCategory: 'type_ia', supacTier: 'level_1', bioequivalence: 'none', rationale: ['Minor scale change'], validationRequirements: ['Record the validation'], impactedCtdSections: ['3.2.P.3'], citations: ['SUPAC-IR'] } }) });
    render(<CmChange ask={vi.fn()} />);
    const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    choose('Dosage form', 'immediate_release_oral_solid'); choose('Change category', 'scale_up');
    choose('Material affected', 'drug_product'); choose('Touches a critical step', 'no'); choose('Scale change', 'within_10x');
    choose('Change description', 'Increase the approved batch scale fivefold');
    fireEvent.click(screen.getByRole('button', { name: 'Assess proposed variation' }));
    expect(await screen.findByText('Annual Report', { selector: 'b' })).toBeTruthy();
    expect(state.api).toHaveBeenCalledWith('POST', '/api/cmc/variations/classify', expect.objectContaining({ scaleChangeFactor: 'within_10x', touchesCriticalStep: false }));
    expect(screen.queryByText('CBE-30')).toBeNull();
  });

  it('reads pending linkage after a reload and clears it only after a successful server retry', async () => {
    const missing = { register: 'analytical-methods', recordId: '31', label: 'Method AM-31', state: 'missing', retryable: true };
    state.links = { links: [missing] };
    const first = render(<CmcRegisterLinks />); first.unmount();
    render(<CmcRegisterLinks />);
    expect(screen.getByText(/the saved record has no dossier source/)).toBeTruthy();
    state.api.mockImplementation(async () => {
      state.links = { links: [{ ...missing, state: 'linked', retryable: false }] };
      return { ok: true, status: 200, json: async () => ({ success: true, module3Linked: true }) };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry Module 3 link' }));
    expect(await screen.findByText(/Method AM-31 now feeds Module 3/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry Module 3 link' })).toBeNull();
    expect(state.api).toHaveBeenCalledWith('POST', `/api/cmc/module3-os/register-links/${PROJECT}/analytical-methods/31/retry`, {});
  });

  it('keeps a failed retry pending and refuses retry of unfiled records', async () => {
    state.links = { links: [
      { register: 'analytical-methods', recordId: '31', label: 'Method AM-31', state: 'outdated', retryable: true },
      { register: 'drug-products', recordId: '32', label: 'Unfiled product', state: 'unfiled', retryable: false },
    ] };
    state.api.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, module3Linked: false, module3Warning: WARNING }) });
    render(<CmcRegisterLinks />);
    expect(screen.getAllByRole('button', { name: 'Retry Module 3 link' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Module 3 link' }));
    expect(await screen.findByText(WARNING)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry Module 3 link' })).toBeTruthy();
  });
});
