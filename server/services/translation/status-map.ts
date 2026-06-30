/**
 * Translation service — DB ↔ DTO status/method vocabulary bridge.
 *
 * The persisted `translation_segments` table and the shared DTO contract use
 * DIFFERENT but parallel vocabularies. The application service maps between them
 * in exactly one place — here — so the bridge is defined and tested once.
 *
 * WHY TWO VOCABULARIES:
 *  - DB `status` names the workflow STAGE in storage terms
 *    ('machine_translated' / 'post_edited' / 'in_review' / 'back_translation_pending').
 *  - DTO `status` names the same stages in UI/contract terms
 *    ('mt_draft' / 'in_progress' / 'review' / 'back_translation').
 *    The two are a clean 1:1 — see STATUS tables below.
 *  - DB `method` records the segment's ORIGIN ('human' | 'machine' |
 *    'translation_memory'). DTO `method` records the WORKFLOW method
 *    ('human' | 'mt_postedited' | 'machine'). They are NOT 1:1: a machine-origin
 *    segment that a human has post-edited is DB (method='machine',
 *    status='post_edited') but DTO method='mt_postedited'. So DB→DTO method needs
 *    the status for context; DTO→DB method collapses 'mt_postedited'→'machine'
 *    (origin is unchanged by post-editing; the post-edit lives in the status).
 *
 * This module is PURE (enum-in, enum-out) and has no dependency on Drizzle or the
 * engine — just the shared DTO unions.
 *
 * @module server/services/translation/status-map
 */

import type { TranslationMethod, TranslationStatus } from '@shared/types/translation';

// ── DB-side string unions (mirror the text columns in shared/schema.ts) ───────

/** `translation_segments.status` storage vocabulary. */
export type DbSegmentStatus =
  | 'pending'
  | 'machine_translated'
  | 'post_edited'
  | 'in_review'
  | 'back_translation_pending'
  | 'approved'
  | 'rejected';

/** `translation_segments.method` storage vocabulary (segment ORIGIN). */
export type DbSegmentMethod = 'human' | 'machine' | 'translation_memory';

// ── Status: clean 1:1 bridge ──────────────────────────────────────────────────

const DB_STATUS_TO_DTO: Record<DbSegmentStatus, TranslationStatus> = {
  pending: 'pending',
  machine_translated: 'mt_draft',
  post_edited: 'in_progress',
  back_translation_pending: 'back_translation',
  in_review: 'review',
  approved: 'approved',
  rejected: 'rejected',
};

const DTO_STATUS_TO_DB: Record<TranslationStatus, DbSegmentStatus> = {
  pending: 'pending',
  mt_draft: 'machine_translated',
  in_progress: 'post_edited',
  back_translation: 'back_translation_pending',
  review: 'in_review',
  approved: 'approved',
  rejected: 'rejected',
};

/** Map a persisted segment status to its DTO equivalent. */
export function dbStatusToDto(status: DbSegmentStatus): TranslationStatus {
  return DB_STATUS_TO_DTO[status];
}

/** Map a DTO segment status to its persisted equivalent. */
export function dtoStatusToDb(status: TranslationStatus): DbSegmentStatus {
  return DTO_STATUS_TO_DB[status];
}

// ── Method: status-aware bridge ───────────────────────────────────────────────

/**
 * DB statuses that imply a human has post-edited a machine draft (so a
 * machine-origin segment surfaces to the DTO as 'mt_postedited' rather than raw
 * 'machine'). A draft that is still 'machine_translated' (or 'pending'/'rejected')
 * has not been post-edited and stays 'machine'.
 */
const POST_EDITED_DB_STATUSES: ReadonlySet<DbSegmentStatus> = new Set<DbSegmentStatus>([
  'post_edited',
  'back_translation_pending',
  'in_review',
  'approved',
]);

/**
 * Derive the DTO workflow method from the persisted ORIGIN + stage:
 *  - 'human' origin → 'human'
 *  - 'translation_memory' origin → 'human' (TM reuse content is human-verified)
 *  - 'machine' origin → 'mt_postedited' once a human has post-edited it (status in
 *    {@link POST_EDITED_DB_STATUSES}), otherwise raw 'machine'.
 */
export function dbMethodToDto(method: DbSegmentMethod, status: DbSegmentStatus): TranslationMethod {
  if (method === 'human' || method === 'translation_memory') return 'human';
  // method === 'machine'
  return POST_EDITED_DB_STATUSES.has(status) ? 'mt_postedited' : 'machine';
}

/**
 * Map a DTO workflow method to the persisted ORIGIN. 'mt_postedited' collapses to
 * 'machine' — post-editing does not change a segment's origin; the post-edit is
 * recorded in the status (and the postEditor column), never by rewriting origin.
 */
export function dtoMethodToDb(method: TranslationMethod): DbSegmentMethod {
  return method === 'mt_postedited' ? 'machine' : method;
}
