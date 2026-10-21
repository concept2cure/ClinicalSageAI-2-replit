import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authedOrgId, usableOrgId } from '../utils/authedOrgId';
import { governedActorId } from '../middleware/orgMembership';
import { requireEditorAccess } from '../middleware/orgMembership';
import { requestPgClient } from '../db/requestDb';
import { DEFAULT_TEMPLATE_SPEC, normalizeTemplateSpec } from '../../shared/templates/template-spec';
import type { CompanyDocumentProfile } from '../../shared/company-documents';
import { renderDocxWithTemplate } from '../services/templates';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../services/export/governedExportConsequence';
import { archiveCompanyLegalDocument, companyDocumentsFailure, companyProfileHash, companyLetterheadForPurpose, readCompanyDocumentProfile,
  registerCompanyLegalDocument, updateCompanyDocumentProfile, context, requireCompanyDocumentManager } from '../services/company-documents/profile';
import { parseCompanyInput, profileUpdateSchema, validateCompanyLetterhead } from '../services/company-documents/validation';
import companyDocumentActions from './company-document-actions';
import { correspondenceFilingParagraphs, createSubmissionCorrespondenceDraft, prepareSubmissionCorrespondence } from '../services/company-documents/correspondence';
import { SubmissionReadError } from '../services/submission-service/submission-request-read';
import { AuthoringCreateOutcomeError, authoringCreationRecoveryPayload } from '../services/authoring/authoring-create-outcome';
import companyDocumentIdentity from './company-document-identity';
import companyDocumentGovernance from './company-document-governance';
import companyLegalWorkflows from './company-legal-workflows';
import companyDocumentDesigns from './company-document-designs';
import companyLegalInventory from './company-legal-inventory';
import { receiveTemplateFile, extractTemplatePreview } from './c2c/template-upload';

const router = Router();
router.use((req, res, next) => {
  if (!usableOrgId(authedOrgId(req)) || !governedActorId(req)) return res.status(403).json({ error: 'AUTH_REQUIRED', message: 'An authenticated organization member is required.' });
  next();
});
const handle = (work: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await work(req, res, next); } catch (error) {
    if (error instanceof SubmissionReadError) return res.status(error.status).json({ error: error.code, message: error.message });
    if (error instanceof AuthoringCreateOutcomeError) return res.status(503).json(authoringCreationRecoveryPayload(error));
    if (isUnauditedExportRefusal(error)) return res.status(503).json({ error: 'UNAUDITED_EXPORT_REFUSED', message: 'The document was not delivered because its export record could not be saved.' });
    const failure = companyDocumentsFailure(error);
    if (failure.status === 500) console.error('[company-documents]', error instanceof Error ? error.message : 'operation failed');
    return res.status(failure.status).json({ error: failure.code, message: failure.message });
  }
};

router.post('/letterhead/extract', handle(async (req, _res, next) => {
  await requireCompanyDocumentManager(req);
  next();
}), receiveTemplateFile, handle(extractTemplatePreview));

router.get('/', handle(async (req, res) => {
  const input = parseCompanyInput(z.object({ includeLegal: z.enum(['true', 'false']).optional() }).strict(), req.query);
  res.json(await readCompanyDocumentProfile(req, input.includeLegal !== 'false'));
}));
router.put('/', handle(async (req, res) => { res.json(await updateCompanyDocumentProfile(req, req.body)); }));
router.post('/legal-documents', handle(async (req, res) => { res.status(201).json(await registerCompanyLegalDocument(req, req.body)); }));
router.delete('/legal-documents/:id', handle(async (req, res) => { res.json(await archiveCompanyLegalDocument(req, String(req.params.id), req.body)); }));

function correspondenceLetterhead(data: CompanyDocumentProfile | null) {
  if (!data) return normalizeTemplateSpec(DEFAULT_TEMPLATE_SPEC);
  return { ...data.letterhead, brand: { ...data.letterhead.brand, organizationName: data.companyName },
    header: { ...data.letterhead.header, alignment: data.letterhead.header?.alignment ?? 'left',
      text: [data.address, data.contact, data.registrationDetails, data.letterhead.header?.text].filter(Boolean).join('\n') } };
}

router.post('/letterhead/preview', handle(async (req, res) => {
  const ctx = await context(req, 'brand');
  const input = parseCompanyInput(z.object({ profile: profileUpdateSchema.pick({ companyName: true, address: true, contact: true,
    registrationDetails: true, letterhead: true, importedFrom: true }), title: z.string().trim().min(1).max(300).optional(),
  paragraphs: z.array(z.string().max(10000)).max(100).optional() }).strict(), req.body);
  const letterhead = await validateCompanyLetterhead(input.profile.letterhead);
  const preview: CompanyDocumentProfile = { version: 1, revision: 0, ...input.profile, letterhead,
    applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [] };
  const title = input.title ?? 'Unsaved company letterhead preview';
  const output = await renderDocxWithTemplate(correspondenceLetterhead(preview), { includeCover: false,
    metadata: { title, submissionType: 'Unsaved company presentation preview', sponsor: preview.companyName },
    sections: [{ title, paragraphs: ['UNSAVED LETTERHEAD PREVIEW — this presentation has not been saved or activated.',
      ...(input.paragraphs ?? [preview.address, preview.contact, preview.registrationDetails].filter(Boolean))] }] });
  await sendAuditedDownload(res, { organizationId: ctx.organizationId, userId: ctx.userId, sourceType: 'export_docx',
    backendRoute: '/api/client-branding/company-documents/letterhead/preview', resourceType: 'company_letterhead_preview', resourceId: String(ctx.organizationId),
    programUuid: null, filename: output.filename, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: output.buffer,
    metadata: { title, purpose: 'preview', unsaved: true, companyBrandingApplied: true, previewPresentationHash: companyProfileHash(preview) } });
}));

const letterheadRenderSchema = z.object({ title: z.string().trim().min(1).max(300).optional(),
    paragraphs: z.array(z.string().max(10000)).max(100).optional(), purpose: z.enum(['company', 'submission']).optional(),
    sequenceId: z.number().int().positive().optional(), variantId: z.string().uuid().optional() }).strict().superRefine((value, ctx) => {
      if (value.purpose === 'submission' && !value.sequenceId) ctx.addIssue({ code: 'custom', message: 'A submission sequence is required for filing correspondence.', path: ['sequenceId'] });
      if (value.purpose !== 'submission' && value.sequenceId !== undefined) ctx.addIssue({ code: 'custom', message: 'A sequence reference requires submission correspondence.', path: ['sequenceId'] });
      if (value.variantId && value.purpose !== 'submission') ctx.addIssue({ code: 'custom', message: 'A stationery variant requires an admitted submission sequence.', path: ['variantId'] });
    });

async function prepareLetterheadDownload(req: Request, input: z.infer<typeof letterheadRenderSchema>) {
  const saved = await readCompanyDocumentProfile(req, false);
  const purpose = input.purpose ?? 'company';
  const filing = purpose === 'submission' ? await prepareSubmissionCorrespondence(req, input.sequenceId!, saved.data, input.variantId) : null;
  const data = !filing ? saved.data : input.variantId ? filing.profile
    : await companyLetterheadForPurpose(usableOrgId(authedOrgId(req))!, 'submission', requestPgClient(req));
  const title = input.title ?? 'Company correspondence';
  const identityLines = data ? [data.address, data.contact, data.registrationDetails].filter(Boolean) : [];
  const paragraphs = [...(filing ? correspondenceFilingParagraphs(filing.origin) : []),
    ...(input.paragraphs ?? (purpose === 'company' ? identityLines : ['Prepare your correspondence here. Review the completed draft before filing.']))];
  const output = await renderDocxWithTemplate(correspondenceLetterhead(data), {
    includeCover: false,
    metadata: { title, submissionType: 'Correspondence', ...(data ? { sponsor: data.companyName, version: `Company profile revision ${data.revision}` } : {}) },
    sections: [{ title, paragraphs: paragraphs.length ? paragraphs : ['Prepare your correspondence here. Review the completed draft before filing.'] }],
  });
  return { filing, data, title, purpose, output };
}

router.post('/letterhead/render', handle(async (req, res) => {
  const input = parseCompanyInput(letterheadRenderSchema, req.body ?? {});
  const { filing, data, title, purpose, output } = await prepareLetterheadDownload(req, input);
  if (filing) await filing.assertCurrent();
  await sendAuditedDownload(res, { organizationId: usableOrgId(authedOrgId(req))!, userId: governedActorId(req)!,
    sourceType: 'export_docx', backendRoute: '/api/client-branding/company-documents/letterhead/render',
    resourceType: filing ? 'submission_correspondence' : 'company_letterhead',
    resourceId: String(filing?.origin.sequenceId ?? usableOrgId(authedOrgId(req))), programUuid: filing?.origin.programId ?? null,
    filename: output.filename, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: output.buffer,
    metadata: { title, purpose, companyBrandingApplied: Boolean(data), ...(filing ? { correspondence: filing.origin } : {}),
      ...(data ? { companyDocumentRevision: data.revision, companyProfileHash: companyProfileHash(data) } : {}) },
  });
}));
router.post('/correspondence/drafts', requireEditorAccess, handle(async (req, res) => {
  res.status(201).json(await createSubmissionCorrespondenceDraft(req, req.body));
}));
router.use('/', companyDocumentActions);
router.use('/', companyDocumentIdentity);
router.use('/', companyDocumentGovernance);
router.use('/', companyLegalWorkflows);
router.use('/', companyDocumentDesigns);
router.use('/', companyLegalInventory);
export default router;
