/**
 * OQ-006 — the signed QMS document acts: approval (VSR-001 F-3) and retirement
 * (security review 2026-09-24, DP-32 / P1-29).
 *
 * Pure predicates over the response shapes the product commits to
 * (docs/evidence/WB/2026-09-21/README.md), and the signed posts made by the
 * credentialed signer (tests/validation/lib/credentials.mjs). These lived in
 * run.mjs until the retirement steps were added (protocol v0.7); they moved here
 * unchanged so the runner stays the list of steps the protocol names. The
 * protocol (docs/validation/OQ-006-QMS.md) names run.mjs, which imports this.
 */
import { signerCode } from '../../lib/credentials.mjs';
import { computeQmsDocumentRetirementDigest, qmsDocumentRetirementDigestInput } from '../../lib/qms-digest.mjs';

export const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const APPROVE_HEX64 = /^[0-9a-f]{64}$/;
const BINDING_BASIS = 'qms-document-version-content-sha256';
/** The mdx-qms error envelope is { error: <message>, details: { code, fieldErrors? } } (server/lib/api-response.ts clientError). */
export const errCode = (r) => r.json?.details?.code ?? r.json?.error?.code ?? null;
/** The data envelope of a mdx-qms response, or an empty one when there is none. */
export const dataOf = (r) => r.json?.data ?? {};
const rowsOf = (r) => r.json?.data ?? [];
/** The approval stamps the route commits to: effective, approver = signer, approved_at set. */
const isEffectiveBy = (d, userId) => d?.status === 'effective' && String(d?.approver_id) === String(userId) && Boolean(d?.approved_at);
/** meta.signature as a signed act returns it — the same shape for the approval and the retirement. */
export const isApprovalSignature = (sig) =>
  Boolean(sig && sig.id && sig.meaning === 'APPROVED' && APPROVE_HEX64.test(String(sig.boundPayloadDigest)) && sig.bindingBasis === BINDING_BASIS);
/** The electronic_signatures row GET /api/part11/signatures/by-target returns for a signed QMS document act. */
export const isQmsSignatureRow = (row, signerId, signatureType) =>
  String(row.signer_id) === String(signerId) &&
  row.signature_meaning === 'APPROVED' &&
  row.signature_type === signatureType &&
  row.binding_basis === BINDING_BASIS &&
  row.is_valid === true;
export const isApprovalRow = (row, signerId) => isQmsSignatureRow(row, signerId, 'qms-document-approval');
/** The stamp the signed retire writes on metadata.retired. */
export const isRetirementStamp = (retired, sig, signerId) =>
  retired.contentDigest === sig.boundPayloadDigest && String(retired.by) === String(signerId) &&
  retired.fromStatus === 'effective' && retired.meaning === 'APPROVED' && Boolean(retired.at);
/** The electronic_signatures rows for a document, as GET /api/part11/signatures/by-target returns them. */
export const signatureRowsFor = async (api, docId) =>
  rowsOf(await api('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(`qms-document:${docId}`)}`));

/**
 * Post a signed QMS act as the credentialed signer (the second identity): the
 * password, a fresh authenticator code when one is enrolled, meaning APPROVED.
 * No code is presented twice (tests/validation/lib/totp.mjs).
 */
export async function postSigned(ctx, path, body) {
  const signer = ctx.state.signer;
  const mfaToken = await signerCode(signer);
  return ctx.apiAs(signer.session)('POST', path, { password: signer.password, ...(mfaToken ? { mfaToken } : {}), meaning: 'APPROVED', ...body });
}

/**
 * A signed approval by the credentialed signer. Shared by the positive step (05)
 * and the fixture approval of SOP B (06d). Asserts the response shape the product
 * commits to (docs/evidence/WB/2026-09-21/README.md).
 */
export async function approveSigned(ctx, docId, reason) {
  const { expect } = ctx;
  const signer = ctx.state.signer;
  const r = await postSigned(ctx, `/api/mdx/qms/documents/${docId}/approve`, { reason, effectiveDate: inDays(0) });
  expect(r.status === 200, `signed approve expected 200, got ${r.status}`, r.json);
  const d = r.json?.data ?? {};
  const meta = r.json?.meta ?? {};
  expect(isEffectiveBy(d, signer.session.user.id), 'approval stamps wrong (status/approver/approved_at)', d);
  expect(meta.auditTrail?.persisted === true, 'meta.auditTrail not reported as persisted', meta);
  const sig = meta.signature;
  expect(isApprovalSignature(sig), 'meta.signature lacks id / meaning APPROVED / sha256 boundPayloadDigest / bindingBasis', sig);
  const approval = d.metadata?.approval ?? {};
  expect(approval.contentDigest === sig.boundPayloadDigest, 'document metadata.approval.contentDigest differs from the signature digest', { approval, sig });
  return { response: r, document: d, signature: sig };
}

/**
 * A signed retirement by the credentialed signer (OQ-QMS-10): the sibling of
 * approveSigned. Asserts the shape the signed retire route commits to: retired,
 * the audit row persisted and chained inside the transaction, meta.signature,
 * and metadata.retired carrying the digest the signature is bound to.
 */
export async function retireSigned(ctx, docId, reason) {
  const { expect } = ctx;
  const r = await postSigned(ctx, `/api/mdx/qms/documents/${docId}/retire`, { reason });
  expect(r.status === 200, `signed retire expected 200, got ${r.status}`, r.json);
  const d = dataOf(r);
  const meta = r.json?.meta ?? {};
  expect(d.status === 'retired' && meta.auditTrail?.persisted === true && meta.auditTrail?.chained === true, 'not retired, or meta.auditTrail not persisted and chained', { status: d.status, auditTrail: meta.auditTrail });
  const sig = meta.signature;
  expect(isApprovalSignature(sig), 'meta.signature lacks id / meaning APPROVED / sha256 boundPayloadDigest / bindingBasis', sig);
  const retired = d.metadata?.retired ?? {};
  expect(retired.contentDigest === sig.boundPayloadDigest, 'document metadata.retired.contentDigest differs from the signature digest', { retired, sig });
  return { response: r, document: d, signature: sig };
}

/**
 * §11.70 for the retirement: the digest recomputed from the stored row with
 * tests/validation/lib/qms-digest.mjs (the approval recipe with metadata.retired
 * removed — the block the retirement writes and stores the digest in), beside
 * the digest the signature reported and the one the document stores.
 */
export function retirementDigestReport(stored, sig, retired, signatureRow) {
  const recomputed = computeQmsDocumentRetirementDigest(stored);
  return {
    method: 'tests/validation/lib/qms-digest.mjs computeQmsDocumentRetirementDigest — re-implementation of server/services/qms/document-approval-signature.ts computeQmsDocumentRetirementDigest (the approval recipe over the stored row with metadata.retired removed)',
    digestInput: qmsDocumentRetirementDigestInput(stored),
    recomputed,
    reportedBySignature: sig.boundPayloadDigest,
    storedOnDocument: retired.contentDigest,
    match: recomputed === sig.boundPayloadDigest && recomputed === retired.contentDigest,
    signatureRow,
  };
}
