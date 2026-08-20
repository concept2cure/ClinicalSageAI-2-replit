/**
 * The RIM learning loop, END-TO-END against in-process PGlite.
 *
 * WHAT WENT WRONG
 * The RIM — "the proprietary layer that accumulates judgment over time" — had a
 * complete read path (three registered AnA tools, tenant-scoped, honest empty
 * states) and a DEAD write link: `interceptLearnedPattern`, the ONLY caller of
 * `recordPattern`, was itself called by NOTHING. Every signal the live
 * interceptors captured died in process RAM; the pattern store's disk
 * persistence wrote to a gitignored per-container directory that had never
 * held a single file; and `recall_rim_patterns` returned `count: 0` — honestly,
 * structurally, forever. Judgment did not accumulate. This suite pins the loop
 * closed:
 *
 *   compliance scan / user feedback
 *     → interceptLearnedPattern            (was: zero callers)
 *     → recordPattern → pattern store      (was: unreachable)
 *     → project_memory_entries row         (was: local-disk JSON, never written)
 *     → survives a process restart         (was: lost with the container)
 *     → getPatterns — what recall_rim_patterns serves (was: eternally empty)
 *
 * Why a real engine: durability IS the claim. A mocked persistence layer proves
 * a pattern was handed to a function, not that judgment survives the process
 * that learned it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let pg: PGlite;

const pgliteClient = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return {
      rows: r.rows as Array<Record<string, unknown>>,
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};

vi.mock('../../../db', () => ({
  pool: { query: (sql: string, p?: unknown[]) => pgliteClient.query(sql, p) },
  getPool: () => ({ query: (sql: string, p?: unknown[]) => pgliteClient.query(sql, p) }),
  db: {},
}));

// The volatile signal layer is not under test (and reaches its own DB paths);
// the interceptors must keep calling it, so the mocks record invocations.
const integration = vi.hoisted(() => ({
  integratePatternScan: vi.fn(),
  integrateSignal: vi.fn(),
}));
vi.mock('../rim-integration', () => ({
  integratePatternScan: integration.integratePatternScan,
  integrateSignal: integration.integrateSignal,
}));

/**
 * Every test uses its OWN org ids (seeded via seedOrg) rather than truncating
 * shared state between tests: the write path is deliberately fire-and-forget,
 * so a previous test's persist can land after a truncate and read as leakage.
 * Org-scoped isolation makes late writes harmless instead of racy.
 */
let nextOrg = 700;
async function seedOrg(): Promise<number> {
  const org = ++nextOrg;
  await pg.query(`INSERT INTO organizations (id, name) VALUES ($1, $2)`, [org, `org-${org}`]);
  return org;
}

// The FK target plus the legacy-blob table the loader can import from; the
// judgment layer's own tables come from the REAL migration file below.
const DDL = `
CREATE TABLE organizations (id integer PRIMARY KEY, name text);
CREATE TABLE project_memory_entries (
  id serial PRIMARY KEY,
  project_profile_id integer NOT NULL,
  project_id integer NOT NULL,
  organization_id integer NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  status text DEFAULT 'active',
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
`;

async function persistedRows(orgId: number) {
  const r = await pg.query<Record<string, unknown>>(
    `SELECT * FROM rim_learned_patterns WHERE organization_id = $1 ORDER BY id`,
    [orgId]
  );
  return r.rows;
}

/** Import the loop's modules FRESH — the same as a process (re)start. */
async function freshProcess() {
  vi.resetModules();
  const store = await import('../rim-pattern-store');
  const interceptors = await import('../rim-interceptors');
  return { ...store, ...interceptors };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  const migration = fs.readFileSync(
    path.join(REPO_ROOT, 'migrations/20260820b_rim_learned_patterns.sql'),
    'utf8'
  );
  await pg.exec(migration);
  await pg.exec(migration); // idempotent — a deploy re-runs the whole set
});

afterAll(async () => {
  await pg.close();
});

beforeEach(() => {
  integration.integratePatternScan.mockClear();
  integration.integrateSignal.mockClear();
});

describe('the write link is alive — observation becomes durable judgment', () => {
  it('a compliance scan with errors records aggregated deficiency patterns and persists them', async () => {
    const org = await seedOrg();
    const { interceptComplianceScan, getPatterns } = await freshProcess();

    interceptComplianceScan({
      organizationId: org,
      projectId: org * 10,
      submissionType: '510k',
      issues: [
        { type: 'error', rule: 'missing-predicate-comparison', message: 'Section 5 lacks a predicate comparison table' },
        { type: 'error', rule: 'unsupported-equivalence-claim', message: 'Equivalence asserted without bench data' },
        { type: 'warning', rule: 'style-passive-voice', message: 'Passive voice in summary' },
      ],
      scannedLength: 12000,
    });

    // Fire-and-forget: the interceptor returns before the store settles.
    await vi.waitFor(async () => {
      const patterns = await getPatterns({ orgId: org });
      expect(patterns).toHaveLength(2);
    });

    const patterns = await getPatterns({ orgId: org });
    expect(patterns.every(p => p.signalType === 'deficiency')).toBe(true);
    expect(patterns.every(p => p.domain === '510k')).toBe(true);
    expect(patterns.map(p => p.observation).sort()).toEqual([
      'Compliance rule missing-predicate-comparison violated',
      'Compliance rule unsupported-equivalence-claim violated',
    ]);
    // Warnings are not deficiencies; only the two errors learned.
    // The volatile signal layer still received every signal (1 overall + 2 per-error).
    expect(integration.integrateSignal).toHaveBeenCalledTimes(3);

    await vi.waitFor(async () => {
      expect(await persistedRows(org)).toHaveLength(1);
    });
  });

  it('the same violation seen again STRENGTHENS the pattern instead of duplicating it', async () => {
    const org = await seedOrg();
    const { interceptComplianceScan, getPatterns, CONFIDENCE_SEED, CONFIDENCE_STEP } =
      await freshProcess();

    const scan = () =>
      interceptComplianceScan({
        organizationId: org,
        projectId: org * 10,
        submissionType: '510k',
        issues: [{ type: 'error', rule: 'missing-predicate-comparison', message: 'differs per doc — must not fragment identity' }],
        scannedLength: 500,
      });

    scan();
    await vi.waitFor(async () => {
      expect(await getPatterns({ orgId: org })).toHaveLength(1);
    });
    scan();
    await vi.waitFor(async () => {
      const [p] = await getPatterns({ orgId: org });
      expect(p.occurrences).toBe(2);
    });

    const [pattern] = await getPatterns({ orgId: org });
    expect(pattern.confidence).toBe(CONFIDENCE_SEED + CONFIDENCE_STEP);
    // One AGGREGATE row per pattern, upserted — while the append-only
    // observation trail keeps one row per event.
    await vi.waitFor(async () => {
      const aggregates = await persistedRows(org);
      expect(aggregates).toHaveLength(1);
      expect(aggregates[0].occurrences).toBe(2);
      const trail = await pg.query(
        `SELECT id FROM rim_pattern_observations WHERE organization_id = $1`,
        [org]
      );
      expect(trail.rows).toHaveLength(2);
    });
  });

  it('a rejection teaches her: user feedback becomes a section-aggregated pattern', async () => {
    const org = await seedOrg();
    const { interceptFeedback, getPatterns } = await freshProcess();

    interceptFeedback({
      organizationId: org,
      projectId: org * 10,
      userId: 42,
      sectionCode: '2.7.3',
      feedbackType: 'rejected',
    });
    // Accepted output is validation, not a gap — it must NOT mint a pattern.
    interceptFeedback({
      organizationId: org,
      projectId: org * 10,
      userId: 42,
      sectionCode: '2.7.3',
      feedbackType: 'accepted',
    });

    await vi.waitFor(async () => {
      const patterns = await getPatterns({ orgId: org });
      expect(patterns).toHaveLength(1);
    });
    const [pattern] = await getPatterns({ orgId: org });
    expect(pattern.signalType).toBe('rejection');
    expect(pattern.domain).toBe('authoring_feedback');
    expect(pattern.observation).toBe('AnA output rejected in section 2.7.3');
  });
});

describe('judgment accumulates — it survives the process that learned it', () => {
  it('a fresh process serves the previous process’s patterns on its FIRST read', async () => {
    const org = await seedOrg();
    const first = await freshProcess();
    first.interceptComplianceScan({
      organizationId: org,
      projectId: org * 10,
      submissionType: 'ectd',
      issues: [{ type: 'error', rule: 'broken-leaf-reference', message: 'x' }],
      scannedLength: 100,
    });
    await vi.waitFor(async () => {
      expect(await persistedRows(org)).toHaveLength(1);
    });

    // Container restart: new module graph, empty in-memory map, same database.
    const second = await freshProcess();
    const recalled = await second.getPatterns({ orgId: org });
    expect(recalled).toHaveLength(1);
    expect(recalled[0].observation).toBe('Compliance rule broken-leaf-reference violated');

    // And learning CONTINUES across the restart: the same violation seen by the
    // new process increments the pattern the old process learned.
    second.interceptComplianceScan({
      organizationId: org,
      projectId: org * 10,
      submissionType: 'ectd',
      issues: [{ type: 'error', rule: 'broken-leaf-reference', message: 'y' }],
      scannedLength: 100,
    });
    await vi.waitFor(async () => {
      const [p] = await second.getPatterns({ orgId: org });
      expect(p.occurrences).toBe(2);
    });
  });

  it('tenant isolation holds through persistence and back', async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const first = await freshProcess();
    first.interceptComplianceScan({
      organizationId: orgA, projectId: orgA * 10, submissionType: 'csr',
      issues: [{ type: 'error', rule: 'org-a-rule', message: 'a' }], scannedLength: 10,
    });
    first.interceptComplianceScan({
      organizationId: orgB, projectId: orgB * 10, submissionType: 'csr',
      issues: [{ type: 'error', rule: 'org-b-rule', message: 'b' }], scannedLength: 10,
    });
    await vi.waitFor(async () => {
      expect(await persistedRows(orgA)).toHaveLength(1);
      expect(await persistedRows(orgB)).toHaveLength(1);
    });

    const second = await freshProcess();
    const a = await second.getPatterns({ orgId: orgA });
    const b = await second.getPatterns({ orgId: orgB });
    expect(a.map(p => p.observation)).toEqual(['Compliance rule org-a-rule violated']);
    expect(b.map(p => p.observation)).toEqual(['Compliance rule org-b-rule violated']);
  });
});
