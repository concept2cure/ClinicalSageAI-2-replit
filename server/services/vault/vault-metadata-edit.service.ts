/**
 * Edit details: the one writer of a Vault version's descriptive fields.
 *
 * VR-05 (docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md, row D5). A
 * version's title, type and classification changed only as a side effect of
 * re-uploading it, and the ingest recorded the new values and never the old.
 * The re-upload now keeps what was recorded and audits what it changes
 * (vault-reupload.ts). This is the governed way to change those fields: a
 * person, with a reason, and one chained `vault.document.metadata_edit` row
 * carrying each changed field's before and after and the reason, committed
 * with the UPDATE or not at all.
 *
 * The same shape as placeVaultDocument (vault-placement.service.ts): the
 * acting role first, then program ownership, the row `FOR UPDATE`, and the
 * UPDATE and its audit row on one client. Identity, bytes, lineage, retention
 * and filing are not edited here; filing has its own writer, and the rest are
 * the record itself (VR-06).
 *
 * The route and the Vault surface's control belong to the Vault surface's lane
 * (POST /api/c2c/project-vault/:id/documents/:documentId/details).
 */
import { pool } from '../../db.js';
import { requireGovernedReason } from '../../routes/governed-reason.js';
import { writeChainedAuditRow } from '../auditService.js';
import { vaultWriteRefusal } from './vault-write-authority.js';
import {
  VAULT_CLASSIFICATIONS,
  VAULT_INGEST_DOCUMENT_TYPES,
} from '../../../shared/constants/domain/vault-taxonomy.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_MAX = 500;

export interface EditVaultDocumentMetadataArgs {
  programId: string;
  documentId: string;
  organizationId: number;
  userId: number | null;
  /** Each field is changed only when given. */
  documentTitle?: string;
  documentType?: string;
  classification?: string;
  /** The reason for change, recorded verbatim (21 CFR 11.10(e)). */
  reason: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export interface MetadataChange {
  field: 'document_title' | 'document_type' | 'classification';
  from: string | null;
  to: string;
}

export type EditVaultDocumentMetadataResult =
  | { ok: true; unchanged: boolean; changes: MetadataChange[] }
  | { ok: false; status: number; code: string; message: string };

const refuse = (status: number, code: string, message: string): EditVaultDocumentMetadataResult => ({
  ok: false,
  status,
  code,
  message,
});

/** The requested values, validated against the Vault's vocabularies; or the refusal. */
function requested(args: EditVaultDocumentMetadataArgs): Partial<Record<MetadataChange['field'], string>> | EditVaultDocumentMetadataResult {
  const out: Partial<Record<MetadataChange['field'], string>> = {};
  if (args.documentTitle !== undefined) {
    const title = String(args.documentTitle).trim();
    if (!title || title.length > TITLE_MAX) {
      return refuse(422, 'INVALID_TITLE', `A title is 1 to ${TITLE_MAX} characters. Nothing was changed.`);
    }
    out.document_title = title;
  }
  if (args.documentType !== undefined) {
    if (!(VAULT_INGEST_DOCUMENT_TYPES as readonly string[]).includes(args.documentType)) {
      return refuse(422, 'INVALID_DOCUMENT_TYPE', `The type must be one of ${VAULT_INGEST_DOCUMENT_TYPES.join(', ')}. Nothing was changed.`);
    }
    out.document_type = args.documentType;
  }
  if (args.classification !== undefined) {
    if (!(VAULT_CLASSIFICATIONS as readonly string[]).includes(args.classification)) {
      return refuse(422, 'INVALID_CLASSIFICATION', `The classification must be one of ${VAULT_CLASSIFICATIONS.join(', ')}. Nothing was changed.`);
    }
    out.classification = args.classification;
  }
  if (Object.keys(out).length === 0) {
    return refuse(400, 'NOTHING_TO_CHANGE', 'Name the title, type or classification to change.');
  }
  return out;
}

export async function editVaultDocumentMetadata(
  args: EditVaultDocumentMetadataArgs,
): Promise<EditVaultDocumentMetadataResult> {
  const roleRefusal = vaultWriteRefusal();
  if (roleRefusal) return roleRefusal;
  const reason = requireGovernedReason(args.reason);
  if (!reason.ok) return refuse(422, 'REASON_REQUIRED', `${reason.error} Nothing was changed.`);
  const { programId, documentId, organizationId } = args;
  if (!UUID_RE.test(programId) || !UUID_RE.test(documentId)) {
    return refuse(404, 'DOCUMENT_NOT_FOUND', 'No such document in this project.');
  }
  const wanted = requested(args);
  if ('ok' in wanted) return wanted as EditVaultDocumentMetadataResult;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Program ownership in the same statement: another organization's
    // document is reported as absent, not as forbidden.
    const found = await client.query(
      `SELECT document_title, document_type, classification
         FROM vault.documents
        WHERE id = $1 AND program_id = $2 AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = vault.documents.program_id
               AND rp.organization_id = $3
               AND rp.deleted_at IS NULL
          )
        FOR UPDATE`,
      [documentId, programId, organizationId],
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return refuse(404, 'DOCUMENT_NOT_FOUND', 'No such document in this project.');
    }
    const before = found.rows[0] as Record<MetadataChange['field'], string | null>;
    const changes: MetadataChange[] = [];
    for (const [field, to] of Object.entries(wanted) as Array<[MetadataChange['field'], string]>) {
      if (before[field] !== to) changes.push({ field, from: before[field], to });
    }
    if (changes.length === 0) {
      await client.query('ROLLBACK');
      return { ok: true, unchanged: true, changes };
    }

    const value = (f: MetadataChange['field']) => changes.find(c => c.field === f)?.to ?? null;
    await client.query(
      `UPDATE vault.documents SET
         document_title = COALESCE($1, document_title),
         document_type = COALESCE($2, document_type),
         classification = COALESCE($3, classification),
         updated_at = NOW()
       WHERE id = $4 AND program_id = $5
         AND EXISTS (
           SELECT 1 FROM regulatory_programs rp
            WHERE rp.id = vault.documents.program_id AND rp.organization_id = $6 AND rp.deleted_at IS NULL
         )`,
      [value('document_title'), value('document_type'), value('classification'), documentId, programId, organizationId],
    );
    await writeChainedAuditRow(client, {
      tenantId: organizationId,
      userId: args.userId ?? undefined,
      action: 'vault.document.metadata_edit',
      resourceType: 'vault_document',
      resourceId: documentId,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      details: { programId, changes, reason: reason.reason },
    });
    await client.query('COMMIT');
    return { ok: true, unchanged: false, changes };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
