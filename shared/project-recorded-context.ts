/** Recorded project-profile facts. Shape/scope checks grant no access or evidentiary status. */
import { projectSharingId } from './project-sharing';

export interface ProjectRecordedContextScope {
  programId: string;
  organizationId: number;
  actorUserId: number;
  projectId?: number;
  /** Undefined means no client selection; explicit null pins a legacy parent. */
  clientWorkspaceId?: number | null;
}
export interface ProjectRecordedProfile {
  profileId: number;
  regulatoryStrategy: string | null;
  targetIndication: string | null;
  targetPopulation: string | null;
  customInstructions: string | null;
  riskFactors: { risk: string; likelihood: string; impact: string; mitigation?: string }[];
  openQuestions: { question: string; context?: string; priority?: string }[];
  keyDecisions: { decision: string; rationale: string; date: string; source?: string }[];
  learnedInsights: { insight: string; source: string; confidence: number | null; extractedAt: string }[];
  lastEnrichedAt: string | null;
}
export interface ProjectRecordedContextData extends ProjectRecordedContextScope {
  projectId: number;
  clientWorkspaceId: number | null;
  profile: ProjectRecordedProfile | null;
}
export interface ProjectRecordedContextEnvelope { success: true; data: ProjectRecordedContextData }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nullableText = (value: unknown) => value === null || text(value);
const optionalText = (value: Record<string, unknown>, key: string) => !(key in value) || text(value[key]);
const rows = (value: unknown, guard: (row: Record<string, unknown>) => boolean) => Array.isArray(value) && value.every(row => object(row) && guard(row));
const uuid = (value: unknown): value is string => text(value) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** The same recorded-note shape is used by the cards and existing AnA formatter. */
export function hasProjectRecordedNotes(value: unknown): value is Pick<ProjectRecordedProfile,
  'riskFactors' | 'openQuestions' | 'keyDecisions' | 'learnedInsights'> {
  return object(value) &&
    rows(value.riskFactors, row => text(row.risk) && text(row.likelihood) && text(row.impact) && optionalText(row, 'mitigation')) &&
    rows(value.openQuestions, row => text(row.question) && optionalText(row, 'context') && optionalText(row, 'priority')) &&
    rows(value.keyDecisions, row => text(row.decision) && text(row.rationale) && text(row.date) && optionalText(row, 'source')) &&
    rows(value.learnedInsights, row => text(row.insight) && text(row.source) && text(row.extractedAt) &&
      (row.confidence === null || typeof row.confidence === 'number' && Number.isFinite(row.confidence)));
}

export function isProjectRecordedProfile(value: unknown): value is ProjectRecordedProfile {
  return object(value) && projectSharingId(value.profileId) &&
    ['regulatoryStrategy', 'targetIndication', 'targetPopulation', 'customInstructions'].every(key => nullableText(value[key])) &&
    (value.lastEnrichedAt === null || text(value.lastEnrichedAt) && /^\d{4}-\d{2}-\d{2}T/.test(value.lastEnrichedAt) && Number.isFinite(Date.parse(value.lastEnrichedAt))) &&
    hasProjectRecordedNotes(value);
}

function hasIdentity(value: Record<string, unknown>): boolean {
  return uuid(value.programId) && projectSharingId(value.projectId) && projectSharingId(value.organizationId) &&
    projectSharingId(value.actorUserId) && (value.clientWorkspaceId === null || projectSharingId(value.clientWorkspaceId));
}
function matchesScope(value: Record<string, unknown>, scope: ProjectRecordedContextScope): boolean {
  return uuid(value.programId) && uuid(scope.programId) && projectSharingId(scope.organizationId) && projectSharingId(scope.actorUserId) &&
    value.programId.toLowerCase() === scope.programId.toLowerCase() && value.organizationId === scope.organizationId &&
    value.actorUserId === scope.actorUserId && (scope.projectId === undefined || value.projectId === scope.projectId) &&
    (scope.clientWorkspaceId === undefined || value.clientWorkspaceId === scope.clientWorkspaceId);
}
export function isProjectRecordedContextData(value: unknown, scope?: ProjectRecordedContextScope): value is ProjectRecordedContextData {
  return object(value) && hasIdentity(value) && (value.profile === null || isProjectRecordedProfile(value.profile)) &&
    (!scope || matchesScope(value, scope));
}

export function isProjectRecordedContextEnvelope(value: unknown, scope?: ProjectRecordedContextScope): value is ProjectRecordedContextEnvelope {
  return object(value) && value.success === true && isProjectRecordedContextData(value.data, scope);
}
