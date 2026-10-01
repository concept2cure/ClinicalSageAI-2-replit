/**
 * An export of an existing record is recorded before it is delivered.
 *
 * The data-origins lineage PDF (POST /api/data-origins/selection.pdf) and the
 * AnA citation downloads (POST /api/ana/citations/:artifactId/export.docx, GET
 * …/export?format=csv and GET /citations/projects/:projectId/export?format=csv)
 * render records that already exist, and handed the file back with nothing
 * recorded. A reviewer asks what left the system, who took it and when, and the
 * answer was "nothing says". Decided 2026-10-01: an export of an existing record
 * gets the same EXPORT_GENERATED row as a generated document. That means the
 * SHA-256 of the exact bytes, and no delivery when the row does not persist.
 * The citation JSON views are API reads, not files, and are unchanged. The AnA
 * lineage dossier's XML form (GET /api/ana-ri/documents/:id/lineage-dossier.xml)
 * is the same kind of file and is held to the same rule.
 */
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const logAction = vi.hoisted(() => vi.fn());
vi.mock('../../services/auditService', () => ({ default: { logAction: (...a: unknown[]) => logAction(...a) } }));
vi.mock('../../services/compute/artifactWriteback', () => ({ registerArtifactWithGovernance: vi.fn() }));

const pass = vi.hoisted(() => (_q: unknown, _s: unknown, n: () => void) => n());
vi.mock('../../middleware/auth', () => ({ authenticateToken: pass }));
vi.mock('../../middleware/tenantContext', () => ({ requireOrganizationContext: pass, requireTenantContext: pass }));
vi.mock('../../middleware/rateLimiter', () => ({ createRateLimiter: () => pass }));

const PDF = vi.hoisted(() => Buffer.from('%PDF-1.7 lineage report'));
vi.mock('../../services/clinical-regulatory-evidence/span-lineage.service', () => ({
  getSelectionOrigins: vi.fn(async () => ({ spans: [] })),
  summarizeDocumentAttribution: vi.fn(),
  SpanLineageError: class extends Error {},
}));
vi.mock('../../services/clinical-regulatory-evidence/data-origins-pdf', () => ({
  renderDataOriginsPdf: vi.fn(async () => PDF),
}));

const DOCX = vi.hoisted(() => Buffer.from('PK\u0003\u0004 ledger docx'));
vi.mock('../../services/export/docx-ledger-export', () => ({
  exportArtifactWithLedger: vi.fn(async () => ({
    buffer: DOCX,
    filename: 'art-1.docx',
    ledgerXmlByteLength: 10,
    ledger: { schemaVersion: '1' },
  })),
}));
const CSV = vi.hoisted(() => 'claim,source\nA,B\n');
vi.mock('../../services/ana/citation-export', () => ({
  exportArtifactCitations: vi.fn(async () => [{}]),
  exportProjectCitations: vi.fn(async () => [{}]),
  formatCitationsCsv: () => CSV,
  formatCitationsJsonExport: () => ({ rows: [] }),
}));

const XML = vi.hoisted(() => '<?xml version="1.0"?><lineage/>');
vi.mock('../../services/ana/lineage-dossier.js', () => ({ buildDocumentLineageDossier: vi.fn(async () => ({ artifactId: 'art-1' })) }));
vi.mock('../../services/ana/lineage-dossier-xml.js', () => ({ serializeDocumentLineageDossierXml: () => XML }));

import { Router } from 'express';
import { mountLineageRoutes } from '../ana-ri/lineage';
import dataOriginsRouter from '../data-origins.routes';
import anaFeaturesRouter from '../ana-features';

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const binary = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _s: Response, n: NextFunction) => {
    (req as any).user = { id: 3, organizationId: 7, email: 'reviewer@example.com' };
    (req as any).tenantContext = { organizationId: 7 };
    (req as any).tenantId = 7;
    n();
  });
  a.use('/api/data-origins', dataOriginsRouter);
  a.use('/api/ana', anaFeaturesRouter);
  const anaRi = Router();
  mountLineageRoutes(anaRi);
  a.use('/api/ana-ri', anaRi);
  return a;
}

const SELECTION = { documentTable: 'authoring_documents', documentId: 'doc-1', charStart: 0, charEnd: 10 };

const cases = [
  { name: 'lineage PDF', go: () => request(app()).post('/api/data-origins/selection.pdf').send(SELECTION), body: PDF },
  { name: 'citation DOCX', go: () => request(app()).post('/api/ana/citations/art-1/export.docx').send({}), body: DOCX },
  { name: 'artifact citation CSV', go: () => request(app()).get('/api/ana/citations/art-1/export?format=csv'), body: Buffer.from(CSV) },
  { name: 'project citation CSV', go: () => request(app()).get('/api/ana/citations/projects/5/export?format=csv'), body: Buffer.from(CSV) },
  { name: 'lineage dossier XML', go: () => request(app()).get('/api/ana-ri/documents/art-1/lineage-dossier.xml'), body: Buffer.from(XML) },
];

beforeEach(() => logAction.mockReset());

describe('an export of an existing record', () => {
  for (const c of cases) {
    it(`${c.name}: records EXPORT_GENERATED with the SHA-256 of the bytes delivered`, async () => {
      logAction.mockResolvedValue({ persisted: true });
      const res = await c.go().buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body as Buffer, c.body)).toBe(0);
      const row = logAction.mock.calls.map(([e]) => e).find((e: any) => e.action === 'EXPORT_GENERATED');
      expect(row).toBeTruthy();
      expect(row.organizationId).toBe(7);
      expect(row.userId).toBe(3);
      expect(JSON.stringify(row)).toContain(sha(c.body));
      expect(res.headers['x-export-sha256']).toBe(sha(c.body));
    });

    it(`${c.name}: delivers nothing when the record does not persist`, async () => {
      logAction.mockResolvedValue({ persisted: false });
      const res = await c.go();
      expect(res.status).toBe(503);
      expect(res.headers['content-disposition']).toBeUndefined();
    });
  }
});
