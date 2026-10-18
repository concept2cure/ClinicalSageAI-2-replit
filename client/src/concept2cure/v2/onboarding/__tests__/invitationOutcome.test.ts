// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { invitationOutcome } from '../invitationOutcome';

const email = 'new.member@c2c.test';
const setupUrl = 'https://c2c.test/concept2cure/password-reset?token=private-setup-token';
const expiry = '2026-11-04T12:00:00.000Z';

describe('onboarding invitation outcomes', () => {
  it('keeps an individually shareable setup link when no invitation email went out', () => {
    const result = invitationOutcome(email, 201, {
      createdNewUser: true, role: 'reviewer',
      invitation: { delivery: 'link', emailSent: false, setupUrl, expiresAt: expiry },
    });
    expect(result).toMatchObject({ state: 'link', recorded: true, readyForAccess: false, setupUrl, expiresAt: expiry, role: 'reviewer' });
    expect(result.note).toMatch(/no invitation email was sent/i);
    expect(result.note).not.toContain('private-setup-token');
  });

  it('counts a created account with failed activation as recorded but not usable', () => {
    const result = invitationOutcome(email, 201, {
      createdNewUser: true, invitation: { delivery: 'failed', emailSent: false, expiresAt: null },
    });
    expect(result).toMatchObject({ state: 'activation-failed', recorded: true, readyForAccess: false });
    expect(result.note).toMatch(/cannot sign in/i);
    expect(result.setupUrl).toBeUndefined();
  });

  it('does not claim that a 202 consent request added membership or sent an email', () => {
    expect(invitationOutcome(email, 202, {
      success: true, pendingInvitation: true, data: { invitationId: 7, status: 'pending' },
    })).toMatchObject({ state: 'pending-consent', recorded: true, readyForAccess: false });
    expect(invitationOutcome(email, 202, {})).toMatchObject({ state: 'unconfirmed', recorded: false });
  });

  it('identifies delivered email without granting immediate access to a new account', () => {
    expect(invitationOutcome(email, 201, {
      createdNewUser: true, invitation: { delivery: 'email', emailSent: true },
    })).toMatchObject({ state: 'email', recorded: true, readyForAccess: false });
  });

  it('retains the stored role for a replacement invitation and explains invalidation', () => {
    const result = invitationOutcome(email, 200, {
      reissued: true, role: 'member', invitation: { delivery: 'link', emailSent: false, setupUrl },
    });
    expect(result).toMatchObject({ reissued: true, role: 'member', state: 'link', recorded: true });
    expect(result.note).toMatch(/previous link no longer works/i);
    expect(result.note).toMatch(/role is unchanged/i);
  });

  it('confirms immediate access only when an existing account was actually added', () => {
    expect(invitationOutcome(email, 201, { id: 33, createdNewUser: false, role: 'manager' }))
      .toMatchObject({ state: 'member-added', readyForAccess: true, recorded: true });
  });

  it('never invents delivery from a missing or inconsistent success payload', () => {
    expect(invitationOutcome(email, 201, null)).toMatchObject({ state: 'unconfirmed', recorded: false });
    expect(invitationOutcome(email, 201, { createdNewUser: true })).toMatchObject({ state: 'delivery-unconfirmed', readyForAccess: false });
    expect(invitationOutcome(email, 201, { createdNewUser: true, invitation: { delivery: 'email', emailSent: false } }))
      .toMatchObject({ state: 'delivery-unconfirmed' });
  });

  it.each(['javascript:alert(1)', 'data:text/html,secret', 'https://c2c.test/wrong?token=secret', 'https://admin:secret@c2c.test/concept2cure/password-reset?token=secret'])('rejects unsafe setup link %s', (unsafe) => {
    const result = invitationOutcome(email, 201, { createdNewUser: true, invitation: { delivery: 'link', setupUrl: unsafe } });
    expect(result.state).toBe('delivery-unconfirmed');
    expect(result.setupUrl).toBeUndefined();
  });

  it('renders the server refusal while stripping infrastructure details', () => {
    expect(invitationOutcome(email, 403, { error: 'SEAT_LIMIT_EXCEEDED', message: 'All purchased seats are in use. Purchase more seats to add members.' }).note)
      .toBe('All purchased seats are in use. Purchase more seats to add members.');
    const result = invitationOutcome(email, 503, { message: 'Missing APP_URL for /api/tenant-users' });
    expect(result.state).toBe('refused');
    expect(result.note).not.toMatch(/APP_URL|\/api\//);
    expect(result.recorded).toBe(false);
  });

  it('handles network uncertainty honestly without exposing raw exceptions', () => {
    expect(invitationOutcome(email, 0, null)).toMatchObject({ state: 'unconfirmed', recorded: false, readyForAccess: false });
  });
});
