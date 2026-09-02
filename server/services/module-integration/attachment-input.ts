/**
 * Document attachment — input contract and boundary validation.
 *
 * The self-contained edge that decides whether an attachment RECORD may be
 * written at all, before any transaction is opened. attachment-service owns
 * the acts (list / get / add / remove, each tenant-scoped, the writes audited
 * in the same transaction); this module owns the shape.
 *
 * Nothing here touches the database, the filesystem or the request. It reuses
 * the repo's canonical validators rather than restating them — a second copy
 * of either rule is a second place for them to drift apart.
 */

import { isAllowedUpload } from '../../middleware/uploadAllowlist';
import { hasUnsafePathSyntax } from '../submission-gateways/bundle-namespace';
import { AttachmentRejectedException } from './errors';

/**
 * The attachment-record input contract.
 *
 * Declared rather than accepted as `any`, for the same reason
 * RegisterDocumentInput is: fileName / fileType / fileSize / filePath are the
 * NOT NULL columns of document_attachments (migrations/20260729b), so an
 * `any` boundary defers a missing one to a runtime 23502 inside an open
 * transaction instead of rejecting it at the edge with a usable message.
 *
 * This records an attachment; it does not receive or store the bytes. The
 * bytes live in the storage provider (services/storage), which is the ONLY
 * tenant boundary object storage has — its `get(vaultVersionId, orgId)`
 * requires the organization, and a foreign file reads as missing. So
 * `filePath` is not a path: it is the `vaultVersionId` that `put()` returned,
 * and nothing else is accepted. A record whose filePath is anything else
 * could be audited and listed but never downloaded, which is an attachment
 * that lies about itself.
 *
 * This boundary validates shape and file-type policy; nothing here should be
 * read as having verified that the bytes exist or are what they claim. The
 * upload route proves that, through assertUploadSafe, before `put()`.
 */
export interface DocumentAttachmentInput {
  fileName: string;
  fileType: string;
  /** Bytes. Stored in an `integer` column, so bounded by INT4_MAX. */
  fileSize: number;
  /** The storage provider's version id for the bytes — see above. */
  filePath: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

/** `file_size integer` — Postgres rejects anything past this, so we do first. */
export const INT4_MAX = 2_147_483_647;

/**
 * A storage-provider version id, as minted by `generateVersionId()` (a
 * randomUUID). The same shape the local provider checks before it will join
 * an id onto a path.
 */
const VAULT_VERSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a storage-provider version id. */
export function isVaultVersionId(value: unknown): value is string {
  return typeof value === 'string' && VAULT_VERSION_ID_RE.test(value);
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
  if (!isVaultVersionId(filePath)) {
    throw new AttachmentRejectedException('filePath must be a storage version id');
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
