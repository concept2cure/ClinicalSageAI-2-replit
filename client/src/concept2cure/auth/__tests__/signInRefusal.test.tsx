// @vitest-environment jsdom
/**
 * QA 2026-10-08 (j9, finding 2): a mistyped password showed "Session expired.
 * Please log in again." The sign-in page now says the email or password is
 * incorrect, and points an invitee who has not set a password at their
 * invitation link or a reset — the same sentence for every address, so it does
 * not tell anyone whether an account exists.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ login: vi.fn(), verifyMfa: vi.fn() }));
vi.mock('wouter', () => ({ useLocation: () => ['/concept2cure/login', vi.fn()] }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
vi.mock('@/services/portal/authService', () => ({
  authService: { adoptSession: vi.fn(), getUser: vi.fn(() => null), requestPasswordReset: vi.fn(), confirmPasswordReset: vi.fn() },
  useAuth: () => auth,
}));

import { Concept2CureLogin } from '../../components/concept2cure-auth/Concept2CureLogin';

afterEach(() => vi.clearAllMocks());

async function signInWith(error: { code: string; message: string }) {
  auth.login.mockResolvedValue({ success: false, error });
  render(<Concept2CureLogin />);
  fireEvent.change(screen.getByLabelText('field.email'), { target: { value: 'someone@c2c.test' } });
  fireEvent.change(document.getElementById('login-password') as HTMLInputElement, { target: { value: 'wrong-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'action.signIn' }));
  await waitFor(() => expect(auth.login).toHaveBeenCalled());
  return screen.findByRole('alert');
}

describe('a refused sign-in', () => {
  it('AUTH_001 reads as an incorrect email or password, never as an expired session', async () => {
    const alert = await signInWith({ code: 'AUTH_001', message: 'Invalid credentials' });
    expect(alert.textContent).toBe('error.invalidCredentials');
  });

  it('any other refusal is shown in the server\'s words', async () => {
    const alert = await signInWith({ code: 'AUTH_011', message: 'No organization assigned' });
    expect(alert.textContent).toBe('No organization assigned');
  });
});
