/**
 * GET /api/mdx/onboarding/:tenantId reports a placement nobody measured as
 * unassessed, and counts as mapped only the files a backbone declared or a
 * person confirmed (and those since imported).
 *
 * What it used to do (until 2026-10-15): `confidence` was
 * `mapping_confidence != null ? Number(mapping_confidence) : 0`, so a filename
 * suggestion — stored with NULL because no confidence was measured — was
 * reported at confidence 0. The KPI's "N mapped" was
 * `a.state === 'mapped' || a.mapped !== ''`, i.e. every row carrying any
 * artifact kind: suggestions awaiting confirmation, the attachment bucket, the
 * md5 index and stylesheets.
 *
 * Real detector and real import route, on PGlite with the 20260512 tables.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const h = vi.hoisted(() => ({ pg: null as unknown as { query: (t: string, p?: unknown[]) => Promise<unknown> } }));
vi.mock('../../db', () => {
  const pool = { query: (text: string, params?: unknown[]) => h.pg.query(text, params) };
  return { pool, getPool: () => pool, db: {} };
});
// Confinement of sourcePath is pinned by tests/mdx-imports-routes.test.ts; this
// file is about what the aggregate reports over the stored rows.
vi.mock('../../utils/document-file-roots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/document-file-roots')>()),
  resolveDocumentPath: (p: string) => p,
}));

import importsRouter from '../mdx-imports';

const ORG = 99;
const USER = 777;
const MIGRATION = readFileSync(path.join(process.cwd(), 'migrations/20260512_legacy_imports.sql'), 'utf8');

let pg: PGlite;
const dir = mkdtempSync(path.join(tmpdir(), 'mdx-onboarding-'));

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

afterAll(async () => {
  await pg?.close();
  rmSync(dir, { recursive: true, force: true });
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

const US_REGIONAL = `<fda-regional>
  <leaf ID="L1" operation="new" xlink:href="m1/us/1-1/cover-letter.pdf"><title>Cover letter</title></leaf>
  <leaf ID="L2" operation="new" xlink:href="m1/us/1-2/application-form.pdf"><title>Application form</title></leaf>
</fda-regional>`;

interface AggregateArtifact { legacy: string; confidence: number | null; state: string }

describe('GET /api/mdx/onboarding/:tenantId — what the aggregate says about mappings', () => {
  it('reports no confidence for an unmeasured placement and counts only declared, confirmed or imported files as mapped', async () => {
    const zip = new JSZip();
    for (const [entry, body] of Object.entries({
      'm1/us/us-regional.xml': US_REGIONAL,
      'm1/us/1-1/cover-letter.pdf': 'letter',
      'm1/us/1-2/application-form.pdf': 'form',
      'm5/53-clin-stud-rep/protocol-amendment-2.pdf': 'amendment',
      'notes.txt': 'n',
      'util/index-md5.txt': 'md5',
      'util/style/ectd-2-0.xsl': '<xsl/>',
    })) zip.file(entry, body);
    const archive = path.join(dir, 'ectd.zip');
    writeFileSync(archive, await zip.generateAsync({ type: 'nodebuffer' }));

    const started = await request(app()).post('/api/mdx/imports').send({ sourcePath: archive });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    // Approve's own write to a materialized file row (POST /imports/:id/approve), applied directly.
    await pg.query(
      `UPDATE import_job_files SET status = 'imported', artifact_id = 501
        WHERE import_job_id = $1 AND relative_path = 'm1/us/1-2/application-form.pdf'`,
      [Number(started.body.data.id)],
    );

    const res = await request(app()).get(`/api/mdx/onboarding/${ORG}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const artifacts = new Map((res.body.data.artifacts as AggregateArtifact[]).map((a) => [a.legacy, a]));

    expect(artifacts.get('protocol-amendment-2.pdf')).toMatchObject({ state: 'suggested' });
    expect(artifacts.get('protocol-amendment-2.pdf')?.confidence, 'an unmeasured placement was reported at confidence 0').toBeNull();
    expect(artifacts.get('notes.txt')?.confidence, 'an unmatched file was reported at confidence 0').toBeNull();
    expect(artifacts.get('cover-letter.pdf')).toMatchObject({ state: 'mapped', confidence: 1 });

    expect(
      res.body.data.kpis[0].meta,
      'suggestions, the attachment bucket, the md5 index and stylesheets were counted as mapped',
    ).toBe('2 mapped');
  });
});
