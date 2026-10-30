/** Validate the existing ingest route's committed receipt before claiming success. */
import { z } from 'zod';
import { vaultDocumentCodeForFile } from '@shared/constants/domain/vault-document-code';

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const nonblank = z.string().regex(/\S/);
const changeField = z.enum([
  'document_title', 'document_type', 'classification', 'retention_policy',
  'parent_document_id', 'supersedes_id', 'storage_version_id', 'folder_id',
  'evidence_kind', 'ctd_section', 'placement_status',
]);
const differenceField = z.enum([
  'document_title', 'document_type', 'classification', 'folder_id', 'evidence_kind', 'ctd_section',
]);
const uniqueFields = (rows: ReadonlyArray<{ field: string }>) => new Set(rows.map((row) => row.field)).size === rows.length;

// Validate the fields used for identity and user-facing claims. Additional
// unrelated fields are permitted; the canonical service may grow its metadata.
const receiptSchema = z.object({
  success: z.literal(true),
  error: z.never().optional(),
  document: z.object({
    id: uuid,
    programId: uuid,
    documentCode: nonblank,
    documentTitle: z.string().nullable(),
    version: nonblank,
    extraction: z.enum(['extracted', 'pending', 'failed']).optional(),
  }),
  filing: z.object({
    folderId: nonblank.nullable(),
    folderLabel: z.string().nullable(),
    placementStatus: z.enum(['confirmed', 'suggested', 'unfiled']),
    needsReview: z.boolean(),
  }),
  reupload: z.object({
    unchanged: z.boolean(),
    changes: z.array(z.object({ field: changeField, from: z.string().nullable(), to: z.string().nullable() })
      .refine((row) => row.from !== row.to)).max(11).refine(uniqueFields),
    differs: z.array(z.object({ field: differenceField, recorded: z.string().nullable(), requested: z.string() })
      .refine((row) => row.recorded !== row.requested)).max(6).refine(uniqueFields),
  }).optional(),
});

/** An invalid successful reply leaves the write unconfirmed, not refused or retried. */
export function readVaultIngestReceipt(value: unknown, status: number, expected: {
  programId: string; fileName: string; supersedesDocumentId?: string;
}): z.infer<typeof receiptSchema> | null {
  if (status !== 200 && status !== 201) return null;
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success || parsed.data.document.programId !== expected.programId.toLowerCase()) return null;
  const receipt = parsed.data;
  if ((status === 200) !== Boolean(receipt.reupload)) return null;
  if (expected.supersedesDocumentId
    ? receipt.document.id === expected.supersedesDocumentId.toLowerCase()
    : receipt.document.documentCode !== vaultDocumentCodeForFile(expected.fileName, 'document')) return null;
  const unfiled = receipt.filing.placementStatus === 'unfiled';
  if (receipt.filing.needsReview !== unfiled) return null;
  if (!unfiled && !receipt.filing.folderId) return null;
  if (receipt.reupload && receipt.reupload.unchanged !== (receipt.reupload.changes.length === 0)) return null;
  return receipt;
}
