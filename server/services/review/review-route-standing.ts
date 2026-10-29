/**
 * What a review route stands at, read from the route header, the member rows'
 * identity columns and VERIFIED signatures — never from a task's status
 * (docs/design/REVIEW_ROUTING_2026-10-23.md §2.1, §2.4, §2.12; RR1a).
 *
 * routeStanding answers exactly one state for a subject:
 *
 *   none       no route, and the subject is not in review
 *   legacy     no route (or the latest one closed before the subject re-entered
 *              review), and the subject is in review: today's eligible signers
 *   live       the latest route is open: only named members whose step is open
 *   withdrawn  the latest route was withdrawn: NOBODY signs until a new route
 *              is sent; it never falls back to "any eligible signer"
 *   returned   the latest route was returned for revision
 *   complete   the latest route's approval is recorded
 *
 * A member's governed act (route_act_id) is a return or a hand-back (RR3),
 * told apart by the act's own command; a member with an act has not signed
 * and is not pending, so neither signs nor completes their step.
 *
 * A failed read THROWS. It is never answered as "none", because "nobody is
 * named" and "the names could not be read" must not look the same.
 *
 * A member's signature counts only when it is the electronic_signatures row
 * stamped on THIS route's member row, of this organization, over the subject,
 * by the member's assignee, bound to the route's content digest, with the
 * role's meaning, and not withdrawn (isSignatureWithdrawn) — finding B3.
 *
 * Every statement carries `organization_id = $1`.
 *
 * @module server/services/review/review-route-standing
 */
import { isSignatureWithdrawn } from '../part11/signature-persistence';

export interface RouteQueryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

export type RouteSubjectType = 'canonical_document' | 'qms_document' | 'authoring_document';
export type RouteRole = 'reviewer' | 'approver';
export type RouteState = 'none' | 'legacy' | 'live' | 'withdrawn' | 'returned' | 'complete';
export type MemberOutcome = 'pending' | 'signed' | 'returned' | 'handed back';

/** The declared §11.50 meaning each role's signature carries. */
export const ROUTE_SIGN_MEANING: Record<RouteRole, string> = { reviewer: 'REVIEWED', approver: 'APPROVED' };

/** The governed target a subject's signatures and naming history are written on. */
export function routeSubjectTarget(type: RouteSubjectType, id: string): string {
  if (type === 'canonical_document') return `canonical_document:${id}`;
  if (type === 'qms_document') return `qms-document:${id}`;
  return `authoring-document:${id}`;
}

export interface RouteHeader {
  id: string;
  round: number;
  senderId: number;
  senderName: string;
  order: 'parallel' | 'sequential';
  status: 'open' | 'withdrawn' | 'returned' | 'complete';
  statusReason: string | null;
  statusBy: number | null;
  statusAt: string | null;
  contentDigest: string;
  reviewDueAt: string | null;
  approvalDueAt: string;
  createdAt: string;
}

export interface RouteMember {
  taskId: string;
  userId: number;
  role: RouteRole;
  step: number;
  /** The printed name recorded when the member was named. */
  printedName: string | null;
  outcome: MemberOutcome;
  stepOpen: boolean;
  dueDate: string | null;
  /** The verified signature, when outcome is 'signed'. */
  signature: { id: number; printedName: string | null; meaning: string; signedAt: string } | null;
  /** The governed act a return or hand-back is recorded as. */
  actId: string | null;
}

/** What the naming history records: each governed act on a route, by printed name (§2.12, M3; RR3). */
export type RouteHistoryAction = 'send' | 'reassign' | 'hand-back' | 'withdraw' | 'return';
export interface RouteHistoryEntry {
  action: RouteHistoryAction;
  /** UTC instant the act was recorded. */
  at: string;
  actorId: number;
  /** The actor's printed name, as the act recorded it (or as the route named them). */
  actorName: string | null;
  reason: string | null;
  /** For a reassign or a hand-back: the role of the assignment. */
  role?: RouteRole;
  /** For a reassign: who it was taken from and given to, at naming. */
  fromName?: string | null;
  toName?: string | null;
  /** For a send: everyone named, in the order named. */
  members?: Array<{ userId: number; role: RouteRole; printedName: string | null }>;
}

export interface RouteStanding {
  state: RouteState;
  route: RouteHeader | null;
  members: RouteMember[];
  reviewComplete: boolean;
  approvalComplete: boolean;
}

const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString());

function header(r: Record<string, any>): RouteHeader {
  return {
    id: String(r.id),
    round: Number(r.round),
    senderId: Number(r.sender_id),
    senderName: String(r.sender_name),
    order: r.review_order,
    status: r.status,
    statusReason: r.status_reason ?? null,
    statusBy: r.status_by == null ? null : Number(r.status_by),
    statusAt: iso(r.status_at),
    contentDigest: String(r.content_digest),
    reviewDueAt: iso(r.review_due_at),
    approvalDueAt: iso(r.approval_due_at)!,
    createdAt: iso(r.created_at)!,
  };
}

const MEMBER_SQL = `
  SELECT t.review_route_id::text AS route_id, t.task_id, t.assignee_id, t.assignee_name, t.review_role, t.review_step,
         t.route_signature_id, t.route_act_id, t.due_date, act.command AS act_command,
         es.id AS sig_id, es.signer_id, es.signer_name, es.signature_meaning, es.signed_at, es.signed_target,
         es.bound_payload_digest, es.verification_status, es.superseded_by, es.is_valid
    FROM unified_tasks t
    LEFT JOIN electronic_signatures es ON es.id = t.route_signature_id AND es.organization_id = $1
    LEFT JOIN c2c_ana_actions act ON act.id = t.route_act_id AND act.org_id = $1
   WHERE t.organization_id = $1 AND t.review_route_id = ANY($2::uuid[]) AND t.deleted_at IS NULL
   ORDER BY t.review_step, t.id`;
/** The same read, locking the member rows (after the subject's own row lock). */
const MEMBER_SQL_FOR_UPDATE = `${MEMBER_SQL} FOR UPDATE OF t`;

/** Whether the signature stamped on a member row is that member's, over this route's content, with the role's meaning, and in force (B3). */
function verifiedSignature(row: Record<string, any>, route: { header: RouteHeader; target: string }, role: RouteRole): boolean {
  if (row.sig_id == null || row.signed_target !== route.target) return false;
  if (Number(row.signer_id) !== Number(row.assignee_id)) return false;
  if (row.bound_payload_digest !== route.header.contentDigest) return false;
  if (String(row.signature_meaning ?? '').toUpperCase() !== ROUTE_SIGN_MEANING[role]) return false;
  return !isSignatureWithdrawn(row);
}

/** A member's disposition: a verified signature, else their act (a hand-back by its command; any other act is a return), else pending. */
function outcomeOf(row: Record<string, any>, verified: boolean): MemberOutcome {
  if (verified) return 'signed';
  if (!row.route_act_id) return 'pending';
  return row.act_command === 'review-route.hand-back' ? 'handed back' : 'returned';
}

function toMember(row: Record<string, any>, route: { header: RouteHeader; target: string }): RouteMember {
  const role = row.review_role as RouteRole;
  const verified = verifiedSignature(row, route, role);
  return {
    taskId: String(row.task_id),
    userId: Number(row.assignee_id),
    role,
    step: Number(row.review_step),
    printedName: row.assignee_name ?? null,
    outcome: outcomeOf(row, verified),
    stepOpen: false,
    dueDate: iso(row.due_date),
    signature: verified
      ? { id: Number(row.sig_id), printedName: row.signer_name ?? null, meaning: String(row.signature_meaning), signedAt: iso(row.signed_at)! }
      : null,
    actId: row.route_act_id ?? null,
  };
}

/** Members of `routes`, each with its verified signature (or none), by route id. */
async function readMembers(
  q: RouteQueryable,
  organizationId: number,
  routes: Array<{ header: RouteHeader; target: string }>,
  forUpdate: boolean,
): Promise<Map<string, RouteMember[]>> {
  const out = new Map<string, RouteMember[]>(routes.map((r) => [r.header.id, []]));
  if (routes.length === 0) return out;
  const { rows } = await q.query(forUpdate ? MEMBER_SQL_FOR_UPDATE : MEMBER_SQL, [organizationId, routes.map((r) => r.header.id)]);
  const byId = new Map(routes.map((r) => [r.header.id, r]));
  for (const row of rows) {
    const route = byId.get(String(row.route_id));
    if (route) out.get(route.header.id)!.push(toMember(row, route));
  }
  for (const members of out.values()) {
    for (const m of members) m.stepOpen = members.filter((o) => o.step < m.step).every((o) => o.outcome === 'signed');
  }
  return out;
}

function completeness(members: RouteMember[]): { reviewComplete: boolean; approvalComplete: boolean } {
  const reviewComplete = members.filter((m) => m.role === 'reviewer').every((m) => m.outcome === 'signed');
  const approvers = members.filter((m) => m.role === 'approver');
  return { reviewComplete, approvalComplete: reviewComplete && approvers.length > 0 && approvers.every((m) => m.outcome === 'signed') };
}

const LATEST_ROUTE_SQL = `SELECT * FROM review_routes WHERE organization_id = $1 AND subject_type = $2 AND subject_id = $3
  ORDER BY created_at DESC, round DESC LIMIT 1`;
const LATEST_ROUTE_SQL_FOR_UPDATE = `${LATEST_ROUTE_SQL} FOR UPDATE`;

function stateOf(route: RouteHeader | null, inReview: boolean): RouteState {
  if (!route) return inReview ? 'legacy' : 'none';
  if (route.status === 'open') return 'live';
  if (route.status === 'withdrawn') return 'withdrawn';
  // A route that closed by return or completion, on a subject back in review
  // with no new route: that round entered review without one.
  if (inReview) return 'legacy';
  return route.status;
}

/**
 * The standing of a subject's latest route. `forUpdate` locks the header and
 * the member rows (call it after the subject's own row lock: subject, then
 * route rows, then the audit chain). Throws on any read failure.
 */
export async function routeStanding(
  q: RouteQueryable,
  p: { organizationId: number; subjectType: RouteSubjectType; subjectId: string; inReview: boolean; forUpdate?: boolean },
): Promise<RouteStanding> {
  const { rows } = await q.query(p.forUpdate ? LATEST_ROUTE_SQL_FOR_UPDATE : LATEST_ROUTE_SQL, [p.organizationId, p.subjectType, p.subjectId]);
  const route = rows[0] ? header(rows[0]) : null;
  const target = routeSubjectTarget(p.subjectType, p.subjectId);
  const members = route ? (await readMembers(q, p.organizationId, [{ header: route, target }], Boolean(p.forUpdate))).get(route.id)! : [];
  return { state: stateOf(route, p.inReview), route, members, ...completeness(members) };
}

/** A subject's latest route and every member, for the round a reader shows (§2.12). */
export interface RouteRound {
  route: RouteHeader;
  members: RouteMember[];
  reviewComplete: boolean;
  approvalComplete: boolean;
  /** Every naming act on this route, oldest first (send, reassign, hand-back, withdraw, return). */
  history: RouteHistoryEntry[];
}

const HISTORY_ACTIONS: Record<string, RouteHistoryAction> = {
  'review-route.send': 'send',
  'review-route.reassign': 'reassign',
  'review-route.hand-back': 'hand-back',
  'review-route.withdraw': 'withdraw',
  'review-route.return': 'return',
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const isRole = (v: unknown): v is RouteRole => v === 'reviewer' || v === 'approver';

/**
 * One governed row as a history entry. Names come from the row itself (the
 * printed names recorded at naming); an act recorded before it carried its
 * actor's name (RR1a's withdraw and return) takes the name the route knew
 * for that account, else none.
 */
/** The actor's printed name: as the act recorded it (a send records its sender's), else as the route knew the account. */
function actorNameOf(payload: Record<string, any>, actorId: number, known: Map<number, string>): string | null {
  return str(payload.actorName) ?? str(payload.senderName) ?? known.get(actorId) ?? null;
}

function historyEntry(row: Record<string, any>, known: Map<number, string>): RouteHistoryEntry | null {
  const action = HISTORY_ACTIONS[String(row.command)];
  if (!action) return null;
  const payload = (row.payload ?? {}) as Record<string, any>;
  const actorId = Number(row.proposed_by);
  const entry: RouteHistoryEntry = {
    action,
    at: iso(row.executed_at ?? row.proposed_at)!,
    actorId,
    actorName: actorNameOf(payload, actorId, known),
    reason: row.decision_reason ?? null,
  };
  if (isRole(payload.role)) entry.role = payload.role;
  if (action === 'reassign') {
    entry.fromName = str(payload.from?.printedName);
    entry.toName = str(payload.to?.printedName);
  }
  if (action === 'send' && Array.isArray(payload.members)) {
    entry.members = payload.members
      .filter((m: any) => m && isRole(m.role) && Number.isSafeInteger(Number(m.userId)))
      .map((m: any) => ({ userId: Number(m.userId), role: m.role as RouteRole, printedName: str(m.printedName) }));
  }
  return entry;
}

/** Every printed name a route's own rows record for an account: the sender, everyone named at send, and everyone reassigned to or from. */
function knownNames(rows: Array<Record<string, any>>, header: RouteHeader): Map<number, string> {
  const known = new Map<number, string>([[header.senderId, header.senderName]]);
  const add = (id: unknown, name: unknown) => {
    const n = str(name);
    if (n && Number.isSafeInteger(Number(id))) known.set(Number(id), n);
  };
  for (const row of rows) {
    const p = (row.payload ?? {}) as Record<string, any>;
    if (Array.isArray(p.members)) for (const m of p.members) add(m?.userId, m?.printedName);
    add(p.from?.userId, p.from?.printedName);
    add(p.to?.userId, p.to?.printedName);
    add(p.userId, p.printedName);
  }
  return known;
}

/**
 * The naming history of `routes`, by route id: the governed rows on each
 * subject's target that name the route, oldest first. Throws on a read
 * failure, like every other read of the round.
 */
async function readRouteHistory(
  q: RouteQueryable,
  organizationId: number,
  routes: Array<{ header: RouteHeader; target: string }>,
): Promise<Map<string, RouteHistoryEntry[]>> {
  const out = new Map<string, RouteHistoryEntry[]>(routes.map((r) => [r.header.id, []]));
  if (routes.length === 0) return out;
  const { rows } = await q.query(
    `SELECT id, command, payload, decision_reason, proposed_by, proposed_at, executed_at
       FROM c2c_ana_actions
      WHERE org_id = $1 AND target = ANY($2::text[]) AND command = ANY($3::text[]) AND payload ->> 'routeId' = ANY($4::text[])
      ORDER BY COALESCE(executed_at, proposed_at), id`,
    [organizationId, [...new Set(routes.map((r) => r.target))], Object.keys(HISTORY_ACTIONS), routes.map((r) => r.header.id)],
  );
  for (const r of routes) {
    const mine = rows.filter((row) => String(row.payload?.routeId) === r.header.id);
    const known = knownNames(mine, r.header);
    out.set(r.header.id, mine.map((row) => historyEntry(row, known)).filter((e): e is RouteHistoryEntry => e !== null));
  }
  return out;
}

/** The latest round of each subject that has one, keyed by subject id. Throws on a read failure. */
export async function readRouteRounds(
  q: RouteQueryable,
  p: { organizationId: number; subjectType: RouteSubjectType; subjectIds: string[] },
): Promise<Map<string, RouteRound>> {
  const out = new Map<string, RouteRound>();
  if (p.subjectIds.length === 0) return out;
  const { rows } = await q.query(
    `SELECT DISTINCT ON (subject_id) * FROM review_routes
      WHERE organization_id = $1 AND subject_type = $2 AND subject_id = ANY($3::text[])
      ORDER BY subject_id, created_at DESC, round DESC`,
    [p.organizationId, p.subjectType, p.subjectIds],
  );
  const routes = rows.map((r) => ({ subjectId: String(r.subject_id), header: header(r), target: routeSubjectTarget(p.subjectType, String(r.subject_id)) }));
  const members = await readMembers(q, p.organizationId, routes, false);
  const history = await readRouteHistory(q, p.organizationId, routes);
  for (const r of routes) {
    const m = members.get(r.header.id)!;
    out.set(r.subjectId, { route: r.header, members: m, ...completeness(m), history: history.get(r.header.id)! });
  }
  return out;
}
