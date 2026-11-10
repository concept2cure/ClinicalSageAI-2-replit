/**
 * GET /api/c2c/project-vault/:id/documents/:documentId/download?rendition=pdf
 * — the PDF rendition of one Vault version (P-107 item 3).
 *
 * The Vault's viewer frames a PDF and downloads anything else, so a Word
 * version could not be read in the Vault. A rendition is a PDF made from the
 * version's bytes through the existing converter (services/pdf-converter.ts),
 * for reading. It is a copy, never the record.
 *
 * It is reached through the source's own download handler, after every check
 * that handler makes, so what this pins is:
 *   - the response is the rendition and names the source SHA-256 it was made
 *     from, and its own;
 *   - every refusal of the source is the same refusal here, and nothing is
 *     converted for it;
 *   - a PDF source gets none; a file the converter does not convert, a Word
 *     file that links outside itself, a missing converter, a failed conversion
 *     and a busy converter are each said as that; the source still downloads;
 *   - viewing a rendition is recorded as the source download is, before a byte
 *     leaves, and refused when it cannot be recorded;
 *   - nothing is stored and no Vault record is written.
 *
 * The harness is vault-download.test.ts's, with the converter stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';

const { query, readFile, requestQuery, storageGet, storagePut, convert } = vi.hoisted(() => ({
  query: vi.fn(), readFile: vi.fn(), requestQuery: vi.fn(), storageGet: vi.fn(), storagePut: vi.fn(), convert: vi.fn(),
}));
vi.mock('../../db.js', () => ({ pool: { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) } }));
vi.mock('node:fs', async (io) => {
  const actual = await io<typeof import('node:fs')>();
  return { ...actual, promises: { ...actual.promises, readFile } };
});
vi.mock('../../services/storage/index.js', () => {
  const provider = { name: 'local', get: storageGet, put: storagePut, delete: vi.fn(), list: vi.fn(async () => []) };
  return { getStorageProvider: () => provider, getStorageProviderFor: () => provider };
});
vi.mock('../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('../c2c/__tests__/support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});
vi.mock('../../services/pdf-converter', async (original) => ({
  ...(await original<typeof import('../../services/pdf-converter')>()),
  convertDocxToPdf: convert,
}));

import createProjectVaultRoutes from '../c2c/project-vault';
import { clearSeats, seatMember, seatProgram } from '../c2c/__tests__/support/current-member';
import { ConversionCapacityError } from '../../services/conversion-slots';
import { externalRelationship, relationshipPart, wordPackage } from '../../services/vault/__tests__/_word-package-fixture';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const USER = 3;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const WORD = await wordPackage();
const LINKING_WORD = await wordPackage(relationshipPart(externalRelationship('image', 'http://169.254.169.254/latest/meta-data/x.png')));
const WORD_HASH = sha(WORD);
const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF = Buffer.from('%PDF-1.7\n% the rendition the converter made\n%%EOF\n');
const SOURCE_PDF = Buffer.from('%PDF-1.4\n% a version that is already a PDF\n%%EOF\n');
const WORKBOOK = Buffer.concat([ZIP, Buffer.from(' the bytes of a workbook')]);

function app(org: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: USER };
    (req as unknown as { dbClient: unknown }).dbClient = { query: requestQuery };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

/** The program is found (or not), then the document row (or not): vault-download.test.ts's store. */
function store(doc: Record<string, unknown> | null, programFound = true) {
  clearSeats();
  seatMember(7, USER, 'member');
  if (programFound) seatProgram(7, PROGRAM);
  requestQuery.mockImplementation(async (sql: string) =>
    /FROM vault\.documents/.test(sql) && doc ? { rows: [{ organization_id: doc.organization_id }] } : { rows: [] });
  query.mockImplementation(async (sql: string) => {
    if (/FROM vault\.documents/.test(sql)) return { rows: doc ? [doc] : [] };
    if (/SELECT\s+id\s+FROM\s+regulatory_programs/.test(sql)) return { rows: programFound ? [{ id: PROGRAM }] : [] };
    return { rows: [] };
  });
}

const DOC = (over: Record<string, unknown> = {}) => ({
  id: DOCUMENT, file_name: 'Protocol v3.docx', document_title: 'Protocol',
  mime_type: WORD_MIME, file_size: WORD.length,
  s3_key: `uploads/vault/${PROGRAM}/${WORD_HASH}.docx`, content_hash: WORD_HASH, organization_id: 7, ...over,
});

const source = (p = PROGRAM, d = DOCUMENT) => `/api/c2c/project-vault/${p}/documents/${d}/download`;
const rendition = (p = PROGRAM, d = DOCUMENT) => `${source(p, d)}?rendition=pdf`;
const auditInserts = () => query.mock.calls.filter((c) => /INSERT INTO audit_logs/i.test(String(c[0])));
/** The response body as bytes, whatever type it was served as. */
const bytesOf = (req: request.Test) => req.buffer(true).parse((res, done) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
});

beforeEach(() => {
  query.mockReset();
  requestQuery.mockReset();
  readFile.mockReset();
  readFile.mockResolvedValue(WORD);
  storageGet.mockReset();
  storagePut.mockReset();
  convert.mockReset();
  convert.mockImplementation(async () => ({ pdf: PDF, sha256: sha(PDF), backend: 'libreoffice', originalBytes: PDF.length }));
});

describe('the rendition of a Word version', () => {
  it('is a PDF made from the verified source bytes, naming the source SHA-256 and its own', async () => {
    store(DOC());
    const res = await bytesOf(request(app()).get(rendition()));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['x-vault-rendition']).toBe('pdf');
    expect(res.headers['x-rendition-source-sha256']).toBe(WORD_HASH);
    expect(res.headers['x-rendition-sha256']).toBe(sha(PDF));
    expect(res.headers['content-disposition']).toBe('attachment; filename="Protocol_v3.docx.rendition.pdf"');
    expect((res.body as Buffer).equals(PDF)).toBe(true);
    expect(convert).toHaveBeenCalledTimes(1);
    expect((convert.mock.calls[0][0] as Buffer).equals(WORD)).toBe(true);
  });

  it('does not carry the header that names the record: its bytes are not the version\'s', async () => {
    store(DOC());
    const res = await request(app()).get(rendition());
    expect(res.status).toBe(200);
    expect(res.headers['x-content-sha256']).toBeUndefined();
  });

  it('leaves the source download as it was: the Word file, under its recorded hash', async () => {
    store(DOC());
    const res = await bytesOf(request(app()).get(source()));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(WORD_MIME);
    expect(res.headers['x-content-sha256']).toBe(WORD_HASH);
    expect(res.headers['x-vault-rendition']).toBeUndefined();
    expect((res.body as Buffer).equals(WORD)).toBe(true);
    expect(convert).not.toHaveBeenCalled();
  });

  it('is made again from the stored bytes on every request, so it cannot outlast or drift from its source', async () => {
    store(DOC());
    await request(app()).get(rendition());
    await request(app()).get(rendition());
    expect(readFile).toHaveBeenCalledTimes(2);
    expect(convert).toHaveBeenCalledTimes(2);
  });
});

describe('a refused source is refused the same way, and nothing is converted', () => {
  const VERSION = 'fa9c1e40-0000-4000-8000-0000000000aa';
  const cases: Array<[string, () => { org?: number | null; p?: string; d?: string }]> = [
    ['no organization on the request', () => { store(DOC()); return { org: null }; }],
    ['a caller who is not a current member', () => { store(DOC()); clearSeats(); seatProgram(7, PROGRAM); return {}; }],
    ['a program that is not this organization\'s', () => { store(DOC(), false); return {}; }],
    ['a version under another project, or withheld by a data disposition (the lookup finds no row)', () => { store(null); return {}; }],
    ['a program id that is not a uuid', () => { store(DOC()); return { p: 'not-a-uuid' }; }],
    ['a version id that is not a uuid', () => { store(DOC()); return { d: 'nope' }; }],
    ['stored bytes that do not match the recorded hash', () => { store(DOC({ content_hash: 'f'.repeat(64) })); return {}; }],
    ['a record with no stored file', () => { store(DOC({ s3_key: null })); return {}; }],
    ['a stored file that is gone', () => {
      store(DOC()); readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); return {};
    }],
    ['a storage key outside the uploads root', () => { store(DOC({ s3_key: '../../etc/passwd' })); return {}; }],
    ['a provider that has no such version for this organization', () => {
      store(DOC({ storage_version_id: VERSION })); storageGet.mockResolvedValue(null); return {};
    }],
  ];

  it.each(cases)('%s', async (_what, arrange) => {
    const { org = 7, p = PROGRAM, d = DOCUMENT } = arrange();
    const asSource = await request(app(org)).get(source(p, d));
    const asRendition = await request(app(org)).get(rendition(p, d));
    expect(asSource.status).toBeGreaterThanOrEqual(400);
    expect(asRendition.status).toBe(asSource.status);
    expect(asRendition.body).toEqual(asSource.body);
    expect(asRendition.headers['x-vault-rendition']).toBeUndefined();
    expect(convert).not.toHaveBeenCalled();
    expect(auditInserts()).toHaveLength(0);
  });

  it('looks the version up with the source\'s own statement: project, organization and data disposition', async () => {
    store(DOC());
    await request(app()).get(source());
    await request(app()).get(rendition());
    const lookups = query.mock.calls.filter(([sql]) => /FROM vault\.documents/.test(String(sql)));
    expect(lookups).toHaveLength(2);
    expect(lookups[1][0]).toBe(lookups[0][0]);
    expect(lookups[1][1]).toEqual([DOCUMENT, PROGRAM, 7]);
    expect(String(lookups[1][0])).toMatch(/document_data_dispositions/);
    expect(String(lookups[1][0])).toMatch(/d\.program_id = \$2/);
  });
});

describe('what gets no rendition says why, and the source still downloads', () => {
  it('a PDF source needs no rendition and gets none', async () => {
    store(DOC({ file_name: 'CSR-201.pdf', mime_type: 'application/pdf', content_hash: sha(SOURCE_PDF) }));
    readFile.mockResolvedValue(SOURCE_PDF);
    const res = await request(app()).get(rendition());
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: 'RENDITION_NOT_NEEDED', message: expect.stringMatching(/is a PDF/) });
    expect(convert).not.toHaveBeenCalled();
    expect(auditInserts()).toHaveLength(0);

    const asSource = await bytesOf(request(app()).get(source()));
    expect(asSource.status).toBe(200);
    expect((asSource.body as Buffer).equals(SOURCE_PDF)).toBe(true);
  });

  it('a workbook is said to be a file the converter does not convert', async () => {
    store(DOC({ file_name: 'Stability data.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content_hash: sha(WORKBOOK) }));
    readFile.mockResolvedValue(WORKBOOK);
    const res = await request(app()).get(rendition());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('RENDITION_NOT_SUPPORTED');
    expect(res.body.message).toMatch(/Word document \(\.docx\)/);
    expect(convert).not.toHaveBeenCalled();
    expect(auditInserts()).toHaveLength(0);

    const asSource = await bytesOf(request(app()).get(source()));
    expect(asSource.status).toBe(200);
    expect((asSource.body as Buffer).equals(WORKBOOK)).toBe(true);
  });

  it('a Word file that links to content outside itself is not converted, and is said as that', async () => {
    store(DOC({ content_hash: sha(LINKING_WORD) }));
    readFile.mockResolvedValue(LINKING_WORD);
    const res = await request(app()).get(rendition());
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: 'RENDITION_LINKS_OUTSIDE_FILE', message: expect.stringMatching(/links to content outside the file/) });
    expect(convert).not.toHaveBeenCalled();
    expect(auditInserts()).toHaveLength(0);

    const asSource = await bytesOf(request(app()).get(source()));
    expect(asSource.status).toBe(200);
    expect((asSource.body as Buffer).equals(LINKING_WORD)).toBe(true);
  });

  it('a converter that is not installed is said as that, not as a PDF', async () => {
    store(DOC());
    convert.mockRejectedValue(Object.assign(new Error('spawn libreoffice ENOENT'), { code: 'ENOENT', syscall: 'spawn libreoffice' }));
    const res = await request(app()).get(rendition());
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, error: 'RENDITION_CONVERTER_UNAVAILABLE', message: expect.stringMatching(/no document converter installed/) });
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.text).not.toContain('%PDF');
    expect(auditInserts()).toHaveLength(0);

    const asSource = await request(app()).get(source());
    expect(asSource.status).toBe(200);
  });

  it.each([
    ['failed', () => convert.mockRejectedValue(new Error('LibreOffice exited with code 1. stderr tail: /tmp/pdf-conv-abc/in-1.docx'))],
    ['returned no bytes', () => convert.mockResolvedValue({ pdf: Buffer.alloc(0), sha256: sha(Buffer.alloc(0)), backend: 'libreoffice', originalBytes: 0 })],
    ['returned bytes that are not a PDF', () => convert.mockResolvedValue({ pdf: Buffer.from('<html>error</html>'), sha256: '0'.repeat(64), backend: 'libreoffice', originalBytes: 18 })],
  ])('a conversion that %s is said as that, and nothing is sent in place of the rendition', async (_what, arrange) => {
    store(DOC());
    arrange();
    const res = await request(app()).get(rendition());
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('RENDITION_FAILED');
    expect(res.body.message).not.toMatch(/tmp|LibreOffice|stderr/);
    expect(res.headers['x-vault-rendition']).toBeUndefined();
    expect(auditInserts()).toHaveLength(0);
  });

  it('a busy converter is answered as busy, with when to try again', async () => {
    store(DOC());
    convert.mockRejectedValue(new ConversionCapacityError('libreoffice', 120_000, 2));
    const res = await request(app()).get(rendition());
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('CONVERTER_BUSY');
    expect(res.headers['retry-after']).toBe('30');
    expect(auditInserts()).toHaveLength(0);
  });

  it('a rendition asked for in another format is refused, after the source\'s own checks', async () => {
    store(DOC());
    const res = await request(app()).get(`${source()}?rendition=docx`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('RENDITION_FORMAT_UNSUPPORTED');
    expect(convert).not.toHaveBeenCalled();

    store(null);
    expect((await request(app()).get(`${source()}?rendition=docx`)).status).toBe(404);
  });
});

describe('viewing a rendition is recorded as the source download is', () => {
  it('writes the download row for the version, with the source hash, before the rendition is sent', async () => {
    store(DOC());
    const res = await request(app()).get(rendition());
    expect(res.status).toBe(200);
    expect(res.headers['x-vault-rendition']).toBe('pdf');
    expect(auditInserts()).toHaveLength(1);
    const row = JSON.stringify(auditInserts()[0]);
    expect(row).toContain('vault.document.download');
    expect(row).toContain(DOCUMENT);
    expect(row).toContain(WORD_HASH);
    // The row says what left: the PDF rendition, under its own hash, and not the version's own bytes.
    expect(row).toContain('rendition');
    expect(row).toContain(String(res.headers['x-rendition-sha256']));
  });

  it("a source download's row names no rendition", async () => {
    store(DOC());
    const res = await request(app()).get(source());
    expect(res.status).toBe(200);
    expect(auditInserts()).toHaveLength(1);
    expect(JSON.stringify(auditInserts()[0])).not.toContain('rendition');
  });

  it('refuses the rendition when the row cannot be written, and sends nothing', async () => {
    store(DOC());
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/INSERT INTO audit_logs/i.test(String(sql))) throw new Error('audit store unavailable');
      return base(sql, params);
    });
    const res = await request(app()).get(rendition());
    // The rendition was made, and was not sent.
    expect(convert).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(res.body.message).toMatch(/Nothing was sent/);
    expect(res.text).not.toContain('%PDF');
    expect(res.headers['x-vault-rendition']).toBeUndefined();
  });
});

describe('a rendition is never kept, filed or sealed', () => {
  it('stores nothing and writes no Vault record: the only write is the audit row', async () => {
    store(DOC());
    const res = await request(app()).get(rendition());
    expect(res.status).toBe(200);
    expect(res.headers['x-vault-rendition']).toBe('pdf');
    expect(storagePut).not.toHaveBeenCalled();
    const writes = query.mock.calls.map(([sql]) => String(sql)).filter((sql) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql));
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.filter((sql) => !/audit_logs|audit_chain/i.test(sql))).toEqual([]);
    expect(writes.filter((sql) => /vault\./i.test(sql))).toEqual([]);
  });
});
