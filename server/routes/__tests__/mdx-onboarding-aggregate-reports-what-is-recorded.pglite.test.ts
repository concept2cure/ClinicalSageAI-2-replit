/**
 * GET /api/mdx/onboarding/:tenantId reports what the import tables record:
 * files actually imported, counted past the list's row limit; per-file issues
 * from the findings recorded against the file; open findings that are still
 * unresolved; and no verdict on a step nothing records.
 *
 * What it used to do (until 2026-10-15):
 *   - "Artifacts imported" was the length of the file listing: every file row of
 *     every job (suggestions, skipped structure files, the attachment bucket),
 *     capped at 500 by the listing's LIMIT, so it could neither say what was
 *     imported nor go past 500;
 *   - every artifact row carried `issues: 0`, a constant;
 *   - "Open findings" counted resolved findings too (from the newest 500 only);
 *   - the "Connect" step (org account, SSO, admin) was a constant 'complete'.
 *
 * Real route on PGlite with the 20260512 tables; rows written as the import,
 * approve and resolve routes write them.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({ pg: null as unknown as { query: (t: string, p?: unknown[]) => Promise<unknown> } }));
vi.mock('../../db', () => {
  const pool = { query: (text: string, params?: unknown[]) => h.pg.query(text, params) };
  return { pool, getPool: () => pool, db: {} };
});

import importsRouter from '../mdx-imports';

const MANY = 101; // more files imported than the listing shows
const FEW = 102;
const USER = 777;
const MIGRATION = readFileSync(path.join(process.cwd(), 'migrations/20260512_legacy_imports.sql'), 'utf8');

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  h.pg = pg;
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${MANY}), (${FEW});
    INSERT INTO users (id) VALUES (${USER});
  `);
  await pg.exec(MIGRATION);
}, 120_000);

afterAll(async () => { await pg?.close(); });

function app(org: number) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: USER, organizationId: org, role: 'admin' };
    (req as unknown as { userRole: string }).userRole = 'admin';
    next();
  });
  a.use('/api/mdx', importsRouter);
  return a;
}

async function job(org: number): Promise<number> {
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO import_jobs (organization_id, source_path, source_kind, status)
     VALUES ($1, '/uploads/archive.zip', 'zip', 'completed') RETURNING id`,
    [org],
  );
  return rows[0].id;
}

interface Kpi { label: string; metric: string }
interface Aggregate {
  steps: Array<{ id: string; state: string; note?: string }>;
  artifacts: Array<{ legacy: string; issues: number | null }>;
  validations: Array<{ id: string; artifact: string | null; resolved: boolean }>;
  kpis: Kpi[];
  totals?: { files: number; listLimit: number };
}
async function aggregate(org: number): Promise<Aggregate> {
  const res = await request(app(org)).get(`/api/mdx/onboarding/${org}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as Aggregate;
}
const kpi = (a: Aggregate, label: string) => a.kpis.find((k) => k.label === label);

describe('GET /api/mdx/onboarding/:tenantId — what the aggregate reports', () => {
  it("counts the files actually imported, past the listing's row limit, and says the listing is cut", async () => {
    const jobId = await job(MANY);
    await pg.query(
      `INSERT INTO import_job_files (import_job_id, organization_id, relative_path, file_name, status, artifact_id, mapping_source)
       SELECT $1, $2, 'm5/leaf-' || g || '.pdf', 'leaf-' || g || '.pdf', 'imported', 1000 + g, 'backbone_xml'
         FROM generate_series(1, 520) AS g`,
      [jobId, MANY],
    );
    await pg.query(
      `INSERT INTO import_job_files (import_job_id, organization_id, relative_path, file_name, status, mapping_source)
       VALUES ($1, $2, 'protocol_deviation_log.xlsx', 'protocol_deviation_log.xlsx', 'suggested', 'filename_heuristic'),
              ($1, $2, 'util/index-md5.txt', 'index-md5.txt', 'skipped', 'structure_path'),
              ($1, $2, 'notes.txt', 'notes.txt', 'skipped', 'fallback')`,
      [jobId, MANY],
    );

    const a = await aggregate(MANY);
    expect(kpi(a, 'Artifacts imported')?.metric, "'Artifacts imported' counted every file row, capped at 500").toBe('520');
    expect(a.totals, 'the listing was cut at its row limit without saying so').toMatchObject({ files: 523, listLimit: 500 });
    expect(a.artifacts).toHaveLength(500);
  });

  it('counts per-file issues and open findings from the unresolved findings recorded', async () => {
    const jobId = await job(FEW);
    await pg.query(
      `INSERT INTO import_job_files (import_job_id, organization_id, relative_path, file_name, status, mapping_source, mapping_confidence)
       VALUES ($1, $2, 'm1/us/1-1/cover-letter.pdf', 'cover-letter.pdf', 'mapped', 'backbone_xml', 1),
              ($1, $2, 'notes.txt', 'notes.txt', 'skipped', 'fallback', NULL)`,
      [jobId, FEW],
    );
    const { rows: [resolvedOnFile] } = await pg.query<{ id: number }>(
      `INSERT INTO import_job_findings (import_job_id, organization_id, severity, code, message, file_path, resolved)
       VALUES ($1, $2, 'error', 'checksum_mismatch', 'Re-uploaded; the checksum now matches.', 'm1/us/1-1/cover-letter.pdf', true)
       RETURNING id`,
      [jobId, FEW],
    );
    await pg.query(
      `INSERT INTO import_job_findings (import_job_id, organization_id, severity, code, message, file_path, resolved)
       VALUES ($1, $2, 'error', 'checksum_mismatch', 'The checksum does not match the md5 index.', 'm1/us/1-1/cover-letter.pdf', false),
              ($1, $2, 'warning', 'unmatched_files', '1 file(s) matched no backbone entry.', NULL, false),
              ($1, $2, 'info', 'extra_files_not_in_backbone', '1 file(s) are not referenced.', NULL, true)`,
      [jobId, FEW],
    );

    const a = await aggregate(FEW);
    const issues = Object.fromEntries(a.artifacts.map((r) => [r.legacy, r.issues]));
    expect(issues['cover-letter.pdf'], 'issues was a constant 0, not counted from recorded findings').toBe(1);
    expect(issues['notes.txt']).toBe(0);
    expect(kpi(a, 'Open findings')?.metric, 'resolved findings were counted as open').toBe('2');
    expect(a.validations.find((v) => v.id === `v-${resolvedOnFile.id}`)?.resolved, 'a resolved finding was listed as if open').toBe(true);
    expect(
      a.validations.filter((v) => v.artifact === null),
      'a finding about no one file was attributed to an empty file name',
    ).toHaveLength(2);
  });

  it('gives the Connect step no verdict, because nothing records it', async () => {
    const a = await aggregate(FEW);
    const connect = a.steps.find((s) => s.id === 'connect');
    expect(connect?.state, 'Connect (org account, SSO, admin) was reported complete with nothing read').toBe('not_recorded');
    expect(connect?.note).toMatch(/not recorded/i);
  });
});
