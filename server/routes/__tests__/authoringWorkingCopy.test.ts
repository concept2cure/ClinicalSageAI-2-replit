/**
 * POST /api/authoring/docs/:docId/working-copy — pull a draft down, marked.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md §4.5, slice 7. The founder, 2026-10-07: "I
 * want to be able to pull them down and see them and work with them". A
 * document AnA has just built could not be downloaded: the export is a Part 11
 * filing artifact and refuses anything not frozen or approved (409).
 *
 * A working copy is a different act and must never pass for the export:
 *  - "DRAFT — uncontrolled copy" with id, version, status, time and downloader
 *    in the header and footer of every page (DOCX header/footer parts; the PDF
 *    engine's page banner);
 *  - no signature manifestation;
 *  - one WORKING_COPY audit row with the delivered bytes' hash, written before
 *    the bytes leave; when it cannot be written, 503 and nothing is sent;
 *  - no export-history row.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, renderHtmlToPdf } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  renderHtmlToPdf: vi.fn(async (_html: string, _opts?: unknown) => Buffer.from('%PDF-1.7 rendered')),
}));

vi.mock('../../db', () => {
  const client = { query: (...a: unknown[]) => mockQuery(...a), release: () => {} };
  return {
    pool: { query: (...a: unknown[]) => mockQuery(...a), connect: async () => client },
    getPool: () => ({ query: (...a: unknown[]) => mockQuery(...a), connect: async () => client }),
    query: (...a: unknown[]) => mockQuery(...a),
    db: {},
  };
});
vi.mock('../../export/renderers', () => ({
  renderHtmlToPdf,
  // The export renders through the tracked form (QA 2026-10-08, j4); same stub.
  renderHtmlToPdfTracked: async (html: string, opts?: unknown) => ({ buffer: await renderHtmlToPdf(html, opts as never), usedFallback: false }),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-export';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';
import { WORKING_COPY_SIGNATURE_STATEMENT } from '../../services/authoring/authoring-export';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: 'u1', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}
const app = () => {
  const a = express();
  a.use(express.json());
  a.use('/api/authoring', router);
  return a;
};
const binary = (r: request.Test) =>
  r.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

const DOC = { id: 'D1', title: 'Clinical Overview', module: 'M2', status: 'DRAFT', version: 3, created_at: new Date() };
let writes: Array<{ sql: string; args: unknown[] }> = [];
let failAudit = false;

beforeEach(() => {
  writes = [];
  failAudit = false;
  renderHtmlToPdf.mockClear();
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: unknown, args: unknown[] = []) => {
    const s = String(sql);
    if (/^\s*(INSERT|UPDATE|DELETE)/i.test(s)) writes.push({ sql: s, args });
    if (s.includes('FROM authoring_documents')) return { rowCount: 1, rows: [DOC] };
    if (s.includes('FROM authoring_sections')) {
      return { rowCount: 1, rows: [{ id: 'S1', code: '2.5.1', title: 'Rationale', content: '<p>Drafted text.</p>', order_index: 0 }] };
    }
    if (s.includes('INSERT INTO authoring_audit_trail')) {
      if (failAudit) throw new Error('audit store down');
      return { rowCount: 1, rows: [{ id: 'T1' }] };
    }
    return { rowCount: 0, rows: [] };
  });
});

const auditRows = () => writes.filter((w) => w.sql.includes('INSERT INTO authoring_audit_trail'));

describe('a working copy of a draft', () => {
  it('PDF: every page carries the uncontrolled-copy banner; no signature manifestation', async () => {
    const res = await binary(
      request(app()).post('/api/authoring/docs/D1/working-copy').set('Authorization', await bearer()).send({ format: 'pdf' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('working_copy.pdf');
    const [html, opts] = renderHtmlToPdf.mock.calls[0] as [string, { pageBanner?: string }];
    expect(opts?.pageBanner).toMatch(/^DRAFT — uncontrolled copy · not a controlled record · D1 · v3 · DRAFT · downloaded .+Z by author@test\.co$/);
    expect(html).toContain(WORKING_COPY_SIGNATURE_STATEMENT);
    expect(html).not.toContain('No electronic signatures are recorded');
  });

  it('DOCX: the banner is in the page header and footer parts; no signature manifestation', async () => {
    const res = await binary(
      request(app()).post('/api/authoring/docs/D1/working-copy').set('Authorization', await bearer()).send({ format: 'docx' }),
    );
    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(res.body as Buffer);
    const names = Object.keys(zip.files);
    const header = names.find((n) => /word\/header\d*\.xml$/.test(n));
    const footer = names.find((n) => /word\/footer\d*\.xml$/.test(n));
    expect(header && footer, `header/footer parts: ${names.join(', ')}`).toBeTruthy();
    for (const part of [header!, footer!]) {
      expect(await zip.file(part)!.async('string')).toContain('DRAFT — uncontrolled copy');
    }
    const body = await zip.file('word/document.xml')!.async('string');
    expect(body).toContain('Uncontrolled working copy. No electronic signature applies to this copy');
    expect(body).not.toContain('No electronic signatures are recorded');
  });

  it('is recorded once, with the delivered bytes\' hash, and writes no export-history row', async () => {
    const res = await binary(
      request(app()).post('/api/authoring/docs/D1/working-copy').set('Authorization', await bearer()).send({ format: 'pdf' }),
    );
    expect(res.status).toBe(200);
    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].args).toContain('WORKING_COPY');
    const meta = JSON.stringify(rows[0].args);
    expect(meta).toContain(String(res.headers['x-artifact-sha256']));
    expect(writes.some((w) => w.sql.includes('authoring_export_history'))).toBe(false);
  });

  it('is not sent when it cannot be recorded', async () => {
    failAudit = true;
    const res = await binary(
      request(app()).post('/api/authoring/docs/D1/working-copy').set('Authorization', await bearer()).send({ format: 'pdf' }),
    );
    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toContain('application/json');
    expect((res.body as Buffer).toString()).not.toContain('%PDF');
    expect((res.body as Buffer).toString()).toContain('WORKING_COPY_NOT_RECORDED');
  });

  it('is DOCX or PDF only', async () => {
    const res = await request(app()).post('/api/authoring/docs/D1/working-copy').set('Authorization', await bearer()).send({ format: 'xml' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WORKING_COPY_FORMAT');
  });

  it('leaves the controlled export as it was: the same draft is still refused', async () => {
    const res = await request(app()).post('/api/authoring/docs/D1/export').set('Authorization', await bearer()).send({ format: 'pdf' });
    expect(res.status).toBe(409);
  });
});
