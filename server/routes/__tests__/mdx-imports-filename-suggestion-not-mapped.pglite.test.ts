/**
 * POST /api/mdx/imports stores a filename-pattern placement as a suggestion,
 * not as a mapping.
 *
 * What it used to do: the INSERT computed the stored status in SQL —
 * `CASE WHEN $7 = 'leaf' AND $11 >= 0.5 THEN 'mapped'` — over the detector's
 * hard-coded per-regex "confidence" (0.70–0.85). So `protocol_deviation_log.xlsx`
 * was stored 'mapped' to CTD 5.3.5.1 at mapping_confidence 0.80, and
 * POST /imports/:id/approve (which materializes every 'mapped' row) turned it
 * into an artifact without anyone having looked. The job header's mapped_count
 * counted every file at >= 0.5, including the backbone XML and stylesheets.
 *
 * Real detector, real zip, real INSERT, on PGlite with the 20260512 tables.
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
// The archive is written to a temp dir. Confinement of sourcePath to the
// caller's upload prefix is pinned by tests/mdx-imports-routes.test.ts; this
// file is about what the detector's output is stored as.
vi.mock('../../utils/document-file-roots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/document-file-roots')>()),
  resolveDocumentPath: (p: string) => p,
}));

import importsRouter from '../mdx-imports';

const ORG = 99;
const USER = 777;
const MIGRATION = readFileSync(path.join(process.cwd(), 'migrations/20260512_legacy_imports.sql'), 'utf8');

let pg: PGlite;
const dir = mkdtempSync(path.join(tmpdir(), 'mdx-imports-'));

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

async function zipOf(name: string, entries: Record<string, string>): Promise<string> {
  const zip = new JSZip();
  for (const [entry, body] of Object.entries(entries)) zip.file(entry, body);
  const file = path.join(dir, name);
  writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
  return file;
}

interface StoredFile {
  relative_path: string;
  status: string;
  mapping_confidence: string | null;
  mapping_source: string;
  metadata: Record<string, unknown> | null;
}
async function storedFiles(jobId: number): Promise<Map<string, StoredFile>> {
  const { rows } = await pg.query<StoredFile>(
    `SELECT relative_path, status, mapping_confidence::text AS mapping_confidence, mapping_source, metadata
       FROM import_job_files WHERE import_job_id = $1`,
    [jobId],
  );
  return new Map(rows.map((r) => [r.relative_path, r]));
}

describe('POST /api/mdx/imports — what a detected file is stored as', () => {
  it('stores a filename-pattern placement as an unconfirmed suggestion with no confidence figure', async () => {
    const archive = await zipOf('raw-folder.zip', {
      'protocol_deviation_log.xlsx': 'deviation log',
      'software_license.pdf': 'licence text',
    });
    const res = await request(app()).post('/api/mdx/imports').send({ sourcePath: archive });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const jobId = Number(res.body.data.id);

    const files = await storedFiles(jobId);
    const protocol = files.get('protocol_deviation_log.xlsx');
    expect(protocol?.status, 'a filename match was stored as a confirmed mapping').toBe('suggested');
    expect(protocol?.mapping_confidence, 'a filename rule weight was stored as a confidence').toBeNull();
    expect(protocol?.mapping_source).toBe('filename_heuristic');
    expect(protocol?.metadata).toEqual({ mappingRuleId: 'filename.protocol' });
    expect(files.get('software_license.pdf')).toMatchObject({ status: 'suggested', mapping_confidence: null });

    expect(res.body.data.mapped_count, 'nothing in a raw folder is declared, so nothing is mapped').toBe(0);
  });

  it('maps only the leaves the backbone declares, and counts only those as mapped', async () => {
    const archive = await zipOf('ectd.zip', {
      'm1/us/us-regional.xml': `<fda-regional><leaf ID="L1" operation="new" xlink:href="m1/us/1-1/cover-letter.pdf"><title>Cover letter</title></leaf></fda-regional>`,
      'm1/us/1-1/cover-letter.pdf': 'letter',
      'util/dtd/us-regional.dtd': '<!ELEMENT x ANY>',
    });
    const res = await request(app()).post('/api/mdx/imports').send({ sourcePath: archive });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const files = await storedFiles(Number(res.body.data.id));
    expect(files.get('m1/us/1-1/cover-letter.pdf')).toMatchObject({ status: 'mapped', mapping_confidence: '1.00', mapping_source: 'backbone_xml' });
    expect(files.get('m1/us/us-regional.xml')?.status).toBe('skipped');
    expect(files.get('util/dtd/us-regional.dtd')?.status).toBe('skipped');
    expect(res.body.data.mapped_count, 'structure files were counted as mapped').toBe(1);
    expect(res.body.data.skipped_count).toBe(2);
  });
});
