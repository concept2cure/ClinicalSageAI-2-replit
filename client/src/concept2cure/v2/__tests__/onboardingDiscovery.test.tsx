// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeDiscovery } from './onboardingDiscoveryFixtures';
import { Onboarding } from '../surfaces/Onboarding';
import type { SurfaceViewProps } from '../surfaceViews';
import type { OnboardingDiscoveryAnswers } from '@shared/types/onboarding-discovery';
import { __resetSurfaceActionBus, registerSurfaceActionHandlers } from '../surfaceActions';

const { request, publish, identity } = vi.hoisted(() => ({ request: vi.fn(), publish: vi.fn(), identity: { orgId: 7 } }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: request, redactInternals: (message: string) => message, probeAuditRowOutcome: vi.fn(), serverMessage: () => null }));
vi.mock('@/utils/authToken', () => ({ getOrgId: () => identity.orgId, getAuthHeaders: () => ({ Authorization: 'Bearer test' }) }));
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: publish }));
vi.mock('../AccountPanel', () => ({ AccountPanel: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Close Account</button> }));

const props = { surface: { id: 'onboarding', label: 'Onboarding' }, segment: 'biotech', onAsk: vi.fn(), onNav: vi.fn() } as unknown as SurfaceViewProps;
let answers: OnboardingDiscoveryAnswers;
let revision: number;
let canEdit: boolean;
let completeRefused: boolean;
let invitationDelivery: string;
let invitationStatus: number;
let invitationReply: unknown;
const mutation = vi.fn();
const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });

beforeEach(() => {
  answers = completeDiscovery(); revision = 1; canEdit = true;
  completeRefused = false; invitationDelivery = 'link'; invitationStatus = 201; invitationReply = undefined; identity.orgId = 7;
  request.mockReset(); publish.mockClear(); mutation.mockReset();
  request.mockImplementation(async (method: string, path: string, body?: { answers: OnboardingDiscoveryAnswers; complete: boolean }) => {
    if (path === '/api/onboarding/discovery') {
      if (method === 'PATCH') {
        if (body?.complete && completeRefused) throw new Error('Discovery was not saved.');
        answers = body!.answers; revision += 1;
      }
      return ok({ data: { canEdit, discovery: { schemaVersion: 1, revision, answers,
        updatedAt: '2026-10-14T00:00:00.000Z', updatedBy: 9,
        completedAt: body?.complete ? '2026-10-14T00:00:00.000Z' : null,
      } } });
    }
    if (path.startsWith('/api/organizations/')) return ok({ organization: { name: 'Acme Pharma' } });
    if (path === '/api/mdx/industry-profile') return ok({ primaryIndustry: 'biotech_pharma' });
    if (path === '/api/v1/auth/session') return ok({ authenticated: true, user: { mfaEnabled: false } });
    return ok({ accounts: [] });
  });
  mutation.mockImplementation(async (path: string) => {
    if (path === '/api/tenant-users') return ok(invitationReply ?? { createdNewUser: true, invitation: { delivery: invitationDelivery, emailSent: invitationDelivery === 'email', setupUrl: 'https://example.test/concept2cure/password-reset?token=private-link' } }, invitationStatus);
    if (path.includes('checkout')) return ok({ url: 'https://checkout.stripe.com/test' });
    return ok({});
  });
  vi.stubGlobal('fetch', mutation);
  localStorage.clear(); sessionStorage.clear();
});
afterEach(() => { cleanup(); __resetSurfaceActionBus(); vi.unstubAllGlobals(); });

async function next() {
  const oldHeading = document.querySelector('.pj-card-b > h2')?.textContent;
  const button = screen.getByRole('button', { name: /^(Save & continue|Continue)/ });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
  await waitFor(() => expect(document.querySelector('.pj-card-b > h2')?.textContent).not.toBe(oldHeading));
}
async function reviewWithInvite(role = 'member') {
  render(<Onboarding {...props} />);
  await next(); await next(); await next(); await next(); await next();
  fireEvent.change(screen.getByLabelText('Email for invitee 1'), { target: { value: 'lee@example.test' } });
  fireEvent.change(screen.getByLabelText('Role for invitee 1'), { target: { value: role } });
  await next(); await next(); await next(); await next();
}

describe('onboarding reaches canonical project creation', () => {
  it('opens the canonical project wizard after activation without creating a project', async () => {
    await reviewWithInvite();
    fireEvent.click(screen.getByRole('button', { name: /Start .* trial|Activate workspace/ }));
    const create = await screen.findByRole('button', { name: 'Create your first project' });
    const mutationCount = mutation.mock.calls.length;
    fireEvent.click(create);
    expect(props.onNav).toHaveBeenCalledWith('projects');
    const openWizard = vi.fn(() => ({ ok: true as const }));
    registerSurfaceActionHandlers('projects', { 'projects.new-project': openWizard });
    expect(openWizard).toHaveBeenCalledOnce();
    expect(mutation).toHaveBeenCalledTimes(mutationCount);
    expect(request.mock.calls.some(([, path]) => path === '/api/c2c/projects')).toBe(false);
  });
});

describe('intelligent discovery wizard', () => {
  it('asks drug and device follow-ups for combination products and service questions for service providers', async () => {
    answers.businessContext = 'service_provider'; answers.serviceScope = ['regulatory'];
    answers.productModalities = ['combination']; answers.devicePurpose = 'Device delivery for adults.';
    render(<Onboarding {...props} />);
    await next();
    expect(screen.getByText('Client services *')).toBeTruthy();
    await next();
    expect(screen.getByLabelText('Therapeutic areas *')).toBeTruthy();
    expect(screen.getByLabelText('Device / diagnostic intended use *')).toBeTruthy();
  });

  it('keeps incomplete discovery on its step and moves focus to the new step heading', async () => {
    answers.companyGoal = '';
    render(<Onboarding {...props} />);
    await next();
    expect(document.activeElement?.textContent).toBe('Client discovery');
    expect((screen.getByRole('button', { name: /Save & continue/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Company goal *'), { target: { value: 'Bring our first project into a controlled review process.' } });
    await next();
    expect(screen.getByTestId('discovery-project')).toBeTruthy();
  });

  it('lets a nonadministrator review saved answers but makes no writes', async () => {
    canEdit = false;
    render(<Onboarding {...props} />);
    await next();
    expect((screen.getByLabelText('Company goal *') as HTMLTextAreaElement).value).toBe(answers.companyGoal);
    expect((screen.getByLabelText('Company goal *') as HTMLTextAreaElement).disabled).toBe(true);
    await next();
    expect(request.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });

  it('validates invitations and defaults to least-privilege membership', async () => {
    render(<Onboarding {...props} />);
    await next(); await next(); await next(); await next(); await next();
    expect((screen.getByLabelText('Role for invitee 1') as HTMLSelectElement).value).toBe('member');
    expect(screen.getByRole('option', { name: 'Approver' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Reviewer' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email for invitee 1'), { target: { value: 'bad-address' } });
    expect((screen.getByRole('button', { name: /^Continue/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/valid, distinct/);
  });

  it('stops activation before any organization, invitation or billing write if discovery cannot be completed', async () => {
    await reviewWithInvite(); completeRefused = true;
    fireEvent.click(screen.getByRole('button', { name: /Start .* trial|Activate workspace/ }));
    await screen.findByText('Discovery was not saved.');
    expect(mutation).not.toHaveBeenCalled();
  });

  it('shows private setup links before checkout and never sends them or discovery narratives to AnA', async () => {
    await reviewWithInvite();
    fireEvent.click(screen.getByRole('button', { name: /Start .* trial|Activate workspace/ }));
    await screen.findByRole('button', { name: 'Continue to secure checkout' });
    expect(document.activeElement?.textContent).toMatch(/Checkout ready/);
    expect(screen.getByLabelText('Setup link for lee@example.test')).toBeTruthy();
    expect(screen.getByText(/No invitation email was sent/)).toBeTruthy();
    const context = JSON.stringify(publish.mock.calls);
    expect(context).not.toContain('private-link'); expect(context).not.toContain('lee@example.test');
    expect(context).not.toContain(answers.indication); expect(context).not.toContain(answers.companyGoal);
    expect(localStorage.getItem('onboardingDiscovery')).toBeNull();
  });

  it('honestly confirms invitation email delivery using the server vocabulary', async () => {
    invitationDelivery = 'email';
    await reviewWithInvite();
    fireEvent.click(screen.getByRole('button', { name: /Start .* trial|Activate workspace/ }));
    await screen.findByText('Email sent');
    expect(screen.queryByLabelText('Setup link for lee@example.test')).toBeNull();
  });

  it('clears activation secrets and tenant drafts when the active organization changes', async () => {
    await reviewWithInvite();
    fireEvent.click(screen.getByRole('button', { name: /Start .* trial|Activate workspace/ }));
    await screen.findByLabelText('Setup link for lee@example.test');
    cleanup(); identity.orgId = 8;
    render(<Onboarding {...props} />);
    await waitFor(() => expect(screen.getByLabelText('Organization name')).toBeTruthy());
    expect(screen.queryByLabelText('Setup link for lee@example.test')).toBeNull();
  });

  it('preserves an invited signer role and records pending consent without claiming membership', async () => {
    invitationStatus = 202; invitationReply = { success: true, pendingInvitation: true };
    await reviewWithInvite('reviewer');
    fireEvent.click(screen.getByRole('button', { name: /Start .* trial|Activate workspace/ }));
    await screen.findByText('Awaiting consent');
    expect(screen.getByText('1 of 1 invitations recorded.')).toBeTruthy();
    const call = mutation.mock.calls.find(([path]) => path === '/api/tenant-users');
    expect(JSON.parse(String(call?.[1]?.body)).role).toBe('reviewer');
  });

  it('shows a created account whose activation failed as needing attention', async () => {
    invitationDelivery = 'failed';
    await reviewWithInvite();
    fireEvent.click(screen.getByRole('button', { name: /Start .* trial|Activate workspace/ }));
    await screen.findByText('Activation needs attention');
    expect(screen.getByText(/1 of 1 invitations recorded.*need attention/i)).toBeTruthy();
    expect(screen.queryByLabelText('Setup link for lee@example.test')).toBeNull();
  });

  it('does not count an unconfirmed accepted-status response as a recorded invitation', async () => {
    invitationStatus = 202; invitationReply = {};
    await reviewWithInvite();
    fireEvent.click(screen.getByRole('button', { name: /Start .* trial|Activate workspace/ }));
    await screen.findByText('Outcome unconfirmed');
    expect(screen.getByText(/0 of 1 invitations recorded.*need attention/i)).toBeTruthy();
  });
});

describe('discovery setup handoffs', () => {
  async function securityStep() {
    props.onNav = vi.fn();
    render(<Onboarding {...props} />);
    for (let index = 0; index < 7; index += 1) await next();
    const checkbox = screen.getByRole('checkbox', { name: /Help me establish/ });
    fireEvent.click(checkbox);
  }

  it('saves changed discovery before opening existing organization setup', async () => {
    await securityStep();
    fireEvent.click(screen.getByRole('button', { name: 'Organization setup' }));
    await waitFor(() => expect(props.onNav).toHaveBeenCalledWith('setup'));
    expect(request).toHaveBeenLastCalledWith('PATCH', '/api/onboarding/discovery', expect.objectContaining({ complete: false }));
    expect(mutation).not.toHaveBeenCalled();
  });

  it('keeps the wizard and changed answers when the handoff save is refused', async () => {
    await securityStep();
    request.mockRejectedValueOnce(new Error('Discovery save unavailable.'));
    fireEvent.click(screen.getByRole('button', { name: 'Roles and access' }));
    await screen.findByText('Discovery save unavailable.');
    expect(props.onNav).not.toHaveBeenCalled();
    expect(screen.getByTestId('discovery-security')).toBeTruthy();
    expect(screen.getByText(/unsaved changes/)).toBeTruthy();
  });
});

describe('complete discovery review', () => {
  it('previews therapeutic, experience and security answers and returns to their existing question steps', async () => {
    await reviewWithInvite();
    const projectSummary = screen.getByText('Project and desired outcome');
    fireEvent.click(projectSummary);
    expect(screen.getByText(answers.indication)).toBeTruthy();
    expect(screen.getByText(answers.therapeuticAreas.join(', '))).toBeTruthy();
    fireEvent.click(screen.getByText('Company and working context'));
    expect(screen.getByText('Regularly manage regulated projects')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Security requirements')[0]);
    expect(screen.getByText('Multi-factor authentication')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review project and desired outcome' }));
    expect(screen.getByTestId('discovery-project')).toBeTruthy();
    expect((screen.getByLabelText('Therapeutic areas *') as HTMLInputElement).value).toBe(answers.therapeuticAreas.join(', '));
    expect(mutation).not.toHaveBeenCalled();
  });
});
