/**
 * CMC Module 3 derivation lineage — END-TO-END against in-process PGlite.
 *
 * Proves the AnA build paths persist cmc_section_lineage (which source objects
 * each compiled section was derived from), at parity with the convergence/OS
 * routes. Before this, module3BuildAll / module3BuildSection wrote the narrative
 * but dropped the provenance, so a section built via AnA traced back to nothing.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// vi.hoisted so the mock factory (hoisted above imports) can reference these
// without a temporal-dead-zone read. `holder.pg` is assigned the PGlite instance
// in beforeAll; wrap/pool capture it lazily.
const h = vi.hoisted(() => {
  const holder: { pg: any } = { pg: null };
  const wrap = async (sql: string, params?: unknown[]) => {
    const r = await holder.pg.query(sql, params as unknown[]);
    return {
      rows: r.rows as any[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  };
  const pool = {
    query: (s: string, p?: unknown[]) => wrap(s, p),
    connect: async () => ({ query: (s: string, p?: unknown[]) => wrap(s, p), release: () => undefined }),
  };
  return { holder, wrap, pool };
});
vi.mock('../../../db', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));
// The artifact bridge is post-commit and non-fatal; stub it so the test stays
// focused on the lineage write.
vi.mock('../../module3-convergence-service', () => ({
  bridgeCompileToArtifact: async () => null,
  classifyAndMapArtifactToSource: async () => null,
  getModule3BuildStatus: async () => ({}),
}));

import { module3BuildAll, module3BuildSection } from '../module3-command-handlers';

let pglite: PGlite;
const wrap = h.wrap;

const ORG = 7;
const PROJECT = 'proj-cmc-1';

beforeAll(async () => {
  pglite = new PGlite();
  h.holder.pg = pglite;
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, name text);
    CREATE TABLE cmc_source_objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, project_id text,
      source_type text, source_payload jsonb, source_hash text, source_key text,
      version int DEFAULT 1, updated_at timestamptz DEFAULT now());
    CREATE TABLE cmc_module3_sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, project_id text,
      section_key text, section_path text, deterministic_json jsonb, narrative_text text,
      compiled_hash text, stale boolean DEFAULT false, stale_reason text,
      approval_state text DEFAULT 'draft', updated_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX uq_m3_sections ON cmc_module3_sections (organization_id, project_id, section_key);
    CREATE TABLE cmc_section_lineage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int,
      section_id uuid, source_object_id uuid, source_hash_at_compile text);
  `);
  await pglite.query(`INSERT INTO organizations (id, name) VALUES ($1,'a')`, [ORG]);
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(async () => {
  await pglite.exec(
    `DELETE FROM cmc_section_lineage; DELETE FROM cmc_module3_sections; DELETE FROM cmc_source_objects;`,
  );
});

async function seedSource(): Promise<string> {
  const r = await wrap(
    `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_payload, source_hash, source_key)
     VALUES ($1,$2,'drug_substance',$3::jsonb,'h1','ds-1') RETURNING id`,
    [ORG, PROJECT, JSON.stringify({ name: 'API-1', manufacturer: 'Acme' })],
  );
  return (r.rows[0] as any).id;
}

async function lineageCount(sourceId: string): Promise<number> {
  const r = await wrap(
    `SELECT COUNT(*)::int AS n FROM cmc_section_lineage WHERE organization_id = $1 AND source_object_id = $2`,
    [ORG, sourceId],
  );
  return Number((r.rows[0] as any).n);
}

describe('CMC Module 3 derivation lineage (AnA build paths)', () => {
  it('module3BuildAll persists cmc_section_lineage tying sections to their source objects', async () => {
    const sourceId = await seedSource();
    const res = await module3BuildAll({ organizationId: ORG } as any, { projectId: PROJECT });
    expect(res.success).toBe(true);
    // Every compiled section that used the source records a lineage row.
    expect(await lineageCount(sourceId)).toBeGreaterThan(0);
    // And each lineage row carries a real section_id from the compiled set.
    const linked = await wrap(
      `SELECT COUNT(*)::int AS n FROM cmc_section_lineage l
        JOIN cmc_module3_sections s ON s.id = l.section_id WHERE l.organization_id = $1`,
      [ORG],
    );
    expect(Number((linked.rows[0] as any).n)).toBeGreaterThan(0);
  });

  it('module3BuildSection persists lineage for the single compiled section', async () => {
    const sourceId = await seedSource();
    const res = await module3BuildSection({ organizationId: ORG } as any, {
      projectId: PROJECT,
      sectionKey: '3.2.S.1',
    });
    expect(res.success).toBe(true);
    expect(await lineageCount(sourceId)).toBeGreaterThan(0);
  });

  it('re-building refreshes lineage in place (no duplicate rows per source/section)', async () => {
    const sourceId = await seedSource();
    await module3BuildSection({ organizationId: ORG } as any, { projectId: PROJECT, sectionKey: '3.2.S.1' });
    const first = await lineageCount(sourceId);
    await module3BuildSection({ organizationId: ORG } as any, { projectId: PROJECT, sectionKey: '3.2.S.1' });
    const second = await lineageCount(sourceId);
    expect(second).toBe(first); // delete-then-insert keeps it stable
  });
});
