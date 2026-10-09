// @vitest-environment jsdom
/** The sign-up form's waiting step (IAM-17, P1-2): the address, a resend with a cooldown, and the way to sign in. */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars?.email ? `${key}:${vars.email}` : vars?.count !== undefined ? `${key}:${vars.count}` : key,
  }),
}));

import { SignupVerifyStep } from '../SignupVerifyStep';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SignupVerifyStep', () => {
  it('names the address, holds the resend for the cooldown, then sends again once and restarts the cooldown', async () => {
    const onResend = vi.fn(async () => undefined);
    const onSignIn = vi.fn();
    render(<SignupVerifyStep email="ada@example.test" onResend={onResend} onSignIn={onSignIn} cooldownSeconds={2} />);
    expect(screen.getByText('signup.verify.body:ada@example.test')).toBeTruthy();
    const resend = screen.getByText('signup.verify.resendIn:2') as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    // The countdown re-arms after each render, so the clock is stepped a second at a time.
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
    const ready = screen.getByText('signup.verify.resend') as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(ready);
    });
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(screen.getByText('signup.verify.resent')).toBeTruthy();
    expect((screen.getByText('signup.verify.resendIn:2') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('signup.verify.signIn'));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
