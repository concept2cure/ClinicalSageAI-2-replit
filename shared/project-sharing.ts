/** Existing project sharing controls. Business responsibility and signing are separate. */
export type ProjectMemberSharingRole = 'owner' | 'edit' | 'use';
export interface ProjectSharingCandidate { userId: number; label: string }
export interface ProjectSharingMember {
  userId: number;
  role: ProjectMemberSharingRole;
  status: 'active' | 'revoked';
  addedById: number | null;
  addedAt: string | null;
  explicit: boolean;
  implicitSources: ('project_owner' | 'project_creator')[];
  canSetRole: boolean;
  canRevoke: boolean;
}
export interface ProjectSharingResponse {
  projectId: string;
  visibility: 'private' | 'org_public';
  legacyFallbackApplied: boolean;
  members: ProjectSharingMember[];
  programId: string | null;
  organizationId: number;
  clientWorkspaceId: number | null;
  actorUserId: number;
  canManage: boolean;
  candidates: ProjectSharingCandidate[];
}
export interface ProjectSharingScope {
  programId: string;
  projectId: number;
  organizationId: number;
  actorUserId: number;
  clientWorkspaceId?: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const projectSharingId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 2_147_483_647;
const nullableId = (v: unknown) => v === null || projectSharingId(v);
const uniqueIds = (rows: { userId: number }[]) => new Set(rows.map(row => row.userId)).size === rows.length;

function hasMemberFields(value: Record<string, unknown>): boolean {
  const timestamp = value.addedAt === null || (typeof value.addedAt === 'string' && Number.isFinite(Date.parse(value.addedAt)));
  return projectSharingId(value.userId) && ['owner', 'use', 'edit'].includes(String(value.role)) &&
    value.status === 'active' && nullableId(value.addedById) && timestamp &&
    typeof value.explicit === 'boolean' && typeof value.canSetRole === 'boolean' && typeof value.canRevoke === 'boolean';
}

function hasImplicitSources(value: unknown): value is ProjectSharingMember['implicitSources'] {
  return Array.isArray(value) && value.every(source => ['project_owner', 'project_creator'].includes(source)) && new Set(value).size === value.length;
}

function isSharingMember(value: unknown, canManage: boolean): value is ProjectSharingMember {
  if (!object(value) || !hasMemberFields(value) || !hasImplicitSources(value.implicitSources)) return false;
  if (!value.explicit && value.implicitSources.length === 0) return false;
  const protectedRow = !canManage || !value.explicit || value.role === 'owner' || value.implicitSources.length > 0;
  return !protectedRow || (!value.canSetRole && !value.canRevoke);
}

function isCandidate(value: unknown): value is ProjectSharingCandidate {
  return object(value) && projectSharingId(value.userId) && typeof value.label === 'string' && Boolean(value.label.trim());
}

/** Validate identity, current admitted anchor and every control before display. */
function hasCurrentScope(value: Record<string, unknown>, expected: ProjectSharingScope): boolean {
  return UUID.test(expected.programId) && projectSharingId(expected.projectId) &&
    value.programId === expected.programId && value.projectId === `proj_${expected.projectId}` &&
    value.organizationId === expected.organizationId && value.actorUserId === expected.actorUserId &&
    projectSharingId(value.organizationId) && projectSharingId(value.actorUserId) && projectSharingId(value.clientWorkspaceId) &&
    (expected.clientWorkspaceId == null || value.clientWorkspaceId === expected.clientWorkspaceId);
}

export function isProjectSharingResponse(value: unknown, expected: ProjectSharingScope): value is ProjectSharingResponse {
  if (!object(value) || !hasCurrentScope(value, expected)) return false;
  if (!['private', 'org_public'].includes(String(value.visibility)) || typeof value.legacyFallbackApplied !== 'boolean' ||
      typeof value.canManage !== 'boolean' || !Array.isArray(value.members) || !Array.isArray(value.candidates)) return false;
  return value.members.every(member => isSharingMember(member, value.canManage as boolean)) && uniqueIds(value.members) &&
    value.candidates.every(isCandidate) && uniqueIds(value.candidates) && (value.canManage || value.candidates.length === 0);
}
