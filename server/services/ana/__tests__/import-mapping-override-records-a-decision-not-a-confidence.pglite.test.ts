/**
 * A person's placement of an imported file is recorded as their decision
 * (mapping_source 'manual' from the REST PATCH, 'ana' from AnA's
 * override_import_mapping) with no confidence figure, whatever status they set.
 *
 * What both overrides used to do (until 2026-10-15): set mapping_confidence =
 * 1.00 on every override, a status of 'skipped' included, so a file a person
 * set aside read as placed with full measured confidence. An override that named
 * no field at all still went through, because the "no updatable fields" check
 * ran after the source and confidence had been added to the update: it stamped
 * a backbone-declared row 'manual' (or 'ana') when nobody had changed anything.
 *
 * Real route and real handler, on PGlite with the 20260512 tables.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => {
  const state: { pg: { query: (text: string, params?: unknown[]) => Promise<unknown> } | null } = { pg: null };
  const pool = {
    query: (text: string, params?: unknown[]) => {
      if (!state.pg) throw new Error('PGlite is not started');
      return state.pg.query(text, params);
    },
  };
  return { state, pool, resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member') };
});
vi.mock('../../../db', () => ({ pool: h.pool, getPool: () => h.pool, db: {} }));
vi.mock('../../../db.js', () => ({ pool: h.pool, getPool: () => h.pool, db: {} }));
// override_import_mapping is a confirm-class write; the person confirming is an editor in the organization.
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import { OVERRIDE_IMPORT_MAPPING } from '../legacy-import-tool-defs';
import importsRouter from '../../../routes/mdx-imports';

const ORG = 8481;
const USER = 8482;
const CTX: ToolContext = { organizationId: ORG, userId: USER, humanConfirmed: true };
const MIGRATION = readFileSync(path.join(process.cwd(), 'migrations/20260512_legacy_imports.sql'), 'utf8');

let pg: PGlite;
let jobId: number;

beforeAll(async () => {
  pg = new PGlite();
  h.state.pg = pg;
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO users (id) VALUES (${USER});
  `);
  await pg.exec(MIGRATION);
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO import_jobs (organization_id, source_path, source_kind, status)
     VALUES ($1, '/uploads/archive.zip', 'zip', 'ready_for_review') RETURNING id`,
    [ORG],
  );
  jobId = rows[0].id;
}, 120_000);

afterAll(async () => { await pg?.close(); });

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG, role: 'admin' };
    (req as unknown as { userRole: string }).userRole = 'admin';
    next();
  });
  a.use('/api/mdx', importsRouter);
  return a;
}

/** A filename suggestion as the import stores it: no confidence, the rule in metadata. */
async function suggestedFile(name: string): Promise<number> {
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO import_job_files (import_job_id, organization_id, relative_path, file_name, detected_kind,
       mapped_ctd_section, mapped_artifact_kind, mapping_confidence, mapping_source, status, metadata)
     VALUES ($1, $2, $3, $3, 'leaf', '5.3.5.1', 'protocol', NULL, 'filename_heuristic', 'suggested',
       '{"mappingRuleId":"filename.protocol"}'::jsonb) RETURNING id`,
    [jobId, ORG, name],
  );
  return rows[0].id;
}
/** A leaf the archive's backbone declares, as the import stores it. */
async function declaredFile(name: string): Promise<number> {
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO import_job_files (import_job_id, organization_id, relative_path, file_name, detected_kind,
       mapped_ctd_section, mapped_artifact_kind, mapping_confidence, mapping_source, status)
     VALUES ($1, $2, $3, $3, 'leaf', '1.1', 'cover_letter', 1, 'backbone_xml', 'mapped') RETURNING id`,
    [jobId, ORG, name],
  );
  return rows[0].id;
}

interface Stored { status: string; mapping_source: string; mapping_confidence: string | null }
async function stored(fileId: number): Promise<Stored> {
  const { rows } = await pg.query<Stored>(
    `SELECT status, mapping_source, mapping_confidence::text AS mapping_confidence FROM import_job_files WHERE id = $1`,
    [fileId],
  );
  return rows[0];
}

async function overrideViaAna(input: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  const handler = getToolHandler('override_import_mapping');
  if (!handler) throw new Error('override_import_mapping is not registered');
  return JSON.parse(await handler({ import_job_id: jobId, ...input }, CTX));
}

describe('import mapping override — a person decides, nobody measured a confidence', () => {
  it.each(['mapped', 'skipped'] as const)("PATCH /imports/:id/files/:fileId status '%s' is stored as a manual decision with no confidence", async (status) => {
    const fileId = await suggestedFile(`rest-${status}.xlsx`);
    const res = await request(app()).patch(`/api/mdx/imports/${jobId}/files/${fileId}`).send({ status });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = await stored(fileId);
    expect(row.mapping_confidence, "a person's placement was stored as a measured confidence").toBeNull();
    expect(row).toMatchObject({ status, mapping_source: 'manual' });
  });

  it.each(['mapped', 'skipped'] as const)("override_import_mapping status '%s' is stored as AnA's decision with no confidence", async (status) => {
    const fileId = await suggestedFile(`ana-${status}.xlsx`);
    const out = await overrideViaAna({ file_id: fileId, status });
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const row = await stored(fileId);
    expect(row.mapping_confidence, "a person's placement was stored as a measured confidence").toBeNull();
    expect(row).toMatchObject({ status, mapping_source: 'ana' });
  });

  it('a PATCH naming no field is refused and leaves a declared placement as the archive declared it', async () => {
    const fileId = await declaredFile('m1/us/1-1/cover-letter.pdf');
    const res = await request(app()).patch(`/api/mdx/imports/${jobId}/files/${fileId}`).send({});
    expect(res.status, 'an override that changed nothing was accepted').toBe(422);
    expect(await stored(fileId), 'an override that changed nothing re-labelled the row').toEqual({
      status: 'mapped', mapping_source: 'backbone_xml', mapping_confidence: '1.00',
    });
  });

  it('an override_import_mapping naming no field is refused and leaves the row as it was', async () => {
    const fileId = await declaredFile('m1/us/1-1/cover-letter-ana.pdf');
    const out = await overrideViaAna({ file_id: fileId });
    expect(out.ok, 'an override that changed nothing was accepted').toBeUndefined();
    expect(out.error).toMatch(/No fields to update/);
    expect(await stored(fileId), 'an override that changed nothing re-labelled the row').toEqual({
      status: 'mapped', mapping_source: 'backbone_xml', mapping_confidence: '1.00',
    });
  });

  it("override_import_mapping's description does not promise a confidence the handler no longer stores", () => {
    expect(OVERRIDE_IMPORT_MAPPING.description).not.toMatch(/mapping_confidence\s*=\s*1(\.0+)?\b/);
    expect(OVERRIDE_IMPORT_MAPPING.description).toContain("mapping_source='ana'");
  });
});
