/**
 * When AnA's start_legacy_import fails after its job row exists, the job is
 * marked 'failed' with the error, as POST /api/mdx/imports marks it.
 *
 * What the handler used to do (until 2026-10-15): its catch returned the error
 * to the model and wrote nothing, so the import_jobs row it had already created
 * stayed at status 'detecting' for good, which every reader of the job (GET
 * /api/mdx/imports, the job page) takes for an import still running. The REST
 * route has marked such a job 'failed' all along.
 *
 * Real handler, real route, real detector, on PGlite with the 20260512 tables.
 * Two failures after the job row exists: the archive is gone by the time
 * detection runs, and a row write fails part-way through the import.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
// start_legacy_import is a confirm-class write; the person confirming is an editor in the organization.
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import importsRouter, { IMPORT_JOB_FAILED_MESSAGE } from '../../../routes/mdx-imports';

const ORG = 8471;
const USER = 8472;
const CTX: ToolContext = { organizationId: ORG, userId: USER, humanConfirmed: true };
const MIGRATION = readFileSync(path.join(process.cwd(), 'migrations/20260512_legacy_imports.sql'), 'utf8');
const UPLOADS = path.resolve('uploads', `org-${ORG}`, randomUUID());

let pg: PGlite;

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
  mkdirSync(UPLOADS, { recursive: true });
}, 120_000);

afterAll(async () => {
  await pg?.close();
  rmSync(UPLOADS, { recursive: true, force: true });
  try { rmdirSync(path.dirname(UPLOADS)); } catch { /* not empty, or already gone */ }
});

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

async function startViaAna(sourcePath: string): Promise<{ ok?: boolean; error?: string; jobId?: number; jobMarkedFailed?: boolean }> {
  const handler = getToolHandler('start_legacy_import');
  if (!handler) throw new Error('start_legacy_import is not registered');
  return JSON.parse(await handler({ source_path: sourcePath }, CTX));
}

interface JobRow { id: number; status: string; error_message: string | null }
async function latestJob(): Promise<JobRow> {
  const { rows } = await pg.query<JobRow>(
    `SELECT id, status, error_message FROM import_jobs WHERE organization_id = $1 ORDER BY id DESC LIMIT 1`,
    [ORG],
  );
  return rows[0];
}

describe('start_legacy_import — a job that fails after it was created', () => {
  it('is marked failed with the error when the archive cannot be read, as the REST import marks it', async () => {
    const gone = path.join(UPLOADS, 'removed-before-detection.zip');

    const out = await startViaAna(gone);
    expect(out.ok).toBeUndefined();
    expect(out.error).toMatch(/^start_legacy_import failed: .*ENOENT/);
    const viaAna = await latestJob();
    expect(viaAna.status, 'the job was left as if detection were still running').toBe('failed');
    // 2026-10-22: the stored error is a fixed sentence (the raw text named the archive's path).
    expect(viaAna.error_message).toBe(IMPORT_JOB_FAILED_MESSAGE);
    expect(out, 'the reply did not name the job it marked failed').toMatchObject({ jobId: viaAna.id, jobMarkedFailed: true });

    const res = await request(app()).post('/api/mdx/imports').send({ sourcePath: gone });
    expect(res.status).toBe(500);
    const viaRoute = await latestJob();
    expect(viaRoute.id).not.toBe(viaAna.id);
    expect(viaRoute.status).toBe('failed');
    expect(viaRoute.error_message).toBe(IMPORT_JOB_FAILED_MESSAGE);
  });

  it('is marked failed with the error when a row write fails part-way through the import', async () => {
    const zip = new JSZip();
    zip.file('protocol_deviation_log.xlsx', 'deviation log');
    const archive = path.join(UPLOADS, 'raw-folder.zip');
    writeFileSync(archive, await zip.generateAsync({ type: 'nodebuffer' }));
    // The file row is written; the finding row after it is refused.
    await pg.exec(`
      CREATE FUNCTION refuse_finding() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'findings store unavailable'; END $$;
      CREATE TRIGGER refuse_finding BEFORE INSERT ON import_job_findings
        FOR EACH ROW EXECUTE FUNCTION refuse_finding();
    `);
    try {
      const out = await startViaAna(archive);
      expect(out.error).toMatch(/findings store unavailable/);
      const job = await latestJob();
      expect(job.status, 'the job was left as if detection were still running').toBe('failed');
      expect(job.error_message).toBe(IMPORT_JOB_FAILED_MESSAGE);
      expect(out).toMatchObject({ jobId: job.id, jobMarkedFailed: true });
    } finally {
      await pg.exec(`DROP TRIGGER refuse_finding ON import_job_findings; DROP FUNCTION refuse_finding();`);
    }
  });
});
