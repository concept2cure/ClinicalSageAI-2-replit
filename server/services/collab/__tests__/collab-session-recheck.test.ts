/**
 * Session re-check on an open collaboration socket (2026-09-28).
 *
 * A collaboration socket was admitted on a verified token, a live membership
 * and a permitted tenant, and then nothing looked again for as long as it
 * stayed open: a member removed from the organisation, a signed-out session,
 * an account taken out of use and a suspended tenant all kept a live WRITE
 * channel into a regulated document. The socket.io namespaces re-check on a
 * timer (server/socket/sessionRecheck.ts, IAM-12 / IAM-19); hocuspocus-server
 * now runs the same re-check. Admission itself — against a real token store,
 * membership and tenant — is covered by collab-governance.pglite.integration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  tokenLive: true,
  member: true,
  posture: 'allow' as 'allow' | 'read_only' | 'deny' | null,
  claims: { userId: 7001, organizationId: 4101 } as Record<string, unknown>,
}));

vi.mock('../../token-revocation', () => ({
  verifyLiveToken: vi.fn(async () => {
    if (!h.tokenLive) throw Object.assign(new Error('ended'), { name: 'SessionEndedError', reason: 'revoked' });
    return h.claims;
  }),
}));
vi.mock('../../../middleware/orgMembership', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../middleware/orgMembership')>()),
  checkOrgMembership: vi.fn(async () => (h.member ? 'member' : 'revoked')),
}));
vi.mock('../../tenant/tenant-lifecycle', () => ({
  getTenantAccessPosture: vi.fn(async (organizationId: number) =>
    h.posture ? { organizationId, state: h.posture, decision: h.posture, code: 'X', reason: 'x' } : null,
  ),
  shouldProcessTenantInBackground: vi.fn(async () => true),
}));
vi.mock('../collab-authorization', async importOriginal => ({
  ...(await importOriginal<typeof import('../collab-authorization')>()),
  authorizeResource: vi.fn(async () => 'authorized'),
}));

import {
  authenticateCollabConnection,
  collabSessionEndReason,
  startCollabSessionRecheck,
} from '../../hocuspocus-server';
import { SOCKET_SESSION_RECHECK_MS } from '../../../socket/sessionRecheck';

const DOC = 'authoring:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function admitted() {
  const connectionConfig = { readOnly: false };
  const context = await authenticateCollabConnection({ token: 't', documentName: DOC, connectionConfig });
  return { context, connection: { readOnly: connectionConfig.readOnly } };
}

beforeEach(() => {
  h.tokenLive = true;
  h.member = true;
  h.posture = 'allow';
  h.claims = { userId: 7001, organizationId: 4101 };
});

describe('session re-check on an open collaboration socket', () => {
  it('keeps a session that is still good', async () => {
    const { context, connection } = await admitted();
    await expect(collabSessionEndReason(context, connection)).resolves.toBeNull();
  });

  it.each([
    ['the session is signed out or the account taken out of use', () => { h.tokenLive = false; }, 'session_ended'],
    ['the member is removed from the organisation', () => { h.member = false; }, 'membership_revoked'],
    ['the tenant is suspended', () => { h.posture = 'deny'; }, 'tenant_inactive'],
    ['the tenant posture cannot be read (fail closed)', () => { h.posture = null; }, 'tenant_inactive'],
  ])('ends it when %s', async (_what, change, reason) => {
    const { context, connection } = await admitted();
    change();
    await expect(collabSessionEndReason(context, connection)).resolves.toBe(reason);
  });

  it('ends a WRITABLE connection when the tenant becomes read-only, and keeps a view-only one', async () => {
    const { context, connection } = await admitted();
    h.posture = 'read_only';
    await expect(collabSessionEndReason(context, connection)).resolves.toBe('tenant_read_only');
    await expect(collabSessionEndReason(context, { readOnly: true })).resolves.toBeNull();
  });

  describe('on the timer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('closes the connection when the session ends, once, and stops re-checking', async () => {
      const { context } = await admitted();
      const closeHandlers: Array<() => void> = [];
      const connection = {
        readOnly: false,
        close: vi.fn((_event?: { code: number; reason: string }) => closeHandlers.forEach(fn => fn())),
        onClose: vi.fn((fn: () => void) => {
          closeHandlers.push(fn);
          return connection;
        }),
      };
      startCollabSessionRecheck(connection as never, context, DOC);
      await vi.advanceTimersByTimeAsync(SOCKET_SESSION_RECHECK_MS);
      expect(connection.close).not.toHaveBeenCalled();

      h.member = false;
      await vi.advanceTimersByTimeAsync(SOCKET_SESSION_RECHECK_MS);
      expect(connection.close).toHaveBeenCalledTimes(1);
      expect(connection.close.mock.calls[0][0]).toMatchObject({ code: 4401, reason: 'membership_revoked' });

      await vi.advanceTimersByTimeAsync(SOCKET_SESSION_RECHECK_MS * 3);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('stops when the client closes first', async () => {
      const { context } = await admitted();
      let onClose: () => void = () => undefined;
      const connection = { readOnly: false, close: vi.fn(), onClose: vi.fn((fn: () => void) => { onClose = fn; return connection; }) };
      startCollabSessionRecheck(connection as never, context, DOC);
      onClose();
      h.member = false;
      await vi.advanceTimersByTimeAsync(SOCKET_SESSION_RECHECK_MS * 2);
      expect(connection.close).not.toHaveBeenCalled();
    });
  });
});

describe('admission', () => {
  it('refuses a subject that is not a platform user id, rather than skipping the membership check', async () => {
    h.claims = { userId: 'not-a-user-id', organizationId: 4101 };
    await expect(
      authenticateCollabConnection({ token: 't', documentName: DOC, connectionConfig: { readOnly: false } }),
    ).rejects.toMatchObject({ reason: 'invalid-token' });
  });
});
