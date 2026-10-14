// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { emptyDiscovery } from '@shared/types/onboarding-discovery';
import type { SurfaceViewProps } from '../surfaceViews';
import { Onboarding } from '../surfaces/Onboarding';

const state = vi.hoisted(() => ({ saved: null as unknown, readError: undefined as string | undefined,
  settings: { settings: { onboardingDiscovery: null as unknown } }, profile: { primaryIndustry: 'biotech_pharma' }, organization: { organization: { name: 'Bright Biosciences' } },
}));
vi.mock('@/utils/authToken', () => ({ getOrgId: () => '7', getAuthHeaders: () => ({ Authorization: 'Bearer test' }) }));
vi.mock('../dataConnect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dataConnect')>()),
  useLiveData: (path: string) => ({ loading: false, error: path.endsWith('/settings') ? state.readError : undefined,
    data: path.endsWith('/settings') ? state.settings
      : path === '/api/mdx/industry-profile' ? state.profile : state.organization,
  }),
}));
vi.mock('../surfaces/GatewayAccountsSetting', () => ({ GatewayAccountsSetting: () => <div>Agency account setup</div> }));
const props = { surface: { id: 'onboarding' }, segment: 'biotech', onNav: vi.fn(), onAsk: vi.fn() } as unknown as SurfaceViewProps;
let writes: Array<{ path: string; body: Record<string, any> }>;
let refuseDiscovery: boolean;
beforeEach(() => {
  state.saved = null; state.readError = undefined; writes = []; refuseDiscovery = false;
  state.settings = { settings: { onboardingDiscovery: null } };
  vi.stubGlobal('fetch', vi.fn(async (path: string, init: { body?: unknown }) => {
    writes.push({ path, body: JSON.parse(String(init.body)) });
    const refused = path.endsWith('/settings') && refuseDiscovery;
    return { ok: !refused, status: refused ? 403 : path === '/api/tenant-users' ? 201 : 200,
      json: async () => refused ? { success: false, error: 'Organization admin role required.' }
        : path === '/api/tenant-users' ? { success: true, createdNewUser: true, invitation: { delivery: 'link', setupUrl: 'https://app.test/concept2cure/password-reset?token=private' } }
          : path === '/api/billing/dtc-checkout' ? { sessionId: 'free' } : { success: true },
    } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const next = () => fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
function startDiscovery() {
  render(<Onboarding {...props} />);
  next();
  fireEvent.change(screen.getByLabelText('Company goals *'), { target: { value: 'Submit an IND for our lead asset.' } });
  fireEvent.click(screen.getByLabelText('Prepare submissions'));
}
function review() {
  next(); // project discovery
  fireEvent.change(screen.getByLabelText('Planned project name'), { target: { value: 'Lead asset' } });
  fireEvent.change(screen.getByLabelText('Product context'), { target: { value: 'drug' } });
  next(); // pricing model
  next(); // plan
  fireEvent.click(screen.getByText('Researcher'));
  next(); // invitations
  fireEvent.change(screen.getByLabelText('Email for invitee 1'), { target: { value: 'reviewer@bright.bio' } });
  fireEvent.change(screen.getByLabelText('Role for invitee 1'), { target: { value: 'reviewer' } });
  next(); next(); next(); next(); // modules, agency, security, review
}
describe('discovery onboarding persists through governed setup and keeps outcomes reviewable', () => {
  it('requires a company goal and a use before advancing', () => {
    render(<Onboarding {...props} />); next();
    expect((screen.getByRole('button', { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Company goals *'), { target: { value: 'IND readiness' } });
    expect((screen.getByRole('button', { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Assess submission readiness'));
    expect((screen.getByRole('button', { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('saves discovery first, writes markets/pathways to the existing industry profile and preserves the setup link', async () => {
    startDiscovery();
    fireEvent.change(screen.getByLabelText('Target markets'), { target: { value: 'US, EU' } });
    fireEvent.change(screen.getByLabelText('Planned regulatory pathways'), { target: { value: 'IND, CTA' } });
    review();
    fireEvent.click(screen.getByRole('button', { name: 'Activate workspace' }));
    await waitFor(() => expect(screen.getByText(/Saved to your organization's setup record/)).toBeTruthy());
    expect(writes[0].path).toBe('/api/organizations/7/settings');
    expect(writes[0].body.settings.onboardingDiscovery.company.goals).toBe('Submit an IND for our lead asset.');
    expect(writes[0].body.settings.onboardingDiscovery.project.name).toBe('Lead asset');
    expect(writes[0].body.reason.length).toBeGreaterThan(3);
    expect(writes.find((w) => w.path === '/api/mdx/industry-profile')?.body).toMatchObject({ defaultMarkets: ['US', 'EU'], defaultPathways: ['IND', 'CTA'] });
    expect(writes.find((w) => w.path === '/api/tenant-users')?.body.role).toBe('reviewer');
    expect((screen.getByLabelText('Password setup link for reviewer@bright.bio') as HTMLInputElement).value).toBe('https://app.test/concept2cure/password-reset?token=private');
    expect(screen.getByRole('button', { name: 'Copy setup link for reviewer@bright.bio' })).toBeTruthy();
  });
  it('keeps answers and does not invite or bill when saving discovery is refused', async () => {
    refuseDiscovery = true;
    startDiscovery(); review();
    fireEvent.click(screen.getByRole('button', { name: 'Activate workspace' }));
    await waitFor(() => expect(screen.getByText('Organization admin role required.')).toBeTruthy());
    expect(writes.map((w) => w.path)).toEqual(['/api/organizations/7/settings']);
    expect(screen.getByText('Lead asset', { selector: '.v' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activate workspace' })).toBeTruthy();
  });
  it('loads previously recorded answers and never renders a failed read as an empty profile', () => {
    const d = emptyDiscovery(); d.company.goals = 'Preserve this company strategy'; state.saved = d; state.settings = { settings: { onboardingDiscovery: d } };
    render(<Onboarding {...props} />); next();
    expect((screen.getByLabelText('Company goals *') as HTMLTextAreaElement).value).toBe(d.company.goals);
    cleanup(); state.readError = 'Read failed';
    render(<Onboarding {...props} />);
    expect(screen.getByText(/Your saved discovery answers or industry profile could not be loaded/)).toBeTruthy();
  });
});
