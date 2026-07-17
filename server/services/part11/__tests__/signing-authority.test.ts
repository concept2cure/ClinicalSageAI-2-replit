import { describe, it, expect, afterEach } from 'vitest';
import {
  DEFAULT_SIGNING_ROLES,
  signingAuthorityRoles,
  isSigningAuthorized,
} from '../signing-authority';

describe('Part 11 signing-authority policy', () => {
  const savedEnv = process.env.ESIGNATURE_SIGNING_ROLES;
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.ESIGNATURE_SIGNING_ROLES;
    else process.env.ESIGNATURE_SIGNING_ROLES = savedEnv;
  });

  it('authorizes the default signing roles (admin/approver/reviewer)', () => {
    expect(isSigningAuthorized('admin')).toBe(true);
    expect(isSigningAuthorized('approver')).toBe(true);
    expect(isSigningAuthorized('reviewer')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSigningAuthorized('Admin')).toBe(true);
    expect(isSigningAuthorized('  APPROVER ')).toBe(true);
  });

  it('fails closed for non-signing, empty, and absent roles', () => {
    expect(isSigningAuthorized('viewer')).toBe(false);
    expect(isSigningAuthorized('member')).toBe(false);
    expect(isSigningAuthorized('user')).toBe(false);
    expect(isSigningAuthorized('')).toBe(false);
    expect(isSigningAuthorized(null)).toBe(false);
    expect(isSigningAuthorized(undefined)).toBe(false);
  });

  it('respects an explicit allowlist argument', () => {
    expect(isSigningAuthorized('quality', ['quality'])).toBe(true);
    expect(isSigningAuthorized('admin', ['quality'])).toBe(false);
  });

  it('honors the ESIGNATURE_SIGNING_ROLES env override', () => {
    process.env.ESIGNATURE_SIGNING_ROLES = 'qa_manager, sponsor_signatory';
    expect(signingAuthorityRoles()).toEqual(['qa_manager', 'sponsor_signatory']);
    expect(isSigningAuthorized('qa_manager')).toBe(true);
    expect(isSigningAuthorized('admin')).toBe(false); // no longer in the override set
  });

  it('falls back to the default policy when the override is blank', () => {
    process.env.ESIGNATURE_SIGNING_ROLES = '   ';
    expect(signingAuthorityRoles()).toEqual([...DEFAULT_SIGNING_ROLES]);
  });
});
