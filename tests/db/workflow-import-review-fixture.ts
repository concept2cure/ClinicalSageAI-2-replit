/** Native HTTP review ceremony for the workflow import integration fixture. */
import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import {
  authoringReviewExpectedSchema, authoringReviewReadSchema, authoringReviewResponseSchema,
} from '../../shared/authoring/peer-review';

export async function captureAssignedWorkflowReview(
  app: Express, reviewer: { id: number; token: string }, documentId: string, organizationId: number,
) {
  const reading = await request(app).get(`/api/authoring/documents/${documentId}/reviews`)
    .set('Authorization', `Bearer ${reviewer.token}`);
  expect(reading.status, JSON.stringify(reading.body)).toBe(200);
  const { reviewContext } = authoringReviewReadSchema.parse(reading.body);
  expect(reviewContext).toMatchObject({
    documentId, actorId: String(reviewer.id), organizationId, canReview: true,
  });
  const expected = authoringReviewExpectedSchema.parse({
    reviewId: reviewContext.myReview?.reviewId, requestedAt: reviewContext.myReview?.requestedAt,
    snapshotHash: reviewContext.snapshotHash, bindingBasis: reviewContext.bindingBasis,
  });
  return { reviewContext, expected };
}

export function assertBoundWorkflowReviewReceipt(
  body: unknown, { reviewContext, expected }: Awaited<ReturnType<typeof captureAssignedWorkflowReview>>,
) {
  const receipt = authoringReviewResponseSchema.parse(body);
  expect(receipt.review).toMatchObject({
    id: expected.reviewId, doc_id: reviewContext.documentId, reviewer_id: reviewContext.actorId,
    tenant_id: reviewContext.organizationId, review_status: 'approved', standing: 'current',
    reviewed_snapshot_hash: expected.snapshotHash, review_binding_basis: expected.bindingBasis,
  });
  expect(receipt.review.reviewed_snapshot).toEqual(reviewContext.snapshot);
}
