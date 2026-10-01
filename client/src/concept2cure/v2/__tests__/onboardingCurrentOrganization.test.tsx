// @vitest-environment jsdom
/**
 * Onboarding sets up the organisation the person is signed into, and starts
 * from what that organisation already records (launch sweep finding 85).
 *
 * The wizard said "Onboarding · new organization" over a blank name and a
 * pre-selected "Virtual biotech", and its writes go to the signed-in org's
 * own record. A person who believed they were creating a second organisation
 * overwrote the first; an untouched archetype wrote biotech_pharma over a
 * device company's profile.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getOrgId: () => '7',
}));

import { Onboarding } from '../surfaces/Onboarding';
import type { SurfaceViewProps } from '../surfaceViews';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const PROPS = { surface: { id: 'onboarding', label: 'Onboarding' }, segment: 'biotech', onAsk: () => {}, onNav: () => {} } as unknown as SurfaceViewProps;
let release: () => void = () => {};

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === '/api/organizations/7') return ok({ organization: { id: 7, name: 'Acme Devices' } });
    if (url === '/api/mdx/industry-profile') return ok({ data: { primaryIndustry: 'medical_device_diagnostics' } });
    return ok({});
  });
});
afterEach(() => cleanup());

const nameInput = () => screen.getByLabelText('Organization name') as HTMLInputElement;
const selectedArchetype = () => document.querySelector('.ob-arch-b.on .ob-arch-l')?.textContent ?? null;

describe('the wizard names the organisation it will change', () => {
  it('does not call itself a new organization', async () => {
    render(<Onboarding {...PROPS} />);
    await waitFor(() => expect(screen.getByText(/Acme Devices/, { selector: '.sp-eyebrow' })).toBeTruthy());
    expect(screen.queryByText(/new organization/i)).toBeNull();
  });
});

describe('the form starts from what the organisation records', () => {
  it('prefills the recorded name', async () => {
    render(<Onboarding {...PROPS} />);
    await waitFor(() => expect(nameInput().value).toBe('Acme Devices'));
  });

  it('pre-selects the archetype whose write-back is the recorded industry, not "Virtual biotech"', async () => {
    render(<Onboarding {...PROPS} />);
    await waitFor(() => expect(selectedArchetype()).toBe('Medical device & IVD'));
  });

  it('never overwrites a name the person typed before the read answered', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/organizations/7') {
        await new Promise<void>((r) => { release = r; });
        return ok({ organization: { id: 7, name: 'Acme Devices' } });
      }
      return ok({});
    });
    render(<Onboarding {...PROPS} />);
    fireEvent.change(nameInput(), { target: { value: 'Acme Diagnostics' } });
    release();
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/organizations/7')).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(nameInput().value).toBe('Acme Diagnostics');
  });
});
