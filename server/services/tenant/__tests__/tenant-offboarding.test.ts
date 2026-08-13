/**
 * Governed tenant offboarding — the state machine that replaced the cascade
 * delete.
 *
 * A fake pool records every statement, so the tests assert both the decisions
 * and the SQL shape that carries them. The cases that matter most are the
 * refusals: a purge that runs without an export digest, before the retention
 * window closes, or on a tenant that was never scheduled for deletion, is the
 * exact failure this whole module exists to make impossible.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  cancelDeletion,
  DEFAULT_RETENTION_DAYS,
  MINIMUM_RETENTION_DAYS,
  OffboardingStateError,
  PURGE_CHILD_TABLES,
  purgeTenant,
  requestDeletion,
} from '../tenant-offboarding';

vi.mock('../../../middleware/orgMembership', () => ({
  invalidateOrgMembershipCache: vi.fn(),
}));

const ORG = 42;
const ACTOR = 7;

type Row = Record<string, unknown>;

/**
 * Minimal pg.Pool stand-in. `rowsFor` is consulted in order: each entry is a
 * predicate on the SQL text plus the rows to return.
 */
function makePool(responses: Array<{ match: RegExp; rows: Row[] }>) {
  const statements: Array<{ text: string; params?: unknown[] }> = [];
  const pool = {
    statements,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      statements.push({ text, params });
      const hit = responses.find(r => r.match.test(text));
      return { rows: hit ? hit.rows : [] };
    }),
  };
  return pool as any;
}

function orgRow(overrides: Row = {}): Row {
  return {
    id: ORG,
    name: 'Acme Bio',
    status: 'active',
    deletion_requested_at: null,
    deletion_requested_by: null,
    deletion_reason: null,
    purge_eligible_at: null,
    purged_at: null,
    final_export_digest: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('requestDeletion', () => {
  it('moves an active organization to pending_deletion and starts the clock', async () => {
    const pool = makePool([
      { match: /SELECT id, name, status/, rows: [orgRow()] },
      {
        match: /UPDATE organizations/,
        rows: [orgRow({ status: 'pending_deletion', purge_eligible_at: new Date() })],
      },
    ]);

    const record = await requestDeletion(pool, {
      organizationId: ORG,
      requestedByUserId: ACTOR,
      reason: 'contract ended',
    });

    expect(record.status).toBe('pending_deletion');
    const update = pool.statements.find((s: any) => /UPDATE organizations/.test(s.text));
    expect(update.text).toContain("status                = 'pending_deletion'");
    expect(update.params).toContain(String(DEFAULT_RETENTION_DAYS));
  });

  it('clamps a short retention request up to the minimum', async () => {
    // The window is not negotiable in the heat of an offboarding conversation.
    const pool = makePool([
      { match: /SELECT id, name, status/, rows: [orgRow()] },
      { match: /UPDATE organizations/, rows: [orgRow({ status: 'pending_deletion' })] },
    ]);

    await requestDeletion(pool, {
      organizationId: ORG,
      requestedByUserId: ACTOR,
      reason: 'r',
      retentionDays: 1,
    });

    const update = pool.statements.find((s: any) => /UPDATE organizations/.test(s.text));
    expect(update.params).toContain(String(MINIMUM_RETENTION_DAYS));
  });

  it('is idempotent — a second request does NOT reset or shorten the window', async () => {
    const existingEligible = new Date('2026-09-01T00:00:00Z');
    const pool = makePool([
      {
        match: /SELECT id, name, status/,
        rows: [orgRow({ status: 'pending_deletion', purge_eligible_at: existingEligible })],
      },
    ]);

    const record = await requestDeletion(pool, {
      organizationId: ORG,
      requestedByUserId: ACTOR,
      reason: 'again',
      retentionDays: 90,
    });

    expect(record.purgeEligibleAt).toEqual(existingEligible);
    expect(pool.statements.some((s: any) => /UPDATE organizations/.test(s.text))).toBe(false);
  });

  it('refuses for an unknown organization', async () => {
    const pool = makePool([{ match: /SELECT id, name, status/, rows: [] }]);
    await expect(
      requestDeletion(pool, { organizationId: ORG, requestedByUserId: ACTOR, reason: 'r' })
    ).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
  });

  it('refuses for an already-purged organization', async () => {
    const pool = makePool([
      { match: /SELECT id, name, status/, rows: [orgRow({ status: 'purged', purged_at: new Date() })] },
    ]);
    await expect(
      requestDeletion(pool, { organizationId: ORG, requestedByUserId: ACTOR, reason: 'r' })
    ).rejects.toMatchObject({ code: 'TENANT_ALREADY_PURGED' });
  });
});

describe('cancelDeletion', () => {
  it('returns a pending_deletion organization to active and clears the evidence', async () => {
    const pool = makePool([
      { match: /SELECT id, name, status/, rows: [orgRow({ status: 'pending_deletion' })] },
      { match: /UPDATE organizations/, rows: [orgRow({ status: 'active' })] },
    ]);

    const record = await cancelDeletion(pool, { organizationId: ORG, cancelledByUserId: ACTOR });

    expect(record.status).toBe('active');
    const update = pool.statements.find((s: any) => /UPDATE organizations/.test(s.text));
    expect(update.text).toContain('purge_eligible_at     = NULL');
  });

  it('refuses when the organization is not scheduled for deletion', async () => {
    const pool = makePool([{ match: /SELECT id, name, status/, rows: [orgRow({ status: 'active' })] }]);
    await expect(
      cancelDeletion(pool, { organizationId: ORG, cancelledByUserId: ACTOR })
    ).rejects.toMatchObject({ code: 'TENANT_NOT_PENDING_DELETION' });
  });

  it('refuses to restore a purged organization', async () => {
    const pool = makePool([
      { match: /SELECT id, name, status/, rows: [orgRow({ status: 'purged', purged_at: new Date() })] },
    ]);
    await expect(
      cancelDeletion(pool, { organizationId: ORG, cancelledByUserId: ACTOR })
    ).rejects.toMatchObject({ code: 'TENANT_ALREADY_PURGED' });
  });
});

describe('purgeTenant — refusals', () => {
  const yesterday = new Date(Date.now() - 86_400_000);
  const tomorrow = new Date(Date.now() + 86_400_000);

  it('refuses without a final export digest', async () => {
    // The digest is the evidence that the data-return obligation was discharged.
    const pool = makePool([]);
    await expect(
      purgeTenant(pool, {
        organizationId: ORG,
        purgedByUserId: ACTOR,
        preconditions: { finalExportDigest: '   ' },
      })
    ).rejects.toMatchObject({ code: 'EXPORT_EVIDENCE_REQUIRED' });
  });

  it('refuses while the retention window is still open', async () => {
    const pool = makePool([
      {
        match: /SELECT id, name, status/,
        rows: [orgRow({ status: 'pending_deletion', purge_eligible_at: tomorrow })],
      },
    ]);
    await expect(
      purgeTenant(pool, {
        organizationId: ORG,
        purgedByUserId: ACTOR,
        preconditions: { finalExportDigest: 'abc123' },
      })
    ).rejects.toMatchObject({ code: 'RETENTION_WINDOW_OPEN' });
  });

  it('refuses to purge a tenant that was never scheduled for deletion', async () => {
    // No path from active straight to destroyed.
    const pool = makePool([{ match: /SELECT id, name, status/, rows: [orgRow({ status: 'active' })] }]);
    await expect(
      purgeTenant(pool, {
        organizationId: ORG,
        purgedByUserId: ACTOR,
        preconditions: { finalExportDigest: 'abc123' },
      })
    ).rejects.toMatchObject({ code: 'TENANT_NOT_PENDING_DELETION' });
  });

  it('permits an early purge ONLY with an explicit override reason', async () => {
    const pool = makePool([
      {
        match: /SELECT id, name, status/,
        rows: [orgRow({ status: 'pending_deletion', purge_eligible_at: tomorrow })],
      },
    ]);
    await expect(
      purgeTenant(pool, {
        organizationId: ORG,
        purgedByUserId: ACTOR,
        preconditions: {
          finalExportDigest: 'abc123',
          overrideRetentionWindowReason: 'regulator-ordered immediate destruction',
        },
        childTables: [],
      })
    ).resolves.toBeDefined();
  });

  it('purges once the window has closed', async () => {
    const pool = makePool([
      {
        match: /SELECT id, name, status/,
        rows: [orgRow({ status: 'pending_deletion', purge_eligible_at: yesterday })],
      },
    ]);
    await expect(
      purgeTenant(pool, {
        organizationId: ORG,
        purgedByUserId: ACTOR,
        preconditions: { finalExportDigest: 'abc123' },
        childTables: [],
      })
    ).resolves.toBeDefined();
  });
});

describe('purgeTenant — what it actually does', () => {
  const yesterday = new Date(Date.now() - 86_400_000);

  function pendingPool() {
    return makePool([
      {
        match: /SELECT id, name, status/,
        rows: [orgRow({ status: 'pending_deletion', purge_eligible_at: yesterday })],
      },
    ]);
  }

  it('KEEPS the organization row, in status purged, carrying the evidence', async () => {
    // Deleting the row would delete the audit trail of the deletion — precisely
    // what 21 CFR Part 11 §11.10(e) forbids.
    const pool = pendingPool();
    await purgeTenant(pool, {
      organizationId: ORG,
      purgedByUserId: ACTOR,
      preconditions: { finalExportDigest: 'sha256:abc' },
      childTables: [],
    });

    const texts = pool.statements.map((s: any) => s.text);
    expect(texts.some((t: string) => /DELETE FROM organizations/.test(t))).toBe(false);
    const update = texts.find((t: string) => /UPDATE organizations/.test(t));
    expect(update).toContain("status                 = 'purged'");
    expect(update).toContain('final_export_digest');
  });

  it('clears commercial identifiers so a purged tenant cannot be re-billed', async () => {
    const pool = pendingPool();
    await purgeTenant(pool, {
      organizationId: ORG,
      purgedByUserId: ACTOR,
      preconditions: { finalExportDigest: 'sha256:abc' },
      childTables: [],
    });
    const update = pool.statements.find((s: any) => /UPDATE organizations/.test(s.text)).text;
    expect(update).toContain('api_key                = NULL');
    expect(update).toContain('stripe_subscription_id = NULL');
  });

  it('deletes child tables inside a transaction', async () => {
    const pool = pendingPool();
    await purgeTenant(pool, {
      organizationId: ORG,
      purgedByUserId: ACTOR,
      preconditions: { finalExportDigest: 'sha256:abc' },
      childTables: ['projects', 'documents'],
    });

    const texts = pool.statements.map((s: any) => s.text);
    expect(texts).toContain('BEGIN');
    expect(texts).toContain('COMMIT');
    expect(texts.some((t: string) => /DELETE FROM projects WHERE organization_id/.test(t))).toBe(true);
    expect(texts.some((t: string) => /DELETE FROM documents WHERE organization_id/.test(t))).toBe(true);
  });

  it('rejects an unsafe table name rather than interpolating it', async () => {
    const pool = pendingPool();
    await expect(
      purgeTenant(pool, {
        organizationId: ORG,
        purgedByUserId: ACTOR,
        preconditions: { finalExportDigest: 'sha256:abc' },
        childTables: ['projects; DROP TABLE organizations'],
      })
    ).rejects.toThrow(OffboardingStateError);
  });

  it('ships a frozen child-table list that excludes the audit trail and billing', async () => {
    // The audit trail must outlive the tenant (Part 11); billing history is
    // needed for revenue recognition after the account closes.
    expect(Object.isFrozen(PURGE_CHILD_TABLES)).toBe(true);
    expect(PURGE_CHILD_TABLES).not.toContain('audit_logs');
    expect(PURGE_CHILD_TABLES).not.toContain('audit_events');
    expect(PURGE_CHILD_TABLES).not.toContain('stripe_events');
    for (const t of PURGE_CHILD_TABLES) expect(t).toMatch(/^[a-z_][a-z0-9_]*$/);
  });
});
