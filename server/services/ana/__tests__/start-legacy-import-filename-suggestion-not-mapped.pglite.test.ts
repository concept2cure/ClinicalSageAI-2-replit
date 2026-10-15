/**
 * AnA's start_legacy_import stores what the detector found exactly as
 * POST /api/mdx/imports does, and tells the model how many placements await a
 * person's confirmation.
 *
 * What the handler used to do (until 2026-10-15): it kept its own copy of the
 * import_job_files INSERT and derived the status itself —
 * `detectedKind === 'leaf' && mappingConfidence >= 0.5 ? 'mapped' : leaf ? 'pending' : 'skipped'`.
 * On the detector's former per-regex weights that stored
 * protocol_deviation_log.xlsx 'mapped' to CTD 5.3.5.1 for approve_import to
 * materialise; once the detector reported only whether the backbone declared a
 * placement, the same file was stored 'pending' at mapping_confidence 0.00 — a
 * figure nobody measured — with no record of the rule that matched. The job's
 * skipped_count was never set, the reply said "(0 mapped, 0 errors). Review then
 * call approve_import." with no word that two placements awaited confirmation,
 * and the tool description sent the model looking for "low-confidence rows".
 *
 * Real detector, real zip under the tenant's upload prefix (a path both entry
 * points accept), real handler and real route, on PGlite with the 20260512 tables.
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
// Both tools are confirm-class writes; the person confirming is an editor in the organization.
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import { START_LEGACY_IMPORT, OVERRIDE_IMPORT_MAPPING } from '../legacy-import-tool-defs';
import importsRouter from '../../../routes/mdx-imports';

const ORG = 8461;
const USER = 8462;
const CTX: ToolContext = { organizationId: ORG, userId: USER, humanConfirmed: true };
const MIGRATION = readFileSync(path.join(process.cwd(), 'migrations/20260512_legacy_imports.sql'), 'utf8');
const UPLOADS = path.resolve('uploads', `org-${ORG}`, randomUUID());

const US_REGIONAL = `<fda-regional><leaf ID="L1" operation="new" xlink:href="m1/us/1-1/cover-letter.pdf"><title>Cover letter</title></leaf></fda-regional>`;

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

async function zipOf(name: string, entries: Record<string, string>): Promise<string> {
  const zip = new JSZip();
  for (const [entry, body] of Object.entries(entries)) zip.file(entry, body);
  const file = path.join(UPLOADS, name);
  writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
  return file;
}

function tool(name: string) {
  const handler = getToolHandler(name);
  if (!handler) throw new Error(`${name} is not registered`);
  return handler;
}

interface AnaImportResult {
  ok?: boolean; error?: string; jobId: number; mappedCount: number;
  suggestedCount?: number; errorCount: number; message: string;
}
async function startViaAna(sourcePath: string): Promise<AnaImportResult> {
  const out = JSON.parse(await tool('start_legacy_import')({ source_path: sourcePath }, CTX)) as AnaImportResult;
  expect(out.ok, JSON.stringify(out)).toBe(true);
  return out;
}

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
async function startViaRoute(sourcePath: string): Promise<number> {
  const res = await request(app()).post('/api/mdx/imports').send({ sourcePath });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return Number(res.body.data.id);
}

interface StoredFile {
  relative_path: string; file_name: string; size_bytes: string; sha256: string;
  detected_kind: string; mapped_ctd_section: string | null; mapped_section_key: string | null;
  mapped_artifact_kind: string | null; mapping_confidence: string | null; mapping_source: string;
  status: string; metadata: Record<string, unknown> | null;
}
async function storedFiles(jobId: number): Promise<StoredFile[]> {
  const { rows } = await pg.query<StoredFile>(
    `SELECT relative_path, file_name, size_bytes::text AS size_bytes, sha256, detected_kind,
            mapped_ctd_section, mapped_section_key, mapped_artifact_kind,
            mapping_confidence::text AS mapping_confidence, mapping_source, status, metadata
       FROM import_job_files WHERE import_job_id = $1 ORDER BY relative_path`,
    [jobId],
  );
  return rows;
}
const byPath = (rows: StoredFile[]) => new Map(rows.map((r) => [r.relative_path, r]));

async function jobHeader(jobId: number) {
  const { rows } = await pg.query(
    `SELECT status, detected_format, detected_region, file_count, mapped_count, skipped_count, error_count
       FROM import_jobs WHERE id = $1`,
    [jobId],
  );
  return rows[0];
}

describe('start_legacy_import — what a detected file is stored as', () => {
  it('stores a filename-pattern placement as an unconfirmed suggestion with no confidence figure, and says how many need confirming', async () => {
    const archive = await zipOf('raw-folder.zip', {
      'protocol_deviation_log.xlsx': 'deviation log',
      'software_license.pdf': 'licence text',
    });
    const out = await startViaAna(archive);

    const files = byPath(await storedFiles(out.jobId));
    const protocol = files.get('protocol_deviation_log.xlsx');
    expect(protocol?.status, 'a filename match was not stored as a suggestion').toBe('suggested');
    expect(protocol?.mapping_confidence, 'a confidence figure was stored for a placement nobody measured').toBeNull();
    expect(protocol?.metadata, 'the rule that suggested the placement was not recorded').toEqual({ mappingRuleId: 'filename.protocol' });
    expect(files.get('software_license.pdf')).toMatchObject({
      status: 'suggested', mapping_confidence: null, metadata: { mappingRuleId: 'filename.software' },
    });

    expect(out.mappedCount, 'nothing in a raw folder is declared, so nothing is mapped').toBe(0);
    expect(out.suggestedCount, 'the reply did not count the placements awaiting confirmation').toBe(2);
    expect(out.message).toMatch(/2 suggested/);
    expect(out.message).toMatch(/override_import_mapping/);
  });

  it('maps only the leaves the backbone declares, and records the skipped files on the job', async () => {
    const archive = await zipOf('ectd.zip', {
      'm1/us/us-regional.xml': US_REGIONAL,
      'm1/us/1-1/cover-letter.pdf': 'letter',
      'util/dtd/us-regional.dtd': '<!ELEMENT x ANY>',
    });
    const out = await startViaAna(archive);

    const files = byPath(await storedFiles(out.jobId));
    expect(files.get('m1/us/1-1/cover-letter.pdf')).toMatchObject({ status: 'mapped', mapping_confidence: '1.00', mapping_source: 'backbone_xml' });
    expect(files.get('m1/us/us-regional.xml')?.status).toBe('skipped');
    expect(files.get('util/dtd/us-regional.dtd')?.status).toBe('skipped');
    expect(out).toMatchObject({ mappedCount: 1, suggestedCount: 0 });
    expect(await jobHeader(out.jobId), 'the job header left skipped_count at its default').toMatchObject({ mapped_count: 1, skipped_count: 2 });
  });

  it('stores the same file rows and job counts as POST /api/mdx/imports for the same archive', async () => {
    const archive = await zipOf('mixed.zip', {
      'm1/us/us-regional.xml': US_REGIONAL,
      'm1/us/1-1/cover-letter.pdf': 'letter',
      'm5/53-clin-stud-rep/protocol-amendment-2.pdf': 'amendment',
      'notes.txt': 'n',
      'util/dtd/us-regional.dtd': '<!ELEMENT x ANY>',
    });
    const viaRoute = await startViaRoute(archive);
    const viaAna = (await startViaAna(archive)).jobId;

    expect(await storedFiles(viaAna), 'AnA stored a file differently from the REST import').toEqual(await storedFiles(viaRoute));
    expect(await jobHeader(viaAna)).toEqual(await jobHeader(viaRoute));
  });
});

describe('legacy-import tool definitions', () => {
  it("send the model to confirm or correct each 'suggested' row, not to look for low-confidence rows", () => {
    expect(START_LEGACY_IMPORT.description, 'no import row carries a confidence any more').not.toMatch(/low-confidence/i);
    expect(START_LEGACY_IMPORT.description).toMatch(/confirm \(status 'mapped'\) or correct each 'suggested' row/);
    expect(START_LEGACY_IMPORT.description).toMatch(/not imported until confirmed/);
  });

  it("override_import_mapping's description names the mapping_source its handler stores", async () => {
    const { jobId } = await startViaAna(await zipOf('confirm.zip', { 'protocol_deviation_log.xlsx': 'x' }));
    const { rows: [file] } = await pg.query<{ id: number }>(`SELECT id FROM import_job_files WHERE import_job_id = $1`, [jobId]);

    const out = JSON.parse(await tool('override_import_mapping')({ import_job_id: jobId, file_id: file.id, status: 'mapped' }, CTX));
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const { rows: [stored] } = await pg.query<{ status: string; mapping_source: string }>(
      `SELECT status, mapping_source FROM import_job_files WHERE id = $1`, [file.id],
    );
    expect(stored.status, 'a person-confirmed suggestion is mapped').toBe('mapped');
    expect(OVERRIDE_IMPORT_MAPPING.description).toContain(`mapping_source='${stored.mapping_source}'`);
  });
});
