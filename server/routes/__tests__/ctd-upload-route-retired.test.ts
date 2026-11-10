/**
 * P-108 3(b), item 5 (the coordinating session's ruling, 2026-11-09, option (a)):
 * the onboarding upload route is removed.
 *
 * `POST /api/ctd/projects/:id/upload` wrote a file into `ctd_onboarding_documents`,
 * the store P-108 3(b) retired as a source of placeable leaves. No client has ever
 * called it (docs/evidence/D7-UPLOAD-ROUTE-RETIRED/2026-11-09/history-searches.txt).
 * An uploaded file now goes into the project's Vault, is approved there, and that
 * Vault version is placed (client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission.tsx).
 *
 * The rest of /api/ctd stays as it is (ctd-project-creator-retired.test.ts keeps
 * proving its reads); its own retirement is an R1 candidate, judged separately.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ upload: vi.fn(), status: vi.fn() }));
vi.mock('../../auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { tenantId: 7, userId: 55 });
    next();
  },
}));
/* `uploadCTDDocument` was the writer the route called; it is removed with the
   route. The mock still names it, so that a route put back with its writer is
   caught writing. */
vi.mock('../../services/ctd-ingestion-service.js', () => ({
  listCTDProjects: vi.fn(), getCTDProjectStatus: h.status, validateCTDCompleteness: vi.fn(), detectCTDSection: vi.fn(),
  uploadCTDDocument: h.upload,
}));
import router from '../ctd-onboarding';

function app() {
  const app = express();
  app.use(express.json());
  app.use('/api/ctd', router);
  return app;
}
beforeEach(() => vi.clearAllMocks());

/** A whole, well-formed upload, as the route used to take it. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

describe('the onboarding upload route is removed (P-108 3(b), item 5)', () => {
  it('answers 404 to a complete upload, and writes nothing to the upload store', async () => {
    h.upload.mockResolvedValue({ id: 900, uuid: '00000000-0000-4000-8000-000000000900' });
    const res = await request(app())
      .post('/api/ctd/projects/31/upload')
      .field('ctdModule', '1')
      .field('ctdSection', '1.1.1')
      .field('sectionTitle', 'Form FDA 1571')
      .field('documentType', 'form')
      .attach('file', PDF, { filename: 'form-1571.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(404);
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('keeps the existing project read beside it', async () => {
    h.status.mockResolvedValue({ project: { id: 31 }, documents: [], gaps: [] });
    const res = await request(app()).get('/api/ctd/projects/31');
    expect(res.status).toBe(200);
    expect(h.status).toHaveBeenCalledWith(31, 7);
  });
});
