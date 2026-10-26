// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ actor: 12, org: 7, tenant: 7, request: vi.fn() }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ id: String(h.actor), organizationId: String(h.org) }) }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: h.tenant }, setCurrentClientWorkspace: vi.fn() }) }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: h.request }));
vi.mock('../surfaces/AnaVerbs', () => ({ RegistryPicker: ({ value, onChange, onAsk }: {
  value: string; onChange: (id: string) => void; onAsk?: (question: string) => void;
}) => <>
  <button onClick={() => onChange('us_ind')}>Pick IND</button>
  <button onClick={() => onChange('us_nda')}>Pick NDA</button>
  {value && onAsk && <button onClick={() => onAsk(`Question about ${value}`)}>Ask about filing</button>}
</> }));
vi.mock('../surfaces/RegistryBridge', () => ({ getSubmissionTypeContext: (id: string) => ({ id,
  displayName: id === 'us_ind' ? 'Investigational New Drug Application' : 'New Drug Application',
  pathwayKey: id === 'us_ind' ? 'ind' : 'nda', agency: 'FDA', region: 'US',
}) }));

import { Projects } from '../surfaces/Projects';
import { __resetSurfaceActionBus } from '../surfaceActions';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const props = () => ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const token = () => setAuthToken(`e30.${btoa(JSON.stringify({ userId: h.actor, organizationId: h.org }))}.signature`);
function Probe({ seen }: { seen: { ctx: SurfaceContext | null } }) { seen.ctx = useActiveSurfaceContext('projects'); return null; }
function mount(onAsk = vi.fn()) {
  const seen = { ctx: null as SurfaceContext | null };
  const view = render(<><Projects {...props()} onAsk={onAsk} /><Probe seen={seen} /></>);
  return { seen, view };
}
const facts = (seen: { ctx: SurfaceContext | null }) => seen.ctx?.facts;
async function open() { fireEvent.click(await screen.findByRole('button', { name: 'New project' })); await screen.findByRole('heading', { name: 'New project' }); }
async function configure() {
  fireEvent.click(screen.getByRole('button', { name: 'Pick IND' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Client workspace' })).toHaveProperty('value', '21'));
}
beforeEach(() => {
  Object.assign(h, { actor: 12, org: 7, tenant: 7 }); token(); __resetSurfaceActionBus();
  h.request.mockReset().mockImplementation(async (_method: string, path: string) => path.includes('/api/clients?')
    ? ok({ success: true, clients: [{ id: '21', name: 'Private client name', organizationId: String(h.org), status: 'active' }],
      meta: { purpose: 'project-intake', actorUserId: h.actor, organizationId: h.org } })
    : path.includes('market-support') ? ok({ markets: [] }) : ok({ data: [] }));
});
afterEach(() => { cleanup(); __resetSurfaceActionBus(); clearAuthToken(); });

describe('the actual wizard reports its public state through the Projects publisher', () => {
  it('publishes the first step and chosen filing, and passes Ask AnA through', async () => {
    const onAsk = vi.fn(); const { seen } = mount(onAsk); await open();
    await waitFor(() => expect(facts(seen)?.wizardStep).toEqual({ number: 1, label: 'Choose filing type' }));
    expect(facts(seen)?.selectedFiling).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pick IND' }));
    await waitFor(() => expect(facts(seen)?.selectedFiling).toMatchObject({ id: 'us_ind', name: 'Investigational New Drug Application', applicationType: 'ind', agency: 'FDA', region: 'US' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask about filing' }));
    expect(onAsk).toHaveBeenCalledExactlyOnceWith('Question about us_ind');
    expect(h.request.mock.calls.some(([method]) => method === 'POST')).toBe(false);
  });

  it('tracks Configure, Review and Back while excluding entered/private fields', async () => {
    const { seen } = mount(); await open(); await configure();
    await waitFor(() => expect(facts(seen)?.wizardStep).toEqual({ number: 2, label: 'Configure project' }));
    fireEvent.change(screen.getByRole('textbox', { name: /^Project name/ }), { target: { value: 'Private project title' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Indication/ }), { target: { value: 'Private indication' } });
    fireEvent.change(screen.getByRole('combobox', { name: /^Product type/ }), { target: { value: 'drug' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(facts(seen)?.wizardStep).toEqual({ number: 3, label: 'Review & create' }));
    expect(JSON.stringify(seen.ctx)).not.toMatch(/Private project|Private indication|Private client|actorUserId|clientWorkspaceId/);
    expect(h.request.mock.calls.some(([method]) => method === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(facts(seen)?.wizardStep).toMatchObject({ number: 2 }));
  });

  it('replaces a prior selection and restores portfolio context on close', async () => {
    const { seen } = mount(); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Pick IND' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick NDA' }));
    await waitFor(() => expect(facts(seen)?.selectedFiling).toMatchObject({ id: 'us_nda', applicationType: 'nda' }));
    expect(JSON.stringify(facts(seen))).not.toContain('us_ind');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(seen.ctx?.summary).toContain('Projects portfolio'));
    expect(facts(seen)?.selectedFiling).toBeUndefined();
    await open();
    await waitFor(() => expect(facts(seen)?.selectedFiling).toBeNull());
  });

  it('keeps wizard state when a delayed portfolio response arrives', async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise(value => { resolve = value; });
    h.request.mockImplementation(async () => { await pending; return ok({ data: [] }); });
    const { seen } = mount(); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Pick NDA' }));
    await act(async () => { resolve(null); await pending; });
    await waitFor(() => expect(facts(seen)?.selectedFiling).toMatchObject({ id: 'us_nda' }));
    expect(facts(seen)?.wizardStep).toMatchObject({ number: 1 });
    expect(seen.ctx?.summary).not.toContain('Projects portfolio');
  });

  it('retires selected metadata if the signed-in organization no longer matches', async () => {
    const { seen, view } = mount(); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Pick IND' }));
    await waitFor(() => expect(facts(seen)?.selectedFiling).toMatchObject({ id: 'us_ind' }));
    h.tenant = 8;
    view.rerender(<><Projects {...props()} /><Probe seen={seen} /></>);
    await screen.findByText(/signed-in account or organization changed/i);
    await waitFor(() => expect(facts(seen)?.wizardState).toBe('unavailable'));
    expect(facts(seen)?.selectedFiling).toBeNull();
    view.unmount();
    render(<Probe seen={seen} />);
    expect(seen.ctx).toBeNull();
  });

  it('starts a matching new account at the first step with no prior selection', async () => {
    const { seen, view } = mount(); await open(); await configure();
    Object.assign(h, { actor: 13, org: 8, tenant: 8 }); token();
    view.rerender(<><Projects {...props()} /><Probe seen={seen} /></>);
    await waitFor(() => expect(facts(seen)?.wizardStep).toMatchObject({ number: 1 }));
    expect(facts(seen)?.selectedFiling).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask about filing' })).toBeNull();
  });
});
