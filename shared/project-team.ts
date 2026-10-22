/** Read-only project responsibility and sharing facts; none imply signing rights. */
export type ProjectTeamResponsibility = 'project_lead' | 'project_owner';
export type ProjectTeamSource = 'program_lead' | 'project_owner' | 'project_creator' | 'project_member' | 'recorded_name';
export type ProjectTeamIdentity = 'active_member' | 'unconfirmed_account' | 'recorded_name';
export type ProjectTeamSharingRole = 'owner' | 'edit' | 'use';

export interface ProjectTeamMember {
  user_id: number | null;
  role: 'lead' | null;
  name: string | null;
  email: string | null;
  entry_id: string;
  identity: ProjectTeamIdentity;
  label: string;
  responsibilities: ProjectTeamResponsibility[];
  sharing_role: ProjectTeamSharingRole | null;
  sources: ProjectTeamSource[];
}

export interface ProjectTeamResponse {
  program_id: string;
  project_id: number;
  team: ProjectTeamMember[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESPONSIBILITIES = ['project_lead', 'project_owner'] as const;
const SOURCES = ['program_lead', 'project_owner', 'project_creator', 'project_member', 'recorded_name'] as const;
const SHARING = ['owner', 'edit', 'use'] as const;
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const positiveId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const nullableText = (v: unknown): v is string | null => v === null || typeof v === 'string';
const uniqueValues = (v: unknown, allowed: readonly string[]): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string' && allowed.includes(s)) && new Set(v).size === v.length;

type MemberFields = Omit<ProjectTeamMember, 'user_id' | 'identity'> & { user_id: unknown; identity: unknown };

function hasMemberFields(v: Record<string, unknown>): v is MemberFields {
  return typeof v.entry_id === 'string' && typeof v.label === 'string' && Boolean(v.label.trim()) &&
    nullableText(v.name) && nullableText(v.email) && (v.role === null || v.role === 'lead') &&
    uniqueValues(v.responsibilities, RESPONSIBILITIES) && uniqueValues(v.sources, SOURCES) &&
    v.sources.length > 0 && (v.sharing_role === null || SHARING.includes(v.sharing_role as ProjectTeamSharingRole));
}

function isRecordedName(v: MemberFields): boolean {
  return /^recorded-name:\d+$/.test(v.entry_id) && v.user_id === null && typeof v.name === 'string' &&
    Boolean(v.name.trim()) && v.label === v.name && v.email === null && v.role === null &&
    v.responsibilities.length === 0 && v.sharing_role === null &&
    v.sources.length === 1 && v.sources[0] === 'recorded_name';
}

function hasAccountFacts(v: MemberFields): boolean {
  const hasSharingSource = v.sources.some(source => ['project_member', 'project_owner', 'project_creator'].includes(source));
  return !v.sources.includes('recorded_name') &&
    (v.role === 'lead') === v.sources.includes('program_lead') &&
    v.responsibilities.includes('project_lead') === v.sources.includes('program_lead') &&
    v.responsibilities.includes('project_owner') === v.sources.includes('project_owner') &&
    (v.sharing_role === null || hasSharingSource);
}

function isUnconfirmedReference(v: MemberFields): boolean {
  return v.name === null && v.email === null && v.sharing_role === null &&
    v.label === `Account #${v.user_id} — Current membership not confirmed`;
}

function isProjectTeamMember(v: unknown): v is ProjectTeamMember {
  if (!object(v) || !hasMemberFields(v)) return false;
  if (v.identity === 'recorded_name') return isRecordedName(v);
  if ((v.identity !== 'active_member' && v.identity !== 'unconfirmed_account') ||
      !positiveId(v.user_id) || v.entry_id !== `user:${v.user_id}` || !hasAccountFacts(v)) return false;
  return v.identity !== 'unconfirmed_account' || isUnconfirmedReference(v);
}

/** A roster is usable only for the currently selected, canonical program. */
export function isProjectTeamResponse(value: unknown, expectedProgramId: string | null): value is ProjectTeamResponse {
  if (!expectedProgramId || !UUID.test(expectedProgramId) || !object(value) ||
      value.program_id !== expectedProgramId || !positiveId(value.project_id) || !Array.isArray(value.team) ||
      !value.team.every(isProjectTeamMember)) return false;
  const entries = new Set(value.team.map((m) => m.entry_id));
  const users = value.team.filter((m) => m.user_id !== null).map((m) => m.user_id);
  return entries.size === value.team.length && new Set(users).size === users.length;
}
