/** QMS content is the existing Authoring record; snapshots are signed versions, never a second editor. */
import type { Queryable } from '../authoring/authoring-evidence';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from '../authoring/authoring-program-access';
import {resolveAuthoringDocumentScope,decideAuthoringPermission} from '../authoring/authoring-permissions';

export class QmsContentRefusedError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'QmsContentRefusedError';
  }
}

export interface QmsAuthoringSnapshot {
  documentId: string;
  programId: string;
  title: string;
  sections: Array<{ id: string; code: string; title: string; content: string; orderIndex: number }>;
}

export interface QmsContentRecord {
  id: number;
  organization_id: number;
  authoring_document_id?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

async function qmsAuthoringRefusal(db: Queryable, tenantId: number, docId: string, governance: boolean): Promise<
  null | { status: 409 | 503; code: string; error: string }
> {
  try {
    const { rows } = await db.query(
      `SELECT status FROM qms_documents WHERE organization_id = $1 AND authoring_document_id = $2::uuid
       UNION ALL
       SELECT 'signed-version' AS status FROM qms_document_versions WHERE organization_id = $1 AND authoring_document_id = $2::uuid
       UNION ALL
       SELECT 'retained-version' AS status FROM qms_documents WHERE organization_id = $1 AND metadata->'retainedAuthoringDocuments' ? $2::text`,
      [tenantId, docId],
    );
    if (governance && rows.length) return { status: 409, code: 'QMS_SIGN_IN_QUALITY', error: 'This controlled QMS document is reviewed, approved and retired in the Quality register. Its signed lifecycle cannot be changed through the Authoring signing controls.' };
    return rows.some((r: {status: string}) => r.status !== 'draft') ? {
      status: 409, code: 'QMS_DOCUMENT_CONTROLLED',
      error: 'This is a controlled QMS document under review or a retained version. Open a controlled revision in the Quality register before changing its content.',
    } : null;
  } catch {
    return { status: 503, code: 'QMS_CONTENT_GOVERNANCE_UNAVAILABLE', error: 'Controlled-document governance could not be verified. Nothing was changed.' };
  }
}

export const qmsAuthoringWriteRefusal = (db: Queryable, tenantId: number, docId: string) => qmsAuthoringRefusal(db, tenantId, docId, false);

/**
 * A controlled render of a QMS controlled document is the Quality register's
 * controlled copy (MR-12 Stage 8, controlled-copy.ts): the version in force,
 * its QMS approval signature and the CONTROLLED COPY marking. Authoring's own
 * controlled export and Vault filing read the Authoring signature store, which
 * a QMS approval never writes, and would print "no signatures" over an approved
 * SOP, or export a retired one; they are refused for a QMS-bound document. Its
 * working copy, marked DRAFT, stays.
 */
export async function qmsControlledRenderRefusal(db: Queryable, tenantId: number, docId: string): Promise<
  null | { status: 409 | 503; code: string; error: string }
> {
  const bound = await qmsAuthoringRefusal(db, tenantId, docId, true);
  if (!bound) return null;
  if (bound.status === 503) return bound;
  return { status: 409, code: 'QMS_CONTROLLED_COPY_IN_QUALITY',
    error: 'A controlled copy of this QMS controlled document is issued from the Quality register, with its approval signature and CONTROLLED COPY marking. Nothing was exported.' };
}
export const qmsAuthoringGovernanceRefusal = (db: Queryable, tenantId: number, docId: string) => qmsAuthoringRefusal(db, tenantId, docId, true);

/** A Part 11 signing role alone must not bypass the bound document's canonical object permission. */
export async function authorizeQmsAuthoredSignature(db: Queryable, orgId: number, userId: number, content: QmsAuthoringSnapshot): Promise<void> {
  try {
    const {principal}=await authorizeAuthoringProgram(db,{tenantId:orgId,actor:{id:String(userId),email:null},programId:content.programId,forWrite:false});
    const scope=await resolveAuthoringDocumentScope(db,orgId,content.documentId);
    const permission=await decideAuthoringPermission({pool:db,principal,scope,action:'approve'});
    if (!permission.allowed) throw new QmsContentRefusedError(403,'QMS_DOCUMENT_PERMISSION_DENIED','You need approval permission on this authored document before applying its Quality signature. Nothing was signed.');
  } catch(error) {
    if (error instanceof AuthoringProgramAccessError) throw new QmsContentRefusedError(error.status,error.code,error.message);
    throw error;
  }
}

/** Current private programme and object access also governs the personal training reader. */
export async function authorizeQmsContentRead(db: Queryable, orgId: number, userId: number, row: QmsContentRecord): Promise<void> {
  if (!row.authoring_document_id) return;
  const scope = await resolveAuthoringDocumentScope(db, orgId, row.authoring_document_id);
  const program = await db.query(`SELECT client_program_id FROM authoring_documents WHERE id = $1 AND tenant_id = $2`, [row.authoring_document_id, orgId]);
  if (!program.rows[0]?.client_program_id) throw new QmsContentRefusedError(409, 'QMS_CONTENT_REQUIRED', 'The bound authored document is unavailable.');
  try {
    const { principal } = await authorizeAuthoringProgram(db, { tenantId: orgId, actor: { id: String(userId), email: null }, programId: program.rows[0].client_program_id, forWrite: false });
    const permission = await decideAuthoringPermission({ pool: db, principal, scope, action: 'view' });
    if (!permission.allowed) throw new QmsContentRefusedError(403, 'QMS_DOCUMENT_VIEW_DENIED', 'You do not have permission to read this authored document.');
  } catch (error) {
    if (error instanceof AuthoringProgramAccessError) throw new QmsContentRefusedError(error.status, error.code, error.message);
    throw error;
  }
}

/** Caller owns a transaction and has locked the QMS record. Section writers share that lock through the DB trigger. */
export async function captureQmsAuthoringContent(db: Queryable, row: QmsContentRecord, requireText = true): Promise<QmsAuthoringSnapshot> {
  if (!row.authoring_document_id) throw new QmsContentRefusedError(409, 'QMS_CONTENT_REQUIRED',
    'This register entry has no authored document. Bind it to an owned project and author its content before review or approval.');
  const doc = await db.query(
    `SELECT id, title, client_program_id FROM authoring_documents
     WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [row.authoring_document_id, row.organization_id],
  );
  if (!doc.rows[0]?.client_program_id) throw new QmsContentRefusedError(409, 'QMS_CONTENT_REQUIRED', 'The bound authored document could not be read in this organization. Nothing was signed.');
  const result = await db.query(
    `SELECT id, code, title, content, order_index FROM authoring_sections
     WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, id FOR UPDATE`, [row.authoring_document_id, row.organization_id],
  );
  const sections: QmsAuthoringSnapshot['sections'] = result.rows.map((r: Record<string, unknown>) => ({ id: String(r.id), code: String(r.code ?? ''), title: String(r.title ?? ''),
    content: String(r.content ?? ''), orderIndex: Number(r.order_index ?? 0) }));
  const text = (content: string) => content.replace(/<[^>]*>/g, '').replace(/&(?:nbsp|#160|#xA0);/gi, ' ').trim();
  if (requireText && !sections.some((s) => text(s.content))) throw new QmsContentRefusedError(409, 'QMS_CONTENT_REQUIRED',
    'The authored document contains no saved text. Complete and save its content in the document editor before review or approval.');
  return { documentId: String(doc.rows[0].id), programId: String(doc.rows[0].client_program_id), title: String(doc.rows[0].title), sections };
}

export async function persistQmsSignedVersion(db: Queryable, row: QmsContentRecord, content: QmsAuthoringSnapshot, digest: string, signatureId: number): Promise<void> {
  await db.query(
    `INSERT INTO qms_document_versions (organization_id, document_id, version, authoring_document_id,
      controlled_document, sections, content_digest, signature_id, approved_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,NOW())`,
    [row.organization_id, row.id, row.version, content.documentId, JSON.stringify(row), JSON.stringify(content.sections), digest, signatureId],
  );
}
