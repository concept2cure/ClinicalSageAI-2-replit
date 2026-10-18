import { beforeEach, describe, expect, it, vi } from 'vitest';
const { configured, send } = vi.hoisted(() => ({ configured: vi.fn(), send: vi.fn() }));
vi.mock('../../emailService', () => ({ isEmailConfigured: configured, sendGenericEmail: send }));
import { deliverPendingInvitation } from '../pending-invitation-delivery';
beforeEach(() => { vi.clearAllMocks(); configured.mockReturnValue(true); send.mockResolvedValue(true); });
describe('pending existing-account invitation delivery', () => {
  it('emails a session-authenticated consent inbox link, never an activation token', async () => {
    expect(await deliverPendingInvitation('existing@test.org', 'https://app.test')).toEqual({ emailSent: true, inbox: true });
    expect(send.mock.calls[0]).toEqual(['existing@test.org', 'An organization invitation is waiting', expect.stringContaining('https://app.test/concept2cure?organization-invitations=1')]);
    expect(send.mock.calls[0][2]).not.toMatch(/password|token=/);
  });
  it('reports inbox-only delivery when SMTP is absent', async () => {
    configured.mockReturnValue(false);
    expect(await deliverPendingInvitation('existing@test.org', 'https://app.test')).toEqual({ emailSent: false, inbox: true });
    expect(send).not.toHaveBeenCalled();
  });
  it('preserves the committed invitation and reports no email when delivery fails', async () => {
    send.mockRejectedValue(new Error('Mail failure'));
    expect(await deliverPendingInvitation('existing@test.org', 'https://app.test')).toEqual({ emailSent: false, inbox: true });
  });
});
