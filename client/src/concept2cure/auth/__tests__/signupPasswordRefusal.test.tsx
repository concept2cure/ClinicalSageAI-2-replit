// @vitest-environment jsdom
/**
 * Human test J1 (2026-11-06, docs/evidence/HUMAN-TEST/J1/): a tester chose a password on sign-up's first step and was
 * told on the fourth, under the legal agreements, "Password must not contain your name, e-mail address or
 * organisation." The password field was three steps back and nothing said so.
 *
 * The server's password policy is the only one that knows the account's name, address and organisation, so it answers
 * on the last step. Its refusal now takes the person back to the first step, with the sentence under the password field.
 * Any other refusal stays where it was said.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
// The steps' enter and exit animations wait on timers jsdom does not run; the steps themselves are what is tested.
vi.mock('framer-motion', () => {
  const strip = ({ initial, animate, exit, transition, layout, ...rest }: Record<string, unknown>) => rest;
  const tag = (t: string) => (p: Record<string, unknown>) => React.createElement(t, strip(p));
  return { motion: new Proxy({}, { get: (_o, t: string) => tag(t) }), AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});
vi.mock('wouter', () => ({ useLocation: () => ['/concept2cure/signup', vi.fn()] }));

import { ZenSignup, isPasswordPolicyRefusal } from '../ZenSignup';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const POLICY = { success: false, error: { code: 'AUTH_001', message: 'Password must not contain your name, e-mail address or organisation.',
  details: { errors: ['Password must not contain your name, e-mail address or organisation.'] } } };

async function signUpAndRefuse(body: unknown, status: number) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as Response));
  const { container } = render(<ZenSignup />);
  const set = (id: string, value: string) => fireEvent.change(container.querySelector(`#${id}`)!, { target: { value } });
  set('firstName', 'Dana'); set('lastName', 'Okafor'); set('email', 'device.ra@example.com');
  set('password', 'Device-Harbor-77!'); set('confirmPassword', 'Device-Harbor-77!'); set('jobTitle', 'Regulatory Affairs Manager');
  fireEvent.click(screen.getByRole('button', { name: /^(signup\.continue|Continue)$/ }));
  set('organization', 'Northfield Medical'); set('country', 'United States');
  fireEvent.change(container.querySelector('#organizationType')!, { target: { value: 'meddevice' } });
  fireEvent.change(container.querySelector('#useCase')!, { target: { value: '510k' } });
  fireEvent.click(screen.getByRole('button', { name: /^(signup\.continue|Continue)$/ }));
  fireEvent.click(screen.getByRole('button', { name: /^(signup\.continue|Continue)$/ }));
  // The legal step: each agreement is read to its end before it can be accepted, one after the other.
  for (let pass = 0; pass < 3; pass += 1) {
    for (const box of Array.from(container.querySelectorAll('[class*="overflow-y-auto"]'))) fireEvent.scroll(box);
    for (const cb of Array.from(container.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))) if (!cb.checked && !cb.disabled) fireEvent.click(cb);
  }
  const create = screen.getByRole('button', { name: /signup\.createAccount/ }) as HTMLButtonElement;
  expect(create.disabled, 'every agreement is accepted').toBe(false);
  await act(async () => { fireEvent.click(create); });
  return container;
}

describe('a password the policy refuses goes back to the password field', () => {
  it('returns to the first step with the refusal under the password', async () => {
    const container = await signUpAndRefuse(POLICY, 400);
    expect(container.querySelector('#password'), 'the first step is shown again').not.toBeNull();
    expect(screen.getByText(POLICY.error.message)).toBeTruthy();
  });

  it('any other refusal stays on the last step', async () => {
    const container = await signUpAndRefuse({ success: false, error: { code: 'X', message: 'An account with this e-mail already exists.' } }, 409);
    expect(container.querySelector('#password')).toBeNull();
    expect(screen.getByText('An account with this e-mail already exists.')).toBeTruthy();
  });

  it("tells the policy's 400 from a malformed request's", () => {
    expect(isPasswordPolicyRefusal(400, POLICY)).toBe(true);
    expect(isPasswordPolicyRefusal(400, { error: { details: [{ path: ['email'], message: 'Invalid email' }] } })).toBe(false);
    expect(isPasswordPolicyRefusal(409, POLICY)).toBe(false);
  });
});

describe('a created account is pointed at where Concept2Cure opens', () => {
  it('names the first project, not Deep Research or document authoring', async () => {
    await signUpAndRefuse({ success: true, token: 'signup-token', organizationId: 8 }, 201);
    const text = document.body.textContent ?? '';
    expect(text).toContain('create your first project');
    expect(text).not.toMatch(/Deep Research|document authoring/);
  });
});
