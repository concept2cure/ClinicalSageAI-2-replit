/**
 * File into Vault from the data room: each source on its own (VR-11, row D2).
 *
 * The PostgreSQL suite (tests/db/vault-data-room-file.dbtest.ts) files real
 * bytes through the real ingest. Here, the cases a database cannot stage:
 *   - the scanner unavailable (503) on the second source does not undo the
 *     first, and an unexpected failure on one source is that source's refusal;
 *   - a viewer is refused before any source is read;
 *   - there is ONE upload-to-Vault orchestration: the only server module that
 *     both loads an upload and admits it is vault-file-upload-to-vault.ts, and
 *     AnA's tool and the data room call it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
/** The title of the document a data-room file is checked in to (its head), not the file's derived title. */
const HEAD_TITLE = 'Stability protocol';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query, connect: vi.fn() } }));

const { readSourceUploads } = vi.hoisted(() => ({ readSourceUploads: vi.fn() }));
vi.mock('../../services/clinical-regulatory-evidence/evidence-spine.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/clinical-regulatory-evidence/evidence-spine.service.js')>()),
  readSourceUploads,
}));

const { fileUploadIntoVault } = vi.hoisted(() => ({ fileUploadIntoVault: vi.fn() }));
vi.mock('../../services/vault/vault-file-upload-to-vault.js', () => ({ fileUploadIntoVault }));

import createProjectVaultRoutes from '../c2c/project-vault';

function app(role: string) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { userRole: role, user: { organizationId: 7, id: 3, role } });
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const source = (id: number) => ({
  id, organizationId: 7, sourceType: 'client_document', clientProgramId: PROGRAM, isCurrent: true,
  title: `Report ${id}.pdf`, checksum: `${id}`.repeat(64).slice(0, 64), fileUploadId: `file_1_${id}`,
});

const filed = (id: string) => ({
  ok: true,
  document: { id, version: '1.0' },
  filing: { placementStatus: 'suggested', folderLabel: 'Module 4', needsReview: false },
});

const post = (role: string, sourceIds: number[]) =>
  request(app(role)).post(`/api/c2c/project-vault/${PROGRAM}/data-room/file`).send({ sourceIds });

beforeEach(() => {
  vi.clearAllMocks();
  query.mockImplementation(async (sql: string) => {
    if (/SELECT document_title FROM vault\.documents/.test(String(sql))) return { rows: [{ document_title: HEAD_TITLE }] };
    return /FROM regulatory_programs WHERE id = \$1/.test(String(sql)) ? { rows: [{ id: PROGRAM }] } : { rows: [] };
  });
  readSourceUploads.mockResolvedValue([source(1), source(2)]);
});

describe('each source is filed on its own', () => {
  it('a 503 from the scanner on the second source leaves the first filed, and the batch is not complete', async () => {
    fileUploadIntoVault
      .mockResolvedValueOnce(filed('doc-1'))
      .mockResolvedValueOnce({
        ok: false, status: 503, code: 'FILE_SCAN_UNAVAILABLE',
        message: 'File scanning is temporarily unavailable; upload rejected',
      });
    const res = await post('admin', [1, 2]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      complete: false,
      items: [
        { sourceId: 1, outcome: 'filed', documentId: 'doc-1', version: '1.0', placementStatus: 'suggested', folderLabel: 'Module 4', needsReview: false },
        { sourceId: 2, outcome: 'refused', code: 'FILE_SCAN_UNAVAILABLE', message: 'File scanning is temporarily unavailable; upload rejected' },
      ],
    });
    // Each source with its own capture checksum, and no folder: never confirmed by a machine.
    expect(fileUploadIntoVault.mock.calls.map(([a]) => [a.fileId, a.capturedChecksum, a.folderId])).toEqual([
      ['file_1_1', source(1).checksum, undefined],
      ['file_1_2', source(2).checksum, undefined],
    ]);
  });

  it('an unexpected failure on one source is that source’s refusal, not the batch’s', async () => {
    fileUploadIntoVault.mockRejectedValueOnce(new Error('storage offline')).mockResolvedValueOnce(filed('doc-2'));
    const res = await post('admin', [1, 2]);
    expect(res.body.items.map((i: { outcome: string; code?: string }) => i.code ?? i.outcome)).toEqual(['FILING_FAILED', 'filed']);
    expect(res.body.complete).toBe(false);
    expect(res.body.items[0].message).toBe('This file could not be filed. Nothing was recorded for it.');
  });

  it('every source filed is complete', async () => {
    fileUploadIntoVault.mockResolvedValueOnce(filed('doc-1')).mockResolvedValueOnce(filed('doc-2'));
    expect((await post('admin', [1, 2])).body.complete).toBe(true);
  });
});

describe('a revised file is offered as the next version of the document it is named for (QA-2026-10-08)', () => {
  const HEAD = '44444444-4444-4444-8444-444444444444';
  const CONFLICT = 'A different document is already recorded at code "Protocol-Stability.pdf" version "1.0" for this program. Nothing was changed. Add it as a new version of that document instead of replacing the recorded one.';

  it('a source the person names a version of is filed as a check-in to that document, and no other is', async () => {
    fileUploadIntoVault.mockResolvedValueOnce(filed('doc-1')).mockResolvedValueOnce(filed('doc-2'));
    const res = await request(app('admin'))
      .post(`/api/c2c/project-vault/${PROGRAM}/data-room/file`)
      .send({ sourceIds: [1, 2], newVersionOf: { '1': HEAD } });
    expect(res.status).toBe(200);
    expect(fileUploadIntoVault.mock.calls.map(([a]) => a.supersedesDocumentId)).toEqual([HEAD, undefined]);
  });

  it('a file checked in as a new version keeps its document’s title; a new document keeps the one derived from its name', async () => {
    fileUploadIntoVault.mockResolvedValueOnce(filed('doc-1')).mockResolvedValueOnce(filed('doc-2'));
    await request(app('admin'))
      .post(`/api/c2c/project-vault/${PROGRAM}/data-room/file`)
      .send({ sourceIds: [1, 2], newVersionOf: { '1': HEAD } });
    const [checkIn, newDocument] = fileUploadIntoVault.mock.calls.map(([a]) => a);
    // source(1) is titled "Report 1.pdf": a check-in takes the head's title, a new document the derived one.
    expect(checkIn).toMatchObject({ supersedesDocumentId: HEAD, documentTitle: HEAD_TITLE });
    expect(newDocument).toMatchObject({ supersedesDocumentId: undefined, documentTitle: 'Report 2' });
  });

  it('a refused conflict says which current version it can be added to', async () => {
    fileUploadIntoVault
      .mockResolvedValueOnce({ ok: false, status: 409, code: 'VERSION_CONTENT_CONFLICT', message: CONFLICT, headDocumentId: HEAD, headVersion: '2.0' })
      .mockResolvedValueOnce(filed('doc-2'));
    const res = await post('admin', [1, 2]);
    expect(res.body.items[0]).toEqual({
      sourceId: 1, outcome: 'refused', code: 'VERSION_CONTENT_CONFLICT', message: CONFLICT, headDocumentId: HEAD, headVersion: '2.0',
    });
    expect(res.body.complete).toBe(false);
  });

  it('a refusal with no version to offer carries no offer', async () => {
    fileUploadIntoVault.mockResolvedValueOnce({ ok: false, status: 409, code: 'SOURCE_BYTES_CHANGED', message: 'Capture the file again.' })
      .mockResolvedValueOnce(filed('doc-2'));
    const res = await post('admin', [1, 2]);
    expect(res.body.items[0]).not.toHaveProperty('headDocumentId');
  });
});

describe('the role is checked first', () => {
  it('a viewer is refused 403 before any source is read', async () => {
    const res = await post('viewer', [1, 2]);
    expect(res.status).toBe(403);
    expect(readSourceUploads).not.toHaveBeenCalled();
    expect(fileUploadIntoVault).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('one upload-to-Vault orchestration', () => {
  const root = path.resolve(__dirname, '../..');

  async function serverFiles(dir: string, out: string[] = []): Promise<string[]> {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') await serverFiles(p, out);
      } else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
        out.push(p);
      }
    }
    return out;
  }

  it('only vault-file-upload-to-vault.ts both loads an upload and admits it', async () => {
    const both: string[] = [];
    for (const f of await serverFiles(root)) {
      const text = await fs.readFile(f, 'utf8');
      if (/\bloadUploadedFile\s*\(/.test(text) && /\bingestVaultDocument\s*\(/.test(text)) {
        both.push(path.relative(root, f).split(path.sep).join('/'));
      }
    }
    expect(both).toEqual(['services/vault/vault-file-upload-to-vault.ts']);
  });

  it('AnA’s filing tool and the data room both call it', async () => {
    for (const f of ['services/ana/document-catalog-tools.ts', 'services/vault/vault-data-room-filing.ts']) {
      expect(await fs.readFile(path.join(root, f), 'utf8'), f).toMatch(/\bfileUploadIntoVault\s*\(/);
    }
  });
});
