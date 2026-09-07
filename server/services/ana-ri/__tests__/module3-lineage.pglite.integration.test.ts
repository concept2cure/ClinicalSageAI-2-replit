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
  // Overridable per test: module3RefreshStale asks this which sections are stale.
  const buildStatus = { fn: async () => ({ sections: [] as any[], artifactRegistry: { state: 'unaddressable' } }) };
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
  return { holder, wrap, pool, buildStatus };
});
vi.mock('../../../db', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));
// The artifact bridge is post-commit and non-fatal; stub it so the test stays
// focused on the lineage write.
vi.mock('../../module3-convergence-service', () => ({
  bridgeCompileToArtifact: async () => ({
    bridged: false,
    reason: 'unaddressable',
    detail: 'stubbed for lineage test',
  }),
  classifyAndMapArtifactToSource: async () => null,
  getModule3BuildStatus: async () => h.buildStatus.fn(),
}));

import { module3BuildAll, module3BuildSection, module3RefreshStale } from '../module3-command-handlers';

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
    -- Shapes copied from db/migrations/20260401_cmc_convergence_os.sql. Both
    -- tables are now reached by the AnA build paths: they run the same
    -- compose+persist implementation as the API routes, which records a
    -- 'compiled' provenance event and consults the program row for the region
    -- of the 3.2.R pass.
    CREATE TABLE cmc_provenance_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int NOT NULL,
      project_id text NOT NULL, artifact_type text NOT NULL, artifact_id text NOT NULL,
      event_type text NOT NULL, event_payload jsonb NOT NULL, created_by text,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE regulatory_programs (
      id text PRIMARY KEY, organization_id int, program_type text,
      product_name text, name text, code text);
  `);
  await pglite.query(`INSERT INTO organizations (id, name) VALUES ($1,'a')`, [ORG]);
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(async () => {
  h.buildStatus.fn = async () => ({ sections: [] as any[], artifactRegistry: { state: 'unaddressable' } });
  await pglite.exec(
    `DELETE FROM cmc_section_lineage; DELETE FROM cmc_module3_sections; DELETE FROM cmc_source_objects; DELETE FROM cmc_provenance_events;`,
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

  it('module3BuildAll records a compiled provenance event per section (parity with the API compile route)', async () => {
    /* The AnA build paths ran their own copy of the compose+persist body, which
       wrote the section and its lineage but no provenance event — so a build
       done through chat left no trace, while the same build through the API did.
       Both now go through services/cmc/module3-section-recompose. */
    await seedSource();
    const res = await module3BuildAll({ organizationId: ORG } as any, { projectId: PROJECT });
    expect(res.success).toBe(true);
    const ev = await wrap(
      `SELECT COUNT(*)::int AS n FROM cmc_provenance_events
        WHERE organization_id = $1 AND project_id = $2 AND event_type = 'compiled' AND artifact_type = 'section'`,
      [ORG, PROJECT],
    );
    expect(Number((ev.rows[0] as any).n)).toBe((res.data as any).compiledCount);
  });

  it('build paths refuse to compose from zero canonical sources instead of writing empty sections', async () => {
    /* No seedSource(). Composing from nothing yields clean-but-empty bodies
       written with stale = false over whatever was there; every other build path
       refuses, and build-all used to answer `success: true` for it. */
    const all = await module3BuildAll({ organizationId: ORG } as any, { projectId: PROJECT });
    expect(all.success).toBe(false);
    expect(all.message).toMatch(/no canonical source objects/i);

    const one = await module3BuildSection({ organizationId: ORG } as any, {
      projectId: PROJECT,
      sectionKey: '3.2.S.1',
    });
    expect(one.success).toBe(false);
    expect(one.message).toMatch(/no canonical source objects/i);

    const written = await wrap(`SELECT COUNT(*)::int AS n FROM cmc_module3_sections`, []);
    expect(Number((written.rows[0] as any).n)).toBe(0);
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

  it('a failed refresh leaves the section lineage intact (the whole refresh is one transaction)', async () => {
    /* persistComposedSection DELETEs a section's cmc_section_lineage rows and
       re-inserts them. module3RefreshStale ran that on a bare pool, so a failure
       after the DELETE left the section traced back to NOTHING and nothing rolled
       it back — worse than the bare UPDATE it replaced, which never deleted.
       Here the re-insert is made to fail; the pre-refresh lineage must survive. */
    const sourceId = await seedSource();
    await module3BuildAll({ organizationId: ORG } as any, { projectId: PROJECT });
    const before = await wrap(
      `SELECT source_object_id, source_hash_at_compile FROM cmc_section_lineage l
        JOIN cmc_module3_sections s ON s.id = l.section_id
       WHERE s.section_key = '3.2.S.1' AND l.organization_id = $1`,
      [ORG],
    );
    expect(before.rows.length).toBeGreaterThan(0);

    h.buildStatus.fn = async () => ({
      sections: [{ sectionKey: '3.2.S.1', sectionLabel: '3.2.S.1', isStale: true, staleReason: 'source changed', missingInputs: [] }],
      artifactRegistry: { state: 'unaddressable' },
    });
    /* Make the lineage re-insert fail, after the delete has run. NOT VALID so the
       constraint applies to new rows only — the rows already there are exactly
       what must survive. */
    await pglite.exec(
      `ALTER TABLE cmc_section_lineage ADD CONSTRAINT no_h1 CHECK (source_hash_at_compile <> 'h1') NOT VALID;`,
    );
    let outcome: { success: boolean; message: string; threw?: boolean };
    try {
      outcome = (await module3RefreshStale({ organizationId: ORG } as any, { projectId: PROJECT })) as any;
    } catch (err) {
      outcome = { success: false, message: (err as Error).message, threw: true };
    } finally {
      await pglite.exec(`ALTER TABLE cmc_section_lineage DROP CONSTRAINT no_h1;`);
    }

    const after = await wrap(
      `SELECT source_object_id, source_hash_at_compile FROM cmc_section_lineage l
        JOIN cmc_module3_sections s ON s.id = l.section_id
       WHERE s.section_key = '3.2.S.1' AND l.organization_id = $1`,
      [ORG],
    );
    // The traceability the refresh exists to keep correct is still there.
    expect(after.rows).toEqual(before.rows);
    expect(after.rows.some((r: any) => r.source_object_id === sourceId)).toBe(true);
    // And the failure is reported, not thrown past the command executor.
    expect(outcome.threw).toBeUndefined();
    expect(outcome.success).toBe(false);
    expect(outcome.message).toMatch(/nothing was written/i);
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
