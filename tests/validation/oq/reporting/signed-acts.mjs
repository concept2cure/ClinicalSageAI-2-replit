/**
 * OQ-007 — the report run's requests, the signed finalize and the response shapes the app commits to.
 *
 * Pure predicates and small request helpers, kept out of the step modules so those stay the list of steps the
 * protocol names (the arrangement of tests/validation/oq/cmc/signed-acts.mjs). The protocol is
 * docs/validation/OQ-007-REPORTING-ANALYTICS.md; the requirements are docs/validation/URS-008-REPORTING-ANALYTICS.md.
 */
import crypto from 'node:crypto';
import { signerCode } from '../../lib/credentials.mjs';
import { freshTotp } from '../../lib/totp.mjs';

const HEX64 = /^[0-9a-f]{64}$/;
/** BINDING_BASIS for a report finalize, as GET /api/part11/signatures/by-target returns it. */
export const SEAL_BINDING_BASIS = 'report-run-seal-sha256';

export const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const isHex64 = (value) => HEX64.test(String(value));

/**
 * The refusal code of a reporting answer. Three envelopes are in use: `{ error: { code } }` (the ceremony, the
 * launch-scope gate, the compliance reports), `{ error: <sentence>, code }` (the run's own refusals) and
 * `{ error: <CODE> }` (the audit reader gate).
 */
export const errCode = (r) => {
  const j = r.json ?? {};
  if (typeof j.error === 'object' && j.error?.code) return j.error.code;
  if (j.code) return j.code;
  return typeof j.error === 'string' && /^[A-Z][A-Z0-9_]+$/.test(j.error) ? j.error : null;
};

/** The types to try for a finalizable run, in order: the scorecard computes with no blocker on an empty register. */
const PREFERRED_TYPES = ['research_admin.scorecard'];

/** The runnable, entitled types of the catalog, the preferred ones first. */
export function runnableTypes(catalog) {
  const runnable = (catalog ?? []).filter((t) => t.runnable && t.entitled && t.runScopeType && t.runScopeId != null);
  const rank = (t) => (PREFERRED_TYPES.includes(t.typeId) ? 0 : 1);
  return [...runnable].sort((a, b) => rank(a) - rank(b));
}

/** The body of a run request for a catalog type, as the canvas sends it. */
export const runRequest = (type) => ({ scopeType: type.runScopeType, scopeId: String(type.runScopeId), reportTypeId: type.typeId });

/** Whether a finalize of this run would be admitted, as GET /runs/:id/rendered reports it. */
export async function finalEligibility(api, runId) {
  const r = await api('GET', `/api/report-os/runs/${runId}/rendered`);
  return { status: r.status, eligible: r.json?.finalEligibility?.eligible === true, reasons: r.json?.finalEligibility?.reasons ?? [] };
}

/** The total of the organisation's run history. */
export async function runTotal(api) {
  const r = await api('GET', '/api/report-os/runs?limit=1');
  return Number(r.json?.meta?.total ?? NaN);
}

/** The seal read of a run: `data` of GET /runs/:id/seal. */
export async function sealOf(api, runId) {
  const r = await api('GET', `/api/report-os/runs/${runId}/seal`);
  return { status: r.status, view: r.json?.data ?? {} };
}

/** The electronic_signatures rows recorded against a run. */
export async function signatureRows(api, runId) {
  const r = await api('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(`report-run:${runId}`)}`);
  const rows = r.json?.data ?? [];
  return Array.isArray(rows) ? rows : [];
}

/** The signer's re-authentication: the password and, when an authenticator is enrolled, a code never presented before. */
export async function reauthOf(signer) {
  const code = await signerCode(signer);
  return { password: signer.password, ...(code ? { totp: code } : {}) };
}

/** The run identity's own re-authentication (the requester's approval OQ-RPT-08 must see refused). */
export async function runReauth() {
  const password = process.env.OQ_RUN_PASSWORD || process.env.VALIDATION_USER_PASSWORD || '';
  const secret = process.env.VALIDATION_USER_TOTP_SECRET || '';
  const code = secret ? await freshTotp(process.env.VALIDATION_USER_EMAIL || '', secret) : undefined;
  return { password, ...(code ? { totp: code } : {}) };
}

/** What is wrong with a finalize's answer, as a list; empty when it carries a sha256 seal and an approval signature. */
export function finalizeAnswerProblems(data) {
  const { seal = {}, signature = {}, status } = data ?? {};
  const problems = [];
  if (status !== 'final') problems.push(`status ${status}`);
  if (seal.algorithm !== 'sha256' || !isHex64(seal.contentHash) || !seal.sealedAt) problems.push('no sha256 seal');
  if (!signature.signatureId || signature.meaning !== 'approval') problems.push('no signature with the meaning approval');
  return problems;
}

/** What is wrong with a seal read of a finalized run, as a list; empty when it is intact and names its signature. */
export function sealProblems(view, finalizeSeal, reason) {
  const verification = view.verification ?? {};
  const checks = verification.checks ?? [];
  const signature = view.signature ?? {};
  const problems = [];
  if (view.sealed !== true) problems.push('not sealed');
  if (view.seal?.contentHash !== finalizeSeal.contentHash) problems.push('a different content hash from the finalize');
  if (verification.verdict !== 'intact') problems.push(`verdict ${verification.verdict}`);
  if (checks.length < 4) problems.push(`${checks.length} checks`);
  for (const c of checks.filter((x) => x.ok !== true)) problems.push(`check ${c.check} not ok`);
  if (!signature.signerName || !signature.signedAt || signature.meaning !== 'approval') problems.push('the signer, the time or the meaning is missing');
  if (view.finalization?.reason !== reason) problems.push('the reason is missing');
  return problems;
}

/** What is wrong with a sealed compliance report, as a list; empty when its manifest binds the data it carries. */
export function sealedReportProblems(signed, headerHash, organizationId) {
  const manifest = signed.manifest ?? {};
  const dataHash = sha256Hex(String(signed.data));
  const problems = [];
  if (manifest.kind !== 'compliance-report') problems.push(`manifest kind ${manifest.kind}`);
  if (String(manifest.organizationId) !== String(organizationId)) problems.push(`manifest organisation ${manifest.organizationId}`);
  if (manifest.dataHash !== dataHash) problems.push('manifest.dataHash is not the SHA-256 of the data');
  if (headerHash !== dataHash) problems.push('X-Report-Data-Hash is not the SHA-256 of the data');
  if (!signed.signature) problems.push('no signature');
  if (!manifest.signingKeyId) problems.push('no signing key id');
  return problems;
}

/** The e-signature register's row for one record (`record_type`, `record_id`), or null. */
export function registerRowFor(data, recordType, recordId) {
  const rows = (data?.sections ?? []).find((s) => s.key === 'signatures')?.rows ?? [];
  return rows.find((x) => x.record_type === recordType && String(x.record_id) === String(recordId)) ?? null;
}

/** The integrity report's verdict rows, split: the audit_logs chain walk, the rows not intact, and those giving no reason. */
export function integrityVerdicts(data) {
  const verdicts = (data?.sections ?? []).find((s) => s.key === 'verdicts')?.rows ?? [];
  const chain = verdicts.find((v) => v.store === 'audit_logs' && /hash chain/i.test(String(v.check))) ?? null;
  const notVerified = verdicts.filter((v) => v.verdict !== 'intact');
  const unexplained = notVerified.filter((v) => !String(v.detail ?? '').trim());
  return { verdicts, chain, notVerified, unexplained, chainIntact: chain?.verdict === 'intact' && Number(chain.rows_checked) > 0 };
}

export const finalizePath = (runId) => `/api/report-os/runs/${runId}/finalize`;

/** The signature row a finalize writes: the signer, the meaning, bound to the seal, valid. */
export const isFinalizeRow = (row, signerId, meaning) =>
  String(row.signer_id) === String(signerId) &&
  String(row.signature_meaning).toLowerCase() === meaning &&
  row.binding_basis === SEAL_BINDING_BASIS &&
  isHex64(row.signature_hash) &&
  row.is_valid === true;

/**
 * One request whose body is read as bytes. The harness client reads a body as text, which is not the bytes a PDF
 * was sent as, so the export step fetches it here and attaches its own record of the request.
 */
export async function fetchBytes(baseUrl, path, accessToken) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Origin: baseUrl, Authorization: `Bearer ${accessToken}` } });
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    disposition: res.headers.get('content-disposition'),
    headerSha256: res.headers.get('x-export-sha256'),
    bodySha256: sha256Hex(bytes),
    byteLength: bytes.length,
    startsWith: bytes.subarray(0, 5).toString('latin1'),
    json: res.headers.get('content-type')?.includes('json') ? JSON.parse(bytes.toString('utf8')) : null,
  };
}
