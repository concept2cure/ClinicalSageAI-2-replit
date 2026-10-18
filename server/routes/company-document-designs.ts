import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { companyDocumentsFailure, context } from '../services/company-documents/profile';
import { companyProfileHash } from '../services/company-documents/provenance';
import { CompanyDocumentsError, parseCompanyInput } from '../services/company-documents/validation';
import { activateCompanyDefaultDesign, listCompanyDesigns, publishCompanyDesign, readCompanyDesign, reviewCompanyDesign, stageCompanyDesign } from '../services/company-documents/designs';
import { correspondenceTemplate } from '../services/company-documents/correspondence-rendering';
import { renderDocxWithTemplate } from '../services/templates';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../services/export/governedExportConsequence';
import { SubmissionReadError } from '../services/submission-service/submission-request-read';

const router = Router();
const idOf = (req: Request) => parseCompanyInput(z.string().uuid(), req.params.id);
const handle = (work: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await work(req, res); }
  catch (error) {
    if (isUnauditedExportRefusal(error)) return res.status(503).json({ error: 'UNAUDITED_EXPORT_REFUSED', message: 'The design proof was not delivered because its export record could not be saved.' });
    const failure = error instanceof SubmissionReadError ? error : companyDocumentsFailure(error);
    return res.status(failure.status).json({ error: failure.code, message: failure.message });
  }
};
router.get('/designs', handle(async (req, res) => { res.json(await listCompanyDesigns(req, req.query)); }));
router.post('/designs', handle(async (req, res) => { res.status(201).json({ data: await stageCompanyDesign(req, req.body) }); }));
router.get('/designs/:id', handle(async (req, res) => { res.json({ data: await readCompanyDesign(req, idOf(req)) }); }));
router.post('/designs/:id/review', handle(async (req, res) => { res.json({ data: await reviewCompanyDesign(req, idOf(req), req.body) }); }));
router.post('/designs/:id/publish', handle(async (req, res) => { res.json({ data: await publishCompanyDesign(req, idOf(req), req.body) }); }));
router.post('/designs/:id/activate-default', handle(async (req, res) => { res.json(await activateCompanyDefaultDesign(req, idOf(req), req.body)); }));
router.post('/designs/:id/proof', handle(async (req, res) => {
  const id = idOf(req);
  const input = parseCompanyInput(z.object({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), req.body);
  const ctx = await context(req);
  const entry = await readCompanyDesign(req, id);
  if (entry.design.sha256 !== input.expectedHash) throw new CompanyDocumentsError(409, 'COMPANY_DESIGN_PROOF_STALE', 'Reload the current design before downloading its proof.');
  const profile = { version: 1 as const, revision: entry.design.publishedRevision ?? 0, ...entry.candidate,
    brandingAdopted: true, legalDocuments: [] };
  const label = entry.design.state === 'published' ? 'PUBLISHED STATIONERY DESIGN PROOF' : 'DRAFT STATIONERY DESIGN PROOF — NOT PUBLISHED';
  const output = await renderDocxWithTemplate(correspondenceTemplate(profile), { includeCover: false,
    metadata: { title: `${entry.design.name} — design proof`, submissionType: 'Company presentation proof', sponsor: profile.companyName },
    sections: [{ title: label, paragraphs: [label, 'Review company identity, logo, running header and footer, page layout and typography before publication.',
      'This is a stationery proof. It does not establish legal sufficiency, agency acceptance or approval of filing content.'] }] });
  const current = await readCompanyDesign(req, id);
  if (current.design.sha256 !== input.expectedHash || current.design.state !== entry.design.state) throw new CompanyDocumentsError(409, 'COMPANY_DESIGN_PROOF_STALE', 'The design changed while rendering. Reload it before downloading a proof.');
  await sendAuditedDownload(res, { organizationId: ctx.organizationId, userId: ctx.userId,
    sourceType: 'export_docx', backendRoute: '/api/client-branding/company-documents/designs/:id/proof',
    resourceType: 'company_design_proof', resourceId: id, programUuid: entry.design.scope.programId,
    filename: `company-design-${id.slice(0, 8)}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: output.buffer,
    metadata: { designId: id, designHash: input.expectedHash, state: entry.design.state,
      companyDocumentRevision: entry.design.publishedRevision, companyProfileHash: companyProfileHash(profile), variantId: entry.design.state === 'published' ? id : null } });
}));
export default router;
