// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InvitationResults } from '../InvitationResults';
import { invitationOutcome } from '../invitationOutcome';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const outcome = (email: string, token: string) => invitationOutcome(email, 201, {
  createdNewUser: true,
  invitation: { delivery: 'link', emailSent: false, setupUrl: `https://c2c.test/concept2cure/password-reset?token=${token}` },
});

describe('private invitation results', () => {
  it('keeps every link visible and copies only the person selected', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const invitations = [outcome('one@c2c.test', 'one'), outcome('two@c2c.test', 'two')];
    render(<InvitationResults invitations={invitations} />);
    expect(screen.getByLabelText('Password setup link for one@c2c.test')).toHaveProperty('value', invitations[0].setupUrl);
    expect(screen.getByLabelText('Password setup link for two@c2c.test')).toHaveProperty('value', invitations[1].setupUrl);
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup link for two@c2c.test' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(invitations[1].setupUrl));
    expect(await screen.findByText('Setup link copied. Share it privately with this person.')).toBeTruthy();
  });

  it('preserves the visible link and announces manual copy when clipboard permission is refused', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    const invitation = outcome('one@c2c.test', 'one');
    render(<InvitationResults invitations={[invitation]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup link for one@c2c.test' }));
    expect(await screen.findByText(/select the visible link below and copy it manually/i)).toBeTruthy();
    expect(screen.getByLabelText('Password setup link for one@c2c.test')).toHaveProperty('value', invitation.setupUrl);
    expect(screen.queryByText(/setup link copied/i)).toBeNull();
  });

  it('shows consent and failed activation explicitly without offering a nonexistent link', () => {
    render(<InvitationResults invitations={[
      invitationOutcome('pending@c2c.test', 202, { pendingInvitation: true }),
      invitationOutcome('failed@c2c.test', 201, { createdNewUser: true, invitation: { delivery: 'failed' } }),
    ]} />);
    expect(screen.getByText('Awaiting consent')).toBeTruthy();
    expect(screen.getByText('Activation needs attention')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /copy setup link/i })).toBeNull();
  });
});
