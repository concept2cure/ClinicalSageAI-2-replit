import { qmsControlledTextInputSchema, type QmsControlledTextInput } from '../../../shared/qms/training';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { writeChainedAuditRow } from '../auditService';
import { computeQmsDocumentContentDigest, type QmsDocumentRow } from './document-approval-signature';
import { currentStanding, QmsTrainingRefused, withQmsTrainingTransaction, type TrainingSqlClient } from './training';
import { trainingObject } from './training-content';
import { QmsControlledTextAuthorshipInvalid, qmsControlledTextAuthorIds, withQmsControlledTextAuthor } from './controlled-text-authorship';
import { routeOpenEditRefusal } from './qms-review-route';

interface ControlledTextSave {
  organizationId: number; userId: number; documentId: number;
  input: QmsControlledTextInput; now?: Date; ipAddress?: string; userAgent?: string;
}

function mergeControlledSections(document: QmsDocumentRow, input: QmsControlledTextInput) {
  const original = document.metadata?.sections;
  if (original != null && !Array.isArray(original)) throw new QmsTrainingRefused(409, 'QMS_CONTROLLED_TEXT_STRUCTURE', 'The stored section structure needs review before its text can be saved.');
  const byKey = new Map<string, Record<string, unknown>>();
  for (const candidate of (original ?? []) as unknown[]) {
    const section = trainingObject(candidate);
    if (typeof section.key !== 'string' || !section.key.trim() || byKey.has(section.key)) throw new QmsTrainingRefused(409, 'QMS_CONTROLLED_TEXT_STRUCTURE', 'The stored section structure needs review before its text can be saved.');
    byKey.set(section.key, section);
  }
  return input.controlledText.sections.map(section => ({ ...byKey.get(section.key), ...section }));
}

function protectAuthorialMetadata(document: QmsDocumentRow, userId: number) {
  try { return withQmsControlledTextAuthor(document.metadata, userId); }
  catch (error) {
    if (error instanceof QmsControlledTextAuthorshipInvalid) throw new QmsTrainingRefused(409, 'QMS_INVALID_AUTHORSHIP', error.message);
    throw error;
  }
}

/** Completes the existing draft writer; it does not edit a released procedure. */
export async function saveQmsControlledText(client: TrainingSqlClient, params: ControlledTextSave): Promise<QmsDocumentRow> {
  const input = qmsControlledTextInputSchema.parse(params.input);
  return withQmsTrainingTransaction(client, async () => {
    const standing = await currentStanding(client, params, true);
    if (standing.decision !== 'allow') throw new QmsTrainingRefused(403, standing.code, standing.reason);
    if (!standing.membershipRole || !GOVERNED_WRITE_ROLES.has(standing.membershipRole)) throw new QmsTrainingRefused(403, 'QMS_CONTROLLED_TEXT_AUTHORITY', 'Current editor access is required to save controlled text.');
    const { rows } = await client.query(
      `SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [params.documentId, params.organizationId],
    );
    const document = rows[0] as QmsDocumentRow | undefined;
    if (!document) throw new QmsTrainingRefused(404, 'QMS_TRAINING_NOT_FOUND', 'Document not found in this organization.');
    if (document.authoring_document_id) throw new QmsTrainingRefused(409, 'QMS_EDIT_IN_AUTHORING', 'Open this controlled document in the Quality document workbench to edit its canonical authored sections.');
    if (!['draft', 'in_review'].includes(document.status)) throw new QmsTrainingRefused(409, 'QMS_DOCUMENT_CONTROLLED', 'Released controlled text changes only through a revision. Nothing was saved.');
    // RR4 (§2.9): saving demotes a document in review to draft, an exit from review; refused while its route is open.
    const routeOpen = await routeOpenEditRefusal(client, document);
    if (routeOpen) throw new QmsTrainingRefused(409, 'QMS_ROUTE_OPEN', `${routeOpen} Nothing was saved.`);
    const beforeDigest = computeQmsDocumentContentDigest(document);
    if (input.controlledText.documentVersion !== document.version || input.controlledText.contentDigest !== beforeDigest) throw new QmsTrainingRefused(409, 'QMS_CONTROLLED_TEXT_STALE', 'The controlled document changed. Reload it before saving.');
    const metadata: Record<string, unknown> = { ...protectAuthorialMetadata(document, params.userId), sections: mergeControlledSections(document, input) };
    delete metadata.approval;
    const updated = await client.query(
      `UPDATE qms_documents SET metadata = $3::jsonb, status = 'draft', approver_id = NULL,
         approved_at = NULL, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status IN ('draft', 'in_review') AND deleted_at IS NULL
       RETURNING *`,
      [params.documentId, params.organizationId, JSON.stringify(metadata)],
    );
    const saved = updated.rows[0] as QmsDocumentRow | undefined;
    if (!saved) throw new QmsTrainingRefused(409, 'QMS_CONTROLLED_TEXT_STALE', 'The controlled document changed. Reload it before saving.');
    await writeChainedAuditRow(client, {
      tenantId: params.organizationId, userId: params.userId, action: 'mdx.qms.document.controlled_text',
      resourceType: 'qms_document', resourceId: String(params.documentId), reason: input.reason,
      ipAddress: params.ipAddress, userAgent: params.userAgent,
      details: { reason: input.reason, documentVersion: document.version, beforeDigest, contentDigest: computeQmsDocumentContentDigest(saved),
        previousStatus: document.status, newStatus: saved.status, originalAuthorId: document.author_id,
        controlledTextAuthorUserIds: qmsControlledTextAuthorIds(saved.metadata), sectionKeys: input.controlledText.sections.map(section => section.key) },
    });
    return saved;
  }, 'The controlled text save could not be confirmed. Reload the document to check the saved text before trying again.');
}
