/**
 * Document attachments — the acts.
 *
 * The third piece of the attachment family, and the one that touches the
 * database:
 *
 *   errors.ts            the three exceptions, so nothing imports in a circle
 *   attachment-input.ts  the shape a record must have before it may be written
 *   attachment-service   this file: list, get, add, remove — tenant-scoped
 *                        and, for the two writes, audited in the same
 *                        transaction as the act
 *
 * ── The tenant boundary, and why it is here rather than in the database ──────
 * `document_attachments` carries no organization_id of its own. It reaches a
 * tenant only through `document_id -> unified_documents.organizationId`, and
 * neither table is RLS-protected (the 20260206 migration enables row-level
 * security on the unrelated `orchestration.*` run tables). So the walk in
 * `requireOwnedDocument` IS the boundary — there is no second line of defence
 * underneath it, which is why every public method here starts with it and why
 * an unusable organization fails closed rather than reaching a query as NaN.
 *
 * ── The honesty rule these methods exist to keep ─────────────────────────────
 * add() and remove() used to write `attachment_added` / `attachment_removed`
 * into document_audit_logs and never touch document_attachments at all — the
 * insert and the delete were comments. Anything reading that trail would have
 * been told a file was attached to a regulated document when no row existed.
 * Now the act and its audit happen in ONE transaction, so a failure of either
 * rolls back both: the ledger never records an attachment that was not made,
 * and none is made without its audit entry (§ 11.10(e)) — the contract the c2c
 * evidence-delete path is already held to.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { RequestDb } from '../../db/requestDb';
import {
  unifiedDocuments,
  documentAttachments,
  documentAuditLogs,
} from '../../../shared/schema/unified_workflow';
import { assertAttachmentRecordable, requireOrgId } from './attachment-input';
import { AttachmentNotFoundException, DocumentNotFoundException } from './errors';

export class DocumentAttachmentService {
  constructor(private db: RequestDb) {}

  /**
   * Resolve a document the caller's organization owns, or throw.
   *
   * Takes the handle to run on so the writes below can use their transaction:
   * ownership must be established INSIDE the transaction that mutates, not in
   * a separate read that could observe a different state.
   */
  private async requireOwnedDocument(tx: any, documentId: number, orgId: number) {
    const rows = await tx
      .select()
      .from(unifiedDocuments)
      .where(
        and(
          eq(unifiedDocuments.id, documentId),
          eq(unifiedDocuments.organizationId, orgId)
        )
      )
      .limit(1);
    // A document in another tenancy reports the same "not found" as one that
    // does not exist, so the error cannot be used to probe for document ids.
    if (!rows.length) throw new DocumentNotFoundException(documentId);
    return rows[0];
  }

  /**
   * Prove the caller's organization owns a document, and nothing more.
   *
   * The upload route calls this BEFORE it hands bytes to the storage provider:
   * a document the caller cannot see must fail here, cheaply, rather than
   * after a file has been written into the vault with nothing to reference it.
   *
   * @param documentId Document ID
   * @param organizationId The caller's organization ID (required)
   */
  async assertDocumentOwned(documentId: number, organizationId: unknown): Promise<void> {
    const orgId = requireOrgId(organizationId, 'assertDocumentOwned');
    await this.requireOwnedDocument(this.db, documentId, orgId);
  }

  /**
   * List a document's attachments, newest first.
   *
   * This is the reader half. Until it existed, document_attachments had a
   * writer and no reader anywhere in the codebase — a row could be stored,
   * audited and removed without any surface ever being able to show it, which
   * is the "writerless store" defect (918c9e801) seen from the other side.
   *
   * Ownership through the document, exactly as the writers do, so attachments
   * on another organization's document are not listable. The predicate on
   * document_id is the only one the table offers, and it is bound to a
   * document just proven to be the caller's.
   *
   * `uploaded_at DESC, id DESC`: the id tiebreak keeps the order total when
   * two uploads share a timestamp, which `now()` at transaction granularity
   * makes routine.
   *
   * @param documentId Document ID
   * @param organizationId The caller's organization ID (required)
   * @returns Attachment rows, newest first
   */
  async list(documentId: number, organizationId: unknown) {
    const orgId = requireOrgId(organizationId, 'listDocumentAttachments');
    await this.requireOwnedDocument(this.db, documentId, orgId);

    return this.db
      .select()
      .from(documentAttachments)
      .where(eq(documentAttachments.documentId, documentId))
      .orderBy(desc(documentAttachments.uploadedAt), desc(documentAttachments.id));
  }

  /**
   * One attachment — the record a download route needs before it may ask the
   * storage provider for bytes.
   *
   * Ownership through the document first, then the attachment keyed by BOTH
   * its id and the document id, so an attachment cannot be reached through a
   * document it does not belong to. A foreign or missing attachment is the
   * same AttachmentNotFoundException — never "forbidden", which would confirm
   * the id exists.
   *
   * @param documentId Document ID
   * @param attachmentId Attachment ID
   * @param organizationId The caller's organization ID (required)
   * @returns The attachment row
   */
  async get(documentId: number, attachmentId: number, organizationId: unknown) {
    const orgId = requireOrgId(organizationId, 'getDocumentAttachment');
    await this.requireOwnedDocument(this.db, documentId, orgId);

    const rows = await this.db
      .select()
      .from(documentAttachments)
      .where(
        and(
          eq(documentAttachments.id, attachmentId),
          eq(documentAttachments.documentId, documentId)
        )
      )
      .limit(1);
    if (!rows.length) throw new AttachmentNotFoundException(attachmentId);
    return rows[0];
  }

  /**
   * Record an attachment on a document, and audit it in the same transaction.
   *
   * The bytes are not this method's business: `filePath` is the storage
   * provider's version id (see attachment-input), and the upload route has
   * already proven the bytes safe and stored them before calling here.
   *
   * @param documentId Document ID
   * @param attachmentData Attachment record (see DocumentAttachmentInput)
   * @param userId User adding the attachment
   * @param organizationId The caller's organization ID (required)
   * @returns The stored attachment row
   */
  async add(
    documentId: number,
    attachmentData: unknown,
    userId: string,
    organizationId: unknown
  ) {
    const orgId = requireOrgId(organizationId, 'addDocumentAttachment');
    // Validate before opening the transaction: a rejected payload should cost
    // nothing and should say which field is wrong.
    assertAttachmentRecordable(attachmentData);
    const attachment = attachmentData;

    return this.db.transaction(async (tx: any) => {
      await this.requireOwnedDocument(tx, documentId, orgId);

      const [stored] = await tx
        .insert(documentAttachments)
        .values({
          documentId,
          fileName: attachment.fileName,
          fileType: attachment.fileType,
          fileSize: attachment.fileSize,
          filePath: attachment.filePath,
          uploadedBy: userId,
          description: attachment.description ?? null,
          metadata: attachment.metadata ?? {},
        })
        .returning();

      // Audited only now that the row exists, and with the identifiers the
      // insert actually produced rather than the ones that were requested.
      await tx.insert(documentAuditLogs).values({
        documentId,
        action: 'attachment_added',
        performedBy: userId,
        details: {
          field: 'attachments',
          action: 'add',
          attachmentId: stored.id,
          fileName: stored.fileName,
          fileType: stored.fileType,
          fileSize: stored.fileSize,
        },
      });

      return stored;
    });
  }

  /**
   * Remove an attachment, and audit it in the same transaction.
   *
   * The delete is scoped by BOTH the attachment id and the document id, so an
   * attachment cannot be removed via a document the caller does not own, and
   * the audit row is written only when a row was actually removed — deleting
   * nothing and recording a removal is the original fabrication in miniature.
   *
   * The removal is a hard delete. document_attachments has no lifecycle column
   * to mark instead and its parent is ON DELETE CASCADE, so this schema offers
   * no soft-delete affordance; the audit row carries the id, name and type of
   * what was removed. Introducing a REPLACED/SUSPENDED lifecycle as ectd_v4
   * has would be a schema change and a product decision.
   *
   * @param documentId Document ID
   * @param attachmentId Attachment ID
   * @param userId User removing the attachment
   * @param organizationId The caller's organization ID (required)
   * @returns The removed attachment row
   */
  async remove(
    documentId: number,
    attachmentId: number,
    userId: string,
    organizationId: unknown
  ) {
    const orgId = requireOrgId(organizationId, 'removeDocumentAttachment');

    return this.db.transaction(async (tx: any) => {
      await this.requireOwnedDocument(tx, documentId, orgId);

      const [removed] = await tx
        .delete(documentAttachments)
        .where(
          and(
            eq(documentAttachments.id, attachmentId),
            eq(documentAttachments.documentId, documentId)
          )
        )
        .returning();

      // Nothing was removed — do not record a removal.
      if (!removed) throw new AttachmentNotFoundException(attachmentId);

      await tx.insert(documentAuditLogs).values({
        documentId,
        action: 'attachment_removed',
        performedBy: userId,
        details: {
          field: 'attachments',
          action: 'remove',
          attachmentId: removed.id,
          fileName: removed.fileName,
          fileType: removed.fileType,
        },
      });

      return removed;
    });
  }
}
