/**
 * The shared knowledge graph must not serve one tenant's entities to another.
 *
 * ── The exposure this pins closed ────────────────────────────────────────────
 * knowledge_graph_nodes, knowledge_graph_edges and lumen_knowledge_graph_edges
 * carried NO tenant column and no RLS, while their siblings
 * (extracted_graph_edges, rag_knowledge_graph, section_graph_nodes) all carry
 * organization_id WITH RLS — drift, not design. server/routes/graphrag.ts
 * writes extracted document entities into them and reads them back with no
 * tenant predicate whatsoever; the whole file contains no getSecureOrgId, no
 * requestDb and no req.user. Its vector search is the sharpest case:
 *
 *   SELECT id, name, entity_type, 1 - (embedding <=> (...)) AS similarity
 *     FROM knowledge_graph_nodes WHERE embedding IS NOT NULL ORDER BY ...
 *
 * Tenant A ingests a protocol, its entities become rows; tenant B asks a
 * semantically related question and the nearest neighbours are A's rows. On a
 * platform holding unannounced programmes, the entity NAMES are the
 * confidential part.
 *
 * ── Why this is a real-database test ─────────────────────────────────────────
 * Every property below is enforced by PostgreSQL, not by application code: a
 * mocked pool has no policies, no FORCE ROW LEVEL SECURITY, and no notion of
 * `app.current_tenant_id`. A unit test asserting "the query has a WHERE clause"
 * would pass against a query that RLS then fails to filter, which is the exact
 * false assurance this suite exists to remove.
 *
 * The migration is applied by this file rather than assumed, so the suite is
 * self-provisioning regardless of which migrations the surrounding CI job ran.
 *
 * ── Why the reads run as a NON-SUPERUSER ─────────────────────────────────────
 * The first draft of this suite queried as the owner (`postgres`) and every
 * isolation case failed — the policy appeared to do nothing. It was doing
 * nothing: a SUPERUSER bypasses RLS unconditionally, and FORCE ROW LEVEL
 * SECURITY does not change that (FORCE subjects the table OWNER to policies; it
 * has no power over a superuser). That is exactly the finding the assessment
 * records — "a superuser or BYPASSRLS runtime role makes all policies inert" —
 * reproduced accidentally, and it is why these tests connect through the
 * harness's provisioned non-superuser role instead. Asserting isolation from a
 * superuser connection would have been a test that can only ever fail, or
 * (worse, if written loosely) one that can only ever pass.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, type ScratchSchema } from './harness';

const MIGRATION = path.join(
  __dirname,
  '../../db/migrations/20260813_knowledge_graph_tenant_keys.sql'
);

const ORG_A = 90001;
const ORG_B = 90002;
/** Marks the rows this suite creates, so cleanup never touches anything else. */
const TAG = 'dbtest-kg-isolation';

let owner: Pool;
let scratch: ScratchSchema;
/** Non-superuser, NOBYPASSRLS — the role production actually serves requests as. */
let runtime: Pool;

/**
 * Run `fn` on a connection scoped to `orgId`, the way a request-scoped client is
 * scoped in production (server/middleware/authBoundary.ts sets the same key).
 *
 * RESET ALL on both checkout and release is load-bearing rather than hygiene:
 * set_config(k, v, false) is SESSION scoped, so a released connection returns to
 * the pool still carrying the previous tenant. That leak produced a false PASS
 * in an earlier suite in this directory — the "unscoped sees nothing" case
 * recycled a client the preceding test had already scoped.
 */
async function asTenant<T>(orgId: number | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await runtime.connect();
  try {
    await client.query('RESET ALL');
    if (orgId !== null) {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [String(orgId)]);
    }
    return await fn(client);
  } finally {
    await client.query('RESET ALL').catch(() => {});
    client.release();
  }
}

async function cleanup(): Promise<void> {
  // The owner is subject to FORCE RLS too, so deletes must be scoped per tenant
  // — which is itself a small proof that FORCE is on.
  for (const org of [ORG_A, ORG_B]) {
    await asTenant(org, async c => {
      await c.query('DELETE FROM knowledge_graph_nodes WHERE description = $1', [TAG]);
    });
  }
  // Unattributed rows match no tenant, so they need the policy lifted to clear.
  await owner.query('ALTER TABLE knowledge_graph_nodes DISABLE ROW LEVEL SECURITY');
  await owner.query('DELETE FROM knowledge_graph_nodes WHERE description = $1', [TAG]);
  await owner.query('ALTER TABLE knowledge_graph_nodes ENABLE ROW LEVEL SECURITY');
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(fs.readFileSync(MIGRATION, 'utf8'));

  // Mint (or reuse) the real non-superuser runtime role via the SAME script the
  // installers run — scripts/db/provision-app-role.mjs — so the posture under
  // test is the posture production gets, not one this file invented.
  scratch = await createScratchSchema(databaseUrl);
  runtime = await scratch.connectAsRuntimeRole();
  for (const t of ['knowledge_graph_nodes', 'knowledge_graph_edges', 'lumen_knowledge_graph_edges']) {
    await owner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO ${scratch.runtimeRole}`);
  }

  await cleanup();
});

afterAll(async () => {
  if (owner) {
    await cleanup().catch(() => {});
  }
  if (scratch) await scratch.destroy().catch(() => {});
  if (owner) await owner.end().catch(() => {});
});

describe('knowledge graph tenant isolation', () => {
  it('carries a tenant key with RLS enabled AND forced on every graph table', async () => {
    // FORCE matters specifically: without it the table OWNER bypasses the
    // policy, and the runtime connects as a role that owns nothing today but
    // might tomorrow. Enabled-but-not-forced is the posture that makes a policy
    // look present and do nothing.
    const posture = await owner.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              EXISTS (SELECT 1 FROM information_schema.columns col
                       WHERE col.table_schema = 'public' AND col.table_name = c.relname
                         AND col.column_name = 'organization_id') AS has_org
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('knowledge_graph_nodes','knowledge_graph_edges','lumen_knowledge_graph_edges')
        ORDER BY c.relname`
    );

    expect(posture.rowCount).toBe(3);
    for (const row of posture.rows) {
      expect({ table: row.relname, org: row.has_org, rls: row.relrowsecurity, forced: row.relforcerowsecurity })
        .toEqual({ table: row.relname, org: true, rls: true, forced: true });
    }
  });

  it("does not serve one tenant's entities to another", async () => {
    await asTenant(ORG_A, async c => {
      await c.query(
        `INSERT INTO knowledge_graph_nodes (id, name, entity_type, description, organization_id)
         VALUES ($1, $2, 'compound', $3, $4)`,
        [`${TAG}-a`, 'ZX-9 (unannounced programme)', TAG, ORG_A]
      );
    });

    const seenByB = await asTenant(ORG_B, c =>
      c.query('SELECT name FROM knowledge_graph_nodes WHERE description = $1', [TAG])
    );
    expect(seenByB.rows).toEqual([]);

    const seenByA = await asTenant(ORG_A, c =>
      c.query('SELECT name FROM knowledge_graph_nodes WHERE description = $1', [TAG])
    );
    expect(seenByA.rows.map(r => r.name)).toEqual(['ZX-9 (unannounced programme)']);
  });

  it('refuses a write that claims another tenant (WITH CHECK)', async () => {
    // Reading is only half of isolation: without WITH CHECK, tenant B could
    // plant rows into A's graph.
    await expect(
      asTenant(ORG_B, c =>
        c.query(
          `INSERT INTO knowledge_graph_nodes (id, name, entity_type, description, organization_id)
           VALUES ($1, 'planted', 'compound', $2, $3)`,
          [`${TAG}-planted`, TAG, ORG_A]
        )
      )
    ).rejects.toThrow(/row-level security/i);
  });

  it('serves UNATTRIBUTED legacy rows to nobody, rather than to everybody', async () => {
    // Rows predating the tenant key cannot be attributed — nothing recorded who
    // wrote them — so the policy compares NULL, which is never true. Fail
    // closed. The alternative (readable until someone backfills) keeps the leak
    // open for as long as the cleanup is postponed.
    await owner.query('ALTER TABLE knowledge_graph_nodes DISABLE ROW LEVEL SECURITY');
    await owner.query(
      `INSERT INTO knowledge_graph_nodes (id, name, entity_type, description, organization_id)
       VALUES ($1, 'legacy orphan', 'compound', $2, NULL)`,
      [`${TAG}-orphan`, TAG]
    );
    await owner.query('ALTER TABLE knowledge_graph_nodes ENABLE ROW LEVEL SECURITY');

    for (const org of [ORG_A, ORG_B]) {
      const rows = await asTenant(org, c =>
        c.query(`SELECT name FROM knowledge_graph_nodes WHERE id = $1`, [`${TAG}-orphan`])
      );
      expect(rows.rows).toEqual([]);
    }
  });

  it('shows nothing at all to a connection carrying no tenant scope', async () => {
    const rows = await asTenant(null, c =>
      c.query('SELECT name FROM knowledge_graph_nodes WHERE description = $1', [TAG])
    );
    expect(rows.rows).toEqual([]);
  });
});
