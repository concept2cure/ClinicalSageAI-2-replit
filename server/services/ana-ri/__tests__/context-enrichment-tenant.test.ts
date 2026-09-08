/**
 * AnA context enrichment — no organization, no memory.
 *
 * Four reads of `project_memory_entries` carried
 * `($2::int IS NULL OR organization_id = $2)` — a tenant guard the caller
 * could switch off, described in the code as preserving "prior behavior
 * exactly" for "legacy paths without org context". What it preserved was a
 * read across every tenant, and what these functions return goes into a
 * MODEL'S PROMPT: another sponsor's notes and decisions would have been
 * summarised back to the user as their own context.
 *
 * `enrichWithClientJourney` and `enrichWithAgentActivity` in the same file
 * already returned '' without an org. These now agree with them: contributing
 * nothing is a smaller loss than contributing someone else's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolQuery = vi.fn();
// Both shapes: the module-scope reads use the exported `pool`, while
// enrichWithCMC dynamically imports `getPool`. A mock providing only `pool`
// makes the CMC block throw into its own bare catch and record zero reads —
// which reads as "no leak" when nothing ran at all.
vi.mock('../../../db', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }),
}));
vi.mock('../../../db.js', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }),
}));

import { enrichContextForChat } from '../context-enrichment';

beforeEach(() => {
  poolQuery.mockReset();
  poolQuery.mockResolvedValue({ rows: [] });
});

describe('project-memory enrichment is tenant-scoped', () => {
  it('issues no project_memory_entries read at all without an organization', async () => {
    /* `/claims` dispatches enrichWithClaims, which reads
       project_memory_entries — a deterministic way in, rather than hoping a
       natural-language trigger fires. */
    await enrichContextForChat({ message: '/claims', projectId: 42, organizationId: undefined });

    const memoryReads = poolQuery.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((sql) => sql.includes('project_memory_entries'));

    expect(memoryReads).toHaveLength(0);
  });

  it('scopes every project-memory read to the caller organization', async () => {
    await enrichContextForChat({ message: '/claims', projectId: 42, organizationId: 7 });

    const memoryReads = poolQuery.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('project_memory_entries'),
    );

    expect(memoryReads.length).toBeGreaterThan(0);
    for (const call of memoryReads) {
      const sql = String(call[0]);
      expect(sql).toContain('organization_id = $2');
      // The escape that made the guard optional.
      expect(sql).not.toMatch(/IS NULL OR/);
      expect((call[1] as unknown[])[1]).toBe(7);
    }
  });
});

/**
 * The same rule, applied to the reads the tenant guard never reached.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `enrichWithCMC` issued four reads that the project_memory_entries fix above
 * did not touch. Two (cmc_module3_sections stale rows, cmc_source_objects
 * counts) were never org-scoped at all. The other two applied scope only when
 * `organizationId` happened to be truthy, behind a comment calling the
 * unscoped path "the pre-existing behaviour, not a widening" — which is the
 * same reasoning this file's header already rejected.
 *
 * cmc_projects.id is a uuid space shared across every tenant and the project id
 * arrives from the request body, so a caller naming another sponsor's project
 * received that sponsor's Module 3 approval state, stale-section reasons,
 * canonical source counts and open contradictions — rendered into the model's
 * prompt and paraphrased back as their own. The canonical reader of exactly
 * this data (services/cmc/final-export-gate.ts) is unconditionally org-scoped;
 * this copy, which feeds the model, was not.
 *
 * All three tables carry `organization_id INTEGER NOT NULL`
 * (db/migrations/20260401_cmc_convergence_os.sql).
 */
const CMC_TABLES = ['cmc_module3_sections', 'cmc_source_objects', 'cmc_contradictions'];
const cmcReads = () =>
  poolQuery.mock.calls.filter((c: unknown[]) =>
    CMC_TABLES.some((t) => String(c[0]).includes(t)),
  );

describe('CMC build-state enrichment is tenant-scoped', () => {
  it('issues no CMC read at all without an organization', async () => {
    await enrichContextForChat({ message: '/cmc', projectId: 42, organizationId: undefined });
    // Fail closed. A token with no org claim genuinely reaches this code, so
    // "the caller always has one" is not a guard.
    expect(cmcReads().map((c: unknown[]) => String(c[0]))).toHaveLength(0);
  });

  it('scopes every CMC read to the caller organization', async () => {
    await enrichContextForChat({ message: '/cmc', projectId: 42, organizationId: 7 });

    const reads = cmcReads();
    expect(reads.length, 'the CMC path issued no reads, so this proves nothing').toBeGreaterThan(0);
    for (const call of reads) {
      const sql = String(call[0]);
      expect(sql, `unscoped CMC read: ${sql.replace(/\s+/g, ' ').trim()}`).toMatch(/organization_id\s*=\s*\$/);
      expect(call[1] as unknown[]).toContain(7);
    }
  });
});

/**
 * `enrichWithDomainMemory` passed FIVE arguments to `readProjectMemory`, whose
 * sixth parameter is `orgId`. So orgId was always `undefined`, the guard added
 * above ("no organization, no memory") always fired, and every domain-memory
 * block silently degraded to its "No {domain} data found for this project yet"
 * placeholder — on /safety, /csr, /device, /ectd, /cms, /diagnostics and the
 * memory half of /cmc.
 *
 * The guard is right; this caller was simply never updated to feed it. The
 * effect is the inverse of a leak and just as damaging on a safety surface: the
 * model is told a project has no recorded safety history when it has one.
 */
describe('domain memory reaches the model when the caller has an organization', () => {
  it('reads project_memory_entries for a domain block, scoped to the org', async () => {
    await enrichContextForChat({ message: '/safety', projectId: 42, organizationId: 7 });

    const memoryReads = poolQuery.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('project_memory_entries'),
    );
    expect(
      memoryReads.length,
      'domain memory never read the table — readProjectMemory short-circuited on a missing orgId',
    ).toBeGreaterThan(0);
    for (const call of memoryReads) {
      expect(String(call[0])).toContain('organization_id = $2');
      expect((call[1] as unknown[])[1]).toBe(7);
    }
  });

  it('still reads nothing when the caller has no organization', async () => {
    await enrichContextForChat({ message: '/safety', projectId: 42, organizationId: undefined });
    const memoryReads = poolQuery.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('project_memory_entries'),
    );
    expect(memoryReads).toHaveLength(0);
  });
});
