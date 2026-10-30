/**
 * A rendered IND document is recorded before it is delivered (D5).
 *
 * The cover letter, the 312.33 annual report and its SAE line listing, the
 * letter of authorization and the right-of-reference statement are documents a
 * sponsor files, and these routes handed each back with nothing recorded: no
 * audit row, no hash, nothing that says who took which document and when
 * (2026-10-15 launch-boundary re-proof,
 * docs/evidence/D2-API-SCOPE/2026-10-15-reproof/). Held to the rule every
 * generated download is held to (sendAuditedDownload): an EXPORT_GENERATED
 * row with the SHA-256 of the exact bytes, and no delivery when it does not
 * persist.
 */
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const logAction = vi.hoisted(() => vi.fn());
vi.mock('../../../services/auditService', () => ({ default: { logAction: (...a: unknown[]) => logAction(...a) } }));
vi.mock('../../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../db', () => ({ db: {} }));

/* The renderers are not what this pins: each returns these bytes, so the
   recorded hash can be checked against what was delivered. */
const PDF = vi.hoisted(() => Buffer.from('%PDF-1.7 rendered IND document'));
vi.mock('../../../services/ind-lifecycle/ind-document-renderer', () => {
  const render = async () => PDF;
  return {
    renderIndSafetyReportPdf: render,
    renderIndAnnualReportPdf: render,
    renderCoverLetterPdf: render,
    renderLetterOfAuthorizationPdf: render,
    renderRightOfReferenceStatementPdf: render,
    renderAuthorizedPersonsListPdf: render,
  };
});

import documentsRoutes from '../documents.routes';
import { buildSaeLineListing, saeLineListingToCsv } from '../../../services/ind-lifecycle/ind-sae-line-listing';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 9, organizationId: 4, roles: ['regulatory-author'] };
    next();
  });
  a.use('/api/ind-lifecycle', documentsRoutes);
  return a;
}

const binary = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

const LISTING = {
  events: [],
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
};
const CSV = Buffer.from(saeLineListingToCsv(buildSaeLineListing(LISTING)), 'utf8');

const cases = [
  {
    name: 'cover letter PDF',
    path: '/api/ind-lifecycle/cover-letter/pdf',
    body: { sponsorName: 'Acme Bio', drugName: 'Zexanib', fdaCenter: 'CDER', submissionType: 'original' },
    bytes: PDF,
  },
  {
    name: 'annual report PDF',
    path: '/api/ind-lifecycle/annual-report/pdf',
    body: { reportingPeriodStart: '2026-01-01', reportingPeriodEnd: '2026-12-31' },
    bytes: PDF,
  },
  { name: 'SAE line listing CSV', path: '/api/ind-lifecycle/annual-report/line-listing?format=csv', body: LISTING, bytes: CSV },
  {
    name: 'letter of authorization PDF',
    path: '/api/ind-lifecycle/loa/pdf',
    body: { referencedFileType: 'DMF', referencedFileNumber: '012345', holderName: 'Holder Co', authorizedPartyName: 'Acme Bio' },
    bytes: PDF,
  },
  {
    name: 'right-of-reference PDF',
    path: '/api/ind-lifecycle/right-of-reference/pdf',
    body: { sponsorName: 'Acme Bio', referencedFileType: 'DMF', referencedFileNumber: '012345' },
    bytes: PDF,
  },
];

beforeEach(() => logAction.mockReset());

describe('a rendered IND document', () => {
  for (const c of cases) {
    it(`${c.name}: records EXPORT_GENERATED with the SHA-256 of the bytes delivered`, async () => {
      logAction.mockResolvedValue({ persisted: true });
      const res = await request(app()).post(c.path).send(c.body).buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body as Buffer, c.bytes)).toBe(0);
      const row = logAction.mock.calls.map(([e]) => e).find((e: any) => e.action === 'EXPORT_GENERATED');
      expect(row, 'no EXPORT_GENERATED row').toBeTruthy();
      expect(row.organizationId).toBe(4);
      expect(row.userId).toBe(9);
      expect(JSON.stringify(row)).toContain(sha(c.bytes));
      expect(res.headers['x-export-sha256']).toBe(sha(c.bytes));
    });

    it(`${c.name}: delivers nothing when the record does not persist, and says so`, async () => {
      logAction.mockResolvedValue({ persisted: false });
      const res = await request(app()).post(c.path).send(c.body);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('UNAUDITED_EXPORT_REFUSED');
      expect(res.headers['content-disposition']).toBeUndefined();
    });
  }
});
