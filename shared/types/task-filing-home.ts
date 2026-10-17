/** Read-only handoff to the actual eSTAR tracker, not an eCTD submission. */
export interface TaskFilingHome {
  filing: {
    id: string;
    catalogKey: string;
    programType: string;
    variant: string;
    title: string | null;
    status: string;
    decision: string | null;
    fdaTrackingNumber: string | null;
    filedAt: string | null;
    reviewGoalDays: number | null;
    decisionDueAt: string | null;
    filedArtifactDocumentId: string | null;
    filedArtifactSha256: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  home: {
    source: 'filing';
    nativeId: string;
    projectId: number | null;
    programId: string | null;
    programTitle: string | null;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isTrackedFilingId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

/** A malformed successful response must never redirect to a different record. */
export function isTaskFilingHome(value: unknown, expectedId: string): value is TaskFilingHome {
  if (!value || typeof value !== 'object') return false;
  const { filing, home } = value as Record<string, unknown>;
  if (!filing || typeof filing !== 'object' || !home || typeof home !== 'object') return false;
  const f = filing as Record<string, unknown>;
  const h = home as Record<string, unknown>;
  return isTrackedFilingId(f.id) && f.id.toLowerCase() === expectedId.toLowerCase()
    && h.source === 'filing' && h.nativeId === f.id
    && isFilingContent(f)
    && isFilingHomeContent(h);
}

const nullableText = (v: unknown) => v === null || typeof v === 'string';
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
function isFilingContent(f: Record<string, unknown>): boolean {
  return ['catalogKey', 'programType', 'variant', 'status'].every(key => typeof f[key] === 'string')
    && ['createdAt', 'updatedAt'].every(key => timestamp(f[key]))
    && ['filedAt', 'decisionDueAt'].every(key => f[key] === null || timestamp(f[key]))
    && ['title', 'decision', 'fdaTrackingNumber', 'filedAt', 'decisionDueAt', 'filedArtifactDocumentId', 'filedArtifactSha256', 'notes'].every(key => nullableText(f[key]))
    && (f.reviewGoalDays === null || (typeof f.reviewGoalDays === 'number' && Number.isSafeInteger(f.reviewGoalDays)));
}
function isFilingHomeContent(h: Record<string, unknown>): boolean {
  return (h.projectId === null || (typeof h.projectId === 'number' && Number.isSafeInteger(h.projectId) && h.projectId > 0))
    && (h.programId === null || (h.projectId !== null && isTrackedFilingId(h.programId)))
    && nullableText(h.programTitle);
}
