/**
 * The in-process schedulers, run the way production runs them: as the
 * non-superuser runtime role, RLS_ENFORCE=on, more than one copy at once.
 *
 * ── What was wrong (W2 audit, 2026-09-24; launch row D1) ────────────────────
 * Production runs three copies of the server process and starts every
 * scheduler on each. No Redis. Four jobs were broken by that shape:
 *
 *  1. AnA memory consolidation (server/services/memory-consolidation-job.ts)
 *     reached the database through withTenantConnection, which checked out its
 *     pooled client BEFORE entering its own tenant scope. The job has no
 *     ambient scope, so the instrumented pool refused the checkout — every run,
 *     in production. And at 02:00 all three processes would run it at once and
 *     write each conversation summary three times.
 *  2. The digest heartbeat (server/services/digest/digest-heartbeat.ts) — the
 *     only digest trigger without Redis — ran each org's digest with NO tenant
 *     scope, so no proactive digest was ever created; its once-per-day guard is
 *     check-then-insert, so overlapping ticks could deliver duplicates; and a
 *     tick in which orgs failed reported ok:true.
 *  3. The schedule-of-events sweep (server/jobs/scheduleOfEventsSweep.ts) ran
 *     on every process: health-review revisions tripled every 6 h, and
 *     recovery tasks / slip alerts duplicated when sweeps overlapped.
 *  4. The citation-run pruner (server/services/ana/citation-run-pruner.ts)
 *     issued an unscoped pool.query, so it never pruned, while its status said
 *     it was running.
 *
 * Every test here drives an entry point that existed before the fix (the cron
 * callback, the heartbeat/pruner timers, runConsolidation,
 * runScheduleOfEventsSweep), so each one fails against the old code for the
 * defect it names, not for a missing export.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, sleep, waitFor, type SchedulerDb } from './scheduler-harness';

const hoisted = vi.hoisted(() => ({
  cronCallbacks: [] as Array<() => unknown>,
  digestImpl: null as null | ((orgId: number) => Promise<unknown>),
  reviewImpl: null as null | ((p: { orgId: number; projectId: number }) => Promise<unknown>),
  embedDelayMs: 0,
}));

// node-cron is replaced by a recorder so the test can fire "02:00" itself — on
// demand, and twice at once, the way three processes' crons fire.
vi.mock('node-cron', () => ({
  default: {
    validate: () => true,
    schedule: (_expr: string, cb: () => unknown) => {
      hoisted.cronCallbacks.push(cb);
      return { stop() {} };
    },
  },
}));

// No embedding provider in CI. The job stores what the service returns.
// The embed call sits between the acceptance gate and the insert — a real
// provider round-trip — so a delay here is what lets two concurrent cycles both
// pass the gate before either writes.
vi.mock('../../server/services/enhancedEmbeddingService', () => ({
  getEmbeddingService: () => ({
    embed: async () => {
      if (hoisted.embedDelayMs > 0) await new Promise(r => setTimeout(r, hoisted.embedDelayMs));
      return { embedding: [0.25, 0.5, 0.75] };
    },
  }),
}));

// The digest's content is run-proactive-digest.test.ts's subject. Here it is a
// stand-in that WRITES through the runtime pool, so it succeeds only if the
// heartbeat gave it the org's tenant scope — which is the defect.
vi.mock('../../server/services/digest/proactive-digest', () => ({
  PROACTIVE_DIGEST_CATEGORY: 'proactive_digest',
  runProactiveDigest: (orgId: number) => hoisted.digestImpl!(orgId),
}));

// listActiveSchedulePlans stays REAL (it must pass the fail-closed pool under
// the sweep's system scope). reviewScheduleHealth becomes a slow recorder: its
// writes — tasks, alerts, the health_review revision — happen once per call,
// so the number of calls IS the number of duplicate side effects.
vi.mock('../../server/services/projects/schedule-of-events', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reviewScheduleHealth: (p: { orgId: number; projectId: number }) => hoisted.reviewImpl!(p),
}));

type Runtime = typeof import('../../server/db/runtime');
type Store = typeof import('../../server/db/tenantStore');

const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text, status text DEFAULT 'active');
CREATE TABLE concept2cure_conversations (id serial PRIMARY KEY, project_id integer, thread_id text);
CREATE TABLE project_intelligence_profiles (
  id serial PRIMARY KEY, project_id integer NOT NULL, organization_id integer NOT NULL
);
CREATE TABLE project_memory_entries (
  id serial PRIMARY KEY,
  project_profile_id integer NOT NULL,
  project_id integer NOT NULL,
  organization_id integer NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  confidence_score real DEFAULT 0.8,
  importance_level text DEFAULT 'medium',
  embedding text,
  status text DEFAULT 'active',
  extracted_by text DEFAULT 'ai',
  created_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE conversation_working_memory (
  id serial PRIMARY KEY,
  conversation_id integer,
  thread_id text,
  project_id integer,
  organization_id integer NOT NULL,
  summary text NOT NULL,
  structured_data json,
  message_count_at_generation integer NOT NULL DEFAULT 1,
  generated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE mdx_notifications (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE project_schedule_of_events (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL,
  project_id integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_reviewed_by_ana_at timestamp,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE ana_artifact_citation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id text NOT NULL,
  organization_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE concept2cure_artifacts (
  id serial PRIMARY KEY, organization_id integer NOT NULL, citation_run_id uuid
);
`;

const RLS_TABLES = [
  'project_intelligence_profiles',
  'project_memory_entries',
  'conversation_working_memory',
  'mdx_notifications',
  'project_schedule_of_events',
  'ana_artifact_citation_runs',
  'concept2cure_artifacts',
];

let env: SchedulerDb;
let runtime: Runtime;
let store: Store;

beforeAll(async () => {
  env = await setupSchedulerDb(databaseUrl, 'dbsched', DDL, RLS_TABLES);
  runtime = await import('../../server/db/runtime');
  store = await import('../../server/db/tenantStore');
}, 120_000);

afterAll(async () => {
  vi.useRealTimers();
  if (runtime) await runtime.getPool().end().catch(() => undefined);
  if (env) await env.destroy();
});

/** Run `fn` with NODE_ENV≠test so a scheduler's own test-environment guard lets it start. */
async function withSchedulersEnabled<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    return await fn();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AnA memory consolidation
// ─────────────────────────────────────────────────────────────────────────────

const STRUCTURED = JSON.stringify({
  objective: 'Assemble the stability narrative for the Module 3 filing',
  lockedFacts: ['Batch 7 long-term data runs through month 18'],
  decisions: ['Use the 25C/60RH arm as the primary claim basis'],
  openQuestions: [],
  nextActions: [],
  createdArtifacts: [],
});

describe('AnA memory consolidation', () => {
  const ORG = 41;
  const PROJECT = 410;
  let consolidation: typeof import('../../server/services/memory-consolidation-job');

  beforeAll(async () => {
    consolidation = await import('../../server/services/memory-consolidation-job');
  });

  beforeEach(async () => {
    await env.owner.query(`TRUNCATE ${env.t('conversation_working_memory')}, ${env.t('project_memory_entries')},
      ${env.t('project_intelligence_profiles')} RESTART IDENTITY`);
    await env.owner.query(
      `INSERT INTO ${env.t('project_intelligence_profiles')} (project_id, organization_id) VALUES ($1, $2)`,
      [PROJECT, ORG],
    );
    await env.owner.query(
      `INSERT INTO ${env.t('conversation_working_memory')}
         (thread_id, project_id, organization_id, summary, structured_data, generated_at)
       VALUES ('thread_live_ui', $1, $2, 'Fallback summary long enough to clear the minimum atom length.',
               $3, now() - interval '8 days')`,
      [PROJECT, ORG, STRUCTURED],
    );
  });

  async function summaries(): Promise<Array<{ title: string; organization_id: number }>> {
    const { rows } = await env.owner.query(
      `SELECT title, organization_id FROM ${env.t('project_memory_entries')}
        WHERE category = 'conversation_summary' ORDER BY id`,
    );
    return rows;
  }

  it('runs with no ambient tenant scope under RLS_ENFORCE=on and consolidates the stale memory', async () => {
    expect(store.getTenantScope()).toBeUndefined();

    const result = await consolidation.runConsolidation();

    expect(result.errors, 'the cycle must not fail closed at checkout').toBe(0);
    expect(result.memoriesConsolidated).toBe(1);
    const rows = await summaries();
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(ORG);
  });

  it('two cycles at once (three processes at 02:00) write the summary ONCE — idempotent write', async () => {
    // Both cycles select the row and pass the acceptance gate before either
    // inserts (the embed round-trip is between them). Only the write guard can
    // stop the second insert here — the lease is deliberately not involved.
    hoisted.embedDelayMs = 150;
    try {
      const [a, b] = await Promise.all([consolidation.runConsolidation(), consolidation.runConsolidation()]);
      expect(a.threadsProcessed + b.threadsProcessed, 'both cycles really raced for the row').toBe(2);
    } finally {
      hoisted.embedDelayMs = 0;
    }
    expect(await summaries()).toHaveLength(1);
  });

  it('row 1 is not mistaken for consolidated because row 12 of the same project is', async () => {
    // Found while fixing the write guard: the old skip test was
    // `title LIKE '%cwm_' || id || '%'`, and '%cwm_1%' matches '[cwm_12]'.
    await env.owner.query(
      `INSERT INTO ${env.t('project_memory_entries')}
         (project_profile_id, project_id, organization_id, category, title, content)
       VALUES (1, $1, $2, 'conversation_summary', 'Conversation summary 2026-09-01 [cwm_12]',
               'An unrelated earlier conversation about the device labeling plan.')`,
      [PROJECT, ORG],
    );

    const result = await consolidation.runConsolidation();

    expect(result.memoriesConsolidated).toBe(1);
    expect((await summaries()).map(r => r.title).filter(t => t.includes('[cwm_1]'))).toHaveLength(1);
  });

  it('the nightly cron fired on two processes at once runs ONE cycle (lease)', async () => {
    consolidation.initMemoryConsolidationScheduler();
    const nightly = hoisted.cronCallbacks.at(-1);
    expect(nightly, 'the scheduler registered a nightly callback').toBeTypeOf('function');

    const outcomes = (await Promise.all([nightly!(), nightly!()])) as Array<{ ran?: boolean } | undefined>;

    expect(outcomes.filter(o => o?.ran === true)).toHaveLength(1);
    expect(outcomes.filter(o => o?.ran === false)).toHaveLength(1);
    expect(await summaries()).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Proactive-digest heartbeat
// ─────────────────────────────────────────────────────────────────────────────

describe('proactive-digest heartbeat (the only digest trigger without Redis)', () => {
  /** Tuesday 09:30 UTC — inside the weekday 07:00 window. */
  const IN_WINDOW = new Date('2026-08-18T09:30:00.000Z');
  let heartbeat: typeof import('../../server/services/digest/digest-heartbeat');
  let metrics: typeof import('../../server/services/background-jobs-metrics');
  const scopesSeen: Array<string | undefined> = [];
  let calls: number[] = [];

  beforeAll(async () => {
    heartbeat = await import('../../server/services/digest/digest-heartbeat');
    metrics = await import('../../server/services/background-jobs-metrics');
  });

  beforeEach(async () => {
    heartbeat.stopDigestHeartbeat();
    heartbeat.__resetDigestHeartbeatStateForTests();
    metrics.resetBackgroundJobsMetrics();
    scopesSeen.length = 0;
    calls = [];
    await env.owner.query(`TRUNCATE ${env.t('organizations')}, ${env.t('mdx_notifications')} RESTART IDENTITY`);
    await env.owner.query(`INSERT INTO ${env.t('organizations')} (name) VALUES ('a'), ('b')`);
    // A real digest takes a while (radar, blockers, contradictions). Slow
    // enough that interval ticks overlap, the way three processes' ticks do.
    hoisted.digestImpl = async (orgId: number) => {
      calls.push(orgId);
      scopesSeen.push(store.getTenantScope()?.tenantId);
      await sleep(250);
      await runtime.pool!.query(
        `INSERT INTO mdx_notifications (organization_id, category, severity, title, created_at)
         VALUES ($1, 'proactive_digest', 'warning', 'Regulatory attention needed', $2)`,
        [orgId, new Date()],
      );
      return { created: true, notificationId: 1 };
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(IN_WINDOW);
    process.env.ANA_DIGEST_HEARTBEAT_INTERVAL_MS = '60';
  });

  async function runHeartbeatFor(ms: number): Promise<void> {
    await withSchedulersEnabled(async () => {
      expect(heartbeat.startDigestHeartbeat()).toBe(true);
    });
    await sleep(ms);
    heartbeat.stopDigestHeartbeat();
    await sleep(400); // let an in-flight tick finish
    vi.useRealTimers();
    delete process.env.ANA_DIGEST_HEARTBEAT_INTERVAL_MS;
  }

  async function digestsPerOrg(): Promise<Record<number, number>> {
    const { rows } = await env.owner.query(
      `SELECT organization_id, count(*)::int AS n FROM ${env.t('mdx_notifications')} GROUP BY 1`,
    );
    return Object.fromEntries(rows.map((r: { organization_id: number; n: number }) => [r.organization_id, r.n]));
  }

  it('each org\'s digest runs in THAT org\'s tenant scope, and is delivered exactly once despite overlapping ticks', async () => {
    await runHeartbeatFor(1200);

    expect(scopesSeen.every(s => s !== undefined), 'digest ran with no tenant scope').toBe(true);
    expect([...new Set(scopesSeen)].sort()).toEqual(['1', '2']);
    expect(await digestsPerOrg()).toEqual({ 1: 1, 2: 1 });
    expect(calls.sort()).toEqual([1, 2]);
  });

  it('a tick in which an org failed is reported as a failed run, not ok:true', async () => {
    const deliver = hoisted.digestImpl!;
    hoisted.digestImpl = async (orgId: number) => {
      if (orgId === 2) throw new Error('org 2 exploded');
      return deliver(orgId);
    };

    await runHeartbeatFor(500);

    const hb = metrics.getBackgroundJobHeartbeats().find(h => h.name === 'proactive-digest-heartbeat');
    expect(hb, 'the heartbeat recorded its ticks').toBeDefined();
    // Counted, not read from lastError: a later tick that found the lease held
    // records ok and clears it, which is correct for that tick.
    expect(hb!.failures, 'a tick with a failed org must count as a failed run').toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Schedule-of-events sweep
// ─────────────────────────────────────────────────────────────────────────────

describe('schedule-of-events sweep', () => {
  let sweep: typeof import('../../server/jobs/scheduleOfEventsSweep');
  let reviewed: Array<{ orgId: number; projectId: number }> = [];

  beforeAll(async () => {
    sweep = await import('../../server/jobs/scheduleOfEventsSweep');
  });

  beforeEach(async () => {
    reviewed = [];
    await env.owner.query(`TRUNCATE ${env.t('project_schedule_of_events')} RESTART IDENTITY`);
    await env.owner.query(
      `INSERT INTO ${env.t('project_schedule_of_events')} (organization_id, project_id) VALUES (51, 510), (52, 520)`,
    );
    hoisted.reviewImpl = async p => {
      reviewed.push({ orgId: p.orgId, projectId: p.projectId });
      await sleep(200);
      return { ok: true, tasksCreated: 1, alertsCreated: 1 };
    };
  });

  it('CONTROL: the plan listing works under the sweep scope (the sweep is not vacuously empty)', async () => {
    const summary = await sweep.runScheduleOfEventsSweep();
    expect(summary.schedules).toBe(2);
  });

  it('two sweeps at once (two processes) review each schedule ONCE', async () => {
    await Promise.all([sweep.runScheduleOfEventsSweep(), sweep.runScheduleOfEventsSweep()]);
    expect(reviewed.map(r => r.projectId).sort()).toEqual([510, 520]);
  });

  it('a later sweep inside the interval (another process\'s timer) records no second review', async () => {
    await sweep.runScheduleOfEventsSweep();
    const second = await sweep.runScheduleOfEventsSweep();

    expect(reviewed).toHaveLength(2);
    expect(second.reviewed).toBe(0);
  });

  it('a schedule whose last review is older than the interval IS reviewed again', async () => {
    await env.owner.query(
      `UPDATE ${env.t('project_schedule_of_events')} SET last_reviewed_by_ana_at = now() - interval '7 hours'`,
    );
    const summary = await sweep.runScheduleOfEventsSweep();
    expect(summary.reviewed).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Citation-run pruner
// ─────────────────────────────────────────────────────────────────────────────

describe('citation-run pruner', () => {
  async function seedRuns(org: number, artifact: string, count: number): Promise<void> {
    const { rows } = await env.owner.query(
      `INSERT INTO ${env.t('ana_artifact_citation_runs')} (artifact_id, organization_id, created_at)
       SELECT $1, $2, now() - (g || ' minutes')::interval FROM generate_series(1, $3) g
       RETURNING id, created_at`,
      [artifact, org, count],
    );
    // The artifact still points at its OLDEST run — that one must survive.
    const oldest = rows.sort((a: any, b: any) => a.created_at - b.created_at)[0];
    await env.owner.query(
      `INSERT INTO ${env.t('concept2cure_artifacts')} (organization_id, citation_run_id) VALUES ($1, $2)`,
      [org, oldest.id],
    );
  }

  it('the scheduled prune actually deletes across tenants, and its status says so', async () => {
    await seedRuns(61, 'artifact-a', 12); // keep 10 + active → 1 pruned
    await seedRuns(62, 'artifact-b', 11); // keep 10, the 11th is active → 0 pruned
    await seedRuns(63, 'artifact-c', 13); // keep 10 + active → 2 pruned

    process.env.ANA_CITATION_RUN_PRUNE_INTERVAL_MS = '80';
    const pruner = await import('../../server/services/ana/citation-run-pruner');
    await withSchedulersEnabled(async () => {
      expect(pruner.startCitationRunPruneScheduler()).toBe(true);
    });
    await waitFor(() => pruner.getCitationRunPruneStatus().lastTick !== null, 3000);
    pruner.stopCitationRunPruneScheduler();
    delete process.env.ANA_CITATION_RUN_PRUNE_INTERVAL_MS;

    const { rows } = await env.owner.query(
      `SELECT organization_id, count(*)::int AS n FROM ${env.t('ana_artifact_citation_runs')} GROUP BY 1 ORDER BY 1`,
    );
    expect(rows).toEqual([
      { organization_id: 61, n: 11 },
      { organization_id: 62, n: 11 },
      { organization_id: 63, n: 11 },
    ]);
    const status = pruner.getCitationRunPruneStatus() as ReturnType<typeof pruner.getCitationRunPruneStatus> & {
      lastFailure?: unknown;
    };
    expect(status.lastTick?.result.prunedRunCount).toBe(3);
    expect(status.lastFailure ?? null).toBeNull();
  });
});
