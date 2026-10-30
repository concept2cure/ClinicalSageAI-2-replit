// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { adoptSession, endSession } = vi.hoisted(() => ({ adoptSession: vi.fn(), endSession: vi.fn() }));
vi.mock('@/services/portal/authService', () => ({ authService: { adoptSession, endSession, getUser: () => sourceUser } }));
const sourceUser = { id: '33', organizationId: '7' };
const SOURCE_TOKEN = `test.${btoa(JSON.stringify({ userId: 33, organizationId: 7 }))}.synthetic`;
import { releaseSessionChange } from '@/lib/sessionChangeGuard';
import { switchOrganization } from '../switchOrganization';
import { GlobalMutationErrors } from '../GlobalMutationErrors';
import { consumeOrganizationSwitchAuditNotice, rememberOrganizationSwitchAuditNotice } from '../organizationSwitchAuditNotice';

const KEY = 'c2c.organization-switch-audit-notice';
const PATH = '/api/auth/enterprise/select-organization';
const lost = { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'private audit detail' };
function respond(auditTrail: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, token: 'rotated-secret-token', organization: { id: '9' }, meta: { auditTrail } }), {
    status, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'switch-request-123' },
  });
}
beforeEach(() => {
  vi.clearAllMocks(); releaseSessionChange(); localStorage.clear(); sessionStorage.clear();
  sessionStorage.setItem('trialsage_access_token', SOURCE_TOKEN);
  adoptSession.mockImplementation(async () => { sessionStorage.setItem('trialsage_access_token', 'rotated-secret-token'); return { id: '33', organizationId: '9' }; });
});
afterEach(() => { releaseSessionChange(); cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('the current organization switch carries its actual audit warning through reload', () => {
  it.each([
    ['lost', lost, 'AUDIT_ROW_NOT_PERSISTED'],
    ['tamper-only', { persisted: true, chained: false }, 'AUDIT_ROW_NOT_RETRIEVABLE'],
  ])('%s: actual apiRequest warns, still adopts and navigates, and the reloaded shell consumes once', async (_label, outcome, code) => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(outcome)));
    render(<GlobalMutationErrors />);
    const navigate = vi.fn();
    await act(async () => { await switchOrganization(9, navigate); });
    expect(adoptSession).toHaveBeenCalledWith('rotated-secret-token', false, { userId: '33', organizationId: '9' }, expect.any(Function));
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/concept2cure/projects');
    expect(screen.getByTestId('global-audit-row-notice').textContent).toContain('switch-request-123');
    const pending = sessionStorage.getItem(KEY)!;
    expect(JSON.parse(pending)).toEqual({ method: 'POST', path: PATH, code, correlationId: 'switch-request-123' });
    expect(pending).not.toMatch(/token|private|organizationId|userId/);
    cleanup();
    render(<React.StrictMode><GlobalMutationErrors /></React.StrictMode>);
    expect(screen.getByTestId('global-audit-row-notice').textContent).toMatch(/audit entry is unconfirmed/i);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    cleanup(); render(<GlobalMutationErrors />);
    expect(screen.queryByTestId('global-audit-row-notice')).toBeNull();
  });

  it('a healthy switch navigates without a persisted or rendered warning', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ persisted: true, chained: true })));
    render(<GlobalMutationErrors />); const navigate = vi.fn();
    await act(async () => { await switchOrganization(9, navigate); });
    expect(navigate).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByTestId('global-audit-row-notice')).toBeNull();
  });

  it('a refused switch does not adopt a token, navigate or save a completed-action notice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(lost, 403)));
    render(<GlobalMutationErrors />); const navigate = vi.fn();
    await expect(switchOrganization(9, navigate)).rejects.toThrow();
    expect(adoptSession).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByTestId('global-audit-row-notice')).toBeNull();
  });

  it('restricted notice storage never breaks the completed token handoff', async () => {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === KEY) throw new Error('Storage unavailable');
      return original.call(this, key, value);
    });
    vi.stubGlobal('fetch', vi.fn(async () => respond(lost)));
    const navigate = vi.fn(); await switchOrganization(9, navigate);
    expect(adoptSession).toHaveBeenCalledOnce(); expect(navigate).toHaveBeenCalledOnce();
  });

  it('stores only bounded allowed fields and rejects malformed or other-action notices without replay', () => {
    rememberOrganizationSwitchAuditNotice(new Headers({ 'X-Request-Id': 'x'.repeat(129) }), {
      token: 'secret-token', userId: 123, meta: { auditTrail: lost },
    });
    expect(consumeOrganizationSwitchAuditNotice()).toEqual({ method: 'POST', path: PATH, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(consumeOrganizationSwitchAuditNotice()).toBeNull();
    for (const raw of ['not-json', JSON.stringify({ method: 'POST', path: '/api/other', code: 'AUDIT_ROW_NOT_PERSISTED' }),
      JSON.stringify({ method: 'POST', path: PATH, code: 'OTHER_FAILURE' })]) {
      sessionStorage.setItem(KEY, raw);
      expect(consumeOrganizationSwitchAuditNotice()).toBeNull();
      expect(sessionStorage.getItem(KEY)).toBeNull();
    }
  });

  it('does not carry an unverified destination session into a reload notice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(lost)));
    adoptSession.mockResolvedValueOnce({ organizationId: 'other' });
    const navigate = vi.fn(); await expect(switchOrganization(9, navigate)).rejects.toThrow(/could not be verified/);
    expect(endSession).toHaveBeenCalledWith(null, true);
    expect(navigate).not.toHaveBeenCalled(); expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
