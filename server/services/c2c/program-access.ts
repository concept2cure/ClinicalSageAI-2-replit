/**
 * Per-program authorization for `regulatory_programs` (the uuid-keyed project
 * entity behind /api/c2c/projects — the ONLY project API the shipped v2 UI
 * calls).
 *
 * Why this exists: every handler in server/routes/c2c/projects.ts gated on
 *   SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2
 * which answers "is this program in my org?", not "may this caller change it?".
 * Any org member could therefore repin or unpin another team's evidence — the
 * set that feeds AI generation — with no authorization step at all.
 *
 * Why the signals are only lead_user_id + org role. `regulatory_programs`
 * declares team_members as $type<TeamMember[]>, but nothing writes that shape:
 * the create handler filters the wizard's payload to `typeof m === 'string'`
 * and stores bare strings, and the wizard never populates it in the first place
 * (client Projects.tsx holds `const [team] = useState<string[]>([])` with no
 * setter). A column that is always an empty array of strings cannot be an
 * authorization source, so the only trustworthy facts are who leads the program
 * and what the caller's org role is. That is deliberately coarser than
 * project-sharing-access.ts, which has a real member roster to consult.
 *
 * READ ROUTES ARE NOT GATED, on purpose. There is no membership store for
 * uuid-keyed programs, so "private unless you are a member" would evaluate to
 * "private to the lead" for every program that exists today and lock every
 * other user out of projects they legitimately work in. Read-side privacy needs
 * the id-space convergence (regulatory_programs ↔ projects) and a real member
 * table first; until then reads stay org-scoped and only MUTATIONS are
 * authorized here.
 *
 * @module server/services/c2c/program-access
 */

import { describeFailure, VerificationUnavailableError } from '../../lib/verification-outcome';

export type ProgramAuthzMode = 'enforce' | 'warn';

/** Org roles that carry program-management authority, mirroring the set
 *  project-sharing-access.ts uses for the other project entity so one user does
 *  not hold two different answers depending on which router they hit. */
const ORG_MANAGE_ROLES = new Set(['admin', 'super_admin', 'owner', 'manager']);

export interface ProgramMutationInput {
  actor: { userId: number | null; orgRole: string | null | undefined };
  program: { leadUserId: number | null };
}

/**
 * May this actor mutate this program? True for org managers (they administer
 * every program in the tenant) and for the program's own lead.
 *
 * A null leadUserId denies: an unowned program is not "owned by everyone".
 * Callers must have already established that the program belongs to the
 * actor's organization — this function answers authorization only, never
 * tenancy.
 */
export function canMutateProgram(input: ProgramMutationInput): boolean {
  const normalizedRole = (input.actor.orgRole || '').toLowerCase();
  if (ORG_MANAGE_ROLES.has(normalizedRole)) return true;
  const { userId } = input.actor;
  const { leadUserId } = input.program;
  if (userId == null || leadUserId == null) return false;
  return userId === leadUserId;
}

/** Org roles that may NOT create a program. Everything else in the org may. */
const ORG_READ_ONLY_ROLES = new Set(['viewer', 'readonly', 'read_only', 'guest']);

/**
 * May this actor create a program?
 *
 * Creation has no program to be the lead of, so it cannot use canMutateProgram.
 * It is still a mutation: it writes a regulated record, scaffolds a document,
 * consumes a licensed seat, and makes the creator the lead — permanently
 * authorized over that program's evidence. Gating it on org membership alone
 * let a read-only viewer do all of that.
 *
 * Deny-list rather than allow-list, deliberately. The org role vocabulary is
 * open (organization_users.role is free text, and tenants add their own), so an
 * allow-list would silently lock out every role nobody thought to enumerate —
 * turning an unknown role into a lockout instead of a permission. The property
 * worth guaranteeing here is narrower: a role that is explicitly read-only
 * cannot write.
 */
export function canCreateProgram(input: { orgRole: string | null | undefined }): boolean {
  const normalizedRole = (input.orgRole || '').toLowerCase().trim();
  return !ORG_READ_ONLY_ROLES.has(normalizedRole);
}

/**
 * Resolve the licensed-quota enforcement mode.
 *
 * Defaults to 'warn', unlike resolveProgramAuthzMode below, and the asymmetry
 * is the point. The authorization rule closes a hole nobody was entitled to
 * use, so it ships enforcing. The quota has never been enforced and its default
 * entitlement equals the standard tier, so enforcing it on deploy would
 * retroactively lock out every tenant already over a limit the product let them
 * exceed. Unbilled capacity for a few days is recoverable; blocking a paying
 * customer from creating a submission is not.
 */
export function resolveProgramQuotaMode(
  env: NodeJS.ProcessEnv = process.env
): ProgramAuthzMode {
  const explicit = (env.PROGRAM_QUOTA_MODE || '').trim().toLowerCase();
  if (explicit === 'enforce' || explicit === 'warn') return explicit;
  return 'warn';
}

/**
 * Resolve the enforcement mode. Explicit PROGRAM_AUTHZ_MODE wins; otherwise
 * 'enforce' everywhere — unlike the auth boundary, this rule is additive to an
 * existing org check rather than a new front door, so it ships enforcing and
 * 'warn' exists for an operator who needs to observe denials in a live tenant
 * before they start returning 403. Resolved per-request so the flip needs no
 * reboot.
 */
export function resolveProgramAuthzMode(
  env: NodeJS.ProcessEnv = process.env
): ProgramAuthzMode {
  const explicit = (env.PROGRAM_AUTHZ_MODE || '').trim().toLowerCase();
  if (explicit === 'enforce' || explicit === 'warn') return explicit;
  return 'enforce';
}

const PROGRAM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProgramScopeOptions {
  /**
   * Admit a soft-deleted program. Only for an act that has to reach a deleted
   * project's records: a legal hold preserves them whatever state the project
   * is in. Everything else acts on live projects only, as the Projects
   * surface does (a deleted project 404s on its own page).
   */
  includeDeleted?: boolean;
}

/**
 * TENANCY, the half canMutateProgram leaves to its caller: is `programId` a live
 * project (regulatory_programs, the one project identity the Projects surface
 * creates) of `organizationId`? False for a malformed id, another
 * organization's project, one that does not exist, and one that was deleted.
 *
 * This is the ONE answer to that question on the server, and
 * `npm run ci:program-ownership-single-source` refuses a second. Every chain of
 * governed records starts at a project, so every writer that anchors a record
 * to one, and every read for one, asks this first. LX-20 (2026-09-25) replaced
 * a dozen hand-written copies with it; by 2026-10-01 there were 51 again, and
 * they disagreed: most admitted a deleted project; `innovation-routes.ts` also
 * consulted `programs` and `core.programs`, which nothing writes (the second
 * is keyed by uuid organization, which no tenant has); and the RBM site-risk
 * read asked whether the caller had RBM records that mention the program
 * rather than whether it owns it — a record that pointed at another tenant's
 * program was enough to read that program's sites. D3, 2026-10-01, moved every
 * copy here and put the gate on it.
 *
 * `db` is anything with the pg `query` shape: the shared pool (which applies
 * the request's tenant scope under RLS_ENFORCE=on), the request's own client,
 * a PoolClient inside the caller's transaction, a test double. Pass the
 * connection the caller already reads on, or a function that returns it
 * (`getPool`): it is then resolved inside the check, so "no pool" is "could
 * not check" like any other failure to run. No row-level-security bypass is
 * needed or used: the organization is a predicate of the query.
 *
 * A lookup that cannot run throws `VerificationUnavailableError`: "could not
 * tell" is not "not yours", and a route that distinguishes the two answers 503.
 */
type ProgramQueryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

export async function programInOrganization(
  db: ProgramQueryable | (() => ProgramQueryable),
  programId: unknown,
  organizationId: number | string,
  options: ProgramScopeOptions = {},
): Promise<boolean> {
  if (typeof programId !== 'string' || !PROGRAM_UUID_RE.test(programId)) return false;
  // An organization id that reached a caller untyped (`req.user.organizationId`
  // is a string on some auth paths) is still that organization; anything that
  // is not a positive integer is no organization at all.
  const org = typeof organizationId === 'string' && /^\d+$/.test(organizationId) ? Number(organizationId) : organizationId;
  if (typeof org !== 'number' || !Number.isSafeInteger(org) || org <= 0) return false;
  const live = options.includeDeleted ? '' : ' AND deleted_at IS NULL';
  let rows: unknown[];
  try {
    const q = typeof db === 'function' ? db() : db;
    ({ rows } = await q.query(
      `SELECT id FROM regulatory_programs WHERE id = $1 AND organization_id = $2${live} LIMIT 1`,
      [programId, org],
    ));
  } catch (err) {
    throw new VerificationUnavailableError('program ownership check', describeFailure(err));
  }
  return rows.length > 0;
}

/**
 * Resolve the open program as a regulatory_programs UUID the organization
 * owns. Null when there is none — the caller refuses.
 *
 * Both branches end at the same check. The legacy integer project's anchor
 * (`projects.regulatory_program_id`) is a soft link with no key, so a row can
 * name another organization's program, a missing one or a deleted one; it is
 * never trusted on its own (PF-04 precondition P2).
 */
export interface OpenProjectContext {
  organizationId?: number | null;
  /** A legacy integer projects.id, when the client sent one. */
  projectId?: number | null;
  /** The project as the client sent it: a regulatory_programs UUID under the v2 shell. */
  projectRef?: string | null;
}

export async function resolveOpenProgram(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  ctx: OpenProjectContext,
): Promise<string | null> {
  const orgId = Number(ctx.organizationId);
  const ref = typeof ctx.projectRef === 'string' ? ctx.projectRef.trim() : '';
  if (ref && PROGRAM_UUID_RE.test(ref)) {
    return (await programInOrganization(pool, ref, orgId)) ? ref : null;
  }
  const legacy = Number(ctx.projectId);
  if (Number.isSafeInteger(legacy) && legacy > 0) {
    const anchored = await pool.query(
      `SELECT regulatory_program_id FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [legacy, orgId],
    );
    const programId = anchored.rows[0]?.regulatory_program_id;
    if (typeof programId !== 'string' || !PROGRAM_UUID_RE.test(programId)) return null;
    return (await programInOrganization(pool, programId, orgId)) ? programId : null;
  }
  return null;
}
