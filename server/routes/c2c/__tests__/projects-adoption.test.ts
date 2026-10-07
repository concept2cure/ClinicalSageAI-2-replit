/** Adoption HTTP contract with the real canonical byte loader/source writer.
 * Query and filesystem doubles are not independent-connection concurrency proof.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request } from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn().mockResolvedValue({ rows: [] }),
  txQuery: vi.fn().mockResolvedValue({ rows: [] }),
  release: vi.fn(), readFile: vi.fn(), loader: vi.fn(), createSource: vi.fn(),
}));
const client = { query: mocks.txQuery, release: mocks.release };
vi.mock('../../../db.js', () => ({
  pool: { query: mocks.poolQuery, connect: async () => client },
  getPool: () => ({ query: mocks.poolQuery }),
}));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, promises: { ...actual.promises, readFile: mocks.readFile } };
});
vi.mock('../../../services/ana/uploaded-file-access.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../services/ana/uploaded-file-access')>();
  mocks.loader.mockImplementation(actual.loadUploadedFile);
  return { ...actual, loadUploadedFile: mocks.loader };
});
vi.mock('../../../services/clinical-regulatory-evidence/evidence-spine.service.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../services/clinical-regulatory-evidence/evidence-spine.service')>();
  mocks.createSource.mockImplementation(actual.createSource);
  return { ...actual, createSource: mocks.createSource };
});
vi.mock('../../../services/audit/chain.js', () => ({
  hashPayload: () => 'payload-hash-test',
  computeAuditChainSealed: async () => ({ sha256Chain: 'chain-test', hmacSeal: 'seal-test' }),
}));

import router from '../projects';

const PROGRAM = 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05';
const ORG = 7;
const LEAD = 3;
const FILE = 'file_adopt';
const BYTES = Buffer.from('original controlled study bytes');
const HASH = createHash('sha256').update(BYTES).digest('hex');
type UploadRow = {
  id: string; organization_id: number; original_name: string; mime_type: string;
  file_size: number; storage_path: string; checksum_sha256: string | null;
};
type Write = { kind: 'source' | 'audit'; row: Record<string, unknown> };
let upload: UploadRow;
let eligible: boolean;
let programExists: boolean;
let lockedProgramExists: boolean;
let lockedLead: number;
let duplicate: Record<string, unknown> | null;
let failWrite: 'source' | 'capture' | 'adopt' | null;
let staged: Write[];
let committed: Write[];
let finalPatch: Partial<UploadRow>;

function appAs(userId: number | null = LEAD, role = 'member', orgId: number | null = ORG) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const auth = req as Request & { organizationId?: number; userId?: number; userRole?: string };
    if (orgId !== null) auth.organizationId = orgId;
    if (userId !== null) auth.userId = userId;
    auth.userRole = role;
    next();
  });
  app.use('/api/c2c/projects', router);
  return app;
}
const adopt = (app = appAs(), program = PROGRAM, body: object = { fileUploadId: FILE }) =>
  request(app).post(`/api/c2c/projects/${program}/adopt`).send(body);
const sqlCalls = () => mocks.txQuery.mock.calls.map(call => String(call[0]));
const noCapture = () => {
  expect(mocks.createSource).not.toHaveBeenCalled();
  expect(committed).toEqual([]);
  expect(sqlCalls()).not.toContain('COMMIT');
  expect(sqlCalls()).toContain('ROLLBACK');
};

function stageSource(sql: string, params: unknown[]) {
  if (failWrite === 'source') throw new Error('source insert failed');
  const columns = /INSERT INTO cre_evidence_sources \(([^)]+)\)/.exec(sql)![1].split(',').map(column => column.trim());
  const row = { id: 41, ...Object.fromEntries(columns.map((column, index) => [column, params[index]])) };
  staged.push({ kind: 'source', row });
  return { rows: [row] };
}
function stageAudit(params: unknown[]) {
  const action = String(params[3]);
  if ((failWrite === 'capture' && action === 'data_room.capture') || (failWrite === 'adopt' && action === 'c2c.project.adopt')) throw new Error('audit insert failed');
  staged.push({ kind: 'audit', row: { action, params } });
  return { rows: [] };
}
function programRows(sql: string) {
  const locking = sql.includes('FOR UPDATE');
  return { rows: (locking ? lockedProgramExists : programExists) ? [{ lead_user_id: locking ? lockedLead : LEAD }] : [] };
}
function uploadRows(sql: string, params: unknown[]) {
  const current = sql.includes('FOR SHARE') ? { ...upload, ...finalPatch } : upload;
  return { rows: eligible && current.organization_id === Number(params[1]) ? [{ ...current }] : [] };
}
async function transactionQuery(sql: string, params: unknown[] = []) {
  if (sql === 'BEGIN') { staged = []; return { rows: [] }; }
  if (sql === 'COMMIT') { committed.push(...staged); staged = []; return { rows: [] }; }
  if (sql === 'ROLLBACK') { staged = []; return { rows: [] }; }
  // This unit fixture represents an ordinary upload with no recorded parent.
  // Actual audit/capture ancestry is exercised by the PGlite route suite.
  if (sql.startsWith('WITH rl_walk AS (WITH RECURSIVE rl_seed') && sql.includes('AS parent_files')) {
    return { rows: [{ invalid: false, withdrawn: false, parent_files: [], parent_sources: [] }], rowCount: 1 };
  }
  if (sql.includes('FROM regulatory_programs')) return programRows(sql);
  if (sql.includes('FROM file_uploads f')) return uploadRows(sql, params);
  if (sql.includes('FROM cre_evidence_sources')) return { rows: duplicate ? [duplicate] : [] };
  if (sql.includes('INSERT INTO cre_evidence_sources')) return stageSource(sql, params);
  if (sql.includes('INSERT INTO audit_logs')) return stageAudit(params);
  return { rows: [] };
}

beforeEach(() => {
  upload = { id: FILE, organization_id: ORG, original_name: 'study.txt', mime_type: 'text/plain', file_size: BYTES.length, storage_path: `uploads/org-${ORG}/${FILE}`, checksum_sha256: HASH };
  eligible = true; programExists = true; lockedProgramExists = true; lockedLead = LEAD;
  duplicate = null; failWrite = null; staged = []; committed = []; finalPatch = {};
  mocks.txQuery.mockReset(); mocks.txQuery.mockImplementation(transactionQuery);
  mocks.poolQuery.mockReset(); mocks.poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM file_uploads f')) return { rows: eligible ? [{ ...upload }] : [] };
    if (sql.includes('FROM cre_evidence_sources')) return { rows: duplicate ? [duplicate] : [] };
    return { rows: [] };
  });
  mocks.readFile.mockReset(); mocks.readFile.mockResolvedValue(BYTES);
  mocks.release.mockClear(); mocks.loader.mockClear(); mocks.createSource.mockClear();
  delete process.env.PROGRAM_AUTHZ_MODE;
});

describe('adoption verifies current owned bytes before capture', () => {
  it('loads bytes through the canonical reader, retains the original and captures pending extraction with paired audits', async () => {
    upload.file_size = 999;
    finalPatch = { original_name: 'current-study.txt', mime_type: 'text/markdown' };
    const res = await adopt();
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ adopted: true, sourceId: 41 });
    expect(mocks.loader).toHaveBeenCalledWith(FILE, ORG);
    expect(mocks.readFile).toHaveBeenCalledWith(path.resolve(process.cwd(), upload.storage_path));
    expect(mocks.createSource.mock.calls[0][2]).toBe(client);
    expect(committed.filter(write => write.kind === 'source')[0].row).toMatchObject({ checksum: HASH, extraction_status: 'pending', ingestion_status: 'ingested', created_by: LEAD });
    const source = committed.find(write => write.kind === 'source')!.row;
    expect(source.title).toBe('current-study.txt');
    expect(JSON.parse(String(source.metadata))).toEqual({ originalName: 'current-study.txt', mimeType: 'text/markdown', fileSize: BYTES.length });
    expect(committed.filter(write => write.kind === 'audit').map(write => write.row.action)).toEqual(['data_room.capture', 'c2c.project.adopt']);
    expect(sqlCalls().some(sql => /(?:UPDATE|DELETE FROM) file_uploads/.test(sql))).toBe(false);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it.each([
    ['altered bytes', 409, 'UPLOAD_INTEGRITY_FAILED', () => mocks.readFile.mockResolvedValue(Buffer.from('altered'))],
    ['missing bytes', 410, 'UPLOAD_BYTES_MISSING', () => mocks.readFile.mockRejectedValue(new Error('ENOENT /private/storage'))],
    ['foreign path', 404, 'UPLOAD_NOT_FOUND', () => { upload.storage_path = 'uploads/org-9/file_adopt'; }],
    ['foreign organization', 404, 'FILE_NOT_FOUND', () => { upload.organization_id = 9; }],
    ['withdrawn upload', 404, 'FILE_NOT_FOUND', () => { eligible = false; }],
  ] as const)('refuses %s without capture or unsafe storage details', async (_label, status, code, configure) => {
    configure();
    const res = await adopt();
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(JSON.stringify(res.body)).not.toMatch(/uploads\/|private\/storage|ENOENT|recordedSha256|actualSha256/);
    noCapture();
  });

  it('keeps checksum-less identity unknown instead of trusting recomputed bytes', async () => {
    upload.checksum_sha256 = null;
    const res = await adopt();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FILE_IDENTITY_UNKNOWN');
    expect(mocks.loader).not.toHaveBeenCalled();
    noCapture();
  });
});

describe('adoption protects the database handoff', () => {
  it('locks the canonical program before row/write locks and reserves impact tables before identity reads', async () => {
    await adopt(appAs(), PROGRAM.toUpperCase());
    const calls = sqlCalls();
    const advisory = calls.findIndex(sql => sql.includes('pg_advisory_xact_lock'));
    const programLock = calls.findIndex(sql => sql.includes('FROM regulatory_programs') && sql.includes('FOR UPDATE'));
    const reservation = calls.findIndex(sql => sql.includes('LOCK TABLE public.cre_evidence_sources, public.file_uploads IN ROW EXCLUSIVE MODE'));
    const firstFileRead = calls.findIndex(sql => sql.includes('FROM file_uploads f'));
    const finalRead = calls.findIndex(sql => sql.includes('FROM file_uploads f') && sql.includes('FOR SHARE OF f'));
    const sourceWrite = calls.findIndex(sql => sql.includes('INSERT INTO cre_evidence_sources'));
    expect(advisory).toBeGreaterThan(calls.indexOf('BEGIN'));
    expect(programLock).toBeGreaterThan(advisory);
    expect(reservation).toBeGreaterThan(programLock);
    expect(firstFileRead).toBeGreaterThan(reservation);
    expect(finalRead).toBeGreaterThan(firstFileRead);
    expect(sourceWrite).toBeGreaterThan(finalRead);
    const lock = mocks.txQuery.mock.calls[advisory];
    expect(lock[1]).toEqual([`${ORG}:${PROGRAM}`]);
    expect(calls).toContain("SET LOCAL lock_timeout = '5s'");
    expect(mocks.poolQuery.mock.calls.some(call => String(call[0]).includes('FROM cre_evidence_sources'))).toBe(false);
  });

  it.each([
    ['path changed', { storage_path: 'uploads/org-7/changed' }, false],
    ['checksum changed', { checksum_sha256: 'f'.repeat(64) }, false],
    ['checksum lost', { checksum_sha256: null }, false],
    ['eligibility withdrawn', {}, true],
  ] as const)('rejects %s at the final locked recheck', async (_label, patch, withdraw) => {
    mocks.readFile.mockImplementation(async () => { finalPatch = patch; if (withdraw) eligible = false; return BYTES; });
    const res = await adopt();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FILE_CHANGED');
    noCapture();
  });

  it.each(['source', 'capture', 'adopt'] as const)('rolls back source and both audit writes when %s fails', async failure => {
    failWrite = failure;
    const res = await adopt();
    expect(res.status).toBe(500);
    expect(mocks.createSource).toHaveBeenCalledOnce();
    expect(committed).toEqual([]);
    expect(staged).toEqual([]);
    expect(sqlCalls()).toContain('ROLLBACK');
    expect(sqlCalls()).not.toContain('COMMIT');
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});

describe('adoption preserves authorization and historical idempotency', () => {
  it('duplicate adoption still verifies bytes and writes no source or audit, including a historical source', async () => {
    duplicate = { id: 16, checksum: HASH, source_type: 'client_document', client_program_id: PROGRAM, is_current: false };
    const res = await adopt();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ adopted: false, sourceId: 16 });
    expect(mocks.loader).toHaveBeenCalledWith(FILE, ORG);
    noCapture();
  });

  it('an altered duplicate is not reported successfully adopted or already available', async () => {
    duplicate = { id: 16, checksum: HASH };
    mocks.readFile.mockResolvedValue(Buffer.from('altered'));
    const res = await adopt();
    expect(res.status).toBe(409);
    noCapture();
  });

  it('denies a non-lead member before bytes and refuses foreign program identity', async () => {
    expect((await adopt(appAs(99))).status).toBe(403);
    expect(mocks.loader).not.toHaveBeenCalled();
    noCapture();
    programExists = false; lockedProgramExists = false;
    expect((await adopt()).status).toBe(404);
  });

  it('rechecks authorization after the advisory lock and refuses a disappeared project', async () => {
    lockedLead = 99;
    expect((await adopt()).status).toBe(403);
    expect(mocks.loader).not.toHaveBeenCalled();
    noCapture();
    lockedProgramExists = false;
    expect((await adopt()).status).toBe(404);
  });

  it('allows an organization manager under the existing mutation policy', async () => {
    expect((await adopt(appAs(99, 'admin'))).status).toBe(201);
  });

  it('rejects missing auth, malformed project and missing file identity before a transaction', async () => {
    expect((await adopt(appAs(null))).status).toBe(403);
    expect((await adopt(appAs(), 'not-a-program')).status).toBe(404);
    expect((await adopt(appAs(), PROGRAM, {})).status).toBe(400);
    expect(mocks.txQuery).not.toHaveBeenCalled();
  });
});
