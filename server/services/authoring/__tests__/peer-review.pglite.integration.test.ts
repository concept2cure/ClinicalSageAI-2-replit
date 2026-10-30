/** Executed canonical Authoring DDL: full human-review binding and admission.
 * Task closure's native state machine is covered by the HTTP review-loop suite;
 * this suite retains the real trail, chained audit, ACL and authorship readers.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_REVIEW_BINDING_BASIS, authoringReviewInputSchema,
  authoringReviewReadSchema, authoringReviewResponseSchema,
  type AuthoringReviewExpected, type AuthoringReviewInput,
} from '@shared/authoring/peer-review';
import { assertNoSchemaGaps, createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, AUTHORING_ACCESS_DDL, AUTHOR, PROGRAM, ORG, OTHER_ORG } from '../../../routes/__tests__/_authoring-canvas-fixture';
import type { RequestConnectable, RequestSqlClient } from '../../../db/requestDb';
import { grantAuthoringPermission } from '../authoring-permissions';
import { authoringSnapshotHash } from '../authoring-content-digests';
import { computeChainHash, sha256Hex } from '../revision-ledger';
import * as service from '../peer-review';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db', () => ({
  get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (text: string, params?: unknown[]) => (h.pool as RequestSqlClient).query(text, params),
}));

const TIMEOUT = 180_000;
const REVIEWER = '21';
const SECOND_REVIEWER = '22';
const FOREIGN_REVIEWER = '23';
const audit = { ipAddress: '127.0.0.1', userAgent: 'canonical-peer-review-fixture' };
let database: JourneyDb;
let connection: RequestConnectable;

beforeAll(async () => {
  database = await createJourneyDb({
    prereqSql: `${PREREQ}\n${AUTHORING_ACCESS_DDL}
      ALTER TABLE organizations ADD COLUMN payment_status text NOT NULL DEFAULT 'active';`,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260730_authoring_subsystem_schema.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      'db/migrations/20260813_audit_tamper_proof_log.sql',
    ],
    testOnlySql: `
      INSERT INTO users (id, name, email) VALUES
        (21,'Independent reviewer','reviewer@review.example'),
        (22,'Second reviewer','second@review.example'),
        (23,'Foreign reviewer','foreign@review.example');
      INSERT INTO organization_users (organization_id,user_id,role) VALUES
        (${ORG},21,'member'),(${ORG},22,'member'),(${OTHER_ORG},23,'member');
      CREATE TABLE peer_review_task_proof (document_id uuid, marker text);
    `,
  });
  h.db = database.db;
  h.pool = database.pool;
  connection = database.pool as unknown as RequestConnectable;
}, TIMEOUT);

afterAll(async () => {
  try { if (database) assertNoSchemaGaps(database); }
  finally { await database?.close(); }
});

beforeEach(async () => {
  await connection.query("UPDATE users SET status='active' WHERE id IN (3,21,22,23)");
  await connection.query("UPDATE organizations SET status='active',payment_status='active'");
  await connection.query('DELETE FROM organization_users WHERE user_id IN (21,22,23)');
  await connection.query('INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,21,$2),($1,22,$2),($3,23,$2)', [ORG, 'member', OTHER_ORG]);
  await connection.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
});

async function rows(text: string, params: unknown[] = []) {
  return (await connection.query(text, params)).rows;
}

interface SavedDocument { id: string; sections: string[] }
async function document(): Promise<SavedDocument> {
  const id = randomUUID();
  await connection.query(`INSERT INTO authoring_documents
    (id,title,module,locale,product_code,version,status,created_by,tenant_id,client_program_id)
    VALUES ($1,'Full saved review','M2','en-US','PROD-REVIEW','0.4','draft',$2,$3,$4)`,
  [id, AUTHOR.id, ORG, PROGRAM]);
  const sections = [randomUUID(), randomUUID()];
  // Insert in reverse order: visible signing order must come from saved rows.
  for (const index of [1, 0]) {
    await connection.query(`INSERT INTO authoring_sections
      (id,doc_id,code,title,content,order_index,tenant_id,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [sections[index], id, `2.5.${index + 1}`, `Saved section ${index + 1}`,
      `<p>Saved text ${index + 1}</p><table><tr><td>Evidence ${index + 1}</td></tr></table>`,
      index, ORG, '2026-10-01T00:00:00.000Z']);
  }
  return { id, sections };
}

async function grant(documentId: string, actorId = REVIEWER, sectionId: string | null = null) {
  return grantAuthoringPermission({ pool: connection, tenantId: ORG, docId: documentId,
    sectionId, principalId: actorId, role: 'REVIEWER', grantedBy: AUTHOR.id, reason: 'Assigned independent review' });
}

const read = (documentId: string, actorId = REVIEWER, tenantId = ORG) =>
  service.readAuthoringPeerReviews(connection, { tenantId, actorId, documentId });

async function requestReview(documentId: string, reviewerIds = [REVIEWER], executor = connection) {
  return service.requestAuthoringPeerReviews(executor, {
    tenantId: ORG, actorId: AUTHOR.id, documentId,
    reviewers: reviewerIds.map(id => ({ id, name: 'Caller supplied label', email: 'spoofed@review.example' })),
    reason: 'Request an independent review of the saved draft.',
  }, { audit, grant: async (client, input) => {
    const outcomes = [];
    for (const review of input.reviews) {
      const permission = await grantAuthoringPermission({ pool: client, tenantId: ORG,
        docId: documentId, principalId: String(review.reviewer_id),
        email: typeof review.reviewer_email === 'string' ? review.reviewer_email : null,
        role: 'REVIEWER', grantedBy: input.actor.id, reason: input.reason });
      outcomes.push({ reviewerId: String(review.reviewer_id), granted: true as const, permissionId: String(permission.id) });
    }
    return outcomes;
  },
  // The request's review route (RR5) is the router's to write (authoring-review-route.ts), proven against
  // PostgreSQL in tests/db/review-route-authoring-rr5.dbtest.ts; this suite pins the request service itself.
  route: { prepare: () => null, write: async () => null } });
}

async function expected(documentId: string, actorId = REVIEWER): Promise<AuthoringReviewExpected> {
  const current = await read(documentId, actorId);
  const request = current.reviewContext.myReview;
  expect(request).not.toBeNull();
  return { reviewId: request!.reviewId, requestedAt: request!.requestedAt,
    snapshotHash: current.reviewContext.snapshotHash, bindingBasis: AUTHORING_REVIEW_BINDING_BASIS };
}

const noTasks = async () => ({ completed: [] as string[], leftOpen: [] as Array<{ taskId: string; why: string }>,
  notices: [], record: async () => undefined });
const submit = (documentId: string, body: AuthoringReviewInput, actorId = REVIEWER,
  closeTasks: Parameters<typeof service.submitAuthoringPeerReview>[2]['closeTasks'] = noTasks) =>
  service.submitAuthoringPeerReview(connection, { tenantId: ORG, actorId, documentId, body }, { audit, closeTasks });

async function approve(documentId: string, actorId = REVIEWER) {
  return submit(documentId, { review_status: 'approved', expected: await expected(documentId, actorId) }, actorId);
}

async function pendingRow(documentId: string, reviewerId = REVIEWER, requestedBy = AUTHOR.id) {
  await connection.query(`INSERT INTO authoring_reviews (id,doc_id,reviewer_id,review_status,requested_at,requested_by,tenant_id)
    VALUES ($1,$2,$3,'pending','2026-10-01T00:00:00.000Z',$4,$5)`,
  [randomUUID(), documentId, reviewerId, requestedBy, ORG]);
}

async function revision(doc: SavedDocument, createdBy: string | null) {
  const content = '<p>Earlier human contribution retained in the ledger.</p>';
  const contentHash = sha256Hex(content);
  const chain = computeChainHash({ prevChain: null, contentSha256: contentHash,
    createdBy: createdBy ?? '', origin: 'human-edit' });
  await connection.query(`INSERT INTO doc_revisions
    (id,section_id,content,created_by,tenant_id,content_sha256,prev_chain_sha256,chain_sha256,origin,inputs)
    VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,'human-edit','{}'::jsonb)`,
  [randomUUID(), doc.sections[0], content, createdBy, ORG, contentHash, chain]);
}

describe('full visible review and retained content binding', () => {
  it('reads every saved section in canonical order and binds the verdict plus real chained audit', async () => {
    const doc = await document();
    await requestReview(doc.id);
    const before = await read(doc.id);
    expect(authoringReviewReadSchema.safeParse(before).success).toBe(true);
    expect(before.reviewContext).toMatchObject({ actorId: REVIEWER, organizationId: ORG,
      documentId: doc.id, canReview: true, unavailableReason: null });
    expect(before.reviewContext.snapshot.sections.map(section => section.id)).toEqual(doc.sections);
    expect(before.reviewContext.snapshot.sections.every(section => section.content?.includes('<table>'))).toBe(true);
    expect(before.reviewContext.snapshotHash).toBe(authoringSnapshotHash(before.reviewContext.snapshot));
    expect(before.canApprove).toBe(false);
    const result = await approve(doc.id);
    expect(authoringReviewResponseSchema.safeParse({ success: true, ...result }).success).toBe(true);
    expect(result.review).toMatchObject({ reviewed_snapshot: before.reviewContext.snapshot,
      reviewed_snapshot_hash: before.reviewContext.snapshotHash, review_binding_basis: AUTHORING_REVIEW_BINDING_BASIS,
      standing: 'current', review_status: 'approved', reviewer_id: REVIEWER });
    expect((await read(doc.id)).stats.approved).toBe(1);
    expect((await read(doc.id)).canApprove).toBe(true);
    const trail = await rows("SELECT id,metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [doc.id]);
    expect(trail).toHaveLength(1);
    expect(trail[0].metadata).toMatchObject({
      request: { reviewId: result.review.id, requestedAt: before.reviewContext.myReview!.requestedAt,
        snapshotHash: before.reviewContext.snapshotHash, bindingBasis: AUTHORING_REVIEW_BINDING_BASIS },
      beforeReview: { review_status: 'pending' }, afterReview: { review_status: 'approved' },
      reviewedSnapshot: before.reviewContext.snapshot,
      snapshotHash: before.reviewContext.snapshotHash, bindingBasis: AUTHORING_REVIEW_BINDING_BASIS,
    });
    expect(await rows("SELECT 1 FROM audit_logs WHERE record_id=$1 AND action='authoring.section.document_reviewed'", [doc.id])).toHaveLength(1);
  }, TIMEOUT);

  it.each(['title', 'version', 'prose', 'section-title', 'order'] as const)('refuses a captured verdict after %s changes without writing audit or task evidence', async change => {
    const doc = await document();
    await requestReview(doc.id);
    const captured = await expected(doc.id);
    if (change === 'title') await connection.query('UPDATE authoring_documents SET title=$2 WHERE id=$1', [doc.id, 'Changed saved title']);
    if (change === 'version') await connection.query('UPDATE authoring_documents SET version=$2 WHERE id=$1', [doc.id, '0.5']);
    if (change === 'prose') await connection.query('UPDATE authoring_sections SET content=$2 WHERE id=$1', [doc.sections[0], '<p>Changed saved prose.</p>']);
    if (change === 'section-title') await connection.query('UPDATE authoring_sections SET title=$2 WHERE id=$1', [doc.sections[0], 'Changed section title']);
    if (change === 'order') await connection.query('UPDATE authoring_sections SET order_index=$2 WHERE id=$1', [doc.sections[0], 2]);
    const tasks = vi.fn(noTasks);
    await expect(submit(doc.id, { review_status: 'approved', expected: captured }, REVIEWER, tasks)).rejects.toMatchObject({ status: 409 });
    expect(tasks).not.toHaveBeenCalled();
    expect((await rows('SELECT review_status,reviewed_snapshot_hash FROM authoring_reviews WHERE doc_id=$1', [doc.id]))[0])
      .toEqual({ review_status: 'pending', reviewed_snapshot_hash: null });
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [doc.id])).toEqual([]);
  }, TIMEOUT);

  it('keeps an approved earlier binding visibly stale after a saved content change', async () => {
    const doc = await document(); await requestReview(doc.id); const decided = await approve(doc.id);
    await connection.query('UPDATE authoring_sections SET content=$2 WHERE id=$1', [doc.sections[1], '<p>A later saved revision.</p>']);
    const current = await read(doc.id);
    expect(current.reviews[0]).toMatchObject({ review_status: 'approved', standing: 'stale', reviewed_snapshot_hash: decided.review.reviewed_snapshot_hash });
    expect(current.stats).toMatchObject({ approved: 0, stale: 1 }); expect(current.canApprove).toBe(false);
  }, TIMEOUT);

  it('re-request clears only the active binding, retains its immutable audit, and refuses the prior round', async () => {
    const doc = await document(); await requestReview(doc.id); const captured = await expected(doc.id);
    const decided = await submit(doc.id, { review_status: 'changes_requested', review_comments: 'Correct the cited study version.', expected: captured });
    const trail = await rows("SELECT id,metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [doc.id]);
    await requestReview(doc.id);
    expect(await rows("SELECT id,metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [doc.id])).toEqual(trail);
    const current = await read(doc.id);
    expect(current.reviews[0]).toMatchObject({ review_status: 'pending', reviewed_at: null,
      review_comments: null, reviewed_snapshot: null, reviewed_snapshot_hash: null, review_binding_basis: null });
    expect(current.reviewContext.myReview!.reviewId).not.toBe(captured.reviewId);
    expect(current.reviewContext.myReview!.requestedAt).not.toBe(captured.requestedAt);
    await expect(submit(doc.id, { review_status: 'approved', expected: captured })).rejects.toMatchObject({ status: 409 });
    const requests = await rows("SELECT metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='review_requested' ORDER BY created_at,id", [doc.id]);
    expect(requests[1].metadata).toMatchObject({ reopenedVerdicts: [{ reviewId: captured.reviewId,
      reviewerId: REVIEWER, verdict: 'changes_requested', reviewedSnapshot: decided.review.reviewed_snapshot,
      snapshotHash: decided.review.reviewed_snapshot_hash, bindingBasis: AUTHORING_REVIEW_BINDING_BASIS }] });
  }, TIMEOUT);

});

describe('request rounds retain identity beyond JavaScript timestamp precision', () => {
  it('refuses the old round when distinct PostgreSQL microseconds serialize to the same millisecond', async () => {
    const doc = await document(); await requestReview(doc.id);
    await connection.query('UPDATE authoring_reviews SET requested_at=$2::timestamptz WHERE doc_id=$1', [doc.id, '2026-10-01T00:00:00.123001Z']);
    const captured = await expected(doc.id);
    const oldFact = await rows('SELECT requested_at::text AS request_time FROM authoring_reviews WHERE doc_id=$1', [doc.id]);
    const firstAudit = await rows("SELECT id,metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='review_requested'", [doc.id]);
    await requestReview(doc.id);
    await connection.query('UPDATE authoring_reviews SET requested_at=$2::timestamptz WHERE doc_id=$1', [doc.id, '2026-10-01T00:00:00.123999Z']);
    const fresh = await expected(doc.id);
    const newFact = await rows('SELECT requested_at::text AS request_time FROM authoring_reviews WHERE doc_id=$1', [doc.id]);
    expect(oldFact[0].request_time).not.toBe(newFact[0].request_time);
    expect(fresh.requestedAt).toBe(captured.requestedAt);
    expect(fresh.snapshotHash).toBe(captured.snapshotHash);
    const tasks = vi.fn(noTasks);
    await expect(submit(doc.id, { review_status: 'approved', expected: captured }, REVIEWER, tasks))
      .rejects.toMatchObject({ status: 409, code: 'REVIEW_CHANGED' });
    expect(tasks).not.toHaveBeenCalled();
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [doc.id])).toEqual([]);
    expect(fresh.reviewId).not.toBe(captured.reviewId);
    expect(await rows('SELECT id,review_status FROM authoring_reviews WHERE doc_id=$1 AND reviewer_id=$2', [doc.id, REVIEWER]))
      .toEqual([{ id: fresh.reviewId, review_status: 'pending' }]);
    const requests = await rows("SELECT id,metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='review_requested' ORDER BY created_at,id", [doc.id]);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(firstAudit[0]);
    expect(requests[0].metadata).toMatchObject({ reviewIds: [captured.reviewId] });
    expect(requests[1].metadata).toMatchObject({ reviewIds: [fresh.reviewId], beforeReviews: [{ id: captured.reviewId }] });
    const decided = await submit(doc.id, { review_status: 'approved', expected: fresh });
    expect(decided.review).toMatchObject({ id: fresh.reviewId, standing: 'current', review_status: 'approved' });
    expect(await rows("SELECT id,metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='review_requested' ORDER BY created_at,id", [doc.id])).toEqual(requests);
  }, TIMEOUT);
});

describe('honest historical verdicts and retained reads', () => {
  it.each(['legacy-null', 'legacy-email-reviewer', 'legacy-email-requester', 'out-of-range-reviewer', 'out-of-range-requester', 'missing-requester', 'malformed-snapshot', 'malformed-hash', 'wrong-hash', 'wrong-basis', 'wrong-document', 'reviewed-before-request'] as const)(
    'retains %s verdicts as unbound without manufacturing current approval', async corruption => {
      const doc = await document(); await requestReview(doc.id); await approve(doc.id);
      if (corruption === 'legacy-null') await connection.query('UPDATE authoring_reviews SET reviewed_snapshot=NULL,reviewed_snapshot_hash=NULL,review_binding_basis=NULL WHERE doc_id=$1', [doc.id]);
      if (corruption === 'legacy-email-reviewer') await connection.query('UPDATE authoring_reviews SET reviewer_id=$2 WHERE doc_id=$1', [doc.id, 'earlier-reviewer@review.example']);
      if (corruption === 'legacy-email-requester') await connection.query('UPDATE authoring_reviews SET requested_by=$2 WHERE doc_id=$1', [doc.id, AUTHOR.email]);
      if (corruption === 'out-of-range-reviewer') await connection.query('UPDATE authoring_reviews SET reviewer_id=$2 WHERE doc_id=$1', [doc.id, '2147483648']);
      if (corruption === 'out-of-range-requester') await connection.query('UPDATE authoring_reviews SET requested_by=$2 WHERE doc_id=$1', [doc.id, '2147483648']);
      if (corruption === 'missing-requester') await connection.query('UPDATE authoring_reviews SET requested_by=NULL WHERE doc_id=$1', [doc.id]);
      if (corruption === 'malformed-snapshot') await connection.query("UPDATE authoring_reviews SET reviewed_snapshot='{}'::jsonb WHERE doc_id=$1", [doc.id]);
      if (corruption === 'malformed-hash') await connection.query('UPDATE authoring_reviews SET reviewed_snapshot_hash=$2 WHERE doc_id=$1', [doc.id, 'malformed']);
      if (corruption === 'wrong-hash') await connection.query('UPDATE authoring_reviews SET reviewed_snapshot_hash=$2 WHERE doc_id=$1', [doc.id, '0'.repeat(64)]);
      if (corruption === 'wrong-basis') await connection.query('UPDATE authoring_reviews SET review_binding_basis=$2 WHERE doc_id=$1', [doc.id, 'sections-only']);
      if (corruption === 'wrong-document') await connection.query("UPDATE authoring_reviews SET reviewed_snapshot=jsonb_set(reviewed_snapshot,'{id}',to_jsonb($2::text)) WHERE doc_id=$1", [doc.id, randomUUID()]);
      if (corruption === 'reviewed-before-request') await connection.query("UPDATE authoring_reviews SET reviewed_at='2026-09-01T00:00:00Z' WHERE doc_id=$1", [doc.id]);
      const current = await read(doc.id);
      expect(current.reviews[0]).toMatchObject({ review_status: 'approved', standing: 'unbound' });
      expect(current.stats).toMatchObject({ approved: 0, unbound: 1 }); expect(current.canApprove).toBe(false);
    }, TIMEOUT);

  it('does not acquire peer approval with no assigned verdicts', async () => {
    const doc = await document(); await grant(doc.id);
    const current = await read(doc.id);
    expect(current.reviews).toEqual([]); expect(current.canApprove).toBe(false);
    expect(current.reviewContext).toMatchObject({ myReview: null, canReview: false });
  }, TIMEOUT);

  it('retains the recorded verdict and complete text under read-only payment posture while refusing another decision', async () => {
    const doc = await document(); await requestReview(doc.id); const captured = await expected(doc.id);
    const decided = await approve(doc.id);
    await connection.query("UPDATE organizations SET payment_status='past_due' WHERE id=$1", [ORG]);
    const current = await read(doc.id);
    expect(current.reviewContext).toMatchObject({ canReview: false, snapshot: decided.review.reviewed_snapshot });
    expect(current.reviews[0]).toMatchObject({ id: decided.review.id, standing: 'current', review_status: 'approved' });
    const tasks = vi.fn(noTasks);
    await expect(submit(doc.id, { review_status: 'approved', expected: captured }, REVIEWER, tasks)).rejects.toMatchObject({ status: 403 });
    expect(tasks).not.toHaveBeenCalled();
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [doc.id])).toHaveLength(1);
  }, TIMEOUT);
});

describe('legacy pending request attribution requires an honest new request', () => {
  it('keeps legacy email requester text readable but refuses its decision without backfilling attribution', async () => {
    const doc = await document(); await grant(doc.id); await pendingRow(doc.id, REVIEWER, AUTHOR.email);
    const current = await read(doc.id);
    expect(current.reviewContext.canReview).toBe(false);
    expect(current.reviewContext.unavailableReason).toMatch(/request.*again/i);
    expect(current.reviewContext.snapshot.sections.map(section => section.id)).toEqual(doc.sections);
    expect(current.reviews[0].requested_by).toBe(AUTHOR.email);
    const tasks = vi.fn(noTasks);
    await expect(submit(doc.id, { review_status: 'approved', expected: await expected(doc.id) }, REVIEWER, tasks))
      .rejects.toMatchObject({ status: 409, code: 'REVIEW_REQUEST_UNVERIFIED' });
    expect(tasks).not.toHaveBeenCalled();
    expect((await rows('SELECT review_status,requested_by,reviewed_snapshot_hash FROM authoring_reviews WHERE doc_id=$1', [doc.id]))[0])
      .toEqual({ review_status: 'pending', requested_by: AUTHOR.email, reviewed_snapshot_hash: null });
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [doc.id])).toEqual([]);
  }, TIMEOUT);
});

describe('fresh independent assignment and native admission', () => {
  it('refuses an unassigned actor even with a document Reviewer grant', async () => {
    const doc = await document(); await grant(doc.id);
    const context = (await read(doc.id)).reviewContext;
    await expect(submit(doc.id, { review_status: 'approved', expected: { reviewId: randomUUID(),
      requestedAt: new Date().toISOString(), snapshotHash: context.snapshotHash, bindingBasis: AUTHORING_REVIEW_BINDING_BASIS } })).rejects.toMatchObject({ status: 403 });
    expect(await rows('SELECT 1 FROM authoring_reviews WHERE doc_id=$1', [doc.id])).toEqual([]);
  }, TIMEOUT);

  it.each(['original', 'contributor', 'unresolved-contributor'] as const)('refuses %s authorship at both request and verdict gates', async authorship => {
    const doc = await document();
    const actorId = authorship === 'original' ? AUTHOR.id : REVIEWER;
    if (authorship !== 'original') await revision(doc, authorship === 'contributor' ? REVIEWER : null);
    await expect(requestReview(doc.id, [actorId])).rejects.toMatchObject({ status: 409 });
    await grant(doc.id, actorId); await pendingRow(doc.id, actorId);
    const context = await read(doc.id, actorId);
    expect(context.reviewContext.canReview).toBe(false);
    await expect(submit(doc.id, { review_status: 'approved', expected: await expected(doc.id, actorId) }, actorId))
      .rejects.toMatchObject({ status: authorship === 'unresolved-contributor' ? 409 : 403 });
    expect((await rows('SELECT review_status FROM authoring_reviews WHERE doc_id=$1', [doc.id]))[0].review_status).toBe('pending');
  }, TIMEOUT);

  it.each(['foreign', 'inactive-user', 'inactive-org', 'departed', 'viewer', 'duplicate-membership'] as const)(
    'refuses %s current admission without changing the assigned verdict', async posture => {
      const doc = await document(); await requestReview(doc.id); const captured = await expected(doc.id);
      if (posture === 'inactive-user') await connection.query("UPDATE users SET status='inactive' WHERE id=21");
      if (posture === 'inactive-org') await connection.query("UPDATE organizations SET status='inactive' WHERE id=$1", [ORG]);
      if (posture === 'departed') await connection.query('DELETE FROM organization_users WHERE user_id=21 AND organization_id=$1', [ORG]);
      if (posture === 'viewer') await connection.query("UPDATE organization_users SET role='viewer' WHERE user_id=21 AND organization_id=$1", [ORG]);
      if (posture === 'duplicate-membership') await connection.query("INSERT INTO organization_users VALUES ($1,21,'admin')", [ORG]);
      const actorId = posture === 'foreign' ? FOREIGN_REVIEWER : REVIEWER;
      if (posture !== 'viewer') await expect(read(doc.id, actorId)).rejects.toMatchObject({ status: 403 });
      await expect(submit(doc.id, { review_status: 'approved', expected: captured }, actorId)).rejects.toMatchObject({ status: 403 });
      expect((await rows('SELECT review_status FROM authoring_reviews WHERE doc_id=$1', [doc.id]))[0].review_status).toBe('pending');
    }, TIMEOUT);

  it.each(['revoked', 'section-only', 'private-project'] as const)('refuses %s full-document access for read and write', async access => {
    const doc = await document(); await requestReview(doc.id); const captured = await expected(doc.id);
    await connection.query('UPDATE doc_permissions SET revoked_at=NOW(),revoked_by=$2 WHERE doc_id=$1 AND principal_id=$3', [doc.id, AUTHOR.id, REVIEWER]);
    if (access === 'section-only') await grant(doc.id, REVIEWER, doc.sections[0]);
    if (access === 'private-project') {
      await grant(doc.id);
      await connection.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
    }
    await expect(read(doc.id)).rejects.toMatchObject({ status: expect.any(Number) });
    await expect(submit(doc.id, { review_status: 'approved', expected: captured })).rejects.toMatchObject({ status: expect.any(Number) });
    expect((await rows('SELECT review_status FROM authoring_reviews WHERE doc_id=$1', [doc.id]))[0].review_status).toBe('pending');
  }, TIMEOUT);

  it('resolves supplied reviewer ids to their actual tenant identity', async () => {
    const doc = await document(); const result = await requestReview(doc.id);
    expect(result.reviews[0]).toMatchObject({ reviewer_id: REVIEWER, reviewer_name: 'Independent reviewer', reviewer_email: 'reviewer@review.example' });
    expect((await rows('SELECT email FROM doc_permissions WHERE doc_id=$1 AND principal_id=$2 AND role=$3', [doc.id, REVIEWER, 'REVIEWER']))[0].email).toBe('reviewer@review.example');
    await expect(requestReview(doc.id, [SECOND_REVIEWER, FOREIGN_REVIEWER])).rejects.toMatchObject({ status: 400 });
    expect(await rows('SELECT 1 FROM authoring_reviews WHERE doc_id=$1 AND reviewer_id=$2', [doc.id, SECOND_REVIEWER])).toEqual([]);
  }, TIMEOUT);

  it('refuses another document or request round in the expected ceremony', async () => {
    const first = await document(); const second = await document();
    await requestReview(first.id); await requestReview(second.id);
    await expect(submit(first.id, { review_status: 'approved', expected: await expected(second.id) })).rejects.toMatchObject({ status: 409 });
    const captured = await expected(first.id);
    await expect(submit(first.id, { review_status: 'approved', expected: { ...captured, requestedAt: '2026-09-01T00:00:00.000Z' } })).rejects.toMatchObject({ status: 409 });
    expect((await rows('SELECT review_status FROM authoring_reviews WHERE doc_id=$1', [first.id]))[0].review_status).toBe('pending');
  }, TIMEOUT);

  it('strict input cannot spoof actor, reviewer, snapshot content or binding basis', async () => {
    const doc = await document(); await requestReview(doc.id);
    const body = { review_status: 'approved', expected: await expected(doc.id) };
    for (const extra of [{ actorId: AUTHOR.id }, { reviewer_id: AUTHOR.id }, { reviewed_snapshot: {} }]) {
      expect(authoringReviewInputSchema.safeParse({ ...body, ...extra }).success).toBe(false);
    }
    expect(authoringReviewInputSchema.safeParse({ ...body, expected: { ...body.expected, bindingBasis: 'sections-only' } }).success).toBe(false);
  }, TIMEOUT);

  it.each(['rejected', 'changes_requested'] as const)('requires a governed reason for %s before a verdict or task write', async reviewStatus => {
    const doc = await document(); await requestReview(doc.id); const captured = await expected(doc.id);
    const tasks = vi.fn(noTasks);
    await expect(submit(doc.id, { review_status: reviewStatus, expected: captured }, REVIEWER, tasks)).rejects.toMatchObject({ status: 400 });
    expect(tasks).not.toHaveBeenCalled();
    expect((await rows('SELECT review_status FROM authoring_reviews WHERE doc_id=$1', [doc.id]))[0].review_status).toBe('pending');
  }, TIMEOUT);
});

describe('one transaction for the decision, task closure and actual audit', () => {
  it('a failed chained audit rolls back the verdict and task evidence on the same client', async () => {
    const doc = await document(); await requestReview(doc.id); const captured = await expected(doc.id);
    const closeTasks = async (client: RequestSqlClient) => {
      await client.query('INSERT INTO peer_review_task_proof VALUES ($1,$2)', [doc.id, 'closure']);
      return { completed: ['task-proof'], leftOpen: [], notices: [], record: async () => {
        await client.query('INSERT INTO peer_review_task_proof VALUES ($1,$2)', [doc.id, 'record']);
      } };
    };
    await database.pglite.exec(`CREATE FUNCTION peer_review_fixture_reject_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture audit unavailable'; END; $$;
      CREATE TRIGGER peer_review_fixture_audit_failure BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION peer_review_fixture_reject_audit();`);
    try { await expect(submit(doc.id, { review_status: 'approved', expected: captured }, REVIEWER, closeTasks)).rejects.toBeInstanceOf(Error); }
    finally { await database.pglite.exec('DROP TRIGGER peer_review_fixture_audit_failure ON audit_logs; DROP FUNCTION peer_review_fixture_reject_audit();'); }
    expect(await rows('SELECT 1 FROM peer_review_task_proof WHERE document_id=$1', [doc.id])).toEqual([]);
    expect((await rows('SELECT review_status,reviewed_snapshot_hash FROM authoring_reviews WHERE doc_id=$1', [doc.id]))[0]).toEqual({ review_status: 'pending', reviewed_snapshot_hash: null });
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [doc.id])).toEqual([]);
  }, TIMEOUT);

  it('failed task-record persistence also rolls back the canonical trail and bound verdict', async () => {
    const doc = await document(); await requestReview(doc.id); const captured = await expected(doc.id);
    const closeTasks = async (client: RequestSqlClient) => {
      await client.query('INSERT INTO peer_review_task_proof VALUES ($1,$2)', [doc.id, 'closure']);
      return { completed: ['task-proof'], leftOpen: [], notices: [], record: async () => { throw new Error('Fixture task record persistence failed'); } };
    };
    await expect(submit(doc.id, { review_status: 'approved', expected: captured }, REVIEWER, closeTasks)).rejects.toBeInstanceOf(Error);
    expect(await rows('SELECT 1 FROM peer_review_task_proof WHERE document_id=$1', [doc.id])).toEqual([]);
    expect((await rows('SELECT review_status FROM authoring_reviews WHERE doc_id=$1', [doc.id]))[0].review_status).toBe('pending');
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [doc.id])).toEqual([]);
    expect(await rows("SELECT 1 FROM audit_logs WHERE record_id=$1 AND action='authoring.section.document_reviewed'", [doc.id])).toEqual([]);
  }, TIMEOUT);
});

/** A deterministic same-client seam changes genuine rows after an observed
 * statement. This proves the final reread and rollback, not multi-session lock
 * scheduling: PGlite executes this fixture on one connection. */
function afterStatement(marker: string, mutate: () => Promise<void>) {
  let fired = false;
  const query: RequestSqlClient['query'] = async (text, params) => {
    const result = await connection.query(text, params);
    if (!fired && text.includes(marker)) { fired = true; await mutate(); }
    return result;
  };
  const executor: RequestConnectable = { query, connect: async () => ({ query, release: () => undefined }) };
  return { executor, fired: () => fired };
}

type AccessChange = 'document-acl' | 'membership' | 'project-sharing' | 'saved-content';
async function changeAccess(doc: SavedDocument, change: AccessChange) {
  if (change === 'document-acl') await connection.query('UPDATE doc_permissions SET revoked_at=clock_timestamp(),revoked_by=$2 WHERE doc_id=$1 AND principal_id=$3', [doc.id, AUTHOR.id, REVIEWER]);
  if (change === 'membership') await connection.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, Number(REVIEWER)]);
  if (change === 'project-sharing') await connection.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
  if (change === 'saved-content') await connection.query('UPDATE authoring_sections SET content=$2 WHERE id=$1', [doc.sections[0], '<p>A changed saved section during the operation.</p>']);
}

describe('final current-authority and content reread before returning or committing', () => {
  it.each(['document-acl', 'membership', 'project-sharing', 'saved-content'] as const)(
    'refuses a full read after %s changes following its captured snapshot', async change => {
      const doc = await document(); await requestReview(doc.id);
      const hooked = afterStatement('SELECT id::text, code, title, content FROM authoring_sections', () => changeAccess(doc, change));
      await expect(service.readAuthoringPeerReviews(hooked.executor, { tenantId: ORG, actorId: REVIEWER, documentId: doc.id }))
        .rejects.toMatchObject({ status: change === 'saved-content' ? 409 : 403 });
      expect(hooked.fired()).toBe(true);
    }, TIMEOUT);

  it('retains the full saved text but lowers review authority when a Reviewer grant becomes Viewer during the read', async () => {
    const doc = await document(); await requestReview(doc.id);
    const before = await read(doc.id);
    expect(before.reviewContext.canReview).toBe(true);
    const hooked = afterStatement('SELECT id::text, code, title, content FROM authoring_sections', async () => {
      await connection.query("UPDATE doc_permissions SET role='VIEWER' WHERE doc_id=$1 AND principal_id=$2 AND role='REVIEWER'", [doc.id, REVIEWER]);
    });
    const current = await service.readAuthoringPeerReviews(hooked.executor,
      { tenantId: ORG, actorId: REVIEWER, documentId: doc.id });
    expect(hooked.fired()).toBe(true);
    expect(authoringReviewReadSchema.safeParse(current).success).toBe(true);
    expect(current.reviewContext).toMatchObject({ canReview: false,
      snapshot: before.reviewContext.snapshot, snapshotHash: before.reviewContext.snapshotHash,
      myReview: before.reviewContext.myReview });
    expect(current.reviewContext.unavailableReason).toMatch(/reviewer/i);
    expect(current.reviews[0]).toMatchObject({ review_status: 'pending', standing: 'pending' });
  }, TIMEOUT);

  it.each(['document-acl', 'membership', 'project-sharing', 'saved-content'] as const)(
    'rolls back the bound verdict, task record and audit when %s changes after the verdict write', async change => {
      const doc = await document(); await requestReview(doc.id); const captured = await expected(doc.id);
      const hooked = afterStatement('UPDATE authoring_reviews SET review_status=', () => changeAccess(doc, change));
      const closeTasks = async (client: RequestSqlClient) => ({ completed: ['task-proof'], leftOpen: [], notices: [],
        record: async () => { await client.query('INSERT INTO peer_review_task_proof VALUES ($1,$2)', [doc.id, 'late-reread']); } });
      await expect(service.submitAuthoringPeerReview(hooked.executor, {
        tenantId: ORG, actorId: REVIEWER, documentId: doc.id, body: { review_status: 'approved', expected: captured },
      }, { audit, closeTasks })).rejects.toMatchObject({ status: change === 'saved-content' ? 409 : 403 });
      expect(hooked.fired()).toBe(true);
      expect((await rows('SELECT review_status,reviewed_snapshot_hash FROM authoring_reviews WHERE doc_id=$1', [doc.id]))[0])
        .toEqual({ review_status: 'pending', reviewed_snapshot_hash: null });
      expect(await rows('SELECT 1 FROM peer_review_task_proof WHERE document_id=$1', [doc.id])).toEqual([]);
      expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [doc.id])).toEqual([]);
      expect(await rows("SELECT 1 FROM audit_logs WHERE record_id=$1 AND action='authoring.section.document_reviewed'", [doc.id])).toEqual([]);
    }, TIMEOUT);

  it.each(['requester-acl', 'reviewer-membership', 'project-sharing'] as const)(
    'rolls back the review request, grants and audit when %s changes after insertion', async change => {
      const doc = await document();
      const hooked = afterStatement('INSERT INTO authoring_reviews', async () => {
        if (change === 'requester-acl') await connection.query('UPDATE doc_permissions SET revoked_at=clock_timestamp(),revoked_by=$2 WHERE doc_id=$1 AND principal_id=$2', [doc.id, AUTHOR.id]);
        if (change === 'reviewer-membership') await changeAccess(doc, 'membership');
        if (change === 'project-sharing') await connection.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
      });
      // The requester owns the project; make private sharing remove their
      // project admission too, rather than relying on a private label alone.
      if (change === 'project-sharing') await connection.query('UPDATE projects SET owner_id=22,created_by_id=22 WHERE id=42');
      try {
        await expect(requestReview(doc.id, [REVIEWER], hooked.executor)).rejects.toMatchObject({ status: change === 'reviewer-membership' ? 400 : 403 });
      } finally {
        if (change === 'project-sharing') await connection.query('UPDATE projects SET owner_id=$1,created_by_id=$1 WHERE id=42', [Number(AUTHOR.id)]);
      }
      expect(hooked.fired()).toBe(true);
      expect(await rows('SELECT 1 FROM authoring_reviews WHERE doc_id=$1', [doc.id])).toEqual([]);
      expect(await rows("SELECT 1 FROM doc_permissions WHERE doc_id=$1 AND principal_id=$2 AND role='REVIEWER'", [doc.id, REVIEWER])).toEqual([]);
      expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='review_requested'", [doc.id])).toEqual([]);
    }, TIMEOUT);
});
