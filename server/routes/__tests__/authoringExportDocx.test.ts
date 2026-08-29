/**
 * BP-W0-6 — the Word export branch, which had never once run.
 *
 * The report: POST /api/authoring/docs/:id/export returns 500 for Word while
 * PDF and XML return 200, and the failure is silent in the UI.
 *
 * The cause was one line — `require('docx')` — in a package that declares
 * "type": "module" and builds with esbuild `format: 'esm'`. `require` is not
 * defined in either runtime, so the branch threw ReferenceError before reaching
 * the docx library at all and the handler's catch turned it into a 500. The PDF
 * branch beside it already used `await import(...)` and the XML branch imports
 * nothing, which is precisely why those two were fine. Nothing was wrong with
 * the document generation below the require; it had simply never executed.
 *
 * That failure mode is invisible to a test that only asserts a 200, because a
 * mocked `docx` would make the require succeed. So this test does NOT mock the
 * library: it lets the real one run and then OPENS the bytes that come back,
 * asserting the ZIP magic number and the presence of word/document.xml with the
 * section content inside it. The acceptance criterion is "a valid .docx", and
 * the only way to check validity is to read it.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => mockQuery(...a) }),
  query: (...a: unknown[]) => mockQuery(...a),
  db: {},
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-export';
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

describe('BP-W0-6 — authoring export, Word branch', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 200 and a real .docx whose XML carries the section content', async () => {
    mockQuery.mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM authoring_documents')) {
        return {
          rowCount: 1,
          // 'approved', not 'draft': a Part 11 filing export is refused (409) unless the
          // document is FROZEN or APPROVED. An editable document has no immutable
          // snapshot, so exporting it byte-for-byte like an approved one — with the
          // §11.50 signature manifest appended — would present whatever signatures
          // exist as certifying a final record that does not exist. Exporting an
          // approved document is what this route is for.
          rows: [{ id: 'D1', title: 'Tox Summary', module: 'M2', status: 'approved', created_at: new Date() }],
        };
      }
      if (s.includes('FROM authoring_sections')) {
        return {
          rowCount: 1,
          rows: [{ code: '2.6.6', title: 'Toxicology Written Summary', content: 'No adverse findings at 100 mg/kg/day.' }],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/export')
      .set('Authorization', await bearer())
      .send({ format: 'docx' })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(res.headers['content-disposition']).toContain('.docx');

    const buf = res.body as Buffer;

    // A .docx is a ZIP. "PK\x03\x04" is the local file header signature — the
    // cheapest possible proof that real bytes came back rather than an error
    // page or an empty buffer with the right content type on it.
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    // Open it. A file that unzips to a document part containing the section
    // text is a document; anything less is a plausible-looking blob.
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    const documentXml = await zip.file('word/document.xml')?.async('string');

    expect(documentXml, 'word/document.xml missing — not a Word document').toBeTruthy();
    expect(documentXml).toContain('Tox Summary');
    expect(documentXml).toContain('Toxicology Written Summary');
    expect(documentXml).toContain('No adverse findings at 100 mg/kg/day.');
  });
});
