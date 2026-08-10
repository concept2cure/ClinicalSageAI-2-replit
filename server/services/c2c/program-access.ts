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
