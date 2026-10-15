/**
 * The archive's structure files (the regional backbone XML, index.xml, the md5
 * index, DTDs and stylesheets) are stored as recognized by their path, with no
 * confidence figure.
 *
 * What the import used to do (until 2026-10-15): the detector gave every
 * structure file mappingSource 'backbone_xml', so POST /api/mdx/imports stored
 * each one as declared by the backbone at mapping_confidence 1.00, beside the
 * leaves the backbone really does declare. Nothing declares them: the detector
 * recognizes them by a fixed path pattern, and stores them 'skipped'.
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
// Confinement of sourcePath is pinned by tests/mdx-imports-routes.test.ts; this
// file is about what the detector's output is stored as.
vi.mock('../../utils/document-file-roots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/document-file-roots')>()),
  resolveDocumentPath: (p: string) => p,
}));

import importsRouter from '../mdx-imports';
import { detectArchive } from '../../services/legacy-importer/detector';

const ORG = 99;
const USER = 777;
const MIGRATION = readFileSync(path.join(process.cwd(), 'migrations/20260512_legacy_imports.sql'), 'utf8');

let pg: PGlite;
const dir = mkdtempSync(path.join(tmpdir(), 'mdx-imports-structure-'));

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

const STRUCTURE = ['m1/us/us-regional.xml', 'index.xml', 'util/index-md5.txt', 'util/dtd/us-regional.dtd', 'util/style/ectd-2-0.xsl'];

async function ectdArchive(): Promise<string> {
  const zip = new JSZip();
  zip.file('m1/us/us-regional.xml',
    `<fda-regional><leaf ID="L1" operation="new" xlink:href="m1/us/1-1/cover-letter.pdf"><title>Cover letter</title></leaf></fda-regional>`);
  zip.file('m1/us/1-1/cover-letter.pdf', 'letter');
  zip.file('index.xml', '<ectd/>');
  zip.file('util/index-md5.txt', 'md5');
  zip.file('util/dtd/us-regional.dtd', '<!ELEMENT x ANY>');
  zip.file('util/style/ectd-2-0.xsl', '<xsl/>');
  const file = path.join(dir, 'ectd.zip');
  writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
  return file;
}

interface StoredFile { relative_path: string; status: string; mapping_confidence: string | null; mapping_source: string }

describe('POST /api/mdx/imports — the archive\'s structure files', () => {
  it('are stored as recognized by path, with no confidence, beside the leaf the backbone declares', async () => {
    const archive = await ectdArchive();
    const res = await request(app()).post('/api/mdx/imports').send({ sourcePath: archive });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { rows } = await pg.query<StoredFile>(
      `SELECT relative_path, status, mapping_confidence::text AS mapping_confidence, mapping_source
         FROM import_job_files WHERE import_job_id = $1`,
      [Number(res.body.data.id)],
    );
    const files = new Map(rows.map((r) => [r.relative_path, r]));

    for (const p of STRUCTURE) {
      expect(files.get(p)?.mapping_source, `${p} was stored as declared by the backbone`).toBe('structure_path');
      expect(files.get(p)?.mapping_confidence, `${p} was stored with a confidence nobody measured`).toBeNull();
      expect(files.get(p)?.status).toBe('skipped');
    }
    expect(files.get('m1/us/1-1/cover-letter.pdf')).toMatchObject({
      status: 'mapped', mapping_source: 'backbone_xml', mapping_confidence: '1.00',
    });
  });

  it('come out of the detector as recognized by path, not declared', async () => {
    const { files } = await detectArchive(await ectdArchive());
    const basis = Object.fromEntries(files.map((f) => [f.relativePath, `${f.mappingSource} / ${f.reviewStatus}`]));
    expect(basis, 'a structure file was reported as declared by the backbone').toEqual({
      ...Object.fromEntries(STRUCTURE.map((p) => [p, 'structure_path / skipped'])),
      'm1/us/1-1/cover-letter.pdf': 'backbone_xml / mapped',
    });
  });
});
