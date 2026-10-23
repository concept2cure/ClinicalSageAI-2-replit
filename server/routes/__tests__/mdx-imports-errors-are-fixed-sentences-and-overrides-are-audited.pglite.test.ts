/**
 * The legacy importer stores and returns a fixed sentence for a failure,
 * records who changed a file's placement, and labels its onboarding steps by
 * what they do.
 *
 * What it used to do (until 2026-10-22):
 *   - import_jobs.error_message and import_job_files.error_message stored the
 *     raw err.message (the archive's absolute path from ENOENT, the database's
 *     own text from a failed insert), and GET /imports/:id returned it;
 *   - PATCH /imports/:id/files/:fileId changed the placement that approve
 *     imports from and wrote no audit row;
 *   - the onboarding steps said "AnA maps files → sections" (the archive's
 *     backbone and a person place files; AnA only confirms when asked) and
 *     "Completeness + integrity checks" (no checksum is verified against
 *     util/index-md5.txt).
 *
 * Real router on PGlite with the 20260512 tables; the audit store is a double.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({
  pg: null as unknown as { query: (t: string, p?: unknown[]) => Promise<unknown> },
  audit: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../db', () => {
  const pool = { query: (text: string, params?: unknown[]) => h.pg.query(text, params) };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async (entry: Record<string, unknown>) => {
    h.audit.push(entry);
    return { persisted: true, chained: true };
  }),
}));

import importsRouter, { markImportJobFailed } from '../mdx-imports';

const ORG = 301;
const USER = 778;
const MIGRATION = readFileSync(path.join(process.cwd(), 'migrations/20260512_legacy_imports.sql'), 'utf8');
const RAW = /\/home\/|uploads\/org-|duplicate key|violates|ENOENT/;

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  h.pg = pg;
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO users (id) VALUES (${USER});
  `);
  await pg.exec(MIGRATION);
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

async function job(status: string): Promise<number> {
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO import_jobs (organization_id, source_path, source_kind, status) VALUES ($1, '/home/app/uploads/org-301/a.zip', 'zip', $2) RETURNING id`,
    [ORG, status],
  );
  return rows[0].id;
}

describe('a failure is stored and returned as a fixed sentence', () => {
  it('markImportJobFailed stores no raw error text', async () => {
    const id = await job('detecting');
    await markImportJobFailed(id, new Error("ENOENT: no such file or directory, open '/home/app/uploads/org-301/a.zip'"));
    const { rows } = await pg.query<{ status: string; error_message: string }>('SELECT status, error_message FROM import_jobs WHERE id = $1', [id]);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error_message, 'the archive path was stored as the error').not.toMatch(RAW);
    expect(rows[0].error_message).toMatch(/server log/);
  });

  it('GET /imports/:id returns no raw text already stored on the job or a file', async () => {
    const id = await job('failed');
    await pg.query(`UPDATE import_jobs SET error_message = $2 WHERE id = $1`, [id, "ENOENT: open '/home/app/uploads/org-301/a.zip'"]);
    await pg.query(
      `INSERT INTO import_job_files (import_job_id, organization_id, relative_path, file_name, status, error_message)
       VALUES ($1, $2, 'm1/x.pdf', 'x.pdf', 'error', 'duplicate key value violates unique constraint "c2c_artifacts_artifact_id_key"')`,
      [id, ORG],
    );
    const r = await request(app()).get(`/api/mdx/imports/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.error_message, 'the stored error text was returned').not.toMatch(RAW);
    expect(r.body.data.error_message).toMatch(/server log/);
    expect(r.body.data.files[0].error_message, "a file's database error was returned").not.toMatch(RAW);
    expect(r.body.data.files[0].error_message).toMatch(/server log/);
  });
});

describe('PATCH /imports/:id/files/:fileId records who changed the placement', () => {
  it('writes an audit row with the actor, the file and the placement before and after', async () => {
    const id = await job('ready_for_review');
    const { rows: [file] } = await pg.query<{ id: number }>(
      `INSERT INTO import_job_files (import_job_id, organization_id, relative_path, file_name, status, mapped_ctd_section, mapping_source)
       VALUES ($1, $2, 'protocol.pdf', 'protocol.pdf', 'suggested', '5.3.5.1', 'filename_heuristic') RETURNING id`,
      [id, ORG],
    );
    h.audit.length = 0;
    const r = await request(app()).patch(`/api/mdx/imports/${id}/files/${file.id}`).send({ status: 'mapped', mappedCtdSection: '5.3.5.2' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.status).toBe('mapped');
    expect(r.body.data.before, 'the audit snapshot leaked into the file row').toBeUndefined();
    expect(h.audit, 'the override that decides what approve imports was not audited').toHaveLength(1);
    expect(h.audit[0]).toMatchObject({
      tenantId: ORG,
      userId: USER,
      resourceType: 'import_job_file',
      resourceId: file.id,
      details: {
        importJobId: id,
        before: { status: 'suggested', mapped_ctd_section: '5.3.5.1', mapping_source: 'filename_heuristic' },
        after: { status: 'mapped', mapped_ctd_section: '5.3.5.2', mapping_source: 'manual' },
      },
    });
    expect(r.body.meta?.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it("control: another job's file is not found, and nothing is audited", async () => {
    const id = await job('ready_for_review');
    h.audit.length = 0;
    const r = await request(app()).patch(`/api/mdx/imports/${id}/files/999999`).send({ status: 'mapped' });
    expect(r.status).toBe(404);
    expect(h.audit).toHaveLength(0);
  });
});

describe('the onboarding steps say what happens', () => {
  it('names who places files and what validation checks', async () => {
    const r = await request(app()).get(`/api/mdx/onboarding/${ORG}`);
    expect(r.status).toBe(200);
    const steps = r.body.data.steps as Array<{ id: string; desc: string }>;
    const map = steps.find((s) => s.id === 'map')!.desc;
    const validate = steps.find((s) => s.id === 'validate')!.desc;
    expect(map, 'the mapping step credited AnA with placing files').not.toMatch(/AnA maps/);
    expect(map).toMatch(/backbone/i);
    expect(map).toMatch(/person/i);
    expect(validate, 'the validate step claimed integrity checks no code performs').not.toMatch(/integrity/i);
    expect(validate).toMatch(/not verified/i);
  });
});
