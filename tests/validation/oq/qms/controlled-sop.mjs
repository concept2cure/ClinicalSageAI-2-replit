/**
 * OQ-006 v0.8 — how a controlled SOP is made and sent for review now.
 *
 * Since 2026-10-14 a controlled document is created bound to an owned project
 * and authored in the canonical editor (server/services/qms/controlled-document-service.ts
 * createControlledQmsDocument: title, docType, programId, reason), and since
 * RR4 (docs/design/REVIEW_ROUTING_2026-10-23.md §2.7; 2026-10-29) it is sent for
 * review on a review route that names its QMS approver
 * (PATCH /api/mdx/qms/documents/:id {status:'in_review', route}). These are the
 * product's own requests; nothing is seeded. The protocol
 * (docs/validation/OQ-006-QMS.md) names run.mjs, which imports this.
 */
import { errCode, inDays } from './signed-acts.mjs';

/** The project the run's controlled documents belong to (an owned regulatory program of the run's organization). */
export function qmsProgramId() {
  const id = (process.env.OQ_QMS_PROGRAM_ID || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('name the run organization’s project with OQ_QMS_PROGRAM_ID (a regulatory program id the run identity owns); none is built in');
  }
  return id;
}

/** The first authored section of a sections read, whichever envelope it answers in. */
function firstSection(json) {
  const list = json?.sections ?? json?.data ?? json ?? [];
  return Array.isArray(list) ? list[0] : null;
}

/**
 * Create an SOP and write its procedure text in its first authored section:
 * POST /api/mdx/qms/documents, GET its sections, PATCH the first one with a
 * reason for change. Returns the created document.
 */
export async function createAuthoredSop(api, expect, input) {
  const c = await api('POST', '/api/mdx/qms/documents', {
    title: input.title, docType: 'sop', programId: qmsProgramId(), templateKey: 'sop', reason: input.reason,
    ...(input.docNumber ? { docNumber: input.docNumber } : {}), ...(input.nextReviewDate ? { nextReviewDate: input.nextReviewDate } : {}),
  });
  expect(c.status === 201, `create expected 201, got ${c.status}`, c.json);
  const doc = c.json.data;
  expect(doc?.status === 'draft' && doc?.version === '1.0' && Boolean(doc?.authoring_document_id), 'not a draft v1.0 bound to an authored copy', doc);
  const sections = await api('GET', `/api/authoring/docs/${doc.authoring_document_id}/sections`);
  const first = firstSection(sections.json);
  expect(sections.status === 200 && first?.id, `sections read expected 200 with a section, got ${sections.status}`, sections.json);
  const saved = await api('PATCH', `/api/authoring/sections/${first.id}`, {
    content: `<p>${input.title}: inspect the recorded document identifier, revision and controlled text, and record your own acknowledgement of the released revision.</p>`,
    changeReason: 'OQ-006: write the controlled procedure text before review',
  });
  expect(saved.status === 200, `section save expected 200, got ${saved.status}`, saved.json);
  return { doc, response: c };
}

/** The review route an OQ send names: the signer as the QMS approver, no reviewers (NEW-4). */
export const signerRoute = (signerId) => ({ reviewers: [], approvers: [Number(signerId)], order: 'parallel', approvalDueDate: inDays(5) });

/** Send a draft for review on a route naming the signer as its QMS approver; asserts it is in review. */
export async function sendOnRoute(api, expect, docId, signerId, reason) {
  const r = await api('PATCH', `/api/mdx/qms/documents/${docId}`, { status: 'in_review', reason, route: signerRoute(signerId) });
  expect(r.status === 200 && r.json?.data?.status === 'in_review', `routed send expected 200 in_review, got ${r.status}`, r.json);
  return r;
}

/** The document's review route as the register reads it (GET …/review-route). */
export async function readRound(api, expect, docId) {
  const r = await api('GET', `/api/mdx/qms/documents/${docId}/review-route`);
  expect(r.status === 200, `review-route read expected 200, got ${r.status}`, r.json);
  return r.json?.round ?? null;
}

/** Round 1 is open, sent by `senderId`, with `signerId` as its one approver at their turn. */
function openOnSigner(round, senderId, signerId) {
  const m = round?.members ?? [];
  const opened = round?.route?.status === 'open' && round.route.round === 1 && String(round.route.senderId) === String(senderId);
  return opened && m.length === 1 && String(m[0].userId) === String(signerId) && m[0].role === 'approver' && m[0].stepOpen === true && m[0].outcome === 'pending';
}

/**
 * OQ-QMS-04b: a send without a route is refused 409 REVIEW_ROUTE_REQUIRED and
 * the document stays draft; the routed send opens round 1, sent by the run
 * identity, with the signer as its one approver at their turn.
 */
export async function qualifyRoutedSend({ api, expect, auth }, docId, signerId) {
  const bare = await api('PATCH', `/api/mdx/qms/documents/${docId}`, { status: 'in_review', reason: 'OQ-006 step 04b: a send names its route' });
  expect(bare.status === 409 && errCode(bare) === 'REVIEW_ROUTE_REQUIRED', `a send without a route expected 409 REVIEW_ROUTE_REQUIRED, got ${bare.status}`, bare.json);
  const still = await api('GET', `/api/mdx/qms/documents/${docId}`);
  expect(still.json?.data?.status === 'draft', 'the document left draft on the refused send', still.json);
  await sendOnRoute(api, expect, docId, signerId, 'OQ-006 step 04b: SOP A ready for QA approval');
  const round = await readRound(api, expect, docId);
  expect(openOnSigner(round, auth.user.id, signerId), 'the route is not open with the signer as its one approver at their turn', round);
  const m = round.members;
  return `no route → 409 REVIEW_ROUTE_REQUIRED (still draft); routed send → in_review; route ${round.route.id} open, approver ${m[0].printedName ?? m[0].userId} at their turn`;
}

/** OQ-QMS-05b (v0.8): the approval completed the route; its one approver signed with this signature. Returns the route id. */
export async function expectRouteCompleteOn(api, expect, docId, signatureId) {
  const round = await readRound(api, expect, docId);
  const approver = (round?.members ?? [])[0];
  expect(round?.route?.status === 'complete' && approver?.outcome === 'signed' && String(approver?.signature?.id) === String(signatureId),
    'the route is not complete on this approval signature', round);
  return round.route.id;
}

/**
 * The stored row as the signature bound it, for §11.70 recomputation (v0.8).
 * The register read withholds a document's authored prose
 * (metadata.authoringContent, behind the authored copy's own permission), and
 * the approval signs the version with it. So for a document authored in the
 * editor the block is restored from the signed version record the approval
 * wrote (GET …/versions, controlled_document of this version); a registry-only
 * document has none, and is recomputed as read.
 */
export async function asSigned(api, expect, stored) {
  if (!stored?.authoring_document_id) return stored;
  const v = await api('GET', `/api/mdx/qms/documents/${stored.id}/versions`);
  expect(v.status === 200, `versions read expected 200, got ${v.status}`, v.json);
  const record = (v.json?.data ?? []).find((r) => r.version === stored.version && r.controlled_document?.metadata?.authoringContent);
  expect(Boolean(record), `no signed version record carries v${stored.version}'s authored content`, v.json?.data);
  return { ...stored, metadata: { ...(stored.metadata ?? {}), authoringContent: record.controlled_document.metadata.authoringContent } };
}
