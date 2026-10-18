import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { COMPANY_LEGAL_KINDS, type CompanyDocumentProfile, type CompanyLegalDocument } from '../../../shared/company-documents';
import { companyLegalRenewal, normalizeCompanyScope, type CompanyLegalRequirement,
  type CompanyLegalWorkflow, type CompanyLegalLifecycleResponse } from '../../../shared/company-legal-workflows';
import type { RequestSqlClient } from '../../db/requestDb';
import { requireCurrentProgramAccess, readCurrentProgramActor, ProgramReadAccessError } from '../c2c/current-program-access';
import { readVaultLifecycleSource } from '../vault/vault-lifecycle';
import { readVaultCmcEvidenceUses, readVaultEstarUses, readVaultPlacements } from '../vault/vault-where-used';
import { createNotification } from '../notifications/notification-service';
import { context, writeProfile, readCompanyLegalDocument, loadCompanyDocumentProfile, CompanyDocumentsError } from './profile';
import { parseCompanyInput } from './validation';
import { companyLegalRequirementCatalog, isInitialMarketingApplication, regionalLegalRequirementId } from './legal-readiness';
import { companyLegalEvidenceRefusal, resolveCompanyLegalEvidence } from './legal-evidence';
import { readSubmissionSequenceForRequest, requireSubmissionReadStillCurrent } from '../submission-service/submission-request-read';
import { canonicalRegionOf, toAgency } from '../../../shared/regulatory/region-identity';

const reason = z.string().trim().min(8).max(2000);
const legalId = z.string().trim().min(1).max(200);
const text = (max: number) => z.string().trim().min(1).max(max);
const nullableLegalId = legalId.nullable();
const authoritySchema = z.object({ signatoryName: text(300), role: text(300), delegationLegalDocumentId: nullableLegalId,
  evidenceVaultDocumentIds: z.array(z.string().uuid()).min(1).max(20) }).strict().nullable();
const signatureSchema = z.object({ method: z.enum(['external_tool', 'manual_evidence']), result: z.enum(['valid', 'invalid', 'inconclusive']),
  tool: text(300), verifiedAt: z.string().datetime(), evidenceVaultDocumentId: z.string().uuid() }).strict().nullable();
export const legalWorkflowUpdateSchema = z.object({ expectedRevision: z.number().int().nonnegative(), reason,
  workflow: z.object({ custodianUserId: z.string().regex(/^[1-9]\d*$/).nullable(), reminderDays: z.array(z.number().int().min(0).max(730)).max(12),
    replacementId: nullableLegalId, revocation: z.object({ reason }).strict().nullable().optional(), authority: authoritySchema,
    signatureEvidence: signatureSchema, translationOfId: nullableLegalId, certifiedTranslationEvidenceVaultDocumentId: z.string().uuid().nullable() }).strict(),
}).strict();
const scope = z.array(z.string().trim().min(1).max(100)).max(100);
export const legalRequirementUpdateSchema = z.object({ expectedRevision: z.number().int().nonnegative(), reason,
  requirement: z.object({ id: legalId.optional(), sequenceId: z.number().int().positive().nullable().optional(), title: text(500), source: z.enum(['regional', 'customer']), regionalCode: legalId.nullable(),
    kind: z.enum(COMPANY_LEGAL_KINDS), agencies: scope, countries: scope, submissionTypes: scope, language: z.string().trim().min(2).max(50).nullable(),
    sectionCode: z.string().trim().min(1).max(64).nullable(), applicability: z.enum(['required', 'not_applicable', 'unresolved']),
    rationale: reason, legalDocumentIds: z.array(legalId).max(50), requiresAuthority: z.boolean().optional(),
    requiresSignatureEvidence: z.boolean().optional(), requiresCertifiedTranslation: z.boolean().optional() }).strict(),
}).strict();
function linkedDocument(profile: CompanyDocumentProfile, document: CompanyLegalDocument, id: string | null, relation: string): CompanyLegalDocument | null {
  if (!id) return null;
  const linked = profile.legalDocuments.find(item => item.id === id && item.programId === document.programId && item.active && !item.workflow?.revokedAt);
  if (!linked || linked.id === document.id) throw new CompanyDocumentsError(409, 'LEGAL_RELATION_UNAVAILABLE', `Select another active legal version in the same program for ${relation}.`);
  return linked;
}
function assertNoRelationCycle(profile: CompanyDocumentProfile, document: CompanyLegalDocument, replacementId: string | null, translationOfId: string | null) {
  for (const [field, id] of [['replacementId', replacementId], ['translationOfId', translationOfId]] as const) {
    const seen = new Set([document.id]);
    let current = id;
    while (current) {
      if (seen.has(current)) throw new CompanyDocumentsError(409, 'LEGAL_RELATION_CYCLE', 'Replacement and translation links must not create a cycle.');
      seen.add(current); current = profile.legalDocuments.find(item => item.id === current)?.workflow?.[field] ?? null;
    }
  }
}
/** Project into the existing work queue; never create a second legal/task store. */
export async function syncCompanyLegalRenewal(q: RequestSqlClient, organizationId: number, userId: number, document: CompanyLegalDocument): Promise<boolean> {
  const access = await requireCurrentProgramAccess(q, { organizationId, userId, programId: document.programId, forShare: true });
  const renewal = companyLegalRenewal(document);
  const open = document.active && !document.workflow?.revokedAt && Boolean(document.expiresOn);
  const changed = await q.query(`INSERT INTO c2c_project_work_items
    (work_item_id,org_id,project_id,source_type,source_id,source_ref,owner_id,title,status,priority,due_at,blocker_type,updated_at,resolved_at)
    VALUES ($1,$2,$3,'company_legal_renewal',0,$4,$5,$6,$7,$8,$9,$10,NOW(),CASE WHEN $7='resolved' THEN NOW() ELSE NULL END)
    ON CONFLICT (org_id,source_type,source_id,source_ref) DO UPDATE SET
      project_id=EXCLUDED.project_id,owner_id=EXCLUDED.owner_id,title=EXCLUDED.title,
      status=CASE WHEN EXCLUDED.status='resolved' THEN 'resolved' ELSE c2c_project_work_items.status END,priority=EXCLUDED.priority,
      due_at=EXCLUDED.due_at,blocker_type=EXCLUDED.blocker_type,updated_at=NOW(),
      resolved_at=CASE WHEN EXCLUDED.status='resolved' THEN COALESCE(c2c_project_work_items.resolved_at,NOW()) ELSE c2c_project_work_items.resolved_at END
    WHERE (c2c_project_work_items.project_id,c2c_project_work_items.owner_id,c2c_project_work_items.title,c2c_project_work_items.priority,c2c_project_work_items.due_at,c2c_project_work_items.blocker_type)
      IS DISTINCT FROM (EXCLUDED.project_id,EXCLUDED.owner_id,EXCLUDED.title,EXCLUDED.priority,EXCLUDED.due_at,EXCLUDED.blocker_type)
      OR (EXCLUDED.status='resolved' AND c2c_project_work_items.status<>'resolved') RETURNING id`,
  [`pwi_legal_${randomUUID()}`, organizationId, access.projectId, document.id, document.workflow?.custodianUserId ? Number(document.workflow.custodianUserId) : null,
    `Renew company legal document: ${document.title}`, open ? 'open' : 'resolved', renewal.status === 'expired' ? 'high' : 'medium',
    open && renewal.dueOn ? `${renewal.dueOn}T00:00:00Z` : null, renewal.status === 'expired' ? 'expired_legal_document' : null]);
  return changed.rows.length > 0;
}
/** Caller holds the organization-settings lock: retries cannot send duplicate threshold notices. */
export async function notifyCompanyLegalRenewal(q: RequestSqlClient, organizationId: number, document: CompanyLegalDocument): Promise<number | null> {
  const renewal = companyLegalRenewal(document);
  const recipient = document.workflow?.custodianUserId ? Number(document.workflow.custodianUserId) : null;
  if (!recipient || !['due', 'expired'].includes(renewal.status)) return null;
  await requireCurrentProgramAccess(q, { organizationId, userId: recipient, programId: document.programId, forShare: true });
  const threshold = renewal.status === 'expired' ? 'expired' : String([...new Set(document.workflow?.reminderDays ?? [])]
    .filter(days => days >= (renewal.daysRemaining ?? Infinity)).sort((a, b) => a - b)[0] ?? 0);
  const key = [document.id, document.contentHash, document.expiresOn, recipient, threshold].join(':');
  const sent = await q.query(`SELECT id FROM mdx_notifications WHERE organization_id=$1 AND category='task_update'
    AND metadata->>'companyLegalReminderKey'=$2 LIMIT 1`, [organizationId, key]);
  if (sent.rows.length) return null;
  return createNotification({ organizationId, recipientUserId: recipient, category: 'task_update',
    severity: renewal.status === 'expired' ? 'critical' : 'warning', title: renewal.status === 'expired' ? 'A company legal document has expired' : 'A company legal document needs renewal',
    body: 'Review the assigned legal renewal in the program work queue. Open Company documents to check the current version and affected filings.',
    resourceType: 'regulatory_program', resourceId: document.programId,
    actionUrl: `/concept2cure/project-home?program=${document.programId}`,
    metadata: { companyLegalReminderKey: key, legalDocumentId: document.id, vaultDocumentId: document.vaultDocumentId, contentHash: document.contentHash, threshold },
  }, q);
}
async function assertExactRegisteredSource(q: RequestSqlClient, organizationId: number, document: CompanyLegalDocument) {
  const source = await readVaultLifecycleSource(q, organizationId, document.vaultDocumentId);
  if (!source || !source.current || source.programId !== document.programId || source.contentHash !== document.contentHash || source.version !== document.version) {
    throw new CompanyDocumentsError(409, 'LEGAL_SOURCE_CHANGED', 'The registered Vault version changed. Refresh and select its current legal version.');
  }
}
type WorkflowContext = Awaited<ReturnType<typeof context>>;
type WorkflowInput = z.infer<typeof legalWorkflowUpdateSchema>['workflow'];
async function admitCustodian(ctx: WorkflowContext, document: CompanyLegalDocument, custodianUserId: string | null) {
  const custodianId = custodianUserId === null ? null : Number(custodianUserId);
  if (custodianId !== null) {
    if (!Number.isSafeInteger(custodianId)) throw new CompanyDocumentsError(400, 'CUSTODIAN_INVALID', 'Choose a valid active organization member.');
    await readCurrentProgramActor(ctx.q, { organizationId: ctx.organizationId, userId: custodianId, forShare: true });
    await requireCurrentProgramAccess(ctx.q, { organizationId: ctx.organizationId, userId: custodianId, programId: document.programId, forShare: true });
  }
}
function admittedRelations(profile: CompanyDocumentProfile, document: CompanyLegalDocument, input: WorkflowInput) {
  const replacement = linkedDocument(profile, document, input.replacementId, 'replacement');
  const translation = linkedDocument(profile, document, input.translationOfId, 'translation');
  const delegation = linkedDocument(profile, document, input.authority?.delegationLegalDocumentId ?? null, 'delegated authority');
  if (delegation && !['power_of_attorney', 'authorization'].includes(delegation.kind)) throw new CompanyDocumentsError(400, 'DELEGATION_KIND_INVALID', 'Delegated authority must reference a power of attorney or authorization.');
  assertNoRelationCycle(profile, document, replacement?.id ?? null, translation?.id ?? null);
  return { replacement, translation, delegation };
}
async function buildAuthority(ctx: WorkflowContext, document: CompanyLegalDocument, input: WorkflowInput['authority']) {
  if (!input) return null;
  const evidence = await Promise.all([...new Set(input.evidenceVaultDocumentIds)].map(id => resolveCompanyLegalEvidence(ctx.q, ctx, document.programId, id)));
  return { signatoryName: input.signatoryName, role: input.role, delegationLegalDocumentId: input.delegationLegalDocumentId,
    evidence, reviewedBy: String(ctx.userId), reviewedAt: new Date().toISOString() };
}
async function buildSignatureEvidence(ctx: WorkflowContext, document: CompanyLegalDocument, input: WorkflowInput) {
  const signature = input.signatureEvidence;
  if (signature && Date.parse(signature.verifiedAt) > Date.now()) throw new CompanyDocumentsError(400, 'VERIFICATION_DATE_INVALID', 'External verification evidence cannot have a future verification date.');
  let signatureEvidence: CompanyLegalWorkflow['signatureEvidence'] = signature ? { method: signature.method,
    result: signature.result, tool: signature.tool, verifiedAt: signature.verifiedAt,
    evidence: await resolveCompanyLegalEvidence(ctx.q, ctx, document.programId, signature.evidenceVaultDocumentId), reviewedBy: String(ctx.userId), recordedAt: new Date().toISOString(),
    verification: 'recorded_external_evidence' as const } : null;
  const previousInvalid = document.workflow?.signatureEvidence?.result === 'invalid' ? document.workflow.signatureEvidence : null;
  if (previousInvalid && input.revocation) signatureEvidence = previousInvalid;
  if (previousInvalid && (!signatureEvidence || signatureEvidence.result === 'inconclusive' ||
    (signatureEvidence.result === 'valid' && signatureEvidence.evidence.contentHash === previousInvalid.evidence.contentHash))) {
    throw new CompanyDocumentsError(409, 'INVALID_SIGNATURE_EVIDENCE_REQUIRES_REVIEW', 'An invalid-signature finding cannot be cleared. Record a new approved verification report reporting valid, or retain the finding and revoke this legal version.');
  }
  return signatureEvidence;
}
function revocationFields(document: CompanyLegalDocument, input: WorkflowInput, userId: number) {
  const previous = document.workflow;
  return { revokedAt: previous?.revokedAt ?? (input.revocation ? new Date().toISOString() : null),
    revokedBy: previous?.revokedBy ?? (input.revocation ? String(userId) : null), revocationReason: previous?.revocationReason ?? input.revocation?.reason ?? null };
}
async function buildWorkflow(ctx: WorkflowContext, document: CompanyLegalDocument, input: WorkflowInput): Promise<CompanyLegalWorkflow> {
  const authority = await buildAuthority(ctx, document, input.authority);
  const signatureEvidence = await buildSignatureEvidence(ctx, document, input);
  const certifiedTranslationEvidence = input.certifiedTranslationEvidenceVaultDocumentId
    ? await resolveCompanyLegalEvidence(ctx.q, ctx, document.programId, input.certifiedTranslationEvidenceVaultDocumentId) : null;
  if (certifiedTranslationEvidence && !input.translationOfId) throw new CompanyDocumentsError(400, 'TRANSLATION_SOURCE_REQUIRED', 'Link the original legal version before attaching certified-translation evidence.');
  return { custodianUserId: input.custodianUserId, reminderDays: [...new Set(input.reminderDays)].sort((a, b) => b - a), replacementId: input.replacementId,
    ...revocationFields(document, input, ctx.userId), authority, signatureEvidence, translationOfId: input.translationOfId, certifiedTranslationEvidence,
    updatedBy: String(ctx.userId), updatedAt: new Date().toISOString() };
}
async function recheckWorkflowEvidence(q: RequestSqlClient, ctx: WorkflowContext, document: CompanyLegalDocument, workflow: CompanyLegalWorkflow) {
  const refs = [...(workflow.authority?.evidence ?? []), ...(workflow.signatureEvidence ? [workflow.signatureEvidence.evidence] : []), ...(workflow.certifiedTranslationEvidence ? [workflow.certifiedTranslationEvidence] : [])];
  for (const ref of refs) {
    const current = await resolveCompanyLegalEvidence(q, ctx, document.programId, ref.vaultDocumentId);
    if (current.contentHash !== ref.contentHash || current.version !== ref.version) throw new CompanyDocumentsError(409, 'LEGAL_EVIDENCE_CHANGED', 'Supporting evidence changed before this legal review could be saved.');
  }
}
export async function updateCompanyLegalWorkflow(req: Request, id: string, body: unknown) {
  const input = parseCompanyInput(legalWorkflowUpdateSchema, body);
  const ctx = await context(req, 'legal');
  const { profile, document } = await readCompanyLegalDocument(req, id);
  await admitCustodian(ctx, document, input.workflow.custodianUserId);
  const relations = admittedRelations(profile, document, input.workflow);
  const workflow = await buildWorkflow(ctx, document, input.workflow);
  const expectedSources = [document, ...Object.values(relations).filter((item): item is CompanyLegalDocument => item !== null)];
  return writeProfile(req, input.expectedRevision, input.reason, before => {
    const current = before.legalDocuments.find(item => item.id === id);
    if (!current || current.contentHash !== document.contentHash) throw new CompanyDocumentsError(409, 'LEGAL_SOURCE_CHANGED', 'The registered legal version changed.');
    return { ...before, legalDocuments: before.legalDocuments.map(item => item.id === id ? { ...item, workflow } : item) };
  }, { capability: 'legal', beforeCommit: async (q, _before, after) => {
    for (const source of expectedSources) await assertExactRegisteredSource(q, ctx.organizationId, source);
    await recheckWorkflowEvidence(q, ctx, document, workflow);
    await admitCustodian({ ...ctx, q }, document, workflow.custodianUserId);
    await syncCompanyLegalRenewal(q, ctx.organizationId, ctx.userId, after.legalDocuments.find(item => item.id === id)!);
    await notifyCompanyLegalRenewal(q, ctx.organizationId, after.legalDocuments.find(item => item.id === id)!);
  } });
}

export async function refreshCompanyLegalReminder(req: Request, id: string, body: unknown) {
  const input = parseCompanyInput(z.object({ expectedRevision: z.number().int().nonnegative(), reason }).strict(), body);
  const ctx = await context(req, 'legal');
  await readCompanyLegalDocument(req, id);
  let notificationId: number | null = null;
  const profile = await writeProfile(req, input.expectedRevision, input.reason, before => before, { capability: 'legal', beforeCommit: async (q, _before, after) => {
    const document = after.legalDocuments.find(item => item.id === id);
    if (!document) throw new CompanyDocumentsError(404, 'LEGAL_DOCUMENT_NOT_FOUND', 'Company legal document not found.');
    await syncCompanyLegalRenewal(q, ctx.organizationId, ctx.userId, document);
    notificationId = await notifyCompanyLegalRenewal(q, ctx.organizationId, document);
  } });
  return { ...profile, notification: { delivered: notificationId !== null, id: notificationId } };
}

export async function readCompanyLegalLifecycle(req: Request, id: string): Promise<CompanyLegalLifecycleResponse> {
  const { document, organizationId, userId, q } = await readCompanyLegalDocument(req, id);
  const [placements, estarUses, cmcEvidence] = await Promise.all([
    readVaultPlacements(q, organizationId, [document.vaultDocumentId], { userId }),
    readVaultEstarUses(q, organizationId, [document.vaultDocumentId], { userId }),
    readVaultCmcEvidenceUses(q, organizationId, [document.vaultDocumentId], { userId }),
  ]);
  let evidenceUnavailable: boolean;
  try { evidenceUnavailable = Boolean(await companyLegalEvidenceRefusal(q, { organizationId, userId }, document)); }
  catch (error) { if (error instanceof CompanyDocumentsError && error.status === 409) evidenceUnavailable = true; else throw error; }
  return { document, renewal: companyLegalRenewal(document), placements: placements.get(document.vaultDocumentId) ?? [], evidenceUnavailable,
    estarUses: estarUses.get(document.vaultDocumentId) ?? [], cmcEvidence: cmcEvidence.get(document.vaultDocumentId) ?? [] };
}
export async function readCompanyLegalCustodians(req: Request, id: string) {
  const ctx = await context(req, 'legal');
  const { document } = await readCompanyLegalDocument(req, id);
  const { rows } = await ctx.q.query(`SELECT u.id,u.name FROM organization_users ou JOIN users u ON u.id=ou.user_id
    WHERE ou.organization_id=$1 AND u.status='active' ORDER BY u.name,u.id`, [ctx.organizationId]);
  const members: Array<{ id: string; name: string }> = [];
  for (const row of rows) {
    try {
      const userId = Number(row.id);
      await requireCurrentProgramAccess(ctx.q, { organizationId: ctx.organizationId, userId, programId: document.programId });
      members.push({ id: String(userId), name: typeof row.name === 'string' && row.name.trim() ? row.name : `Member ${userId}` });
    } catch (error) {
      if (error instanceof ProgramReadAccessError && [403, 404, 409].includes(error.status)) continue;
      throw error;
    }
  }
  await requireCurrentProgramAccess(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId, programId: document.programId });
  return { data: members };
}
function normalizedScopes(input: { agencies: string[]; countries: string[]; submissionTypes: string[] }) {
  const normalize = (values: string[], kind: 'agency' | 'country' | 'submissionType') => [...new Set(values.map(value => {
    const normalized = normalizeCompanyScope(value, kind);
    if (!normalized) throw new CompanyDocumentsError(400, 'UNKNOWN_LEGAL_SCOPE', `Choose a recognized ${kind} from the scope catalog.`);
    return normalized;
  }))];
  return { agencies: normalize(input.agencies, 'agency'), countries: normalize(input.countries, 'country'), submissionTypes: normalize(input.submissionTypes, 'submissionType') };
}
type RequirementInput = z.infer<typeof legalRequirementUpdateSchema>['requirement'];
type RequirementScopes = ReturnType<typeof normalizedScopes>;
type RequirementTarget = Awaited<ReturnType<typeof readSubmissionSequenceForRequest>> | null;
async function admittedRequirementTarget(ctx: WorkflowContext, input: RequirementInput, scopes: RequirementScopes): Promise<RequirementTarget> {
  if (!input.sequenceId) return null;
  const admitted = await readSubmissionSequenceForRequest(ctx.q, ctx, input.sequenceId);
  const country = canonicalRegionOf(admitted.sequenceRegion);
  const agency = country ? toAgency(country) : null;
  const targetScope = normalizedScopes({ agencies: agency ? [agency] : [], countries: country ? [country] : [], submissionTypes: [admitted.applicationType] });
  if (!country || !agency || JSON.stringify(scopes) !== JSON.stringify(targetScope)) throw new CompanyDocumentsError(400, 'REQUIREMENT_TARGET_MISMATCH', 'Use the recorded agency, market and filing type for the selected sequence.');
  return admitted;
}
function requirementTemplate(input: RequirementInput, scopes: RequirementScopes) {
  if (input.source !== 'regional') return null;
  const template = companyLegalRequirementCatalog().requirements.find(item => item.code === input.regionalCode);
  if (!template || scopes.countries.length !== 1 || scopes.countries[0] !== template.country ||
    scopes.agencies.length !== 1 || scopes.agencies[0] !== template.agency || scopes.submissionTypes.length !== 1 ||
    !isInitialMarketingApplication(scopes.submissionTypes[0], template.country)) {
    throw new CompanyDocumentsError(400, 'REGIONAL_REQUIREMENT_SCOPE_INVALID', 'A regional checklist mapping requires its recorded agency, market and one supported initial marketing filing type.');
  }
  if (template.kind && input.kind !== template.kind) throw new CompanyDocumentsError(400, 'REGIONAL_REQUIREMENT_KIND_INVALID', 'Use the document kind identified by this regional legal-companion checklist.');
  return template;
}
function customerRequirementIdentity(profile: CompanyDocumentProfile, input: RequirementInput, admitted: RequirementTarget) {
  const retained = profile.legalRequirements ?? [];
  const existing = retained.find(item => item.id === input.id && item.source === 'customer');
  if (input.id && !existing) throw new CompanyDocumentsError(404, 'REQUIREMENT_NOT_FOUND', 'Customer requirement not found.');
  if (admitted && existing && !existing.sequenceId) {
    const specialization = retained.find(item => item.policyId === existing.id && item.sequenceId === admitted.sequenceId);
    return { id: specialization?.id ?? `requirement_${randomUUID()}`, policyId: existing.id, existing };
  }
  return { id: input.id ?? `requirement_${randomUUID()}`, policyId: existing?.policyId ?? null, existing };
}
async function readMappedDocuments(req: Request, ids: string[], admitted: RequirementTarget) {
  const documents: CompanyLegalDocument[] = [];
  for (const documentId of ids) {
    const source = await readCompanyLegalDocument(req, documentId);
    if (admitted && source.document.programId !== admitted.programId) throw new CompanyDocumentsError(409, 'REQUIREMENT_DOCUMENT_PROGRAM_MISMATCH', 'Map legal versions from the admitted filing program.');
    documents.push(source.document);
  }
  return documents;
}
async function buildRequirement(ctx: WorkflowContext, profile: CompanyDocumentProfile, input: RequirementInput, admitted: RequirementTarget): Promise<CompanyLegalRequirement> {
  const scopes = normalizedScopes(input);
  const template = requirementTemplate(input, scopes);
  const identity = template ? { id: regionalLegalRequirementId(template.code, scopes.submissionTypes[0], admitted?.sequenceId), policyId: null, existing: null }
    : customerRequirementIdentity(profile, input, admitted);
  if (identity.existing?.sequenceId) await readSubmissionSequenceForRequest(ctx.q, ctx, identity.existing.sequenceId);
  return { ...input, ...scopes, id: identity.id, regionalCode: template?.code ?? null,
    sequenceId: admitted?.sequenceId ?? null, programId: admitted?.programId ?? null,
    policyId: identity.policyId, title: template?.label ?? input.title, sectionCode: template?.section ?? input.sectionCode,
    legalDocumentIds: [...new Set(input.legalDocumentIds)], reviewedAt: new Date().toISOString(), reviewedBy: String(ctx.userId) };
}
export async function updateCompanyLegalRequirement(req: Request, body: unknown) {
  const input = parseCompanyInput(legalRequirementUpdateSchema, body);
  const ctx = await context(req, 'legal');
  const profile = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q);
  const admitted = await admittedRequirementTarget(ctx, input.requirement, normalizedScopes(input.requirement));
  const requirement = await buildRequirement(ctx, profile, input.requirement, admitted);
  const documents = await readMappedDocuments(req, requirement.legalDocumentIds, admitted);
  return writeProfile(req, input.expectedRevision, input.reason, before => {
    const retained = (before.legalRequirements ?? []).filter(item => item.id !== requirement.id);
    if (retained.length >= 200) throw new CompanyDocumentsError(409, 'REQUIREMENT_LIMIT', 'The reviewed requirement registry has reached its supported limit.');
    return { ...before, legalRequirements: [...retained, requirement] };
  }, { capability: 'legal', beforeCommit: async q => {
    if (admitted) await requireSubmissionReadStillCurrent(q, admitted);
    for (const document of documents) {
      await requireCurrentProgramAccess(q, { organizationId: ctx.organizationId, userId: ctx.userId, programId: document.programId, forShare: true });
      await assertExactRegisteredSource(q, ctx.organizationId, document);
    }
  } });
}
