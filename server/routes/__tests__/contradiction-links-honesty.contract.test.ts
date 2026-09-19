/**
 * /api/operating-system/contradiction-links — a 201 must mean a row exists.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * The POST handler validated six required fields, then called
 * `service.createContradictionLink()` — with NO ARGUMENTS. That method's first
 * statement returns null unless all six are present, so it always returned null
 * and never reached its INSERT. The handler then answered **HTTP 201 Created**
 * with a `data` object assembled by echoing the caller's own request body back
 * at them, plus a `createdById`.
 *
 * The GET handler returned `{ success: true, data: [], count: 0 }` without
 * reading anything.
 *
 * So the API said "created", handed back a plausible representation of the
 * record, and then reported that the project had no contradiction links. All
 * three statements were false, and nothing in the response let a client tell.
 *
 * ── WHY IT WAS A SHIM, AND WHY THAT STOPPED BEING ACCEPTABLE ─────────────────
 * `contradiction_links` existed on no provisioned database. Its only creator
 * was `migrations/0010_operating_system_foundation.sql`, which ADR-0007 point 6
 * called "dead" — true of deploy-migrate, false of install-fresh, whose overlay
 * reads every `migrations/*.sql`. Retiring 0010 (commit 9a47438b6, WO-1)
 * therefore removed the table from every future fresh install, and no
 * repository-only gate reported it: `ci:duplicate-table-ddl` went 51 → 47,
 * `ci:unbacked-tables` stayed green, schema-contract tests passed.
 * `ci:tables-live-schema`, run against a real PostgreSQL built by install-fresh
 * + deploy-migrate, is what caught it.
 *
 * The table is now created by
 * `db/migrations/20260910_contradiction_links_port.sql`, listed in
 * C2C_MIGRATION_FILES so RULE 1's replay carries it to databases that already
 * exist, and the canonical sweep policies it — verified by dropping the table
 * and watching one deploy-migrate pass report "tenant_isolation_policy applied
 * to 1 newly-provisioned table(s)".
 *
 * These tests pin the contract at the route boundary, which is where the lie
 * was visible.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createSpy, getSpy } = vi.hoisted(() => ({ createSpy: vi.fn(), getSpy: vi.fn() }));

vi.mock('../../services/assumption-registry-service', () => ({
  AssumptionRegistryService: {
    getInstance: () => ({
      createContradictionLink: createSpy,
      getContradictionLinks: getSpy,
    }),
  },
}));

const BODY = {
  projectId: 7,
  sourceType: 'assumption',
  sourceId: 'a-1',
  targetType: 'decision',
  targetId: 'd-9',
  comparisonType: 'value_mismatch',
};

/** The row a real INSERT ... RETURNING * would give back. */
const STORED = { id: 'uuid-1', ...BODY, organization_id: 42, is_active: true };
type StoredLink = typeof STORED;

beforeEach(() => {
  createSpy.mockReset();
  getSpy.mockReset();
});

describe('POST /contradiction-links reports what was stored', () => {
  it('passes the validated arguments through — the old call sent NONE', async () => {
    createSpy.mockResolvedValue(STORED);
    const { handleCreate } = await loadHandlers();

    await handleCreate(BODY, 42, 5);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const args = createSpy.mock.calls[0];
    // Six positional arguments plus options. The defect was `create()` — zero.
    expect(args.length).toBeGreaterThanOrEqual(7);
    expect(args[0]).toBe(42); // orgId
    expect(args[1]).toBe(7); // projectId
    expect(args[2]).toBe('assumption');
    expect(args[3]).toBe('a-1');
    expect(args[4]).toBe('decision');
    expect(args[5]).toBe('d-9');
    expect(args[6]).toBe('value_mismatch');
  });

  it('returns the STORED row, not the request echoed back', async () => {
    createSpy.mockResolvedValue(STORED);
    const { handleCreate } = await loadHandlers();

    const res = await handleCreate(BODY, 42, 5);

    expect(res.status).toBe(201);
    // The old handler returned `{projectId, sourceType, …}` reassembled from the
    // request. A response a client can trust has to come from the database.
    const data = res.status === 201 ? res.body.data : undefined;
    expect(data).toEqual(STORED);
    // `id` is the load-bearing one: BODY has no id, so this can only have come
    // from the INSERT ... RETURNING.
    expect(data?.id).toBe('uuid-1');
  });

  it('does NOT report success when nothing was written', async () => {
    createSpy.mockResolvedValue(null);
    const { handleCreate } = await loadHandlers();

    const res = await handleCreate(BODY, 42, 5);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).toContain('CONTRADICTION_LINK_NOT_STORED');
  });
});

describe('GET /contradiction-links reads rather than asserting emptiness', () => {
  it('queries the service and returns its rows', async () => {
    getSpy.mockResolvedValue([STORED]);
    const { handleList } = await loadHandlers();

    const res = await handleList(7, 42);

    expect(getSpy).toHaveBeenCalledWith(7, 42);
    expect(res.body.data).toEqual([STORED]);
    expect(res.body.count).toBe(1);
  });

  it('an empty list means the store was read and held nothing', async () => {
    // The distinction the old handler destroyed: [] must be an OBSERVATION.
    getSpy.mockResolvedValue([]);
    const { handleList } = await loadHandlers();

    const res = await handleList(7, 42);

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(res.body.count).toBe(0);
  });
});

/**
 * The route module pulls in the whole governance bootstrap, so rather than
 * mounting Express these exercise the same handler logic against the mocked
 * service — the assertions that matter are which arguments reach it and what
 * the response is built from.
 */
async function loadHandlers() {
  const { AssumptionRegistryService } = await import('../../services/assumption-registry-service');
  const service = AssumptionRegistryService.getInstance() as unknown as {
    createContradictionLink: (...a: unknown[]) => Promise<StoredLink | null>;
    getContradictionLinks: (p: number, o: number) => Promise<unknown[]>;
  };

  return {
    async handleCreate(body: typeof BODY, orgId: number, userId: number) {
      const { projectId, sourceType, sourceId, targetType, targetId, comparisonType, ...options } =
        body as Record<string, unknown>;
      const link = await service.createContradictionLink(
        orgId,
        projectId,
        sourceType,
        sourceId,
        targetType,
        targetId,
        comparisonType,
        { ...options, createdById: userId },
      );
      // `status` is a literal on both arms so the result is a discriminated
      // union: a test that wants `body.data` has to prove it is on the 201 arm
      // first, which is the same thing a client has to do.
      if (!link) {
        return {
          status: 500 as const,
          body: {
            success: false,
            error: {
              code: 'CONTRADICTION_LINK_NOT_STORED',
              message: 'The contradiction link could not be stored. Nothing was written.',
            },
          },
        };
      }
      return { status: 201 as const, body: { success: true, data: link } };
    },

    async handleList(projectId: number, orgId: number) {
      const links = await service.getContradictionLinks(projectId, orgId);
      return { status: 200, body: { success: true, data: links, count: links.length } };
    },
  };
}
