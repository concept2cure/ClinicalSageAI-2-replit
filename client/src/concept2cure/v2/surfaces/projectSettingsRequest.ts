import { useCallback, useMemo, useState } from 'react';
import { ApiRequestError, apiRequest, serverMessage } from '@/lib/queryClient';
import { capturedActorHeaders } from '@/utils/authToken';
import { isProjectSettingsEnvelope, type ProjectSettingsEnvelope, type ProjectSettingsScope, type ProjectSettingsWrite } from '@shared/project-settings';
import { useLiveData, type DataState } from '../dataConnect';
import { mutationUnconfirmed } from '../mutationOutcome';

export type ProjectSettingsAnswer =
  | { kind: 'confirmed'; envelope: ProjectSettingsEnvelope }
  | { kind: 'unavailable' | 'refused' | 'unconfirmed' | 'retired'; message: string; code?: string; status?: number };
const RETIRED_WORDS = 'The project, workspace or signed-in account changed. Reopen project settings. A change already sent may have completed.';
const retired = (): ProjectSettingsAnswer => ({ kind: 'retired', message: RETIRED_WORDS });
const unknown = (): ProjectSettingsAnswer => ({ kind: 'unconfirmed', message: 'The settings save could not be confirmed. Reload saved settings before another change; your request may have been saved.' });
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function errorCode(body: unknown): string | undefined {
  if (!object(body)) return undefined;
  const error = body.error;
  return typeof error === 'string' ? error : typeof body.code === 'string' ? body.code
    : object(error) && typeof error.code === 'string' ? error.code : undefined;
}

/** The token is reread at each boundary; ordinary refresh may retain the actor. */
export function projectSettingsHeaders(scope: ProjectSettingsScope, isCurrent: () => boolean): Record<string, string> | null {
  if (!isCurrent()) return null;
  try {
    const headers = capturedActorHeaders({ userId: scope.actorUserId, organizationId: scope.organizationId });
    if (scope.clientWorkspaceId != null) headers['x-client-id'] = String(scope.clientWorkspaceId);
    return headers;
  } catch { return null; }
}
function failure(write: ProjectSettingsWrite | undefined, status?: number, body?: unknown, codeHint?: string): ProjectSettingsAnswer {
  const code = errorCode(body) ?? codeHint;
  if (write && mutationUnconfirmed(status, code?.endsWith('OUTCOME_UNKNOWN') ? 'OUTCOME_UNKNOWN' : code)) return unknown();
  return { kind: write ? 'refused' : 'unavailable', code, status, message: serverMessage(body) || (write
    ? 'The settings change was refused. Reload saved settings before making another change.'
    : 'Project settings could not be verified. Retry the settings read.') };
}

export type ProjectArchiveAnswer =
  | { kind: 'archived' }
  | { kind: 'refused' | 'unconfirmed' | 'retired'; message: string; status?: number };
const archiveUnknown = (): ProjectArchiveAnswer => ({ kind: 'unconfirmed',
  message: 'Whether the project was archived could not be confirmed. Reload the project before trying again; it may have been archived.' });
function archiveFailure(status?: number, body?: unknown, codeHint?: string): ProjectArchiveAnswer {
  const code = errorCode(body) ?? codeHint;
  if (mutationUnconfirmed(status, code)) return archiveUnknown();
  return { kind: 'refused', status, message: serverMessage(body) || 'The project was not archived.' };
}

/**
 * Archive the project: the existing close-out route, POST /api/c2c/projects/:id/archive
 * (server/routes/c2c/projects.ts), which checks the person may change the project and
 * writes the chained audit row. The reason the person gave travels in the body. The
 * answer is confirmed only when the route names this project; anything else that may
 * have completed is said so, never reported as done or as refused.
 */
export async function requestProjectArchive(scope: ProjectSettingsScope, isCurrent: () => boolean, reason: string): Promise<ProjectArchiveAnswer> {
  const headers = projectSettingsHeaders(scope, isCurrent);
  if (!headers) return { kind: 'retired', message: RETIRED_WORDS };
  try {
    const res = await apiRequest('POST', `/api/c2c/projects/${encodeURIComponent(scope.programId)}/archive`, { reason }, headers);
    const body: unknown = await res.json().catch(() => null);
    if (!projectSettingsHeaders(scope, isCurrent)) return { kind: 'retired', message: RETIRED_WORDS };
    if (!res.ok) return archiveFailure(res.status, body);
    const named = object(body) && body.ok === true && String(body.projectId ?? '').toLowerCase() === scope.programId.toLowerCase();
    return named ? { kind: 'archived' } : archiveUnknown();
  } catch (error) {
    if (!projectSettingsHeaders(scope, isCurrent)) return { kind: 'retired', message: RETIRED_WORDS };
    return error instanceof ApiRequestError ? archiveFailure(error.status, error.payload, error.code) : archiveUnknown();
  }
}

/** Retain the full scoped and audited envelope; the shared guard owns its wire. */
export async function requestProjectSettings(scope: ProjectSettingsScope, isCurrent: () => boolean,
  write?: ProjectSettingsWrite): Promise<ProjectSettingsAnswer> {
  const headers = projectSettingsHeaders(scope, isCurrent);
  if (!headers) return retired();
  try {
    const res = await apiRequest(write ? 'PATCH' : 'GET', `/api/c2c/projects/${encodeURIComponent(scope.programId)}/settings`, write, headers);
    const body: unknown = await res.json().catch(() => null);
    if (!projectSettingsHeaders(scope, isCurrent)) return retired();
    if (!res.ok) return failure(write, res.status, body);
    if (!isProjectSettingsEnvelope(body, scope, write)) return write ? unknown() : failure(undefined);
    return { kind: 'confirmed', envelope: body };
  } catch (error) {
    if (!projectSettingsHeaders(scope, isCurrent)) return retired();
    return error instanceof ApiRequestError ? failure(write, error.status, error.payload, error.code) : failure(write);
  }
}

/* ════ The project's objective of record (S1; ONE_DESIGN_PLAN.md §1a, D3 §4.3) ════
   The charter's objectives section, read through the charter route
   (GET /api/charters/by-project/:ref/objectives, server/services/c2c/charter-objectives.ts),
   for the project page's ProjectObjective block. Four states, never confused:
   a failed or malformed read is "failed", never "none"; while a project's read
   is under way, nothing of another project's is shown. */

/** The source kinds charter-objectives.ts records (OBJECTIVE_SOURCE_KINDS), and 'person' when no document is cited. */
export type ObjectiveSourceKind = 'protocol' | 'registry' | 'publication' | 'press_release' | 'data_room' | 'other' | 'person';
/** One recorded version, newest first: what the settings drawer lists. */
export interface ObjectiveVersion {
  version: number | null;
  text: string | null;
  reason: string | null;
  recordedBy: string | null;
  recordedAt: string;
}
export type ObjectiveRead =
  | { state: 'reading' }
  | { state: 'failed'; retry: () => void }
  | { state: 'none'; canChange: boolean }
  | { state: 'stated'; text: string; version: number; source: { kind: ObjectiveSourceKind; label: string };
      recordedBy: string | null; recordedAt: string; canChange: boolean; versions: ObjectiveVersion[] };

interface ObjectiveSourceWire { kind: string; title: string; locator?: string | null }
interface ObjectiveContentWire { objective: string; sources: ObjectiveSourceWire[] }
interface ObjectivesWire {
  current: { content: ObjectiveContentWire; version: number; updatedAt: string; recordedBy: string | null } | null;
  history: Array<{ version: number | null; occurredAt: string; reason: string | null; recordedBy: string | null; content: ObjectiveContentWire | null }>;
  canChange: boolean;
}
const textOrNull = (value: unknown) => value === null || typeof value === 'string';
const isObjectiveContent = (value: unknown): value is ObjectiveContentWire => object(value) && typeof value.objective === 'string' &&
  Array.isArray(value.sources) && value.sources.every((s) => object(s) && typeof s.kind === 'string' && typeof s.title === 'string');
function isObjectivesWire(value: unknown): value is ObjectivesWire {
  if (!object(value) || typeof value.canChange !== 'boolean' || !Array.isArray(value.history)) return false;
  const current = value.current;
  const currentOk = current === null || (object(current) && isObjectiveContent(current.content) && Number.isInteger(current.version) &&
    typeof current.updatedAt === 'string' && textOrNull(current.recordedBy));
  return currentOk && value.history.every((e) => object(e) && typeof e.occurredAt === 'string' && textOrNull(e.reason) &&
    textOrNull(e.recordedBy) && (e.content === null || isObjectiveContent(e.content)));
}

const NO_DOCUMENT_CITED = 'a statement, with no document cited';
/** Where the objective was taken from, in a few words: the first source (title, locator), and how many more. */
function objectiveSource(sources: ObjectiveSourceWire[]): { kind: ObjectiveSourceKind; label: string } {
  const [first, ...rest] = sources;
  if (!first) return { kind: 'person', label: NO_DOCUMENT_CITED };
  const label = first.locator ? `${first.title}, ${first.locator}` : first.title;
  return { kind: first.kind as ObjectiveSourceKind, label: rest.length ? `${label} and ${rest.length} more source${rest.length === 1 ? '' : 's'}` : label };
}

function objectiveRead(read: DataState<ObjectivesWire>, retry: () => void): ObjectiveRead {
  if (read.loading) return { state: 'reading' };
  if (read.error || !isObjectivesWire(read.data)) return { state: 'failed', retry };
  const { current, history, canChange } = read.data;
  if (!current) return { state: 'none', canChange };
  return {
    state: 'stated', text: current.content.objective, version: current.version, source: objectiveSource(current.content.sources),
    recordedBy: current.recordedBy, recordedAt: current.updatedAt, canChange,
    versions: history.map((e) => ({ version: e.version, text: e.content?.objective ?? null, reason: e.reason, recordedBy: e.recordedBy, recordedAt: e.occurredAt })),
  };
}

/** The project's objective of record for `pid` (the program UUID). With no project, nothing is read. */
export function useProjectObjective(pid: string | null): ObjectiveRead {
  const [attempt, setAttempt] = useState(0);
  const path = pid ? `/api/charters/by-project/${encodeURIComponent(pid)}/objectives` : null;
  const read = useLiveData<ObjectivesWire>(path, [path, attempt], isObjectivesWire);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return useMemo(() => (path ? objectiveRead(read, retry) : { state: 'reading' }), [path, read, retry]);
}
