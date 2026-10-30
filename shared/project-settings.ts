/** Scoped receipts for the existing Projects profile writer; no access is granted here. */
import { isRealCalendarDay } from './calendar-day';
import { projectSharingId } from './project-sharing';
import { GOVERNED_REASON_MIN, GOVERNED_REASON_MAX } from './constants/governed-reason';

export const PROJECT_SETTINGS_FIELDS = ['description', 'priority', 'targetSubmissionDate'] as const;
export type ProjectSettingsField = typeof PROJECT_SETTINGS_FIELDS[number];
export type ProjectSettingsPriority = 'low' | 'medium' | 'high' | 'critical';
export interface ProjectSettingsScope {
  programId: string;
  organizationId: number;
  actorUserId: number;
  projectId?: number;
  /** An absent first-read claim does not select a client. Writes pin the saved parent. */
  clientWorkspaceId?: number | null;
}
export interface ProjectSettingsData extends ProjectSettingsScope {
  projectId: number;
  clientWorkspaceId: number | null;
  canChange: boolean;
  revision: string;
  description: string | null;
  priority: ProjectSettingsPriority;
  targetSubmissionDate: string | null;
}
export type ProjectSettingsPatch = Partial<Pick<ProjectSettingsData, ProjectSettingsField>>;
export interface ProjectSettingsWrite { revision: string; reason: string; patch: ProjectSettingsPatch }
export interface ProjectSettingsEnvelope {
  success: true;
  data: ProjectSettingsData;
  meta?: {
    auditTrail: { persisted: true; chained: true };
    changedFields: ProjectSettingsField[];
  };
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const revision = (v: unknown): v is string => typeof v === 'string' && /^v1:[a-f0-9]{64}$/.test(v);
const priority = (v: unknown): v is ProjectSettingsPriority => typeof v === 'string' && ['low', 'medium', 'high', 'critical'].includes(v);
const description = (v: unknown): v is string | null => v === null || typeof v === 'string' && v.length <= 4000;
const day = (v: unknown): v is string | null => v === null || typeof v === 'string' &&
  /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v) && isRealCalendarDay(v);
const field = (v: unknown): v is ProjectSettingsField => typeof v === 'string' && PROJECT_SETTINGS_FIELDS.some(key => key === v);

/** Validate only the bounded settings patch; the server still uses the canonical profile schema. */
export function isProjectSettingsPatch(value: unknown): value is ProjectSettingsPatch {
  if (!object(value) || Object.keys(value).length === 0 || !Object.keys(value).every(field)) return false;
  return (!('description' in value) || description(value.description)) &&
    (!('priority' in value) || priority(value.priority)) &&
    (!('targetSubmissionDate' in value) || day(value.targetSubmissionDate));
}

function hasSettingsIdentity(value: Record<string, unknown>): boolean {
  return uuid(value.programId) && projectSharingId(value.projectId) && projectSharingId(value.organizationId) &&
    projectSharingId(value.actorUserId) && (value.clientWorkspaceId === null || projectSharingId(value.clientWorkspaceId));
}

function hasSettingsFields(value: Record<string, unknown>): boolean {
  return typeof value.canChange === 'boolean' && revision(value.revision) &&
    description(value.description) && priority(value.priority) && day(value.targetSubmissionDate);
}

function matchesScope(value: Record<string, unknown>, scope: ProjectSettingsScope): boolean {
  return uuid(scope.programId) && projectSharingId(scope.organizationId) && projectSharingId(scope.actorUserId) &&
    String(value.programId).toLowerCase() === scope.programId.toLowerCase() && value.organizationId === scope.organizationId &&
    value.actorUserId === scope.actorUserId && (scope.projectId === undefined || value.projectId === scope.projectId) &&
    (scope.clientWorkspaceId == null || value.clientWorkspaceId === scope.clientWorkspaceId);
}

export function isProjectSettingsData(value: unknown, scope?: ProjectSettingsScope): value is ProjectSettingsData {
  return object(value) && hasSettingsIdentity(value) && hasSettingsFields(value) && (!scope || matchesScope(value, scope));
}

function matchesPatch(data: ProjectSettingsData, patch: ProjectSettingsPatch): boolean {
  return Object.entries(patch).every(([key, raw]) => {
    const expected = key === 'description' ? (typeof raw === 'string' ? raw.trim() || null : null) : raw;
    return data[key as ProjectSettingsField] === expected;
  });
}

/** A save requires exact current scope, saved values, a new revision and its transactional audit. */
function matchesWrite(data: ProjectSettingsData, scope: ProjectSettingsScope, write: ProjectSettingsWrite): boolean {
  const reason = typeof write.reason === 'string' ? write.reason.trim() : '';
  return projectSharingId(scope.projectId) && data.clientWorkspaceId === scope.clientWorkspaceId &&
    revision(write.revision) && isProjectSettingsPatch(write.patch) &&
    reason.length >= GOVERNED_REASON_MIN && reason.length <= GOVERNED_REASON_MAX && data.canChange &&
    data.revision !== write.revision && matchesPatch(data, write.patch);
}

function hasChangeAudit(meta: unknown, patch: ProjectSettingsPatch): boolean {
  return object(meta) && object(meta.auditTrail) && meta.auditTrail.persisted === true && meta.auditTrail.chained === true &&
    Array.isArray(meta.changedFields) && meta.changedFields.length > 0 &&
    meta.changedFields.every(key => field(key) && Object.prototype.hasOwnProperty.call(patch, key)) &&
    new Set(meta.changedFields).size === meta.changedFields.length;
}

export function isProjectSettingsEnvelope(value: unknown, scope: ProjectSettingsScope,
  write?: ProjectSettingsWrite): value is ProjectSettingsEnvelope {
  if (!object(value) || value.success !== true || !isProjectSettingsData(value.data, scope) ||
      object(value.meta) && value.meta.pendingStore === true) return false;
  return !write || matchesWrite(value.data, scope, write) && hasChangeAudit(value.meta, write.patch);
}
