/** Figures use the existing upload/capture stores, bound to the actual editor
 * document before any bytes are written. No approval is inherited or granted. */
import type { RequestSqlClient } from '../../db/requestDb';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { looksLikeProgramUuid } from '../../lib/project-id';
import { admitAnaProjectScope, AnaProjectScopeError } from '../ana/project-scope-admission';
import { saveDerivedUpload, type DerivedUploadResult } from '../ana/uploaded-file-access';
import { AUTHORING_IMAGE_MIMES } from '../../export/authoring-images';
import { checkDocumentWritable, reserveWritableDocument, DocumentWriteReservationError } from './document-lock';
import { decideAuthoringPermission, type AuthoringPermissionAction, type AuthoringPrincipal } from './authoring-permissions';

export interface AuthoringImagePool extends RequestSqlClient {
  connect(): Promise<RequestSqlClient & { release(): void }>;
}
export interface AuthoringImageContext {
  pool: AuthoringImagePool;
  tenantId: number;
  actor: { id: string; email: string | null };
  principal: AuthoringPrincipal | null;
}
export interface AuthoringImageInput {
  documentId: unknown;
  file: { buffer: Buffer; mimetype?: string; originalname?: string };
}
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const refused = (status: 400 | 403 | 404 | 409 | 503, code: string, message: string): never => { throw new AnaProjectScopeError(status, code, message); };

interface ImageDocumentInput {
  organizationId: unknown; userId: unknown; documentId: unknown;
  action: 'view' | 'edit'; expectedProgramId?: string; reserve?: boolean;
}
interface VerifiedImageInput extends ImageDocumentInput { organizationId: number; userId: number; documentId: string }

async function imagePrincipal(q: RequestSqlClient, input: VerifiedImageInput): Promise<AuthoringPrincipal> {
  const sql = input.reserve
    ? `SELECT ou.role, to_jsonb(u)->>'email' AS email FROM organization_users ou
        JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
        WHERE ou.user_id=$1 AND ou.organization_id=$2 AND u.status='active' AND o.status='active'
        FOR SHARE OF ou, u, o`
    : `SELECT ou.role, to_jsonb(u)->>'email' AS email FROM organization_users ou
        JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
        WHERE ou.user_id=$1 AND ou.organization_id=$2 AND u.status='active' AND o.status='active'`;
  const membership = await q.query(sql, [input.userId, input.organizationId]);
  const member = membership.rows.length === 1 ? membership.rows[0] : null;
  const role = typeof member?.role === 'string' ? member.role.trim().toLowerCase() : null;
  if (!role || (input.action === 'edit' && !GOVERNED_WRITE_ROLES.has(role))) return refused(403, 'ANA_IMAGE_ACCESS_DENIED', 'Your current organization role cannot perform this figure action.');
  return { id: String(input.userId), email: typeof member?.email === 'string' ? member.email : null, roles: [role.toUpperCase()] };
}

async function writableImageParent(q: RequestSqlClient, input: VerifiedImageInput): Promise<void> {
  if (input.action !== 'edit') return;
  if (input.reserve) { await reserveWritableDocument(q, input.documentId, input.organizationId); return; }
  const verdict = await checkDocumentWritable(q, input.documentId, input.organizationId);
  if (!verdict.writable) return refused(verdict.code === 'DOCUMENT_NOT_FOUND' ? 404 : 403,
    verdict.code ?? 'ANA_IMAGE_ACCESS_DENIED', verdict.reason ?? 'The document cannot be changed.');
}

async function reserveImageGrants(q: RequestSqlClient, input: VerifiedImageInput, projectId: number, principal: AuthoringPrincipal): Promise<void> {
  await q.query('SELECT id FROM projects WHERE id=$1 AND organization_id=$2 FOR SHARE', [projectId, input.organizationId]);
  await q.query('SELECT project_id FROM project_visibility_settings WHERE project_id=$1 AND organization_id=$2 FOR SHARE', [projectId, input.organizationId]);
  await q.query('SELECT project_id FROM project_members WHERE project_id=$1 AND organization_id=$2 AND user_id=$3 FOR SHARE', [projectId, input.organizationId, input.userId]);
  await q.query(`SELECT id FROM doc_permissions WHERE tenant_id=$1 AND doc_id=$2
    AND (principal_id=$3 OR ($4::text IS NOT NULL AND lower(email)=lower($4::text))) FOR SHARE`,
  [input.organizationId, input.documentId, principal.id, principal.email]);
  // A grant changed before reservation is seen by the second decision. The
  // parent reservation excludes signing and updates its MVCC version.
  await admitAuthoringImageDocument(q, { ...input, reserve: false });
}

async function admittedImageParent(q: RequestSqlClient, input: VerifiedImageInput) {
  const principal = await imagePrincipal(q, input);
  await writableImageParent(q, input);
  const { rows } = await q.query('SELECT id, client_program_id, status, created_by FROM authoring_documents WHERE id=$1 AND tenant_id=$2',
    [input.documentId, input.organizationId]);
  if (rows.length !== 1) return refused(404, 'ANA_IMAGE_DOCUMENT_NOT_FOUND', 'Document not found.');
  const doc = rows[0];
  if (!looksLikeProgramUuid(doc.client_program_id)) return refused(409, 'ANA_IMAGE_SCOPE_UNRESOLVED', 'This document needs a verified project before a figure can be used.');
  const programId = String(doc.client_program_id).toLowerCase();
  if (input.expectedProgramId && input.expectedProgramId.toLowerCase() !== programId) return refused(409, 'ANA_IMAGE_SCOPE_MISMATCH', 'The figure and document project relationships do not agree.');
  const scope = await admitAnaProjectScope(q, { organizationId: input.organizationId, userId: input.userId, projectRef: programId });
  if (scope.projectId == null) return refused(409, 'ANA_IMAGE_SCOPE_UNRESOLVED', 'The document project relationship could not be verified.');
  const action: AuthoringPermissionAction = input.action;
  const permission = await decideAuthoringPermission({ pool: q, principal, action, scope: {
    tenantId: input.organizationId, docId: input.documentId, sectionId: null,
    documentStatus: String(doc.status ?? ''), createdBy: String(doc.created_by ?? ''),
  } });
  if (!permission.allowed) return refused(403, 'ANA_IMAGE_DOCUMENT_PERMISSION_DENIED', 'You do not have current permission for this figure on the document.');
  if (input.reserve) await reserveImageGrants(q, input, scope.projectId, principal);
  return { documentId: input.documentId, programId, projectId: scope.projectId };
}

/** Also used by the canonical upload reader for a captured figure's exact
 * authoring parent. An object grant cannot override its original project. */
export async function admitAuthoringImageDocument(q: RequestSqlClient, input: ImageDocumentInput): Promise<{ documentId: string; programId: string; projectId: number }> {
  if (!positiveId(input.organizationId) || !positiveId(input.userId)) return refused(403, 'ANA_IMAGE_ACCESS_DENIED', 'An active organization member is required to access this figure.');
  if (!looksLikeProgramUuid(input.documentId)) return refused(400, 'ANA_IMAGE_DOCUMENT_REQUIRED', 'Choose the document this figure belongs to.');
  const verified: VerifiedImageInput = { ...input, organizationId: input.organizationId, userId: input.userId,
    documentId: String(input.documentId).trim().toLowerCase() };
  try {
    return await admittedImageParent(q, verified);
  } catch (error) {
    if (error instanceof AnaProjectScopeError) throw error;
    if (error instanceof DocumentWriteReservationError) return refused(error.status, error.code, error.message);
    return refused(503, 'ANA_IMAGE_ACCESS_UNAVAILABLE', 'Current document and project access could not be verified. No figure was read or saved.');
  }
}

export async function saveAuthoringImage(ctx: AuthoringImageContext, input: AuthoringImageInput): Promise<DerivedUploadResult> {
  if (!ctx.principal || ctx.principal.id !== ctx.actor.id || !/^[1-9]\d*$/.test(ctx.actor.id)) return refused(403, 'ANA_IMAGE_ACCESS_DENIED', 'A verified author is required to upload a figure.');
  const userId = Number(ctx.actor.id);
  if (!positiveId(userId)) return refused(403, 'ANA_IMAGE_ACCESS_DENIED', 'A verified author is required to upload a figure.');
  if (!Buffer.isBuffer(input.file.buffer) || !input.file.buffer.length || !AUTHORING_IMAGE_MIMES.has(input.file.mimetype ?? '')) return refused(400, 'ANA_IMAGE_FORMAT_INVALID', 'Upload a PNG, JPEG or GIF figure.');
  const parent = await admitAuthoringImageDocument(ctx.pool, { organizationId: ctx.tenantId, userId, documentId: input.documentId, action: 'edit' });
  return saveDerivedUpload({ buffer: input.file.buffer, fileName: input.file.originalname || 'figure', mimeType: input.file.mimetype!,
    organizationId: ctx.tenantId, userId, authoringImage: { pool: ctx.pool, documentId: parent.documentId, programId: parent.programId,
      authorize: q => admitAuthoringImageDocument(q, { organizationId: ctx.tenantId, userId, documentId: parent.documentId,
        expectedProgramId: parent.programId, action: 'edit', reserve: true }).then(() => undefined),
    } });
}
