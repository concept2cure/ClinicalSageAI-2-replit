/**
 * Central AnA command authorization (C2C-AI-001 / C2C-AI-002).
 *
 * Locks the three properties the dispatcher depends on:
 *   1. fail-closed BY CONSTRUCTION — a command with no authorization metadata
 *      is denied, so a newly wired handler cannot ship ungated;
 *   2. fail-closed on every uncertain input — missing identity, an RBAC lookup
 *      error, and an unresolved tenant governance configuration all deny a
 *      mutation, while read-only commands stay available (degraded read mode);
 *   3. TOTAL COVERAGE — every dispatchable command in COMMAND_HANDLERS carries
 *      metadata, every write carries a role tier, and the Part 11 flags in the
 *      registry match part11-governance.ts. This is the anti-drift guard: a
 *      future command added without classification fails CI here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rbac = vi.hoisted(() => ({
  hasRole: vi.fn(async () => false),
  getUserRoles: vi.fn(async () => [] as string[]),
}));

// The canonical RBAC service — mocked so these tests need no database.
vi.mock('../../roleBasedAccess', () => ({
  default: {
    hasRole: (...args: unknown[]) => (rbac.hasRole as any)(...args),
    getUserRoles: (...args: unknown[]) => (rbac.getUserRoles as any)(...args),
  },
}));

// db facade stub so importing command-executor (for the coverage invariants)
// does not initialise a real pool.
vi.mock('../../../db', () => ({
  db: {},
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })) }),
  getDb: () => ({}),
}));

import {
  authorizeCommand,
  isPrivacyAdmin,
  COMMAND_AUTHORIZATION,
} from '../command-rbac';
import { COMMAND_HANDLER_NAMES, type CommandContext } from '../command-executor.js';
import {
  PART11_GOVERNED_COMMANDS,
  PART11_ESIGN_COMMANDS,
} from '../part11-governance';

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  return { userId: 7, organizationId: 3, ...over } as CommandContext;
}

beforeEach(() => {
  rbac.hasRole.mockReset();
  rbac.getUserRoles.mockReset();
  rbac.hasRole.mockResolvedValue(false);
  rbac.getUserRoles.mockResolvedValue([]);
});

describe('authorizeCommand — fail-closed by construction', () => {
  it('DENIES a dispatchable-looking command that carries no authorization metadata', async () => {
    const decision = await authorizeCommand('some_brand_new_mutation', ctx());
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('COMMAND_NOT_AUTHORIZED');
    expect(decision.result.success).toBe(false);
    // The role service must not even be consulted — there is nothing to check.
    expect(rbac.hasRole).not.toHaveBeenCalled();
  });

  it('allows a read-only command without consulting RBAC', async () => {
    const decision = await authorizeCommand('list_projects', ctx());
    expect(decision.ok).toBe(true);
    expect(rbac.hasRole).not.toHaveBeenCalled();
  });
});

describe('authorizeCommand — tenant tool policy applies to ALL commands', () => {
  // Regression guard. The per-tenant allow/deny policy used to be enforced ONLY by
  // requireGovernedToolGate(), which is reachable exclusively from the 37 dotted
  // MDX/PDEV handlers. The other ~78 dispatchable commands — submit_document,
  // freeze_document, sign_document, place_in_dossier, erase_personal_data … —
  // silently IGNORED an admin deny, and a non-empty allow list failed to constrain
  // them at all, inverting a whitelist into a no-op. server/routes/ana-tool-policy.ts
  // accepts those names, so it was a supported, silently-ineffective configuration.

  it('DENIES a non-MDX write that the tenant deny-list names', async () => {
    rbac.hasRole.mockResolvedValue(true); // role would otherwise permit it
    const decision = await authorizeCommand(
      'submit_document',
      ctx({ anaToolPolicy: { deny: ['submit_document'] } }),
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('TOOL_DENIED');
  });

  it('DENIES a READ the tenant deny-list names (deny outranks the degraded-read path)', async () => {
    const decision = await authorizeCommand(
      'list_projects',
      ctx({ anaToolPolicy: { deny: ['list_projects'] } }),
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('TOOL_DENIED');
  });

  it('DENIES a command absent from a non-empty allow-list (whitelist actually constrains)', async () => {
    rbac.hasRole.mockResolvedValue(true);
    const decision = await authorizeCommand(
      'create_task',
      ctx({ anaToolPolicy: { allow: ['create_project'] } }),
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('TOOL_NOT_ALLOWED');
  });

  it('ALLOWS a command that is on the allow-list, and when no policy is set', async () => {
    rbac.hasRole.mockResolvedValue(true);
    expect((await authorizeCommand('create_project', ctx({ anaToolPolicy: { allow: ['create_project'] } }))).ok).toBe(true);
    // No policy configured for the tenant → the gate is transparent.
    expect((await authorizeCommand('create_project', ctx())).ok).toBe(true);
    // An empty allow-list is "unset", not "deny everything".
    expect((await authorizeCommand('create_project', ctx({ anaToolPolicy: { allow: [] } }))).ok).toBe(true);
  });
});

describe('authorizeCommand — role enforcement on mutations', () => {
  it('DENIES a mutation when the caller lacks the required role (viewer)', async () => {
    rbac.hasRole.mockResolvedValue(false);
    const decision = await authorizeCommand('create_project', ctx());
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('RBAC_DENIED');
    expect(decision.result.message).toContain('member');
    expect(rbac.hasRole).toHaveBeenCalledWith(7, 'member', 3);
  });

  it('ALLOWS a mutation when the caller holds the required role', async () => {
    rbac.hasRole.mockResolvedValue(true);
    await expect(authorizeCommand('create_project', ctx())).resolves.toEqual({ ok: true });
  });

  it('demands the manager tier for Part 11 record-altering commands', async () => {
    rbac.hasRole.mockResolvedValue(true);
    await authorizeCommand('submit_document', ctx());
    expect(rbac.hasRole).toHaveBeenCalledWith(7, 'manager', 3);
  });

  it('DENIES when the RBAC lookup throws (fail closed, never fail open)', async () => {
    rbac.hasRole.mockRejectedValue(new Error('connection lost'));
    const decision = await authorizeCommand('create_project', ctx());
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('RBAC_DENIED');
  });

  it.each([
    ['missing userId', { userId: undefined as unknown as number }],
    ['missing organizationId', { organizationId: undefined as unknown as number }],
    ['non-numeric userId', { userId: '7' as unknown as number }],
    ['zero organizationId', { organizationId: 0 }],
  ])('DENIES a mutation with %s (identity must come from the verified principal)', async (_l, over) => {
    const decision = await authorizeCommand('create_project', ctx(over));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('RBAC_CONTEXT_MISSING');
    expect(rbac.hasRole).not.toHaveBeenCalled();
  });
});

describe('authorizeCommand — fail-closed governance', () => {
  it('BLOCKS every mutation when tenant governance config could not be resolved', async () => {
    rbac.hasRole.mockResolvedValue(true); // role is fine; governance is not
    const decision = await authorizeCommand('create_project', ctx({ governanceUnavailable: true }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('GOVERNANCE_UNAVAILABLE');
  });

  it('BLOCKS a Part 11 governed mutation when governance config is unresolved', async () => {
    rbac.hasRole.mockResolvedValue(true);
    const decision = await authorizeCommand('place_in_dossier', ctx({ governanceUnavailable: true }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('GOVERNANCE_UNAVAILABLE');
  });

  it('keeps READ-ONLY commands available while governance is unresolved (documented degraded mode)', async () => {
    await expect(
      authorizeCommand('list_projects', ctx({ governanceUnavailable: true })),
    ).resolves.toEqual({ ok: true });
    await expect(
      authorizeCommand('search_artifacts', ctx({ governanceUnavailable: true })),
    ).resolves.toEqual({ ok: true });
  });
});

describe('authorizeCommand — GDPR data-subject carve-out', () => {
  it('lets the central gate through so the handler can apply the self-service rule', async () => {
    rbac.hasRole.mockResolvedValue(false); // no elevated role at all
    await expect(authorizeCommand('export_personal_data', ctx())).resolves.toEqual({ ok: true });
    await expect(authorizeCommand('erase_personal_data', ctx())).resolves.toEqual({ ok: true });
    expect(rbac.hasRole).not.toHaveBeenCalled();
  });

  it('still demands provable identity for the GDPR commands', async () => {
    const decision = await authorizeCommand('erase_personal_data', ctx({ userId: 0 }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('RBAC_CONTEXT_MISSING');
  });

  it('blocks the erase mutation when governance is unresolved', async () => {
    const decision = await authorizeCommand('erase_personal_data', ctx({ governanceUnavailable: true }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.result.error).toBe('GOVERNANCE_UNAVAILABLE');
  });
});

describe('isPrivacyAdmin — DB-sourced, fail closed', () => {
  it('is true for manager+ in the organization', async () => {
    rbac.hasRole.mockResolvedValue(true);
    await expect(isPrivacyAdmin(ctx())).resolves.toBe(true);
  });

  it('is true for a dedicated privacy role that has no hierarchy level', async () => {
    rbac.hasRole.mockResolvedValue(false);
    rbac.getUserRoles.mockResolvedValue(['privacy_officer']);
    await expect(isPrivacyAdmin(ctx())).resolves.toBe(true);
  });

  it('is false for an ordinary member and never trusts ctx.userRole', async () => {
    rbac.hasRole.mockResolvedValue(false);
    rbac.getUserRoles.mockResolvedValue(['member']);
    // A caller asserting "I am an admin" in the context must not matter.
    await expect(isPrivacyAdmin(ctx({ userRole: 'admin' }))).resolves.toBe(false);
  });

  it('is false when the role lookup throws', async () => {
    rbac.hasRole.mockRejectedValue(new Error('db down'));
    await expect(isPrivacyAdmin(ctx())).resolves.toBe(false);
  });

  it('is false without a provable identity', async () => {
    await expect(isPrivacyAdmin(ctx({ organizationId: undefined as unknown as number }))).resolves.toBe(false);
  });
});

describe('authorization registry — total coverage (anti-drift CI guard)', () => {
  it('classifies EVERY dispatchable command', () => {
    const missing = COMMAND_HANDLER_NAMES.filter((n) => !COMMAND_AUTHORIZATION[n]);
    expect(
      missing,
      'commands dispatchable by executeCommands with no COMMAND_AUTHORIZATION entry ' +
        '(they are denied at runtime — classify them in command-rbac.ts): ' +
        missing.join(', '),
    ).toEqual([]);
  });

  it('has no authorization entry for a command that is not dispatchable', () => {
    const dispatchable = new Set(COMMAND_HANDLER_NAMES);
    const stale = Object.keys(COMMAND_AUTHORIZATION).filter((n) => !dispatchable.has(n));
    expect(stale, `stale authorization entries: ${stale.join(', ')}`).toEqual([]);
  });

  it('gives every mutation-capable command a role tier or an explicit handler carve-out', () => {
    const unguarded = Object.entries(COMMAND_AUTHORIZATION)
      .filter(([, a]) => a.effect === 'write' && !a.minRole && !a.handlerAuthorized)
      .map(([n]) => n);
    expect(unguarded, `write commands with no minRole: ${unguarded.join(', ')}`).toEqual([]);
  });

  it('never puts a role tier on a plain read (reads are not RBAC-gated)', () => {
    const odd = Object.entries(COMMAND_AUTHORIZATION)
      .filter(([, a]) => a.effect === 'read' && a.minRole)
      .map(([n]) => n);
    expect(odd).toEqual([]);
  });

  it('marks every dispatchable Part 11 governed command as a manager-tier write', () => {
    const dispatchable = new Set(COMMAND_HANDLER_NAMES);
    const wrong = [...PART11_GOVERNED_COMMANDS]
      .filter((n) => dispatchable.has(n))
      .filter((n) => {
        const a = COMMAND_AUTHORIZATION[n];
        return !a || a.effect !== 'write' || a.minRole !== 'manager' || !a.requiresReasonForChange;
      });
    expect(wrong, `Part 11 governed commands misclassified: ${wrong.join(', ')}`).toEqual([]);
  });

  it('mirrors the Part 11 e-signature subset exactly', () => {
    const dispatchable = new Set(COMMAND_HANDLER_NAMES);
    const declared = Object.entries(COMMAND_AUTHORIZATION)
      .filter(([, a]) => a.requiresSignature)
      .map(([n]) => n)
      .sort();
    const expected = [...PART11_ESIGN_COMMANDS].filter((n) => dispatchable.has(n)).sort();
    expect(declared).toEqual(expected);
  });

  it('never marks a Part 11 governed command as read-only', () => {
    const reads = [...PART11_GOVERNED_COMMANDS].filter(
      (n) => COMMAND_AUTHORIZATION[n]?.effect === 'read',
    );
    expect(reads).toEqual([]);
  });
});
