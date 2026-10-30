/**
 * The current-access gate's answers, for route suites that drive the Projects
 * router against a queued query mock (trunk green, 2026-10-15).
 *
 * Since 14362ef00 every `/:id` route admits a caller only through
 * `requireCurrentProgramAccess` (server/routes/c2c/project-route-access.ts):
 * the program is in the caller's org, the caller is a current active member
 * with a role, the program has one anchor, and that anchor is accessible. Those
 * are four reads against the request's own connection, ahead of everything a
 * route suite queues. A suite about readiness or taxonomy should not have to
 * restate them in its queue, so it seats its members and programs here.
 *
 * This replaces the four reads, not the decisions after them: the role a seated
 * member carries still goes through the route's own canCreateProgram /
 * canMutateProgram / GOVERNED_WRITE_ROLES checks. An unseated caller is refused
 * exactly as the real gate refuses (403 PROJECT_ACTOR_ACCESS_DENIED), and an
 * unseated program is 404 PROJECT_NOT_FOUND, so the refusals stay observable.
 * The gate itself is proven on PostgreSQL by its own suites
 * (server/routes/__tests__/*vault-parent-access.pglite*, current-program-access).
 *
 * Scope: the library list and `/:id` admission. It never reproduces the
 * gate's 403 PROJECT_PERMISSION_DENIED (sharing roster) or 409
 * PROJECT_ANCHOR_UNRESOLVED; those are proven where the real gate runs. A
 * scope it issues is not registered with assertVerifiedProgramScope, so a
 * route that asserts one fails closed (403), never open.
 *
 * Use (the real module's error class is passed in, so this file never imports
 * the module it stands in for; that import would deadlock the mock):
 *   vi.mock('../../../services/c2c/current-program-access', async (original) => {
 *     const real = await original<typeof import('../../../services/c2c/current-program-access')>();
 *     return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
 *   });
 * and give each request `req.dbClient`, which the production request scope
 * supplies.
 */
import type { CurrentAccessibleProgramScope, CurrentProgramActor, ProgramReadAccessError, VerifiedProgramAnchor } from '../../../../services/c2c/current-program-access';

const members = new Map<string, string>();
const programs = new Map<string, number>();
const anchors = new Map<string, VerifiedProgramAnchor>();

/** Seat `userId` as a current active member of `organizationId` with `role`. */
export function seatMember(organizationId: number, userId: number, role: string): void {
  members.set(`${organizationId}:${userId}`, role);
}

/** Record `programId` as a program of `organizationId`, with one accessible anchor. */
export function seatProgram(organizationId: number, programId: string,
  anchor: {projectId:number;clientWorkspaceId:number|null} = {projectId:1,clientWorkspaceId:null}): void {
  programs.set(programId.toLowerCase(), organizationId);
  anchors.set(programId.toLowerCase(), {programId:programId.toLowerCase(),...anchor});
}

export function clearSeats(): void {
  members.clear();
  programs.clear();
  anchors.clear();
}

/** The gate's four reads, answered from the seats. */
export function currentAccessDouble(Err: typeof ProgramReadAccessError) {
  function actor(organizationId: number, userId: number | undefined): CurrentProgramActor {
    const role = userId == null ? undefined : members.get(`${organizationId}:${userId}`);
    if (!role) throw new Err(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'The actor is not a current active member of this organization.');
    return { userId: userId as number, role };
  }
  type Who = { organizationId: number; userId: number | undefined };
  return {
    readCurrentProgramActor: async (_q: unknown, input: Who) => actor(input.organizationId, input.userId),
    requireCurrentProgramAccess: async (_q: unknown, input: Who & { programId: string }) => {
      const programId = input.programId.toLowerCase();
      if (programs.get(programId) !== input.organizationId) throw new Err(404, 'PROJECT_NOT_FOUND', 'Project not found.');
      return { actor: actor(input.organizationId, input.userId), ...anchors.get(programId)! };
    },
    getCurrentAccessibleProgramScope: async (_q: unknown, input: Who & { programId?: string | null }): Promise<CurrentAccessibleProgramScope> => {
      const seated = [...programs].filter(([, org]) => org === input.organizationId).map(([id]) => id);
      const one = input.programId == null ? null : input.programId.toLowerCase();
      if (one !== null && !seated.includes(one)) throw new Err(404, 'PROJECT_NOT_FOUND', 'Project not found.');
      return { scope: 'verified-accessible-programs', actor: actor(input.organizationId, input.userId),
        programIds: one === null ? seated : [one], reconciliationRequired: false };
    },
    requireProgramScopeStillCurrent: async (_q: unknown, input: Who) => { actor(input.organizationId, input.userId); },
    verifiedProgramAnchors: (_q: unknown, input: Who, scope: CurrentAccessibleProgramScope): readonly VerifiedProgramAnchor[] => {
      actor(input.organizationId,input.userId);
      return scope.programIds.map(id => {
        if (programs.get(id) !== input.organizationId || !anchors.has(id)) throw new Err(404,'PROJECT_NOT_FOUND','Project not found.');
        return anchors.get(id)!;
      });
    },
  };
}
