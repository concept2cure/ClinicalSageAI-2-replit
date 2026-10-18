import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authedOrgId, usableOrgId } from '../utils/authedOrgId';
import { governedActorId } from '../middleware/orgMembership';
import { requestPgClient } from '../db/requestDb';
import { DEFAULT_TEMPLATE_SPEC, normalizeTemplateSpec } from '../../shared/templates/template-spec';
import type { CompanyDocumentProfile } from '../../shared/company-documents';
import { renderDocxWithTemplate } from '../services/templates';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../services/export/governedExportConsequence';
import { archiveCompanyLegalDocument, companyDocumentsFailure, companyProfileHash, companyLetterheadForPurpose, readCompanyDocumentProfile,
  registerCompanyLegalDocument, updateCompanyDocumentProfile } from '../services/company-documents/profile';
import { parseCompanyInput } from '../services/company-documents/validation';
import companyDocumentActions from './company-document-actions';

const router = Router();
router.use((req, res, next) => {
  if (!usableOrgId(authedOrgId(req)) || !governedActorId(req)) return res.status(403).json({ error: 'AUTH_REQUIRED', message: 'An authenticated organization member is required.' });
  next();
});
const handle = (work: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await work(req, res); } catch (error) {
    if (isUnauditedExportRefusal(error)) return res.status(503).json({ error: 'UNAUDITED_EXPORT_REFUSED', message: 'The document was not delivered because its export record could not be saved.' });
    const failure = companyDocumentsFailure(error);
    if (failure.status === 500) console.error('[company-documents]', error instanceof Error ? error.message : 'operation failed');
    return res.status(failure.status).json({ error: failure.code, message: failure.message });
  }
};

router.get('/', handle(async (req, res) => { res.json(await readCompanyDocumentProfile(req)); }));
router.put('/', handle(async (req, res) => { res.json(await updateCompanyDocumentProfile(req, req.body)); }));
router.post('/legal-documents', handle(async (req, res) => { res.status(201).json(await registerCompanyLegalDocument(req, req.body)); }));
router.delete('/legal-documents/:id', handle(async (req, res) => { res.json(await archiveCompanyLegalDocument(req, String(req.params.id), req.body)); }));

function correspondenceLetterhead(data: CompanyDocumentProfile | null) {
  if (!data) return normalizeTemplateSpec(DEFAULT_TEMPLATE_SPEC);
  return { ...data.letterhead, brand: { ...data.letterhead.brand, organizationName: data.companyName },
    header: { ...data.letterhead.header, alignment: data.letterhead.header?.alignment ?? 'left',
      text: [data.address, data.contact, data.registrationDetails, data.letterhead.header?.text].filter(Boolean).join('\n') } };
}

router.post('/letterhead/render', handle(async (req, res) => {
  const input = parseCompanyInput(z.object({ title: z.string().trim().min(1).max(300).optional(),
    paragraphs: z.array(z.string().max(10000)).max(100).optional(), purpose: z.enum(['company', 'submission']).optional() }).strict(), req.body ?? {});
  const saved = await readCompanyDocumentProfile(req);
  const purpose = input.purpose ?? 'company';
  const data = purpose === 'submission'
    ? await companyLetterheadForPurpose(usableOrgId(authedOrgId(req))!, 'submission', requestPgClient(req))
    : saved.data;
  const title = input.title ?? 'Company correspondence';
  const identityLines = data ? [data.address, data.contact, data.registrationDetails].filter(Boolean) : [];
  const paragraphs = input.paragraphs ?? (purpose === 'company' ? identityLines : []);
  const output = await renderDocxWithTemplate(correspondenceLetterhead(data), {
    includeCover: false,
    metadata: { title, submissionType: 'Correspondence', ...(data ? { sponsor: data.companyName, version: `Company profile revision ${data.revision}` } : {}) },
    sections: [{ title, paragraphs: paragraphs.length ? paragraphs : ['Prepare your correspondence here. Review the completed draft before filing.'] }],
  });
  await sendAuditedDownload(res, { organizationId: usableOrgId(authedOrgId(req))!, userId: governedActorId(req)!,
    sourceType: 'export_docx', backendRoute: '/api/client-branding/company-documents/letterhead/render',
    resourceType: 'company_letterhead', resourceId: String(usableOrgId(authedOrgId(req))), programUuid: null,
    filename: output.filename, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: output.buffer,
    metadata: { title, purpose, companyBrandingApplied: Boolean(data),
      ...(data ? { companyDocumentRevision: data.revision, companyProfileHash: companyProfileHash(data) } : {}) },
  });
}));
router.use('/', companyDocumentActions);
export default router;
