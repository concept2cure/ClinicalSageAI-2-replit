/** Authenticated exports use actual rich Word input and a strict-converter
 * seam with real PDF bytes. Actual LibreOffice layout is qualified separately;
 * this suite owns ledger/delivery uncertainty and safe HTTP failure mapping. */
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertedPdfFixture, wordBody, wordPart } from './_authoring-pdf-converter-fixture';
import { ConversionCapacityError } from '../../services/conversion-slots';

const h = vi.hoisted(() => ({ query: vi.fn(), convert: vi.fn(), recorded: [] as unknown[][], auditWrites: 0 }));
vi.mock('../../db', () => ({
  pool: { query: (...args: unknown[]) => h.query(...args) },
  getPool: () => ({ query: (...args: unknown[]) => h.query(...args) }),
  query: (...args: unknown[]) => h.query(...args), db: {},
}));
vi.mock('../../services/pdf-converter', () => ({ convertDocxToPdf: h.convert }));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-export';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';
import { DOC_ID, releaseGovernanceRead } from '../../services/authoring/__tests__/release-governance-reads';
import { AuthoringPdfRenderingError } from '../../services/authoring/authoring-export';

async function bearer(): Promise<string> {
  return 'Bearer ' + await new SignJWT({ sub: 'u1', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
}

function makeApp(deliveryError?: Error) {
  const app = express(); app.use(express.json());
  if (deliveryError) app.use((_req, res, next) => {
    const send = res.send.bind(res);
    res.send = body => { if (Buffer.isBuffer(body)) throw deliveryError; return send(body); };
    next();
  });
  app.use('/api/authoring', router); return app;
}

async function download(deliveryError?: Error) {
  return request(makeApp(deliveryError)).post(`/api/authoring/docs/${DOC_ID}/export`)
    .set('Authorization', await bearer()).send({ format: 'pdf' });
}

function storedRows(sql: unknown, args: unknown[] = []) {
  const text = String(sql);
  const governance = releaseGovernanceRead(text);
  if (governance) return governance;
  if (text.includes('FROM authoring_documents')) return { rowCount: 1, rows: [{ id: DOC_ID, title: 'Tox Summary', module: 'M2', status: 'approved', created_at: new Date() }] };
  if (text.includes('FROM authoring_sections')) return { rowCount: 1, rows: [{ code: '2.6.6', title: 'General', content: 'A <critical> finding & more' }] };
  if (text.includes('INSERT INTO authoring_audit_trail')) h.auditWrites++;
  if (text.includes('INSERT INTO authoring_export_history')) {
    h.recorded.push(args); return { rowCount: 1, rows: [{ id: 'X1', exported_at: new Date() }] };
  }
  return { rowCount: 0, rows: [] };
}

beforeEach(() => {
  h.query.mockReset(); h.query.mockImplementation(storedRows);
  h.convert.mockReset(); h.convert.mockImplementation(convertedPdfFixture);
  h.recorded = []; h.auditWrites = 0;
});

describe('authoring controlled PDF export', () => {
  it('delivers strict-converter PDF bytes and records their exact hash, never a plain-text fallback', async () => {
    const res = await request(makeApp()).post(`/api/authoring/docs/${DOC_ID}/export`)
      .set('Authorization', await bearer()).send({ format: 'pdf' }).buffer(true)
      .parse((response, cb) => { const chunks: Buffer[] = []; response.on('data', c => chunks.push(c)); response.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('.pdf');
    expect(res.headers['x-export-rendering']).toBe('formatted');
    expect(h.convert).toHaveBeenCalledTimes(1);
    const [word, options] = h.convert.mock.calls[0] as [Buffer, unknown];
    expect(options).toEqual({ backend: 'libreoffice' });
    expect(await wordPart(word)).toContain('w:document');
    expect(await wordBody(word)).toContain('Tox Summary');
    expect(await wordBody(word)).toContain('A <critical> finding & more');
    const converted = await h.convert.mock.results[0].value;
    expect(res.body).toEqual(converted.pdf);
    expect(h.recorded).toHaveLength(1);
    expect(JSON.parse(String(h.recorded[0][6]))).toMatchObject({ rendering: 'formatted',
      artifactSha256: createHash('sha256').update(res.body).digest('hex') });
  });

  it('refuses a failed strict converter with safe 503 and no export record or success audit', async () => {
    h.convert.mockRejectedValueOnce(new Error('private converter detail /tmp/tenant-source.docx'));
    const res = await download();
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PDF_RENDERER_UNAVAILABLE');
    expect(res.body.message).toMatch(/PDF.*(unavailable|not available|could not)/i);
    expect(JSON.stringify(res.body)).not.toMatch(/private|tmp|tenant-source|%PDF/i);
    expect(h.recorded).toEqual([]); expect(h.auditWrites).toBe(0);
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('does not record an EXPORT success audit when rendering fails before recording starts', async () => {
    h.convert.mockRejectedValueOnce(new Error('converter process failed'));
    await download();
    expect(h.auditWrites).toBe(0);
    expect(h.recorded).toEqual([]);
  });

  it('retains the canonical busy-converter retry response without an export record', async () => {
    h.convert.mockRejectedValueOnce(new ConversionCapacityError('libreoffice', 120000, 2));
    const res = await download();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('CONVERTER_BUSY');
    expect(res.headers['retry-after']).toBe('30');
    expect(res.body.retryAfterSeconds).toBe(30);
    expect(h.recorded).toEqual([]); expect(h.auditWrites).toBe(0);
  });
});

describe('controlled export outcomes keep recording and delivery distinct', () => {
  it.each(['ledger', 'delivery'] as const)('reports the %s failure at its actual stage', async stage => {
    h.query.mockImplementation((sql: unknown, args: unknown[]) => {
      const rows = storedRows(sql, args);
      if (stage === 'ledger' && String(sql).includes('INSERT INTO authoring_export_history')) throw new Error('reply lost after INSERT');
      return rows;
    });
    const res = await download(stage === 'delivery' ? new Error('transport failed before bytes') : undefined);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe(stage === 'ledger' ? 'EXPORT_OUTCOME_UNKNOWN' : 'EXPORT_DELIVERY_FAILED');
    expect(h.recorded).toHaveLength(1);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/reply lost|transport failed/);
  });

  it.each(['ledger', 'delivery'] as const)('does not turn a %s uncertainty into a definite renderer refusal', async stage => {
    const error = new AuthoringPdfRenderingError(new Error('private late-converter detail'));
    h.query.mockImplementation((sql: unknown, args: unknown[]) => {
      const rows = storedRows(sql, args);
      if (stage === 'ledger' && String(sql).includes('INSERT INTO authoring_export_history')) throw error;
      return rows;
    });
    const res = await download(stage === 'delivery' ? error : undefined);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe(stage === 'ledger' ? 'EXPORT_OUTCOME_UNKNOWN' : 'EXPORT_DELIVERY_FAILED');
    expect(JSON.stringify(res.body)).not.toContain('private late-converter');
    expect(h.recorded).toHaveLength(1);
  });
});
