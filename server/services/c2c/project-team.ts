/** Recorded responsibility and current sharing facts; this read grants no rights. */
import type { ProjectTeamMember, ProjectTeamResponse, ProjectTeamSource } from '../../../shared/project-team';
import { memberLabels } from '../../../shared/utils/member-labels';
import { getProjectSharingState, type ProjectShareMember } from '../project-sharing-access';
import {
  ProgramReadAccessError, requireCurrentProgramAccess,
  type CurrentProgramAccess, type ProgramAccessExecutor,
} from './current-program-access';

type Row = Record<string, unknown>;
type AccountSource = Exclude<ProjectTeamSource, 'recorded_name'>;
type Sources = Map<number, AccountSource[]>;

function accountId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid recorded account reference');
  return value;
}

function optionalAccountId(value: unknown): number | null {
  return value == null ? null : accountId(value);
}

function addSource(sources: Sources, id: number | null, source: AccountSource): void {
  if (id === null) return;
  const recorded = sources.get(id) ?? [];
  if (!recorded.includes(source)) recorded.push(source);
  sources.set(id, recorded);
}

function durableMembers(rows: Row[], sources: Sources): ProjectShareMember[] {
  const seen = new Set<number>();
  return rows.filter(row => row.status === 'active').map(row => {
    const userId = accountId(row.user_id);
    if (seen.has(userId) || !['owner', 'edit', 'use'].includes(String(row.role))) throw new Error('Invalid durable sharing membership');
    seen.add(userId);
    addSource(sources, userId, 'project_member');
    return { userId, role: row.role as ProjectShareMember['role'], status: 'active' };
  });
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function accountLabels(accounts: Map<number, Row>): Map<number, string> {
  const members = [...accounts].map(([id, row]) => ({ id, name: text(row.name), email: text(row.email) }));
  const labels = memberLabels(members);
  const counts = new Map<string, number>();
  for (const label of labels.values()) {
    const key = label.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map(members.map(member => {
    const label = labels.get(String(member.id))!;
    if (!member.name && !member.email) return [member.id, `Account #${member.id}`];
    return [member.id, (counts.get(label.trim().toLowerCase()) ?? 0) > 1 ? `${label} · Account #${member.id}` : label];
  }));
}

function linkedMember(id: number, sources: AccountSource[], account: Row | undefined,
  sharingRole: ProjectTeamMember['sharing_role'], accountLabel: string | undefined): ProjectTeamMember {
  const name = account ? text(account.name) : null;
  const email = account ? text(account.email) : null;
  const responsibilities: ProjectTeamMember['responsibilities'] = [];
  if (sources.includes('program_lead')) responsibilities.push('project_lead');
  if (sources.includes('project_owner')) responsibilities.push('project_owner');
  const label = account ? (accountLabel ?? `Account #${id}`)
    : `Account #${id} — Current membership not confirmed`;
  return { entry_id: `user:${id}`, user_id: id, role: sources.includes('program_lead') ? 'lead' : null,
    name, email, label, identity: account ? 'active_member' : 'unconfirmed_account',
    responsibilities, sharing_role: account ? sharingRole : null, sources };
}

function recordedNames(raw: unknown): ProjectTeamMember[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value, position) => {
    const name = text(value);
    return name ? [{ entry_id: `recorded-name:${position}`, user_id: null, role: null, name, email: null,
      identity: 'recorded_name' as const, label: name, responsibilities: [], sharing_role: null, sources: ['recorded_name' as const] }] : [];
  });
}

async function currentAccounts(q: ProgramAccessExecutor, organizationId: number, ids: number[]): Promise<Map<number, Row>> {
  if (!ids.length) return new Map();
  const { rows } = await q.query(`SELECT u.id, u.name, u.email, ou.role AS membership_role
    FROM organization_users ou JOIN users u ON u.id=ou.user_id
    WHERE ou.organization_id=$1 AND ou.user_id=ANY($2::integer[]) AND u.status='active'`, [organizationId, ids]);
  const accounts = new Map<number, Row>();
  for (const row of rows) {
    const id = accountId(row.id);
    if (!ids.includes(id) || accounts.has(id) || typeof row.membership_role !== 'string' || !row.membership_role.trim()) {
      throw new Error('Current account membership is ambiguous');
    }
    accounts.set(id, row);
  }
  return accounts;
}

async function loadRoster(q: ProgramAccessExecutor, organizationId: number, access: CurrentProgramAccess): Promise<ProjectTeamMember[]> {
  const { rows } = await q.query(`/* project-team:roster */
    SELECT rp.lead_user_id, rp.team_members, p.owner_id, p.created_by_id, p.settings, v.visibility
    FROM regulatory_programs rp
    JOIN projects p ON p.id=$3 AND p.organization_id=rp.organization_id AND p.regulatory_program_id=rp.id
    LEFT JOIN project_visibility_settings v ON v.project_id=p.id AND v.organization_id=p.organization_id
    WHERE rp.id=$1 AND rp.organization_id=$2 AND rp.deleted_at IS NULL AND p.status IS DISTINCT FROM 'deleted'`,
  [access.programId, organizationId, access.projectId]);
  if (rows.length !== 1) throw new ProgramReadAccessError(503, 'PROJECT_ACCESS_CHANGED', 'Current project access changed during the read. No project data was supplied.');
  const row = rows[0];
  const ownerId = optionalAccountId(row.owner_id);
  const createdById = optionalAccountId(row.created_by_id);
  const sources: Sources = new Map();
  addSource(sources, optionalAccountId(row.lead_user_id), 'program_lead');
  addSource(sources, ownerId, 'project_owner');
  addSource(sources, createdById, 'project_creator');
  const members = await q.query(`SELECT user_id, role, status FROM project_members
    WHERE project_id=$1 AND organization_id=$2 AND status='active' ORDER BY user_id`, [access.projectId, organizationId]);
  const membersOverride = durableMembers(members.rows, sources);
  const settings = row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings) ? row.settings as Row : {};
  const fallback = getProjectSharingState({ settings, ownerId, createdById });
  const visibilityOverride = row.visibility === 'private' || row.visibility === 'org_public' ? row.visibility : fallback.visibility;
  const sharing = getProjectSharingState({ settings, ownerId, createdById, visibilityOverride, membersOverride });
  const roles = new Map(sharing.members.map(member => [member.userId, member.role]));
  const accounts = await currentAccounts(q, organizationId, [...sources.keys()]);
  const labels = accountLabels(accounts);
  return [...sources].map(([id, recorded]) => linkedMember(id, recorded, accounts.get(id), roles.get(id) ?? null, labels.get(id)))
    .concat(recordedNames(row.team_members));
}

/** The caller supplies the already-admitted anchor and its request-pinned client. */
export async function readProjectTeam(q: ProgramAccessExecutor, input: {
  organizationId: number; access: CurrentProgramAccess;
}): Promise<ProjectTeamResponse> {
  try {
    const { organizationId, access } = input;
    const team = await loadRoster(q, organizationId, access);
    const current = await requireCurrentProgramAccess(q, { organizationId, userId: access.actor.userId, programId: access.programId });
    if (current.projectId !== access.projectId || current.clientWorkspaceId !== access.clientWorkspaceId ||
        current.programId !== access.programId || current.actor.userId !== access.actor.userId || current.actor.role !== access.actor.role) {
      throw new ProgramReadAccessError(503, 'PROJECT_ACCESS_CHANGED', 'Current project access changed during the read. No project data was supplied.');
    }
    return { program_id: access.programId, project_id: access.projectId, team };
  } catch (error) {
    if (error instanceof ProgramReadAccessError) throw error;
    throw new ProgramReadAccessError(503, 'PROJECT_TEAM_UNAVAILABLE', 'The project team could not be verified. No team data was supplied.');
  }
}
