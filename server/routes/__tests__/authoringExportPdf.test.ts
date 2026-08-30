/**
 * Authoring export — PDF branch. The previous implementation returned DOCX
 * bytes under a PDF label; the branch now composes escaped HTML from the
 * document's governed sections and renders it through the platform's real
 * HTML→PDF engine. This locks in: application/pdf content type, the renderer
 * actually invoked with the section content (escaped), and a .pdf attachment.
 *
 * The router carries its own §11 JWT gate, so the test signs a real HS256
 * token with the test secret rather than stubbing auth.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, renderHtmlToPdf } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  renderHtmlToPdf: vi.fn(async (_html: string) => Buffer.from('%PDF-1.7 rendered')),
}));

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => mockQuery(...a) }),
  query: (...a: unknown[]) => mockQuery(...a),
  db: {},
}));
vi.mock('../../export/renderers', () => ({ renderHtmlToPdf }));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-export';
// The authoring router verifies via the CANONICAL verifyJwtWithRotation, which in
// test env reads JWT_SECRET_DEV ?? JWT_SECRET. Pin them together so the token this
// file signs with JWT_SECRET is the one the verifier checks against, regardless of
// what the global test setup did.
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: 'u1', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

describe('authoring export — real PDF branch', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    renderHtmlToPdf.mockClear();
  });

  it('renders application/pdf through the HTML→PDF engine (not mislabeled DOCX)', async () => {
    mockQuery.mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM authoring_documents')) {
        // 'approved', not 'draft': a Part 11 filing export is refused (409) unless the
        // document is FROZEN or APPROVED. An editable document has no immutable
        // snapshot, so exporting it byte-for-byte like an approved one — with the
        // §11.50 signature manifest appended — would present whatever signatures
        // exist as certifying a final record that does not exist. Exporting an
        // approved document is what this route is for.
        return { rowCount: 1, rows: [{ id: 'D1', title: 'Tox Summary', module: 'M2', status: 'approved', created_at: new Date() }] };
      }
      if (s.includes('FROM authoring_sections')) {
        return { rowCount: 1, rows: [{ code: '2.6.6', title: 'General', content: 'A <critical> finding & more' }] };
      }
      return { rowCount: 0, rows: [] };
    });

    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/export')
      .set('Authorization', await bearer())
      .send({ format: 'pdf' })
      .buffer(true)
      .parse((r, cb) => { const chunks: Buffer[] = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('.pdf');
    // The REAL renderer ran, over escaped section HTML.
    expect(renderHtmlToPdf).toHaveBeenCalledTimes(1);
    const html = renderHtmlToPdf.mock.calls[0][0] as string;
    expect(html).toContain('Tox Summary');
    expect(html).toContain('A &lt;critical&gt; finding &amp; more'); // escaped, not raw
    expect((res.body as Buffer).toString()).toContain('%PDF-1.7 rendered');
  });
});
