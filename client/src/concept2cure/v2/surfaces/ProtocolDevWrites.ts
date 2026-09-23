/**
 * Protocol development — the write layer for the registers the surface edits.
 *
 * `ProtocolRegisterForms.tsx` owns the CREATE forms for the four operational
 * registers plus objective / eligibility. This module owns the two signed
 * acts (finalize, reviewer disposition — see "Signed acts" below) and the
 * writes that surface never had a caller for, and that WO left the routes for
 * without a screen (docs/evidence/WO/2026-09-21): the section body, the
 * schedule of assessments' visits and assessment rows, a risk's residual
 * rating, the budget's line items and feasibility parameters, the review
 * assignments, and the cover page. One writer per capability — nothing here
 * duplicates a path `submitProtocolRegister` already posts to.
 *
 * Every route is the governed one that already exists; none was invented for
 * this module:
 *
 *   section          PATCH /api/protocol-development/sections/:id
 *   visit add        POST  /api/protocol-development/documents/:id/visits
 *   visit rename     PATCH /api/protocol-development/documents/:id/visits/:visitId
 *   visit remove     POST  /api/protocol-development/documents/:id/visits/:visitId/remove
 *   assessment add   POST  /api/protocol-soa/documents/:id/assessments
 *   assessment rm    POST  /api/protocol-development/documents/:id/assessments/:aid/remove
 *   risk residual    PATCH /api/protocol-risks/risks/:id
 *   budget item      POST  /api/protocol-budget/documents/:id/items
 *   budget params    PUT   /api/protocol-budget/documents/:id/params
 *   reviewer         POST  /api/protocol-reviews/documents/:id/reviewers
 *   disposition      PATCH /api/protocol-reviews/assignments/:id/disposition
 *   cover page       PATCH /api/protocol-development/documents/:id
 *   start protocol   POST  /api/protocol-development/documents
 *
 * Every one requires a governed reason of at least 8 characters; the server
 * refuses less and this module refuses it first, so a rejected ceremony never
 * reaches the ledger as a failed write.
 *
 * FAIL CLOSED: a refusal throws with the server's own message and the sentence
 * "Nothing was written." The caller re-reads GET /api/protocol-dev after a
 * confirmed write — no register is patched locally, so the screen can only
 * ever show what the record holds.
 */
import { ApiRequestError, apiRequest } from '@/lib/queryClient';

/** The section PATCH's optimistic-concurrency refusal (409 SECTION_CHANGED). */
export class ProtocolSectionConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolSectionConflict';
  }
}

const MIN_REASON = 8;

/** Drops empty-string optionals so the Zod schemas see absent, not ''. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null));
}

/** The governed reason, or a refusal that never leaves the browser. */
export function requireReason(raw: string | undefined): string {
  const reason = (raw ?? '').trim();
  if (reason.length < MIN_REASON) {
    throw new Error(`The governed reason must be at least ${MIN_REASON} characters. Nothing was written.`);
  }
  return reason;
}

/** A finite number from a form string, or undefined when the field was empty. */
export function optionalNumber(raw: string | undefined): number | undefined {
  const s = (raw ?? '').trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function detailOf(json: unknown, status: number): string {
  const err = (json as { error?: unknown } | null)?.error;
  if (typeof err === 'string') return err;
  const obj = err as { message?: unknown; code?: unknown } | undefined;
  if (typeof obj?.message === 'string') return obj.message;
  if (typeof obj?.code === 'string') return obj.code;
  return `HTTP ${status}`;
}

/** The one refusal, whichever way the HTTP client delivered it. */
function refusal(what: string, status: number, code: string | undefined, message: string): Error {
  // A signed act answers 401 for a password the server did not accept, which
  // is not the same as an expired session and must not be reported as one.
  if (status === 401 && code?.startsWith('REAUTH_TOTP')) {
    return new Error(`Couldn't ${what} — the authenticator code was ${code === 'REAUTH_TOTP_REQUIRED' ? 'required and not given' : 'not accepted'}. Nothing was signed.`);
  }
  if (status === 401 && code?.startsWith('REAUTH')) {
    return new Error(`Couldn't ${what} — the password was not accepted. Nothing was signed.`);
  }
  if (status === 401) return new Error(`Couldn't ${what} — your session isn't authenticated. Nothing was written.`);
  if (status === 409 && code === 'SECTION_CHANGED') return new ProtocolSectionConflict(message);
  return new Error(`Couldn't ${what} — ${message} Nothing was written.`);
}

/**
 * Send one governed write. `what` completes the sentence "Couldn't <what>" on
 * a refusal, so every failure names the act the user attempted rather than the
 * route that refused it.
 *
 * `apiRequest` answers a refusal in TWO shapes and both are handled here.
 * In a browser it THROWS an `ApiRequestError` carrying the status, the
 * server's code and its sentence — every non-2xx except 401. Reading only
 * `res.ok` therefore leaves a branch that never runs: the refusal still
 * reaches the user, because the thrown message is the server's, but the CODE
 * is lost with it, so a 409 SECTION_CHANGED cannot be told from any other 409
 * and the editor's concurrency handling never fires. It RESOLVES on 401, and
 * resolves a non-ok `Response` wherever a test doubles it, so the `res.ok`
 * branch below is the second half of the same contract, not a leftover.
 */
async function send(
  method: 'POST' | 'PATCH' | 'PUT',
  path: string,
  body: Record<string, unknown>,
  what: string,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await apiRequest(method, path, body);
  } catch (e) {
    /* Anything that is not an API refusal — a dropped connection, a parse
       failure — is re-thrown as it came. Dressing it as a governed refusal
       would claim the server answered when it did not. */
    if (!(e instanceof ApiRequestError)) throw e;
    throw refusal(what, e.status, e.code, e.message);
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || res.status === 401) {
    const code = (json as { error?: { code?: string } } | null)?.error?.code;
    throw refusal(what, res.status, code, detailOf(json, res.status));
  }
  return json ?? {};
}

/* ── Sections ──────────────────────────────────────────────────────────── */

export interface SectionSaveInput {
  sectionId: number;
  content?: string;
  status?: 'not_started' | 'draft' | 'complete';
  /** The `updated_at` the editor loaded. The route refuses a row that moved. */
  expectedUpdatedAt?: string | null;
  reason: string;
}

/** Returns the row's new `updatedAt` so the editor can keep its token fresh. */
export async function saveProtocolSection(
  input: SectionSaveInput,
): Promise<{ updatedAt: string | null; status: string | null }> {
  const reason = requireReason(input.reason);
  const body = compact({
    content: input.content,
    status: input.status,
    expectedUpdatedAt: input.expectedUpdatedAt,
    reason,
  });
  const json = await send('PATCH', `/api/protocol-development/sections/${input.sectionId}`, body, 'save the section');
  const updatedAt = json.updatedAt;
  return {
    updatedAt: updatedAt == null ? null : String(updatedAt),
    status: json.status == null ? null : String(json.status),
  };
}

/* ── Schedule of assessments ───────────────────────────────────────────── */

export async function addScheduleVisit(
  documentId: number,
  v: { visitName: string; timepoint?: string; reason: string },
): Promise<Record<string, unknown>> {
  const reason = requireReason(v.reason);
  return send('POST', `/api/protocol-development/documents/${documentId}/visits`,
    compact({ visitName: v.visitName, timepoint: v.timepoint, reason }), 'add the visit');
}

export async function renameScheduleVisit(
  documentId: number,
  visitId: number,
  v: { visitName?: string; timepoint?: string; reason: string },
): Promise<Record<string, unknown>> {
  const reason = requireReason(v.reason);
  return send('PATCH', `/api/protocol-development/documents/${documentId}/visits/${visitId}`,
    compact({ visitName: v.visitName, timepoint: v.timepoint, reason }), 'rename the visit');
}

export async function removeScheduleVisit(
  documentId: number,
  visitId: number,
  reasonRaw: string,
): Promise<Record<string, unknown>> {
  const reason = requireReason(reasonRaw);
  return send('POST', `/api/protocol-development/documents/${documentId}/visits/${visitId}/remove`,
    { reason }, 'remove the visit');
}

export async function addSoaAssessment(
  documentId: number,
  v: { name: string; category?: string; reason: string },
): Promise<Record<string, unknown>> {
  const reason = requireReason(v.reason);
  return send('POST', `/api/protocol-soa/documents/${documentId}/assessments`,
    compact({ name: v.name, category: v.category, reason }), 'add the assessment');
}

export async function removeSoaAssessment(
  documentId: number,
  assessmentId: number,
  reasonRaw: string,
): Promise<Record<string, unknown>> {
  const reason = requireReason(reasonRaw);
  return send('POST', `/api/protocol-development/documents/${documentId}/assessments/${assessmentId}/remove`,
    { reason }, 'remove the assessment');
}

/* ── Risk register ─────────────────────────────────────────────────────── */

export async function updateProtocolRisk(
  riskId: number,
  v: {
    residualLikelihood?: string;
    residualImpact?: string;
    owner?: string;
    mitigation?: string;
    status?: string;
    reason: string;
  },
): Promise<Record<string, unknown>> {
  const reason = requireReason(v.reason);
  return send('PATCH', `/api/protocol-risks/risks/${riskId}`, compact({
    residualLikelihood: v.residualLikelihood,
    residualImpact: v.residualImpact,
    owner: v.owner,
    mitigation: v.mitigation,
    status: v.status,
    reason,
  }), 'update the risk');
}

/* ── Budget ────────────────────────────────────────────────────────────── */

export async function addBudgetItem(
  documentId: number,
  v: { description: string; unitCost: number; quantityPerSubject?: number; category?: string; payer?: string; reason: string },
): Promise<Record<string, unknown>> {
  const reason = requireReason(v.reason);
  return send('POST', `/api/protocol-budget/documents/${documentId}/items`, compact({
    description: v.description,
    unitCost: v.unitCost,
    quantityPerSubject: v.quantityPerSubject,
    category: v.category,
    payer: v.payer,
    reason,
  }), 'add the budget line');
}

export async function setBudgetParams(
  documentId: number,
  v: { targetEnrollment?: number; sponsorPaymentPerSubject?: number; indirectRatePct?: number; reason: string },
): Promise<Record<string, unknown>> {
  const reason = requireReason(v.reason);
  return send('PUT', `/api/protocol-budget/documents/${documentId}/params`, compact({
    targetEnrollment: v.targetEnrollment,
    sponsorPaymentPerSubject: v.sponsorPaymentPerSubject,
    indirectRatePct: v.indirectRatePct,
    reason,
  }), 'set the feasibility parameters');
}

/* ── Reviews ───────────────────────────────────────────────────────────── */

export async function requestProtocolReview(
  documentId: number,
  v: { reviewerName: string; role?: string; dueDate?: string; reason: string },
): Promise<Record<string, unknown>> {
  const reason = requireReason(v.reason);
  return send('POST', `/api/protocol-reviews/documents/${documentId}/reviewers`, compact({
    reviewerName: v.reviewerName,
    role: v.role,
    dueDate: v.dueDate,
    reason,
  }), 'request the review');
}

/* ── Signed acts ───────────────────────────────────────────────────────────
   Finalizing and a reviewer's disposition are electronic signatures. The
   shared EsignModal collects the meaning, the reason, the password and, when
   the signer has one enrolled, the authenticator code. It pre-checks the
   password itself; the signing request then carries both as `reauth`, for the
   server to re-verify inside the signing transaction. Nothing here stores them. */

export interface ProtocolSignatureInput {
  meaning: string;
  reason: string;
  password: string;
  totp?: string;
}

function signedBody(s: ProtocolSignatureInput): Record<string, unknown> {
  return {
    reason: requireReason(s.reason),
    meaning: s.meaning,
    reauth: { password: s.password, ...(s.totp ? { totp: s.totp } : {}) },
  };
}

export async function recordReviewDisposition(
  assignmentId: number,
  v: { disposition: string } & ProtocolSignatureInput,
): Promise<Record<string, unknown>> {
  return send('PATCH', `/api/protocol-reviews/assignments/${assignmentId}/disposition`,
    { disposition: v.disposition, ...signedBody(v) }, 'sign the disposition');
}

export async function finalizeProtocol(
  documentId: number,
  v: ProtocolSignatureInput,
): Promise<Record<string, unknown>> {
  return send('POST', `/api/protocol-development/documents/${documentId}/finalize`,
    signedBody(v), 'finalize the protocol');
}

/* ── Cover page ────────────────────────────────────────────────────────── */

export async function updateProtocolHeader(
  documentId: number,
  v: { sponsor?: string; principalInvestigator?: string; title?: string; protocolNumber?: string; phase?: string; reason: string },
): Promise<Record<string, unknown>> {
  const reason = requireReason(v.reason);
  /* The route is `.strict()` and refuses a body with no field to change, so
     an untouched form is refused here rather than sent to be refused there. */
  const fields = compact({
    sponsor: v.sponsor,
    principalInvestigator: v.principalInvestigator,
    title: v.title,
    protocolNumber: v.protocolNumber,
    phase: v.phase,
  });
  if (Object.keys(fields).length === 0) {
    throw new Error('Nothing to change — enter a sponsor or a principal investigator. Nothing was written.');
  }
  return send('PATCH', `/api/protocol-development/documents/${documentId}`, { ...fields, reason }, 'update the cover page');
}

/* ── Start a protocol ──────────────────────────────────────────────────── */

export async function startProtocolDocument(
  v: { title: string; protocolKind: string; protocolNumber?: string; phase?: string; sponsor?: string; principalInvestigator?: string; reason: string },
): Promise<{ id: number | null; sectionsSeeded: number | null }> {
  const reason = requireReason(v.reason);
  const json = await send('POST', '/api/protocol-development/documents', compact({
    title: v.title,
    protocolKind: v.protocolKind,
    protocolNumber: v.protocolNumber,
    phase: v.phase,
    sponsor: v.sponsor,
    principalInvestigator: v.principalInvestigator,
    reason,
  }), 'start the protocol');
  return {
    id: typeof json.id === 'number' ? json.id : null,
    sectionsSeeded: typeof json.sectionsSeeded === 'number' ? json.sectionsSeeded : null,
  };
}
