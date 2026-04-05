export type ProjectVisibilityMode = 'private' | 'org_public';
export type ProjectShareRole = 'owner' | 'edit' | 'use';
export type ProjectActorRole = 'admin' | 'super_admin' | 'owner' | 'manager' | 'member' | 'viewer';

export interface ProjectShareMember {
  userId: number;
  role: ProjectShareRole;
  status?: 'active' | 'revoked';
  addedById?: number | null;
  addedAt?: string;
}

export interface ProjectSharingState {
  visibility: ProjectVisibilityMode;
  members: ProjectShareMember[];
  legacyFallbackApplied: boolean;
}

export interface ProjectSharingOverrides {
  visibilityOverride?: ProjectVisibilityMode;
  membersOverride?: ProjectShareMember[];
}

export interface ProjectAccessEvaluationInput {
  actor: { userId: number; orgRole: string | null | undefined };
  project: {
    createdById: number | null;
    ownerId: number | null;
    settings: Record<string, unknown>;
  };
}

const ORG_MANAGE_ROLES = new Set(['admin', 'super_admin', 'owner', 'manager']);

function sanitizeMembers(raw: unknown): ProjectShareMember[] {
  if (!Array.isArray(raw)) return [];
  const valid: ProjectShareMember[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const member = item as Record<string, unknown>;
    const userId = Number(member.userId);
    const role = member.role;
    const status = member.status;
    if (!Number.isFinite(userId)) continue;
    if (role !== 'owner' && role !== 'edit' && role !== 'use') continue;
    if (status && status !== 'active' && status !== 'revoked') continue;
    valid.push({
      userId,
      role,
      status: (status as 'active' | 'revoked' | undefined) ?? 'active',
      addedById: member.addedById ? Number(member.addedById) : null,
      addedAt:
        typeof member.addedAt === 'string' ? member.addedAt : new Date().toISOString(),
    });
  }
  return valid;
}

function ensureOwnerMembers(
  members: ProjectShareMember[],
  ownerId: number | null,
  createdById: number | null
): ProjectShareMember[] {
  const next = [...members];
  for (const uid of [ownerId, createdById]) {
    if (!uid) continue;
    if (next.some(m => m.userId === uid && m.status !== 'revoked')) continue;
    next.push({
      userId: uid,
      role: 'owner',
      status: 'active',
      addedAt: new Date().toISOString(),
      addedById: uid,
    });
  }
  return next;
}

export function getProjectSharingState(input: {
  settings: Record<string, unknown>;
  ownerId: number | null;
  createdById: number | null;
  visibilityOverride?: ProjectVisibilityMode;
  membersOverride?: ProjectShareMember[];
}): ProjectSharingState {
  if (input.visibilityOverride || input.membersOverride) {
    return {
      visibility: input.visibilityOverride ?? 'org_public',
      members: ensureOwnerMembers(
        sanitizeMembers(input.membersOverride ?? []),
        input.ownerId,
        input.createdById
      ),
      legacyFallbackApplied: false,
    };
  }

  const rawSharing = input.settings.projectSharing;
  if (!rawSharing || typeof rawSharing !== 'object') {
    return {
      visibility: 'org_public',
      members: ensureOwnerMembers([], input.ownerId, input.createdById),
      legacyFallbackApplied: true,
    };
  }

  const sharing = rawSharing as Record<string, unknown>;
  const visibility: ProjectVisibilityMode =
    sharing.visibility === 'private' ? 'private' : 'org_public';
  const members = ensureOwnerMembers(
    sanitizeMembers(sharing.members),
    input.ownerId,
    input.createdById
  );
  return { visibility, members, legacyFallbackApplied: false };
}

export function canUseProject(input: ProjectAccessEvaluationInput): boolean {
  const normalizedRole = (input.actor.orgRole || '').toLowerCase();
  if (ORG_MANAGE_ROLES.has(normalizedRole)) return true;
  const sharing = getProjectSharingState({
    settings: input.project.settings,
    ownerId: input.project.ownerId,
    createdById: input.project.createdById,
  });
  if (sharing.visibility === 'org_public') return true;
  return sharing.members.some(m => m.userId === input.actor.userId && m.status !== 'revoked');
}

export function canEditProject(input: ProjectAccessEvaluationInput): boolean {
  const normalizedRole = (input.actor.orgRole || '').toLowerCase();
  if (ORG_MANAGE_ROLES.has(normalizedRole)) return true;
  const sharing = getProjectSharingState({
    settings: input.project.settings,
    ownerId: input.project.ownerId,
    createdById: input.project.createdById,
  });
  return sharing.members.some(
    m => m.userId === input.actor.userId && m.status !== 'revoked' && (m.role === 'owner' || m.role === 'edit')
  );
}

export function canManageProject(input: ProjectAccessEvaluationInput): boolean {
  const normalizedRole = (input.actor.orgRole || '').toLowerCase();
  if (ORG_MANAGE_ROLES.has(normalizedRole)) return true;
  const sharing = getProjectSharingState({
    settings: input.project.settings,
    ownerId: input.project.ownerId,
    createdById: input.project.createdById,
  });
  return sharing.members.some(
    m => m.userId === input.actor.userId && m.status !== 'revoked' && m.role === 'owner'
  );
}

export function applyProjectSharingState(
  settings: Record<string, unknown>,
  sharing: ProjectSharingState
): Record<string, unknown> {
  return {
    ...settings,
    projectSharing: {
      visibility: sharing.visibility,
      members: sharing.members,
    },
  };
}

export function upsertProjectShareMember(
  sharing: ProjectSharingState,
  member: { userId: number; role: 'use' | 'edit'; addedById: number }
): ProjectSharingState {
  const filtered = sharing.members.filter(m => m.userId !== member.userId);
  return {
    ...sharing,
    members: [
      ...filtered,
      {
        userId: member.userId,
        role: member.role,
        status: 'active',
        addedAt: new Date().toISOString(),
        addedById: member.addedById,
      },
    ],
  };
}

export function removeProjectShareMember(
  sharing: ProjectSharingState,
  userId: number
): ProjectSharingState {
  return {
    ...sharing,
    members: sharing.members.filter(m => m.userId !== userId),
  };
}

