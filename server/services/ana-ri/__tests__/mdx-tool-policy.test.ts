/**
 * Tool-policy gate tests — confirms the three-layer check works:
 *   1. Tenant policy (allow / deny lists) refuses before confirmation.
 *   2. Confirmation enforces expected confirm + min reason length.
 *   3. Reason-quality filter rejects degenerate strings.
 */

import { describe, it, expect } from 'vitest';
import { requireGovernedToolGate, mapServiceError } from '../mdx-tool-policy';

const baseCtx = { userId: 7, organizationId: 11 };

describe('tenant policy gate', () => {
  it('refuses when tool is in deny list', () => {
    const ctx = { ...baseCtx, anaToolPolicy: { deny: ['q_sub.create'] } } as any;
    const r = requireGovernedToolGate('q_sub.create', ctx, {
      confirm: 'yes',
      reason: 'a sufficient reason for the test',
    });
    expect(r.ok).toBe(false);
    expect(r.result.error).toBe('TOOL_DENIED');
    expect(r.result.message).toMatch(/disabled/i);
  });

  it('allows when tool is in allow list', () => {
    const ctx = { ...baseCtx, anaToolPolicy: { allow: ['q_sub.create'] } } as any;
    const r = requireGovernedToolGate('q_sub.create', ctx, {
      confirm: 'yes',
      reason: 'a sufficient reason for the test',
    });
    expect(r.ok).toBe(true);
  });

  it('refuses when tool is NOT in allow list (allowlist mode)', () => {
    const ctx = { ...baseCtx, anaToolPolicy: { allow: ['q_sub.create'] } } as any;
    const r = requireGovernedToolGate('section.approve', ctx, {
      confirm: 'yes',
      reason: 'a sufficient reason for the test',
    });
    expect(r.ok).toBe(false);
    expect(r.result.error).toBe('TOOL_NOT_ALLOWED');
  });

  it('default policy (no anaToolPolicy on ctx) allows everything', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx as any, {
      confirm: 'yes',
      reason: 'a sufficient reason for the test',
    });
    expect(r.ok).toBe(true);
  });
});

describe('confirmation gate', () => {
  it('refuses missing confirm', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx as any, {
      reason: 'a sufficient reason for the test',
    });
    expect(r.ok).toBe(false);
    expect(r.result.error).toBe('CONFIRMATION_REQUIRED');
  });

  it('refuses wrong confirm value', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx as any, {
      confirm: 'sure',
      reason: 'a sufficient reason for the test',
    });
    expect(r.ok).toBe(false);
    expect(r.result.error).toBe('CONFIRMATION_REQUIRED');
  });

  it('refuses short reason', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx as any, {
      confirm: 'yes',
      reason: 'short',
    });
    expect(r.ok).toBe(false);
    expect(r.result.error).toBe('REASON_TOO_SHORT');
  });

  it('honors custom expected confirm and min length (transmit)', () => {
    const r = requireGovernedToolGate(
      'k510_workflow.transmit',
      baseCtx as any,
      { confirm: 'yes', reason: 'this is a long enough reason for normal mutations' },
      { expected: 'yes-transmit', minReasonLength: 30 },
    );
    expect(r.ok).toBe(false);
    expect(r.result.error).toBe('CONFIRMATION_REQUIRED');
    expect((r.result.data as any)?.confirmExpected).toBe('yes-transmit');
  });

  it('passes with valid confirm + reason', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx as any, {
      confirm: 'yes',
      reason: 'a sufficient reason for the test',
    });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('a sufficient reason for the test');
  });
});

describe('reason-quality filter', () => {
  it('rejects a reason of one repeated character', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx as any, {
      confirm: 'yes',
      reason: 'aaaaaaaaaaaaaaa',
    });
    expect(r.ok).toBe(false);
    expect(r.result.error).toBe('REASON_DEGENERATE');
  });

  it('rejects a reason with too few distinct characters', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx as any, {
      confirm: 'yes',
      reason: 'abababababab',
    });
    expect(r.ok).toBe(false);
    expect(r.result.error).toBe('REASON_DEGENERATE');
  });

  it('accepts a real-shaped reason', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx as any, {
      confirm: 'yes',
      reason: 'per FDA AI letter triage outcome',
    });
    expect(r.ok).toBe(true);
  });
});

describe('mapServiceError', () => {
  it('maps TenantAccessError to TENANT_ACCESS_DENIED', () => {
    class TenantAccessError extends Error {
      constructor(m: string) { super(m); this.name = 'TenantAccessError'; }
    }
    const r = mapServiceError('q_sub.create', new TenantAccessError('cross-tenant'));
    expect(r.error).toBe('TENANT_ACCESS_DENIED');
    expect(r.success).toBe(false);
  });

  it('maps generic errors to EXECUTION_FAILED', () => {
    const r = mapServiceError('q_sub.create', new Error('boom'));
    expect(r.error).toBe('EXECUTION_FAILED');
    expect(r.message).toMatch(/boom/);
  });
});
