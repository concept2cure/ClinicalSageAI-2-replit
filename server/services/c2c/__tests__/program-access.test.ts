import { describe, expect, it } from 'vitest';
import {
  canCreateProgram,
  canMutateProgram,
  programInOrganization,
  resolveProgramQuotaMode,
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

describe('canCreateProgram', () => {
  it('denies read-only roles', () => {
    // Creation writes a regulated record, scaffolds a document, consumes a
    // licensed seat, and makes the creator the lead — permanently authorized
    // over that program's evidence. A viewer could do all of it.
    for (const role of ['viewer', 'VIEWER', 'readonly', 'read_only', 'guest', ' viewer ']) {
      expect(canCreateProgram({ orgRole: role }), role).toBe(false);
    }
  });

  it('allows ordinary and elevated roles', () => {
    for (const role of ['member', 'manager', 'admin', 'owner', 'super_admin']) {
      expect(canCreateProgram({ orgRole: role }), role).toBe(true);
    }
  });

  it('allows an unrecognized role rather than locking it out', () => {
    // Deny-list on purpose: organization_users.role is free text and tenants add
    // their own, so an allow-list would turn every unenumerated role into a
    // lockout. The guarantee here is narrower — an explicitly read-only role
    // cannot write.
    expect(canCreateProgram({ orgRole: 'regulatory_lead' })).toBe(true);
    expect(canCreateProgram({ orgRole: null })).toBe(true);
  });
});

describe('resolveProgramQuotaMode', () => {
  it('defaults to WARN, unlike the authorization gate', () => {
    // Asymmetric on purpose. The authz rule closes a hole nobody was entitled
    // to use, so it enforces. The quota has never been enforced and its default
    // entitlement equals the standard tier, so enforcing on deploy would
    // retroactively lock out every tenant already over it.
    expect(resolveProgramQuotaMode({} as NodeJS.ProcessEnv)).toBe('warn');
    expect(resolveProgramQuotaMode({ PROGRAM_QUOTA_MODE: '' } as NodeJS.ProcessEnv)).toBe('warn');
  });

  it('honours an explicit enforce', () => {
    expect(resolveProgramQuotaMode({ PROGRAM_QUOTA_MODE: 'ENFORCE' } as NodeJS.ProcessEnv)).toBe('enforce');
  });

  it('falls back to warn on an unrecognized value', () => {
    expect(resolveProgramQuotaMode({ PROGRAM_QUOTA_MODE: 'off' } as NodeJS.ProcessEnv)).toBe('warn');
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

describe('programInOrganization — the one program check (D3, 2026-10-01)', () => {
  const PROGRAM = '33333333-3333-4333-8333-333333333333';
  const answering = (rows: unknown[]) => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    return {
      calls,
      db: { query: async (sql: string, params?: unknown[]) => (calls.push({ sql, params }), { rows }) },
    };
  };

  it('asks regulatory_programs for a live program of this organization', async () => {
    const { db, calls } = answering([{ id: PROGRAM }]);
    expect(await programInOrganization(db, PROGRAM, 7)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2 AND deleted_at IS NULL/);
    expect(calls[0].params).toEqual([PROGRAM, 7]);
  });

  it('is false when the query finds nothing', async () => {
    expect(await programInOrganization(answering([]).db, PROGRAM, 7)).toBe(false);
  });

  it('admits a deleted program only when the caller opts in by name', async () => {
    const { db, calls } = answering([{ id: PROGRAM }]);
    await programInOrganization(db, PROGRAM, 7, { includeDeleted: true });
    expect(calls[0].sql).not.toMatch(/deleted_at/);
  });

  it.each([['not-a-uuid'], [''], [42], [null], [undefined]])('refuses %j without asking the database', async id => {
    const { db, calls } = answering([{ id: PROGRAM }]);
    expect(await programInOrganization(db, id, 7)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('reads a digit-string organization as that organization, and nothing else as one', async () => {
    const ok = answering([{ id: PROGRAM }]);
    expect(await programInOrganization(ok.db, PROGRAM, '7')).toBe(true);
    expect(ok.calls[0].params).toEqual([PROGRAM, 7]);
    for (const org of ['7a', '', '0', 0, -1, Number.NaN, 1.5]) {
      const { db, calls } = answering([{ id: PROGRAM }]);
      expect(await programInOrganization(db, PROGRAM, org as number)).toBe(false);
      expect(calls).toHaveLength(0);
    }
  });

  it('throws VerificationUnavailableError, not false, when the query cannot run', async () => {
    const broken = { query: async () => { throw Object.assign(new Error('relation does not exist'), { code: '42P01' }); } };
    await expect(programInOrganization(broken, PROGRAM, 7)).rejects.toMatchObject({
      name: 'VerificationUnavailableError',
      detail: '42P01: relation does not exist',
    });
  });

  it('resolves a connection given as a function inside the check, so "no pool" is "could not check"', async () => {
    const noPool = () => { throw new Error('Database connection not available'); };
    await expect(programInOrganization(noPool, PROGRAM, 7)).rejects.toMatchObject({ name: 'VerificationUnavailableError' });
    const { db } = answering([{ id: PROGRAM }]);
    expect(await programInOrganization(() => db, PROGRAM, 7)).toBe(true);
  });
});
