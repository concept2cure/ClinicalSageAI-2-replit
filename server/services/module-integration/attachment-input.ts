/**
 * Document attachment — input contract and boundary validation.
 *
 * Split out of ModuleIntegrationService: this is the self-contained edge that
 * decides whether an attachment RECORD may be written at all, before any
 * transaction is opened. The service owns the act (insert / delete / list,
 * each tenant-scoped and audited); this module owns the shape.
 *
 * Nothing here touches the database, the filesystem or the request. It reuses
 * the repo's canonical validators rather than restating them — a second copy
 * of either rule is a second place for them to drift apart.
 */

import { isAllowedUpload } from '../../middleware/uploadAllowlist';
import { hasUnsafePathSyntax } from '../submission-gateways/bundle-namespace';

/**
 * The attachment-record input contract.
 *
 * Declared rather than accepted as `any`, for the same reason
 * RegisterDocumentInput is: fileName / fileType / fileSize / filePath are the
 * NOT NULL columns of document_attachments (migrations/20260729b), so an
 * `any` boundary defers a missing one to a runtime 23502 inside an open
 * transaction instead of rejecting it at the edge with a usable message.
 *
 * This records an attachment; it does not receive or store the bytes.
 * `filePath` must already point at a file placed through the caller's own
 * storage path — this boundary validates the SYNTAX it is handed and the file
 * type policy, and nothing here should be read as having verified that the
 * file exists or is what it claims.
 */
export interface DocumentAttachmentInput {
  fileName: string;
  fileType: string;
  /** Bytes. Stored in an `integer` column, so bounded by INT4_MAX. */
  fileSize: number;
  filePath: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

/** `file_size integer` — Postgres rejects anything past this, so we do first. */
export const INT4_MAX = 2_147_483_647;

/** An attachment that does not exist on the named document, in this tenant. */
export class AttachmentNotFoundException extends Error {
  constructor(attachmentId: number | string) {
    super(`Attachment with ID ${attachmentId} not found`);
    this.name = 'AttachmentNotFoundException';
  }
}

/** An attachment record this boundary refuses to write. */
export class AttachmentRejectedException extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AttachmentRejectedException';
  }
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AttachmentRejectedException(`${field} is required`);
  }
  return value;
}

/** `file_size` is a NOT NULL `integer`; anything else is rejected here, not by PG. */
function requireByteCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new AttachmentRejectedException('fileSize must be a non-negative integer number of bytes');
  }
  if (value > INT4_MAX) {
    throw new AttachmentRejectedException('fileSize exceeds the maximum this record can store');
  }
  return value;
}

/**
 * Narrow an untrusted attachment payload, or throw.
 *
 * `hasUnsafePathSyntax` rejects empty / embedded-NUL / `..` traversal in either
 * separator style; `isAllowedUpload` is the shared extension + MIME policy,
 * which refuses the BLOCKED_EXTENSIONS executables outright.
 *
 * `fileName` is checked for path syntax too: a name is not a path, and one
 * carrying separators or `..` is either a mistake or an attempt to make a
 * later consumer join it onto a directory.
 */
export function assertAttachmentRecordable(
  input: unknown
): asserts input is DocumentAttachmentInput {
  const candidate = input as Partial<DocumentAttachmentInput> | null | undefined;
  if (!candidate || typeof candidate !== 'object') {
    throw new AttachmentRejectedException('attachment data is required');
  }

  const fileName = requireText(candidate.fileName, 'fileName');
  const fileType = requireText(candidate.fileType, 'fileType');
  const filePath = requireText(candidate.filePath, 'filePath');
  requireByteCount(candidate.fileSize);

  if (hasUnsafePathSyntax(fileName) || /[\\/]/.test(fileName)) {
    throw new AttachmentRejectedException('fileName must be a file name, not a path');
  }
  if (hasUnsafePathSyntax(filePath)) {
    throw new AttachmentRejectedException('filePath must not contain traversal syntax');
  }
  if (!isAllowedUpload(fileName, fileType)) {
    throw new AttachmentRejectedException(`Unsupported file type: ${fileName}`);
  }
}

/**
 * The tenant a governed write is filed under is never optional and never
 * inferred. An unusable organization id fails closed rather than reaching a
 * query as NaN — `Number(undefined)` and `Number('x')` are both NaN, and a NaN
 * in an equality predicate matches nothing, which reads as "not found" instead
 * of "you did not pass a tenant".
 */
export function requireOrgId(organizationId: unknown, method: string): number {
  const parsed =
    typeof organizationId === 'number'
      ? organizationId
      : Number(String(organizationId ?? '').trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${method} requires an organization context`);
  }
  return parsed;
}
