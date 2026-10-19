/** Composes QMS registration with canonical Authoring transactions and permissions. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { insertDocumentTx, type CreateContext, type SectionSeed } from '../authoring/authoring-documents';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from '../authoring/authoring-program-access';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { recordGovernedAction } from '../../routes/c2c/actions';
import { captureQmsAuthoringContent, QmsContentRefusedError } from './controlled-document-content';
import { getSopTemplate, STANDARD_SECTIONS } from './sopTemplates';
import { resolveAuthoringDocumentScope, decideAuthoringPermission, grantAuthoringPermission } from '../authoring/authoring-permissions';
import { checkDocumentWritable } from '../authoring/document-lock';
import { resolveSignerOrgRole } from '../part11/resolve-signer-role';
import { qmsTrainingSections } from './training-content';
import { computeQmsDocumentContentDigest, type QmsDocumentRow } from './document-approval-signature';
import type { RequestSqlClient } from '../../db/requestDb';

type QmsReadContext = Pick<CreateContext, 'tenantId' | 'actor'> & { pool: RequestSqlClient };

export const controlledQmsCreateSchema = z.object({
  title: z.string().trim().min(1).max(300), docType: z.enum(['sop', 'wi', 'form', 'spec', 'policy', 'manual', 'protocol', 'curriculum']),
  programId: z.string().uuid(), docNumber: z.string().trim().min(1).max(60).optional(),
  templateKey: z.string().max(80).optional(), category: z.string().max(60).nullable().optional(),
  nextReviewDate: z.string().date().nullable().optional(), reason: z.string().trim().min(8).max(2000),
}).strict();
type ControlledQmsCreate = z.infer<typeof controlledQmsCreateSchema>;

const PREFIX: Record<ControlledQmsCreate['docType'], string> = {
  sop: 'SOP-', wi: 'WI-', form: 'FORM-', spec: 'SPEC-', policy: 'POL-', manual: 'QM-', protocol: 'VP-', curriculum: 'TRN-',
};

function parseCreate(raw: unknown): ControlledQmsCreate {
  const parsed = controlledQmsCreateSchema.safeParse(raw);
  if (!parsed.success) throw new QmsContentRefusedError(400, 'QMS_CREATE_INVALID', 'Choose an owned project, document type and title, and state a reason of at least eight characters.');
  if (parsed.data.templateKey && !getSopTemplate(parsed.data.templateKey)) throw new QmsContentRefusedError(400, 'QMS_TEMPLATE_UNKNOWN', 'The requested Quality template does not exist.');
  return parsed.data;
}

function seedsFor(input: ControlledQmsCreate): SectionSeed[] {
  const template = input.templateKey ? getSopTemplate(input.templateKey) : undefined;
  return (template?.sections ?? STANDARD_SECTIONS).map((s) => ({ code: `qms-${s.key}`, title: s.label, content: '', orderIndex: s.order,
    changeReason: input.reason, metadata: { qmsTemplate: input.templateKey ?? null, authoringHint: s.hint ?? null } }));
}

async function ownedProgram(ctx: QmsReadContext, programId: string): Promise<void> {
  try {
    await authorizeAuthoringProgram(ctx.pool, { tenantId: ctx.tenantId, actor: ctx.actor, programId });
  } catch (error) {
    if (error instanceof AuthoringProgramAccessError) throw new QmsContentRefusedError(error.status,error.code,error.message);
    throw error;
  }
}

async function requireContentAccess(ctx: QmsReadContext, docId: string, action: 'view' | 'edit'): Promise<void> {
  const scope = await resolveAuthoringDocumentScope(ctx.pool, ctx.tenantId, docId);
  const role = await resolveSignerOrgRole(Number(ctx.actor.id), ctx.tenantId, ctx.pool);
  const access = await decideAuthoringPermission({ pool: ctx.pool, scope,
    principal: { id: ctx.actor.id, email: ctx.actor.email, roles: role ? [role.toUpperCase()] : [] }, action });
  /* P-40: say which refusal this is. `decideAuthoringPermission` refuses an
     edit of a FROZEN or APPROVED document before it looks at any grant, so
     collapsing every outcome into the permission sentence told the owner of a
     sealed document that they lacked permission on it — false, and it named no
     remedy. The decider already distinguishes them; this stopped discarding
     it. The remedy is performable: a controlled revision copies the sealed
     text onto a new version and leaves the signed one intact. */
  if (access.reason === 'document-immutable') {
    throw new QmsContentRefusedError(409, 'QMS_DOCUMENT_SEALED',
      "This document's text is sealed: it was frozen or approved, and sealed text is part of the signed record. "
      + 'Open a controlled revision to continue — it copies this text into a new version and leaves the signed one intact.');
  }
  if (!access.allowed) throw new QmsContentRefusedError(403, 'QMS_DOCUMENT_PERMISSION_DENIED', 'You do not have permission to read or change this authored document.');
}

/** A new regulated editing copy must be usable by its creator before its transaction can commit. */
async function grantControlledOwnership(ctx: CreateContext, docId: string, client: Parameters<typeof grantAuthoringPermission>[0]['pool']): Promise<void> {
  for (const role of ['OWNER','AUTHOR'] as const) await grantAuthoringPermission({ pool: client,tenantId:ctx.tenantId,docId,
    principalId:ctx.actor.id,email:ctx.actor.email,role,grantedBy:ctx.actor.id,reason:'Controlled document creator' });
}

/** The QMS INSERT and canonical document/sections/audit land in the same existing Authoring transaction. */
export async function createControlledQmsDocument(ctx: CreateContext, raw: unknown): Promise<Record<string, any>> {
  const input = parseCreate(raw);
  const docId = randomUUID();
  let registered: Record<string, any> | undefined;
  const template = input.templateKey ? getSopTemplate(input.templateKey) : undefined;
  await insertDocumentTx(ctx, { docId, title: input.title, module: null, productCode: null, locale: 'en-US', templateId: null,
    clientProgramId: input.programId, binding: { documentId: null, reason: 'An organization controlled procedure is not a regulatory filing.' } }, seedsFor(input), async (client) => {
    await setTenantContextTx(client, ctx.tenantId);
    await ownedProgram({ ...ctx, pool: client },input.programId);
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [ctx.tenantId, 143]);
    let number = input.docNumber;
    if (!number) {
      const prefix = template?.numberPrefix ?? PREFIX[input.docType];
      const prior = await client.query(`SELECT doc_number FROM qms_documents WHERE organization_id = $1 AND doc_number LIKE $2`, [ctx.tenantId, `${prefix}%`]);
      const maximum = prior.rows.reduce((max: number, r: {doc_number: unknown}) => { const suffix = String(r.doc_number).slice(prefix.length); return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max; }, 0);
      number = `${prefix}${String(maximum + 1).padStart(3, '0')}`;
    }
    const result = await client.query(`INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, category, version, status,
      next_review_date, author_id, authoring_document_id, metadata)
      VALUES ($1,$2,$3,$4,$5,'1.0','draft',$6,$7,$8,$9::jsonb) RETURNING *`,
      [ctx.tenantId, number, input.title, template?.docType ?? input.docType, input.category ?? template?.category ?? null,
        input.nextReviewDate ?? null, Number(ctx.actor.id), docId, JSON.stringify({ programId: input.programId, templateKey: input.templateKey ?? null, sections: template?.sections ?? STANDARD_SECTIONS })]);
    registered = result.rows[0];
    await recordGovernedAction(client, { orgId: ctx.tenantId, userId: Number(ctx.actor.id), command: 'transition', target: `qms-document:${registered!.id}`,
      reason: input.reason, payload: { kind: 'create', docNumber: number, authoringDocumentId: docId, programId: input.programId }, domain: 'qms', surface: 'quality' });
  }, (client) => grantControlledOwnership(ctx,docId,client));
  return registered!;
}

/** Bind an existing draft without assigning invented text to a legacy signed record. */
export async function bindControlledQmsDocument(ctx: CreateContext, id: number, raw: unknown): Promise<Record<string, any>> {
  const body = z.object({ programId: z.string().uuid(), templateKey: z.string().optional(), reason: z.string().trim().min(8) }).safeParse(raw);
  if (!body.success) throw new QmsContentRefusedError(400, 'QMS_BIND_INVALID', 'Choose an owned project and state the reason for binding this draft.');
  const current = await ctx.pool.query(`SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [id, ctx.tenantId]);
  const row = current.rows[0];
  if (!row) throw new QmsContentRefusedError(404, 'QMS_DOCUMENT_NOT_FOUND', 'Document not found.');
  const input = parseCreate({ title: row.title, docType: row.doc_type, ...body.data });
  const docId = randomUUID();
  let bound: Record<string, any> | undefined;
  await insertDocumentTx(ctx, { docId, title: row.title, module: null, productCode: null, locale: 'en-US', templateId: null,
    clientProgramId: input.programId, binding: { documentId: null } }, seedsFor(input), async (client) => {
    await setTenantContextTx(client, ctx.tenantId);
    await ownedProgram({ ...ctx, pool: client },input.programId);
    const result = await client.query(`UPDATE qms_documents SET authoring_document_id = $3,
      metadata = COALESCE(metadata,'{}'::jsonb) || $4::jsonb, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status = 'draft' AND authoring_document_id IS NULL AND deleted_at IS NULL RETURNING *`,
      [id, ctx.tenantId, docId, JSON.stringify({ programId: input.programId, templateKey: input.templateKey ?? null })]);
    if (!result.rows[0]) throw new QmsContentRefusedError(409, 'QMS_DOCUMENT_CONTROLLED', 'Only an unbound draft may be bound. Nothing was created.');
    bound = result.rows[0];
    await recordGovernedAction(client, { orgId: ctx.tenantId, userId: Number(ctx.actor.id), command: 'transition', target: `qms-document:${id}`,
      reason: input.reason, payload: { kind: 'bind-content', authoringDocumentId: docId, programId: input.programId }, domain: 'qms', surface: 'quality' });
  }, (client) => grantControlledOwnership(ctx,docId,client));
  return bound!;
}

function qmsRegisterUpdateArgs(body: { title?: string; docNumber?: string; docType?: string; category?: string | null;
  nextReviewDate?: string | null; status?: string }, id: number, tenantId: number): unknown[] {
  return [id, tenantId, body.title ?? null, body.docNumber ?? null, body.docType ?? null,
    'category' in body, body.category ?? null, 'nextReviewDate' in body, body.nextReviewDate ?? null, body.status ?? null];
}

/** Registry metadata and review are audited with their canonical editing copy on one transaction. */
export async function updateControlledQmsDocument(ctx: CreateContext, id: number, raw: unknown): Promise<Record<string, any>> {
  const parsed = z.object({ title: z.string().trim().min(1).max(300).optional(), docNumber: z.string().trim().min(1).max(60).optional(),
    docType: controlledQmsCreateSchema.shape.docType.optional(), category: z.string().max(60).nullable().optional(),
    nextReviewDate: z.string().date().nullable().optional(), status: z.enum(['draft','in_review']).optional(),
    reason: z.string().trim().min(8).max(2000),
  }).strict().safeParse(raw);
  if (!parsed.success) throw new QmsContentRefusedError(400, 'QMS_UPDATE_INVALID', 'State a reason of at least eight characters. Edit document text in the canonical editor, and change its version through a controlled revision.');
  const body = parsed.data; const client = await ctx.pool.connect();
  try {
    await client.query('BEGIN'); await setTenantContextTx(client, ctx.tenantId);
    const current = await client.query(`SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`, [id, ctx.tenantId]);
    const row = current.rows[0];
    if (!row) throw new QmsContentRefusedError(404, 'QMS_DOCUMENT_NOT_FOUND', 'Document not found.');
    if (row.status !== 'draft') throw new QmsContentRefusedError(409, 'QMS_DOCUMENT_CONTROLLED', 'Only a draft can be edited or sent for review. Open a controlled revision before changing this document.');
    // Use the enlisted connection: PGlite and production both observe the same locked scope.
    if (row.authoring_document_id) await requireContentAccess({ ...ctx, pool: client }, row.authoring_document_id, 'edit');
    if (body.status === 'in_review') {
      if (row.authoring_document_id) await captureQmsAuthoringContent(client, row);
      else if (!qmsTrainingSections(row).length) throw new QmsContentRefusedError(409, 'QMS_CONTENT_REQUIRED', 'Save controlled procedure text before sending this draft for review.');
    }
    if (row.authoring_document_id && (body.title || body.status === 'in_review')) await client.query(
      `UPDATE authoring_documents SET title = COALESCE($3,title), status = COALESCE($4,status), updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [row.authoring_document_id, ctx.tenantId, body.title ?? null, body.status === 'in_review' ? 'IN_REVIEW' : null]);
    const result = await client.query(`UPDATE qms_documents SET title = COALESCE($3,title), doc_number = COALESCE($4,doc_number),
      doc_type = COALESCE($5,doc_type), category = CASE WHEN $6 THEN $7 ELSE category END,
      next_review_date = CASE WHEN $8 THEN $9::date ELSE next_review_date END, status = COALESCE($10,status), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 RETURNING *`, qmsRegisterUpdateArgs(body, id, ctx.tenantId));
    await recordGovernedAction(client, { orgId: ctx.tenantId, userId: Number(ctx.actor.id), command: 'transition', target: `qms-document:${id}`,
      reason: body.reason, payload: { kind: body.status === 'in_review' ? 'send-for-review' : 'update-register', changedFields: Object.keys(body).filter((k) => k !== 'reason') }, domain: 'qms', surface: 'quality' });
    await client.query('COMMIT'); return result.rows[0];
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { client.release(); }
}

/** Revision changes the current pointer; the previously signed editing copy and version snapshot remain intact. */
export async function reviseControlledQmsDocument(ctx: CreateContext, id: number, reason: string, legacyBinding?: { programId?: unknown; templateKey?: unknown }): Promise<Record<string, any>> {
  if (reason.trim().length < 8) throw new QmsContentRefusedError(400, 'QMS_REASON_REQUIRED', 'State a reason for revision of at least eight characters.');
  const current = await ctx.pool.query(`SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [id, ctx.tenantId]);
  const row = current.rows[0];
  if (!row) throw new QmsContentRefusedError(404, 'QMS_DOCUMENT_NOT_FOUND', 'Document not found.');
  if (!row.authoring_document_id) return reviseLegacyRegistryDocument(ctx, row, reason, legacyBinding);
  await requireContentAccess(ctx, row.authoring_document_id, 'view');
  const client = await ctx.pool.connect();
  let copy;
  try { await client.query('BEGIN'); await setTenantContextTx(client, ctx.tenantId); copy = await captureQmsAuthoringContent(client, row, false); }
  finally { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
  const docId = randomUUID();
  const nextVersion = `${Number.parseInt(String(row.version), 10) + 1 || 2}.0`;
  let revised: Record<string, any> | undefined;
  await insertDocumentTx(ctx, { docId, title: row.title, module: null, productCode: null, locale: 'en-US', templateId: null,
    clientProgramId: copy.programId, binding: { documentId: null } }, copy.sections.map((s) => ({ code: s.code, title: s.title, content: s.content,
      orderIndex: s.orderIndex, changeReason: reason, metadata: { copiedFromQmsVersion: row.version, sourceDocumentId: copy.documentId, sourceSectionId: s.id } })), async (tx) => {
    await setTenantContextTx(tx, ctx.tenantId);
    await ownedProgram({ ...ctx, pool: tx },copy.programId);
    const locked = await tx.query(`SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`, [id, ctx.tenantId]);
    const live = locked.rows[0];
    /* P-40: a `draft` whose editing copy is SEALED is revisable, and nothing
       else about `draft` is. Such an entry could otherwise go nowhere — it
       cannot be sent for review (the seal, correctly) and there is no unfreeze
       and no new-version route on the authoring side, so the frozen message's
       own "create a new version" had nothing behind it. A revision is exactly
       that: the sealed text is copied onto a new editing copy, the version is
       bumped, the old document id is retained and the seal and its signatures
       are untouched. The condition is the seal, because without it this would
       be a free version bump on any draft — a new door, not a remedy. */
    const sealedCopy = (await checkDocumentWritable(tx, copy.documentId, ctx.tenantId)).code === 'DOCUMENT_FROZEN';
    const revisableState = ['effective','retired','superseded','in_review'].includes(live?.status)
      || (live?.status === 'draft' && sealedCopy);
    if (!live || live.version !== row.version || live.authoring_document_id !== copy.documentId || !revisableState)
      throw new QmsContentRefusedError(409, 'QMS_INVALID_STATE', 'The controlled document changed, or is a draft whose text is not sealed. Reopen it before revising.');
    // Re-read under the governing lock so a concurrent review edit cannot be copied from an earlier state.
    const latest = await captureQmsAuthoringContent(tx, live, false);
    if (JSON.stringify(latest) !== JSON.stringify(copy)) throw new QmsContentRefusedError(409, 'QMS_CONTENT_CHANGED', 'The saved content changed. Reopen this document before revising.');
    const metadata = { ...(live.metadata ?? {}), programId: copy.programId,
      retainedAuthoringDocuments: [...(Array.isArray(live.metadata?.retainedAuthoringDocuments) ? live.metadata.retainedAuthoringDocuments : []), copy.documentId],
      lastRevision: { reason, from: live.version, by: Number(ctx.actor.id), sourceDocumentId: copy.documentId } };
    delete metadata.approval; delete metadata.retired; delete metadata.authoringContent;
    const result = await tx.query(`UPDATE qms_documents SET version = $3, status = 'draft', author_id = $4, approver_id = NULL, approved_at = NULL,
      effective_date = NULL, authoring_document_id = $5, metadata = $6::jsonb, updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, ctx.tenantId, nextVersion, Number(ctx.actor.id), docId, JSON.stringify(metadata)]);
    revised = result.rows[0];
    await recordGovernedAction(tx, { orgId: ctx.tenantId, userId: Number(ctx.actor.id), command: 'transition', target: `qms-document:${id}`,
      reason, payload: { kind: 'revise', from: live.version, to: nextVersion, sourceDocumentId: copy.documentId, authoringDocumentId: docId }, domain: 'qms', surface: 'quality' });
  }, (client) => grantControlledOwnership(ctx,docId,client));
  return revised!;
}

/** Explicit recovery of a previously approved metadata-only entry, without inventing a prior authored document or signature. */
async function reviseLegacyRegistryDocument(ctx: CreateContext, previous: Record<string, any>, reason: string, options?: { programId?: unknown; templateKey?: unknown }): Promise<Record<string, any>> {
  if (!options?.programId) throw new QmsContentRefusedError(409, 'QMS_LEGACY_REVISION_PROJECT_REQUIRED', 'This retained registry entry has no authored document. Choose an owned project and a Quality template to start its next revision; the previous registry record will be retained without claiming authored text.');
  const input = parseCreate({ title: previous.title, docType: previous.doc_type, programId: options.programId, templateKey: options.templateKey, reason });
  const docId = randomUUID(); let revised: Record<string, any> | undefined;
  await insertDocumentTx(ctx, { docId, title: previous.title, module: null, productCode: null, locale: 'en-US', templateId: null,
    clientProgramId: input.programId, binding: { documentId: null } }, seedsFor(input), async (client) => {
    await setTenantContextTx(client, ctx.tenantId);
    await ownedProgram({ ...ctx, pool: client },input.programId);
    const current = await client.query(`SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`,[previous.id,ctx.tenantId]);
    const row = current.rows[0];
    if (!row || row.authoring_document_id || row.version !== previous.version || !['effective','retired','superseded','in_review'].includes(row.status))
      throw new QmsContentRefusedError(409,'QMS_INVALID_STATE','This registry entry changed or is already a draft. Reopen it before revising.');
    await client.query(`INSERT INTO qms_document_versions (organization_id,document_id,version,record_kind,controlled_document,sections,content_digest,approved_at)
      VALUES ($1,$2,$3,'legacy-registry',$4::jsonb,'[]'::jsonb,$5,$6)`,
      [ctx.tenantId,row.id,row.version,JSON.stringify(row),computeQmsDocumentContentDigest(row as QmsDocumentRow),row.approved_at ?? null]);
    const metadata = { ...(row.metadata ?? {}), programId: input.programId, templateKey: input.templateKey ?? null,
      lastRevision: { reason, from: row.version, by: Number(ctx.actor.id), source: 'legacy-registry', priorAuthoredContentAvailable: false } };
    delete metadata.approval; delete metadata.retired; delete metadata.authoringContent;
    const result = await client.query(`UPDATE qms_documents SET version=$3,status='draft',author_id=$4,approver_id=NULL,approved_at=NULL,effective_date=NULL,
      authoring_document_id=$5,metadata=$6::jsonb,updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *`,
      [row.id,ctx.tenantId,`${Number.parseInt(String(row.version),10)+1||2}.0`,Number(ctx.actor.id),docId,JSON.stringify(metadata)]);
    revised = result.rows[0];
    await recordGovernedAction(client,{orgId:ctx.tenantId,userId:Number(ctx.actor.id),command:'transition',target:`qms-document:${row.id}`,reason,
      payload:{kind:'revise-legacy-registry',from:row.version,to:revised!.version,authoringDocumentId:docId,priorAuthoredContentAvailable:false},domain:'qms',surface:'quality'});
  }, (client) => grantControlledOwnership(ctx,docId,client));
  return revised!;
}
