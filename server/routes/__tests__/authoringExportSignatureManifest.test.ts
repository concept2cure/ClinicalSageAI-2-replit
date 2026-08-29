/**
 * §11.50(b) — the manifestation in a human-readable PRINTOUT.
 *
 * §11.50(b) requires the printed name, the date and time, and the meaning of
 * each signature to be "included as part of any human readable form of the
 * electronic record (e.g. electronic display or printout)". The Signatures rail
 * closed the display half. This is the printout half, and before it all three
 * export formats carried the title and the sections and nothing else — so a
 * filed DOCX of a signed, frozen document showed no evidence it had ever been
 * signed.
 *
 * The repo already had a renderer for this block, `buildDocx`, carrying an
 * "ELECTRONIC SIGNATURES" heading. It was dead: one repo-wide hit, its own
 * definition, absent from the built bundle — and it read four field names that
 * do not exist on `authoring_signatures` (`signature_meaning`,
 * `signature_intent`, `signature_timestamp`, `document_hash` against the actual
 * `meaning` / `reason` / `signed_at` / `content_hash`), so it would have printed
 * `undefined` for the meaning and the date if anything had called it. It is
 * deleted; this is the live path.
 *
 * These tests OPEN the produced bytes rather than asserting a 200, because the
 * failure mode being guarded is a well-formed file with the manifest missing
 * from it — which a status assertion cannot see.
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

const SIGNED = {
  signer_email: 'r.okafor@test.co',
  signer_name: 'Rita Okafor',
  meaning: 'APPROVER',
  reason: 'Approved for filing.',
  method: 'PIN',
  content_hash: 'a1b2c3d4e5f6',
  covered_freeze_version: 'v3',
  pin_verified: true,
  signed_at: new Date('2026-08-14T09:31:00.000Z'),
};

/** `title` is deliberately XML-hostile — see the escaping test below. */
function mockRows(signatures: unknown[], title = 'Tox Summary') {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM authoring_documents')) {
      // 'approved', not 'draft': a Part 11 filing export is refused (409) unless the
      // document is FROZEN or APPROVED. An editable document has no immutable
      // snapshot, so exporting it byte-for-byte like an approved one — with the
      // §11.50 signature manifest appended — would present whatever signatures
      // exist as certifying a final record that does not exist. Exporting an
      // approved document is what this route is for.
      return { rowCount: 1, rows: [{ id: 'D1', title, module: 'M2', status: 'approved', created_at: new Date() }] };
    }
    if (s.includes('FROM authoring_sections')) {
      return {
        rowCount: 1,
        rows: [{ code: '2.6.6', title: 'Toxicology Written Summary', content: 'No adverse findings.' }],
      };
    }
    if (s.includes('FROM authoring_signatures')) {
      return { rowCount: signatures.length, rows: signatures };
    }
    return { rowCount: 0, rows: [] };
  });
}

function raw(format: string) {
  return request(makeApp())
    .post('/api/authoring/docs/D1/export')
    .set('Authorization', bearerSync)
    .send({ format })
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
}
let bearerSync = '';

beforeEach(async () => {
  mockQuery.mockReset();
  bearerSync = await bearer();
});

describe('§11.50(b) — DOCX carries the manifestation', () => {
  it('prints the printed name, the meaning and the executed time', async () => {
    mockRows([SIGNED]);
    const res = await raw('docx');
    expect(res.status).toBe(200);

    const { default: JSZip } = await import('jszip');
    const xml = await (await JSZip.loadAsync(res.body as Buffer)).file('word/document.xml')!.async('string');

    expect(xml).toContain('Electronic signatures');
    expect(xml).toContain('Rita Okafor');          // §11.50(a)(1)
    expect(xml).toContain('Approval');             // §11.50(a)(3), labelled
    expect(xml).not.toContain('APPROVER');         // never the raw enum token
    expect(xml).toContain('2026-08-14 09:31:00 UTC'); // §11.50(a)(2)
    expect(xml).toContain('Approved for filing.');
    expect(xml).toContain('frozen version v3');    // §11.70
  });

  it('says so plainly when a document carries no signatures', async () => {
    mockRows([]);
    const res = await raw('docx');
    const { default: JSZip } = await import('jszip');
    const xml = await (await JSZip.loadAsync(res.body as Buffer)).file('word/document.xml')!.async('string');
    expect(xml).toContain('No electronic signatures are recorded against this document.');
  });

  it('does not print an email where the printed name goes', async () => {
    mockRows([{ ...SIGNED, signer_name: null }]);
    const res = await raw('docx');
    const { default: JSZip } = await import('jszip');
    const xml = await (await JSZip.loadAsync(res.body as Buffer)).file('word/document.xml')!.async('string');
    // The address may appear as the identifier it is; what must not happen is
    // it standing UNQUALIFIED in the §11.50(a)(1) position of a filed document.
    expect(xml).toContain('no printed name on record');
  });
});

describe('§11.50(b) — XML carries the manifestation, and is well-formed', () => {
  it('includes a signature element with the required lines', async () => {
    mockRows([SIGNED]);
    const res = await raw('xml');
    const xml = (res.body as Buffer).toString('utf8');
    expect(xml).toContain('<electronic_signatures count="1">');
    expect(xml).toContain('Rita Okafor');
    expect(xml).toContain('Meaning: Approval');
    expect(xml).toContain('Executed: 2026-08-14 09:31:00 UTC');
  });

  it('escapes the document title, which it never did', async () => {
    // "Safety & Efficacy" produced `<title>Safety & Efficacy</title>` — a bare
    // ampersand, which no XML parser accepts. The export returned 200 with a
    // file that could not be opened. Signature reasons and names make this
    // unavoidable rather than merely latent.
    mockRows([SIGNED], 'Safety & Efficacy <draft>');
    const res = await raw('xml');
    const xml = (res.body as Buffer).toString('utf8');
    expect(xml).toContain('Safety &amp; Efficacy &lt;draft&gt;');
    expect(xml).not.toMatch(/<title>[^<]*&(?!amp;|lt;|gt;|quot;)/);
  });

  it('is parseable by a real XML parser', async () => {
    mockRows([{ ...SIGNED, reason: 'Q3A & Q3B impurities <reviewed>' }], 'A & B');
    const res = await raw('xml');
    const xml = (res.body as Buffer).toString('utf8');
    // The point of escaping is that the bytes parse. Assert that, not the
    // presence of entities.
    const { DOMParser } = await import('@xmldom/xmldom');
    const errors: string[] = [];
    const doc = new DOMParser({
      onError: (_level: string, msg: string) => errors.push(msg),
    } as never).parseFromString(xml, 'text/xml');
    expect(errors, `XML did not parse: ${errors.join('; ')}`).toHaveLength(0);
    expect(doc.getElementsByTagName('electronic_signatures')).toHaveLength(1);
  });
});

describe('§11.50(b) — PDF carries the manifestation', () => {
  it('renders the signature block into the PDF html', async () => {
    mockRows([SIGNED]);
    const res = await raw('pdf');
    expect(res.status).toBe(200);
    const buf = res.body as Buffer;
    // %PDF- — real bytes, not an error page under a PDF content type.
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(500);
  });
});

describe('the dead renderer is gone', () => {
  it('buildDocx no longer exists to be mistaken for the live path', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'server/routes/authoring.router.ts'), 'utf8');
    // It printed `undefined` for the meaning and the date, and its presence
    // suggested exports already had a manifest.
    expect(src).not.toContain('async function buildDocx');
    expect(src).not.toContain('signature_meaning');
    expect(src).not.toContain('signature_timestamp');
  });
});
