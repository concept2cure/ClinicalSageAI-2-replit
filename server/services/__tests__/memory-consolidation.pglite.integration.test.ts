/**
 * Conversations become durable memory — END-TO-END against in-process PGlite.
 *
 * WHAT WENT WRONG
 * memory-consolidation-job.ts was the ONLY path by which anything AnA learned
 * in conversation could become durable, cross-thread memory — and its SELECT
 * was `JOIN concept2cure_conversations ON cwm.conversation_id = cc.id`, an
 * INNER JOIN, while the live AnA chat path (ana-ri/stream → post-processing →
 * storeWorkingMemoryForThread) writes every row with conversation_id NULL.
 * 100% of the rows the real UI produced were structurally invisible to
 * promotion: they aged past the 7-day staleness threshold and were never
 * consolidated. AnA's durable memory was a document index; her memory of
 * talking to you had a hard 7-day expiry.
 *
 * Two more dead ends in the same pipeline, fixed and pinned here:
 *   - promoted entries were inserted WITHOUT an embedding, and semantic recall
 *     filters `embedding IS NOT NULL` — whatever did get promoted was durable
 *     but invisible to similarity search, forever;
 *   - the memory-acceptance gate (provenance, confidence, dedupe,
 *     contradiction — built, tested, exported) had zero production callers, so
 *     promotion would have been "write everything".
 *
 * Why a real engine: the defect IS the SQL. A mocked pool returns whatever the
 * test hands it and would happily "prove" a join that excludes every live row.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pg: PGlite;

const adaptResult = (r: { rows: unknown[]; affectedRows?: number }) => ({
  rows: r.rows as Array<Record<string, unknown>>,
  rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
});

const pgliteClient = {
  query: async (sql: string, params?: unknown[]) => adaptResult(await pg.query(sql, params as unknown[])),
};

// The job resolves its clients through withTenantConnection (super-admin scan +
// per-org insert scope). RLS posture has its own tests; here both scopes run
// against the same PGlite so the SQL itself is what is under test.
vi.mock('../../db/withTenantConnection', () => ({
  withTenantConnection: async (_opts: unknown, fn: (c: unknown) => unknown) => fn(pgliteClient),
}));

// Deterministic embedding: promotion must WRITE one (recall filters
// `embedding IS NOT NULL`), and what it writes must be the literal of what the
// service returned.
vi.mock('../enhancedEmbeddingService', () => ({
  getEmbeddingService: () => ({
    embed: async () => ({ embedding: [0.25, 0.5, 0.75] }),
  }),
}));

// The job's module-level `pool` import (used only to hand the embedding service
// a pool we just mocked away) must not open a real connection.
vi.mock('../../db', () => ({
  pool: { query: (sql: string, p?: unknown[]) => pgliteClient.query(sql, p) },
  getPool: () => ({ query: (sql: string, p?: unknown[]) => pgliteClient.query(sql, p) }),
  db: {},
}));

import { runConsolidation } from '../memory-consolidation-job';

const ORG = 1;
const PROJECT = 11;
const PROFILE_PROJECT = 11; // profile exists
const NO_PROFILE_PROJECT = 12; // no intelligence profile

const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer, name text);
CREATE TABLE concept2cure_conversations (id serial PRIMARY KEY, project_id integer, thread_id text);
CREATE TABLE project_intelligence_profiles (
  id serial PRIMARY KEY,
  project_id integer NOT NULL,
  organization_id integer NOT NULL
);
-- embedding is text here: PGlite cannot load pgvector, and the INSERT under
-- test passes a vector literal string, which is exactly what gets asserted.
CREATE TABLE project_memory_entries (
  id serial PRIMARY KEY,
  project_profile_id integer NOT NULL,
  project_id integer NOT NULL,
  organization_id integer NOT NULL,
  category text NOT NULL,
  subcategory text,
  title text NOT NULL,
  content text NOT NULL,
  confidence_score real DEFAULT 0.8,
  importance_level text DEFAULT 'medium',
  is_verified_by_user boolean DEFAULT false,
  embedding text,
  status text DEFAULT 'active',
  extracted_by text DEFAULT 'ai',
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE conversation_working_memory (
  id serial PRIMARY KEY,
  conversation_id integer,
  thread_id text,
  project_id integer,
  organization_id integer NOT NULL,
  summary text NOT NULL,
  structured_data json,
  message_count_at_generation integer NOT NULL,
  generated_at timestamp DEFAULT now() NOT NULL
);
`;

const STRUCTURED = JSON.stringify({
  objective: 'Assemble the stability narrative for the Module 3 filing',
  lockedFacts: ['Batch 7 long-term data runs through month 18'],
  decisions: ['Use the 25C/60RH arm as the primary claim basis'],
  openQuestions: [],
  nextActions: [],
  createdArtifacts: [],
  exclusions: [],
});

/** Insert one working-memory row, 8 days stale (past the 7-day threshold). */
async function seedWorkingMemory(opts: {
  conversationId?: number | null;
  threadId?: string | null;
  projectId?: number | null;
  structured?: string | null;
  summary?: string;
}): Promise<number> {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO conversation_working_memory
       (conversation_id, thread_id, project_id, organization_id, summary, structured_data,
        message_count_at_generation, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 24, now() - interval '8 days')
     RETURNING id`,
    [
      opts.conversationId ?? null,
      opts.threadId ?? null,
      opts.projectId ?? null,
      ORG,
      opts.summary ?? 'Fallback summary long enough to clear the minimum atom length.',
      opts.structured ?? STRUCTURED,
    ]
  );
  return r.rows[0].id;
}

async function promotedEntries() {
  const r = await pg.query<{
    title: string; content: string; status: string; embedding: string | null;
    confidence_score: number; extracted_by: string;
  }>(
    `SELECT title, content, status, embedding, confidence_score, extracted_by
       FROM project_memory_entries WHERE category = 'conversation_summary' ORDER BY id`
  );
  return r.rows;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(
    `TRUNCATE conversation_working_memory, project_memory_entries,
       concept2cure_conversations, project_intelligence_profiles RESTART IDENTITY`
  );
  await pg.query(
    `INSERT INTO project_intelligence_profiles (project_id, organization_id) VALUES ($1, $2)`,
    [PROFILE_PROJECT, ORG]
  );
});

describe('the live AnA chat path can finally reach durable memory', () => {
  it('promotes a THREAD-KEYED row (conversation_id NULL) via its own project_id', async () => {
    // This is the severed link: before the LEFT JOIN + COALESCE fix, this row —
    // the ONLY shape the live UI writes — was excluded by the INNER JOIN on
    // conversation_id and could never be promoted.
    const cwmId = await seedWorkingMemory({ threadId: 'thread_live_ui', projectId: PROFILE_PROJECT });

    const result = await runConsolidation();

    expect(result.memoriesConsolidated).toBe(1);
    const entries = await promotedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toContain(`[cwm_${cwmId}]`);
    expect(entries[0].status).toBe('active');
    expect(entries[0].extracted_by).toBe('memory_consolidation');
    expect(entries[0].content).toContain('Module 3 filing');
  });

  it('still promotes a CONVERSATION-KEYED row (the legacy shape) — no regression', async () => {
    const conv = await pg.query<{ id: number }>(
      `INSERT INTO concept2cure_conversations (project_id) VALUES ($1) RETURNING id`,
      [PROFILE_PROJECT]
    );
    await seedWorkingMemory({ conversationId: conv.rows[0].id, projectId: null });

    const result = await runConsolidation();

    expect(result.memoriesConsolidated).toBe(1);
    expect(await promotedEntries()).toHaveLength(1);
  });

  it('never guesses: a thread row with NO project attribution stays unpromoted', async () => {
    await seedWorkingMemory({ threadId: 'thread_no_project', projectId: null });

    const result = await runConsolidation();

    expect(result.threadsProcessed).toBe(0);
    expect(await promotedEntries()).toHaveLength(0);
  });

  it('skips (does not invent) a promotion when the project has no intelligence profile', async () => {
    await seedWorkingMemory({ threadId: 'thread_no_profile', projectId: NO_PROFILE_PROJECT });

    const result = await runConsolidation();

    expect(result.memoriesConsolidated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(await promotedEntries()).toHaveLength(0);
  });
});

describe('promotion is embedded and gated, not "write everything"', () => {
  it('writes the embedding, so semantic recall (embedding IS NOT NULL) can see the memory', async () => {
    await seedWorkingMemory({ threadId: 't_embed', projectId: PROFILE_PROJECT });

    await runConsolidation();

    const entries = await promotedEntries();
    expect(entries[0].embedding).toBe('[0.25,0.5,0.75]');
    // Externally scored, honest confidence: an unvalidated conversation summary
    // must NOT carry document-extract confidence. Before the gate, every
    // promotion was hardcoded 0.75.
    expect(entries[0].confidence_score).toBeGreaterThanOrEqual(0.3);
    expect(entries[0].confidence_score).toBeLessThan(0.7);
  });

  it('REJECTS a duplicate of what the project already remembers', async () => {
    const cwmId = await seedWorkingMemory({ threadId: 't_dup', projectId: PROFILE_PROJECT });
    // Same content the promotion would produce, already in project memory under
    // a different title (no [cwm_] marker, so the NOT EXISTS guard does not
    // hide the row — the GATE has to be the thing that refuses).
    const duplicateContent = [
      'Objective: Assemble the stability narrative for the Module 3 filing',
      'Key facts: Batch 7 long-term data runs through month 18',
      'Decisions: Use the 25C/60RH arm as the primary claim basis',
    ].join('\n');
    await pg.query(
      `INSERT INTO project_memory_entries
         (project_profile_id, project_id, organization_id, category, title, content, status)
       VALUES (1, $1, $2, 'conversation_summary', 'Prior note', $3, 'active')`,
      [PROFILE_PROJECT, ORG, duplicateContent]
    );

    const result = await runConsolidation();

    expect(result.rejectedByGate).toBe(1);
    expect(result.memoriesConsolidated).toBe(0);
    const titles = (await promotedEntries()).map(e => e.title);
    expect(titles).not.toContain(expect.stringContaining(`[cwm_${cwmId}]`));
  });

  it('QUARANTINES a contradiction as pending_review, invisible to recall until a human clears it', async () => {
    await seedWorkingMemory({
      threadId: 't_contradict',
      projectId: PROFILE_PROJECT,
      structured: JSON.stringify({
        objective: 'Reassess the stability data position before filing',
        lockedFacts: ['The month-12 stability data is insufficient to support the shelf-life claim'],
        decisions: [],
        openQuestions: [],
        nextActions: [],
        createdArtifacts: [],
        exclusions: [],
      }),
    });
    await pg.query(
      `INSERT INTO project_memory_entries
         (project_profile_id, project_id, organization_id, category, title, content, status)
       VALUES (1, $1, $2, 'regulatory', 'Stability assessment',
               'The month-12 stability data is sufficient to support the shelf-life claim.', 'active')`,
      [PROFILE_PROJECT, ORG]
    );

    const result = await runConsolidation();

    expect(result.quarantined).toBe(1);
    expect(result.memoriesConsolidated).toBe(0);

    const quarantinedRow = (await promotedEntries()).find(e => e.status === 'pending_review');
    expect(quarantinedRow).toBeDefined();

    // The recall shape: both live read paths filter status='active' AND
    // embedding IS NOT NULL. A known-disputed claim must not reach AnA's
    // prompts on either side of the contradiction.
    const recall = await pg.query(
      `SELECT id FROM project_memory_entries
        WHERE category = 'conversation_summary' AND status = 'active' AND embedding IS NOT NULL`
    );
    expect(recall.rows).toHaveLength(0);
  });

  it('a second nightly run does not double-promote (title-encoded cwm id)', async () => {
    await seedWorkingMemory({ threadId: 't_idem', projectId: PROFILE_PROJECT });

    const first = await runConsolidation();
    expect(first.memoriesConsolidated).toBe(1);

    const second = await runConsolidation();
    expect(second.threadsProcessed).toBe(0);
    expect(await promotedEntries()).toHaveLength(1);
  });
});
