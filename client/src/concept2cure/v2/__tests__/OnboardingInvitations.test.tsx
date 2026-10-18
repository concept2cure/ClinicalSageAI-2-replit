// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invitationOutcome, OnboardingInvitations } from '../surfaces/OnboardingInvitations';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('onboarding invitation handover', () => {
  it('distinguishes emailed, private-link, failed-delivery and existing-user invitations', () => {
    expect(invitationOutcome('a@b.test', 201, { invitation: { delivery: 'email', emailSent: true } }).state).toBe('email');
    expect(invitationOutcome('a@b.test', 201, { invitation: { delivery: 'failed' } }).state).toBe('activation-failed');
    expect(invitationOutcome('a@b.test', 202, { pendingInvitation: true }).state).toBe('pending-consent');
    expect(invitationOutcome('a@b.test', 201, { invitation: { delivery: 'link' } }).state).toBe('delivery-unconfirmed');
    expect(invitationOutcome('a@b.test', 201, {}).state).toBe('unconfirmed');
  });
  it('copies the chosen link only on request and provides a manual fallback', async () => {
    const copy = vi.fn().mockRejectedValue(new Error('Denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    const setupUrl = 'https://example.test/concept2cure/password-reset?token=private-setup-token';
    render(<OnboardingInvitations invitations={[invitationOutcome('a@b.test', 201, { invitation: { delivery: 'link', setupUrl } })]} />);
    expect(copy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Copy setup link/ }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/copy it manually/));
    expect(copy).toHaveBeenCalledWith(setupUrl);
    expect(screen.getByRole('textbox', { name: 'Setup link for a@b.test' })).toHaveProperty('value', setupUrl);
  });
  it('keeps each private link visible and copies only the selected person', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    const result = (email: string) => invitationOutcome(email, 201, { invitation: { delivery: 'link', setupUrl: `https://example.test/concept2cure/password-reset?token=${email}` } });
    const invitations = [result('one@c2c.test'), result('two@c2c.test')];
    render(<OnboardingInvitations invitations={invitations} />);
    expect(copy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup link for two@c2c.test' }));
    await waitFor(() => expect(copy).toHaveBeenCalledExactlyOnceWith(invitations[1].setupUrl));
    expect(screen.getByRole('textbox', { name: 'Setup link for one@c2c.test' })).toHaveProperty('value', invitations[0].setupUrl);
  });
  it('renders consent, activation failure and refusal without a fabricated link', () => {
    render(<OnboardingInvitations invitations={[
      invitationOutcome('pending@c2c.test', 202, { pendingInvitation: true }),
      invitationOutcome('failed@c2c.test', 201, { invitation: { delivery: 'failed' } }),
      invitationOutcome('refused@c2c.test', 403, { message: 'No seats available.' }),
    ]} />);
    expect(screen.getByText('Awaiting consent')).toBeTruthy();
    expect(screen.getByText('Activation needs attention')).toBeTruthy();
    expect(screen.getByText('No seats available.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Copy setup link/ })).toBeNull();
  });
});
