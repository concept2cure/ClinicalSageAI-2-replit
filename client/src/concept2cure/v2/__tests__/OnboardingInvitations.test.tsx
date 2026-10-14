// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invitationOutcome, OnboardingInvitations } from '../surfaces/OnboardingInvitations';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('onboarding invitation handover', () => {
  it('distinguishes emailed, private-link, failed-delivery and existing-user invitations', () => {
    expect(invitationOutcome('a@b.test', 201, { invitation: { delivery: 'email' } }).status).toBe('email_sent');
    expect(invitationOutcome('a@b.test', 201, { invitation: { delivery: 'failed' } }).status).toBe('delivery_failed');
    expect(invitationOutcome('a@b.test', 202, {}).status).toBe('pending_membership');
    expect(invitationOutcome('a@b.test', 201, { invitation: { delivery: 'link' } }).status).toBe('delivery_failed');
    expect(invitationOutcome('a@b.test', 201, {}).status).toBe('created');
  });
  it('copies the chosen link only on request and provides a manual fallback', async () => {
    const copy = vi.fn().mockRejectedValue(new Error('Denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    render(<OnboardingInvitations invitations={[invitationOutcome('a@b.test', 201, { invitation: { delivery: 'link', setupUrl: 'https://example.test/private' } })]} />);
    expect(copy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Copy setup link/ }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/copy it manually/));
    expect(copy).toHaveBeenCalledWith('https://example.test/private');
  });
});
