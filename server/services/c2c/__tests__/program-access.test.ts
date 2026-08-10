import { describe, expect, it } from 'vitest';
import {
  canMutateProgram,
  resolveProgramAuthzMode,
} from '../program-access.js';

describe('canMutateProgram', () => {
  it('allows the program lead', () => {
    expect(
      canMutateProgram({
        actor: { userId: 42, orgRole: 'member' },
        program: { leadUserId: 42 },
      })
    ).toBe(true);
  });

  it('allows every org manage role regardless of who leads the program', () => {
    for (const orgRole of ['admin', 'super_admin', 'owner', 'manager']) {
      expect(
        canMutateProgram({
          actor: { userId: 7, orgRole },
          program: { leadUserId: 42 },
        })
      ).toBe(true);
    }
  });

  it('normalizes the org role, so SUPER_ADMIN is the same authority as super_admin', () => {
    expect(
      canMutateProgram({
        actor: { userId: 7, orgRole: 'SUPER_ADMIN' },
        program: { leadUserId: 42 },
      })
    ).toBe(true);
  });

  // The P0 this module exists for: before it, this actor could unpin the
  // evidence feeding another team's AI generation purely by being in the org.
  it('denies an unrelated org member', () => {
    expect(
      canMutateProgram({
        actor: { userId: 7, orgRole: 'member' },
        program: { leadUserId: 42 },
      })
    ).toBe(false);
  });

  it('denies a viewer and an actor with no role at all', () => {
    expect(
      canMutateProgram({
        actor: { userId: 7, orgRole: 'viewer' },
        program: { leadUserId: 42 },
      })
    ).toBe(false);
    expect(
      canMutateProgram({
        actor: { userId: 7, orgRole: null },
        program: { leadUserId: 42 },
      })
    ).toBe(false);
  });

  it('denies a non-manager when the program has no lead — unowned is not everyone-owned', () => {
    expect(
      canMutateProgram({
        actor: { userId: 7, orgRole: 'member' },
        program: { leadUserId: null },
      })
    ).toBe(false);
    // …but a manager still administers it.
    expect(
      canMutateProgram({
        actor: { userId: 7, orgRole: 'admin' },
        program: { leadUserId: null },
      })
    ).toBe(true);
  });

  it('denies an unauthenticated actor even when the program is unowned', () => {
    expect(
      canMutateProgram({
        actor: { userId: null, orgRole: 'member' },
        program: { leadUserId: null },
      })
    ).toBe(false);
  });
});

describe('resolveProgramAuthzMode', () => {
  it('defaults to enforce when PROGRAM_AUTHZ_MODE is unset or empty', () => {
    expect(resolveProgramAuthzMode({} as NodeJS.ProcessEnv)).toBe('enforce');
    expect(
      resolveProgramAuthzMode({ PROGRAM_AUTHZ_MODE: '' } as NodeJS.ProcessEnv)
    ).toBe('enforce');
  });

  it('defaults to enforce outside production too', () => {
    expect(
      resolveProgramAuthzMode({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)
    ).toBe('enforce');
  });

  it('honours an explicit mode, case- and whitespace-insensitively', () => {
    expect(
      resolveProgramAuthzMode({ PROGRAM_AUTHZ_MODE: 'warn' } as NodeJS.ProcessEnv)
    ).toBe('warn');
    expect(
      resolveProgramAuthzMode({ PROGRAM_AUTHZ_MODE: '  Warn ' } as NodeJS.ProcessEnv)
    ).toBe('warn');
    expect(
      resolveProgramAuthzMode({
        PROGRAM_AUTHZ_MODE: 'ENFORCE',
        NODE_ENV: 'development',
      } as NodeJS.ProcessEnv)
    ).toBe('enforce');
  });

  it('falls back to enforce on an unrecognized value rather than opening up', () => {
    expect(
      resolveProgramAuthzMode({ PROGRAM_AUTHZ_MODE: 'off' } as NodeJS.ProcessEnv)
    ).toBe('enforce');
  });
});
