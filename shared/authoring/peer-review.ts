/** Wire contract for the existing Authoring human review index and ceremony. */
import { z } from 'zod';

export const AUTHORING_REVIEW_BINDING_BASIS = 'authoring-full-visible-v1' as const;
const uuid = z.string().uuid();
const actorId = z.string().regex(/^[1-9]\d*$/);
const timestamp = z.string().datetime({ offset: true });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const authoringReviewStatusSchema = z.enum(['pending', 'approved', 'rejected', 'changes_requested']);
export const authoringReviewStandingSchema = z.enum(['pending', 'current', 'stale', 'unbound']);

/** Exact JSON framing promoted from the existing workflow adoption snapshot. */
export const authoringSavedSnapshotSchema = z.object({
  id: uuid,
  title: z.string().nullable(),
  module: z.string().nullable(),
  locale: z.string().nullable(),
  productCode: z.string().nullable(),
  version: z.union([z.string(), z.number().finite()]).nullable(),
  sections: z.array(z.object({
    id: uuid, code: z.string(), title: z.string().nullable(), content: z.string().nullable(),
  }).strict()),
}).strict();

export const authoringReviewExpectedSchema = z.object({
  reviewId: uuid,
  requestedAt: timestamp,
  snapshotHash: digest,
  bindingBasis: z.literal(AUTHORING_REVIEW_BINDING_BASIS),
}).strict();

export const authoringReviewInputSchema = z.object({
  review_status: z.enum(['approved', 'rejected', 'changes_requested']),
  review_comments: z.string().trim().max(4000).optional(),
  expected: authoringReviewExpectedSchema,
  /** Parsed against the bounded scientific-review contract after authorization. */
  csr_evidence: z.unknown().optional(),
}).strict();

export const authoringReviewContextSchema = z.object({
  documentId: uuid,
  actorId,
  organizationId: z.number().int().positive().max(2_147_483_647),
  snapshot: authoringSavedSnapshotSchema,
  snapshotHash: digest,
  bindingBasis: z.literal(AUTHORING_REVIEW_BINDING_BASIS),
  myReview: z.object({
    reviewId: uuid, requestedAt: timestamp, reviewStatus: authoringReviewStatusSchema,
  }).strict().nullable(),
  canReview: z.boolean(),
  unavailableReason: z.string().min(1).nullable(),
  /** The server's CSR rule for this document (requiresCsrScientificReview), so
   * the screen opens the scientific-review step for a CSR its label does not name. */
  csrScientificReviewRequired: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.snapshot.id !== value.documentId || (value.canReview && (!value.myReview || value.unavailableReason !== null))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A decision needs this document and an authorized current review request.' });
  }
});

export const authoringReviewRowSchema = z.object({
  id: uuid, doc_id: uuid, reviewer_id: z.string(), tenant_id: z.number().int().positive(),
  review_status: authoringReviewStatusSchema,
  review_comments: z.string().nullable(),
  reviewed_at: timestamp.nullable(),
  requested_at: timestamp,
  requested_by: z.string().nullable(),
  reviewed_snapshot: authoringSavedSnapshotSchema.nullable(),
  reviewed_snapshot_hash: digest.nullable(),
  review_binding_basis: z.string().nullable(),
  standing: authoringReviewStandingSchema,
}).passthrough();

export const authoringReviewReadSchema = z.object({
  success: z.literal(true),
  reviews: z.array(authoringReviewRowSchema),
  reviewContext: authoringReviewContextSchema,
  stats: z.object({
    total: z.number().int().nonnegative(), pending: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(),
    changes_requested: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(), unbound: z.number().int().nonnegative(),
  }),
  canApprove: z.boolean(),
});

export const authoringReviewResponseSchema = z.object({
  success: z.literal(true),
  review: authoringReviewRowSchema,
  tasks: z.object({ completed: z.array(z.unknown()), leftOpen: z.array(z.unknown()) }),
  auditTrail: z.object({ persisted: z.literal(true), chained: z.literal(true) }),
}).superRefine((value, ctx) => {
  const r = value.review;
  if (r.review_status === 'pending' || r.standing !== 'current' || !r.reviewed_at ||
      !r.requested_by || !r.reviewed_snapshot_hash || !r.reviewed_snapshot ||
      r.review_binding_basis !== AUTHORING_REVIEW_BINDING_BASIS || r.reviewed_snapshot.id !== r.doc_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The returned verdict must confirm its saved-content binding.' });
  }
});

export type AuthoringSavedSnapshot = z.infer<typeof authoringSavedSnapshotSchema>;
export type AuthoringReviewStanding = z.infer<typeof authoringReviewStandingSchema>;
export type AuthoringReviewStatus = z.infer<typeof authoringReviewStatusSchema>;
export type AuthoringReviewExpected = z.infer<typeof authoringReviewExpectedSchema>;
export type AuthoringReviewContext = z.infer<typeof authoringReviewContextSchema>;
export type AuthoringReviewInput = z.infer<typeof authoringReviewInputSchema>;
export type AuthoringReviewRow = z.infer<typeof authoringReviewRowSchema>;
