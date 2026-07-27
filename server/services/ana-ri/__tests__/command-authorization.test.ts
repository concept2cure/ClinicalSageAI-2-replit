/**
 * Central command-authorization envelope (G-05).
 *
 * PARITY is the load-bearing guarantee: every dispatchable command in
 * COMMAND_HANDLERS must resolve to a policy, so a NEW command added without an
 * authorization decision fails this test at build time rather than dispatching
 * ungated. The behavioural cases pin fail-closed for unknown commands, the
 * tenant tool policy applying to ALL commands, and the privacy-admin capability.
 */

import { describe, it, expect } from 'vitest';
import {
  authorizeCommand,
  resolvePolicy,
  COMMAND_POLICY,
  DELEGATED_COMMANDS,
  type AuthzContext,
} from '../command-authorization';
import { COMMAND_HANDLER_NAMES } from '../command-executor';

const base: AuthzContext = { userId: 1, organizationId: 1, userRole: 'author' };

describe('parity: every dispatchable command has an authorization policy', () => {
  it('resolves a policy for every COMMAND_HANDLERS entry', () => {
    const unmapped = COMMAND_HANDLER_NAMES.filter((name) => resolvePolicy(name) === null);
    expect(unmapped, `commands with no authorization policy: ${unmapped.join(', ')}`).toEqual([]);
  });

  it('classifies the known sign + privacy commands', () => {
    for (const c of ['place_in_dossier', 'sign_document', 'submit_document', 'freeze_document', 'revert_to_version', 'create_submission_package']) {
      expect(COMMAND_POLICY[c]?.class).toBe('sign');
    }
    for (const c of ['export_personal_data', 'erase_personal_data']) {
      expect(COMMAND_POLICY[c]?.class).toBe('privacy');
      expect(COMMAND_POLICY[c]?.requiredCapabilities).toContain('privacy_admin');
    }
  });
});

describe('authorizeCommand — fail closed', () => {
  it('denies an unknown / unmapped command', () => {
    const d = authorizeCommand('totally_made_up_command', base);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('no-authorization-policy');
    expect(d.class).toBe('unknown');
  });

  it('allows a read and a mutation for an ordinary tenant member', () => {
    expect(authorizeCommand('list_projects', base).allowed).toBe(true);
    expect(authorizeCommand('create_artifact', base).allowed).toBe(true);
  });

  it('allows a sign-class command at this layer (Part 11 sign-off is enforced separately)', () => {
    const d = authorizeCommand('place_in_dossier', base);
    expect(d.allowed).toBe(true);
    expect(d.class).toBe('sign');
  });

  it('allows a delegated MDX/PDEV command (its handler gate governs confirm/reason)', () => {
    const delegated = [...DELEGATED_COMMANDS][0];
    expect(typeof delegated).toBe('string');
    const d = authorizeCommand(delegated, base);
    expect(d.allowed).toBe(true);
    expect(d.class).toBe('delegated');
  });
});

describe('authorizeCommand — privacy capability', () => {
  it('denies GDPR export/erase without a privacy-admin role', () => {
    const d = authorizeCommand('erase_personal_data', { ...base, userRole: 'author' });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('missing-capability:privacy_admin');
  });
  it('allows GDPR export/erase for a privacy-admin role', () => {
    for (const role of ['admin', 'dpo', 'privacy_officer', 'owner']) {
      expect(authorizeCommand('export_personal_data', { ...base, userRole: role }).allowed).toBe(true);
    }
  });
});

describe('authorizeCommand — tenant tool policy applies to ALL commands', () => {
  it('denies a command on the tenant deny list', () => {
    const d = authorizeCommand('create_artifact', { ...base, anaToolPolicy: { deny: ['create_artifact'] } });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('tenant-tool-policy-deny');
  });
  it('denies a command absent from a non-empty allow list', () => {
    const d = authorizeCommand('create_task', { ...base, anaToolPolicy: { allow: ['list_projects'] } });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('tenant-tool-policy-not-allowed');
  });
  it('allows a command present on the allow list', () => {
    const d = authorizeCommand('list_projects', { ...base, anaToolPolicy: { allow: ['list_projects'] } });
    expect(d.allowed).toBe(true);
  });
});
