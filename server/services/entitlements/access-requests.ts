/**
 * Module access requests — the decision logic behind "I cannot buy this, but I
 * need it".
 *
 * WHY THIS EXISTS. A member who opened a locked destination got an honest
 * panel and, if they were not an org administrator, no button at all: the panel
 * refuses to offer an action the viewer cannot take. Honest, and a dead end —
 * the person who actually needs the module had nothing to do with the knowledge
 * that they needed it. This module is the missing step: the ask is recorded, an
 * administrator answers it, and the answer is governed.
 *
 * ── WHAT LIVES HERE, AND WHY IT IS SEPARATE FROM THE ROUTE ───────────────────
 * Everything in this file is PURE — no database, no Express, no clock. That is
 * not tidiness: the authorization rules below are the whole security boundary of
 * this feature, and a rule that can only be exercised by standing up Express, a
 * pool and a JWT is a rule that gets tested once and then trusted forever. Here
 * each one is a function with a truth table.
 *
 * ── THE FOUR RULES ───────────────────────────────────────────────────────────
 *  1. A member may request a module FOR THEIR OWN ORGANIZATION ONLY. The
 *     organization is taken from the request's own tenant context and is never
 *     read from the body — there is no field a caller could set to aim a
 *     request at somebody else's workspace.
 *  2. Only an org administrator or the platform owner may answer a request.
 *  3. An org administrator may answer ONLY their own organization's requests.
 *     A platform master admin answers across organizations, because that is
 *     already true of every other entitlement control they hold; an org admin
 *     reaching across a tenant boundary is refused unconditionally.
 *  4. Answering is a governed act: a reason of at least three characters, the
 *     same floor the master licensing console applies, and an audit entry
 *     written by the route.
 *
 * ── APPROVAL WRITES THE GRANT THE ONE CANONICAL WAY ──────────────────────────
 * The grant itself is NOT written here — see the note at the foot of this file.
 * It goes through `writeModuleGrant` in ./module-grants, the one place the
 * `module_subscriptions` upsert lives. Nothing downstream reads a request row to
 * decide entitlement, and nothing in this feature can revoke a grant: the record
 * of the ask is never a second entitlement store.
 *
 * @module server/services/entitlements/access-requests
 */

/** The three states a request can be in. Mirrors the table's CHECK constraint. */
export type AccessRequestStatus = 'open' | 'approved' | 'declined';

/** The two an administrator can move it to. */
export type AccessRequestDecision = 'approved' | 'declined';

/**
 * The floor for a reason-for-change, in characters after trimming.
 *
 * Three, matching `normalizeReason` in the master licensing console and the
 * inline check in the master admin console. An administrator should not have to
 * learn one rule for suspending a tenant and a different one for answering a
 * colleague.
 */
export const MIN_REASON_CHARS = 3;

/**
 * The longest note a requester can attach. Long enough for the paragraph
 * somebody writes about a submission deadline; short enough that the queue
 * stays a queue. Over-long input is REFUSED rather than silently truncated —
 * a request that shows the administrator less than the requester wrote is worse
 * than one that was not accepted.
 */
export const MAX_NOTE_CHARS = 2000;

/** Identity as the route resolves it, before any rule is applied. */
export interface RequestActor {
  /** The authenticated user, or null when there is none. */
  userId: number | null;
  /** The organization the request is scoped to, or null when there is none. */
  organizationId: number | null;
  /** Org-scoped `admin` — an ordinary customer, not platform staff. */
  isOrgAdmin: boolean;
  /** The platform-owner grant. Crosses tenant boundaries by design. */
  isMasterAdmin: boolean;
}

/** The row as the table stores it. */
export interface AccessRequestRow {
  id: number | string;
  organization_id: number | string;
  module_id: string;
  requested_by: number | string;
  requester_email: string | null;
  requester_name: string | null;
  note: string | null;
  status: string;
  decided_by: number | string | null;
  decided_by_email: string | null;
  decided_at: Date | string | null;
  decision_reason: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  /** Present only on the queue reads, which join the catalog. */
  module_name?: string | null;
  organization_name?: string | null;
}

/** The row as the client reads it. */
export interface AccessRequest {
  id: number;
  organizationId: number;
  organizationName: string | null;
  moduleId: string;
  moduleName: string | null;
  requestedBy: number;
  requesterEmail: string | null;
  requesterName: string | null;
  note: string | null;
  status: AccessRequestStatus;
  decidedByEmail: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * A refusal, as the status and sentence the route sends.
 *
 * Returned rather than thrown so every caller is forced to handle it, and so
 * the truth table in the tests reads as data instead of as a set of expected
 * exceptions.
 */
export interface Denial {
  status: 400 | 401 | 403 | 404 | 409;
  error: string;
}

/* ── Input normalization ──────────────────────────────────────────────────── */

/**
 * PURE: a reason-for-change, trimmed, or null when it does not clear the floor.
 *
 * Deliberately the same shape and floor as the master licensing console's
 * validator. That one is exported from a route module, which a service must not
 * import; when those routes are converged onto a shared governance helper this
 * is the implementation to converge onto.
 */
export function normalizeReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length >= MIN_REASON_CHARS ? trimmed : null;
}

/**
 * PURE: the requester's note.
 *
 * Three outcomes, and the difference between two of them matters: `null` means
 * "no note", which is a complete request and not a draft; `{ tooLong: true }`
 * means the caller sent more than the column is meant to hold and must be told
 * so rather than having their words cut in half.
 */
export function normalizeNote(raw: unknown): { note: string | null } | { tooLong: true } {
  if (raw === undefined || raw === null) return { note: null };
  if (typeof raw !== 'string') return { note: null };
  const trimmed = raw.trim();
  if (!trimmed) return { note: null };
  if (trimmed.length > MAX_NOTE_CHARS) return { tooLong: true };
  return { note: trimmed };
}

/** PURE: a module id, trimmed, or null when absent or blank. */
export function normalizeModuleId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** PURE: is this one of the two decisions an administrator can record? */
export function isDecision(raw: unknown): raw is AccessRequestDecision {
  return raw === 'approved' || raw === 'declined';
}

/* ── Authorization ────────────────────────────────────────────────────────── */

/**
 * PURE: may this actor record a request?
 *
 * Any authenticated member of an organization may. There is no admin gate here
 * on purpose — the entire point of the feature is that the person who cannot
 * act is the person who needs to be heard.
 *
 * Note what is NOT a parameter: a target organization. The organization comes
 * from the actor's own context, so rule 1 is not enforced by a check that could
 * be forgotten — it is enforced by there being nothing to check against.
 */
export function denyCreate(actor: RequestActor): Denial | null {
  if (actor.userId == null) return { status: 401, error: 'Sign in to request access.' };
  if (actor.organizationId == null) {
    return { status: 401, error: 'This account is not attached to a workspace.' };
  }
  return null;
}

/**
 * PURE: may this actor READ the queue at the given scope?
 *
 * `all` is the platform owner's cross-organization view. An org admin asking
 * for it is refused rather than quietly downgraded to their own organization:
 * a console that shows one workspace while its heading says every workspace is
 * a console that lies about its own scope.
 */
export function denyQueueRead(actor: RequestActor, scope: 'organization' | 'all'): Denial | null {
  if (actor.userId == null) return { status: 401, error: 'Sign in to view access requests.' };
  if (scope === 'all') {
    if (!actor.isMasterAdmin) {
      return { status: 403, error: 'Only a platform administrator can view every workspace.' };
    }
    return null;
  }
  if (actor.organizationId == null && !actor.isMasterAdmin) {
    return { status: 401, error: 'This account is not attached to a workspace.' };
  }
  if (!actor.isOrgAdmin && !actor.isMasterAdmin) {
    return { status: 403, error: 'Only an administrator can view access requests.' };
  }
  return null;
}

/** The parts of a stored request the decision rules actually read. */
export interface DecidableRequest {
  organizationId: number;
  status: AccessRequestStatus;
}

/**
 * PURE: may this actor approve or decline THIS request?
 *
 * The order of the checks is deliberate and is the part worth reviewing:
 *
 *   authentication → authority → tenant boundary → state
 *
 * The tenant boundary is checked BEFORE the request's state, so an org admin
 * probing another organization's ids learns the same thing for every id — that
 * they may not act — rather than being told which ones are already answered.
 * A master admin is exempt from the boundary and from nothing else.
 */
export function denyDecision(actor: RequestActor, request: DecidableRequest): Denial | null {
  if (actor.userId == null) return { status: 401, error: 'Sign in to answer this request.' };
  if (!actor.isOrgAdmin && !actor.isMasterAdmin) {
    return { status: 403, error: 'Only an administrator can answer an access request.' };
  }
  if (!actor.isMasterAdmin && actor.organizationId !== request.organizationId) {
    return { status: 403, error: 'This request belongs to another workspace.' };
  }
  if (request.status !== 'open') {
    return {
      status: 409,
      error: 'This request has already been answered.',
    };
  }
  return null;
}

/* ── Row mapping ──────────────────────────────────────────────────────────── */

/** PURE: an instant as an ISO-8601 string, or null when it is absent or unreadable. */
export function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** PURE: a stored status, or 'open' — the only value that could be acted on. */
export function toStatus(raw: unknown): AccessRequestStatus {
  return raw === 'approved' || raw === 'declined' ? raw : 'open';
}

/** PURE: the stored row as the client contract. */
export function mapRow(row: AccessRequestRow): AccessRequest {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    organizationName: row.organization_name ?? null,
    moduleId: row.module_id,
    moduleName: row.module_name ?? null,
    requestedBy: Number(row.requested_by),
    requesterEmail: row.requester_email ?? null,
    requesterName: row.requester_name ?? null,
    note: row.note ?? null,
    status: toStatus(row.status),
    decidedByEmail: row.decided_by_email ?? null,
    decidedAt: toIso(row.decided_at),
    decisionReason: row.decision_reason ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/* ── The grant ────────────────────────────────────────────────────────────────
 *
 * There is deliberately no grant writer in this module.
 *
 * Approving a request writes an `enabled` row in `module_subscriptions` — the
 * override the entitlement resolver reads ahead of tier and industry — through
 * `writeModuleGrant` in ./module-grants, which is the ONE place that statement
 * lives. The route calls it directly. A second upsert here, even a correct one,
 * would be a third copy of the enabled_at / disabled_at / enabled_by /
 * expires_at bookkeeping, and a correction to one of them would then apply to a
 * third of the product.
 *
 * What the approval path must state, and does, is `expiresAt: null`. That
 * signature has no default on purpose: an organization whose trial of a module
 * lapsed still holds a row carrying a past date, and re-enabling it without
 * clearing that date writes `enabled = true` on an already-expired grant. The
 * queue would say approved and the rail would still say locked. An approval is
 * an unbounded grant and says so.
 */
