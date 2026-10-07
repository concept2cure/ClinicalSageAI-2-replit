/** Shared interpretation of saved lifecycle statuses for registry assessments.
 * A status is evidence about progress, never proof of technical filing validity.
 */
const APPROVED = new Set(['approved', 'locked']);
const PRESENT = new Set(['signed', 'draft', 'drafted', 'drafting', 'authoring', 'present', 'active', 'review', 'in_review', 'in-review', 'in_progress', 'rejected']);
const RETIRED = new Set(['superseded', 'withdrawn', 'archived', 'deleted']);

const normalized = (status: string): string => String(status ?? '').trim().toLowerCase();

/** Multiple current records must all be approved. Never pick the last row or
 * let one approved study report vouch for the other reports of that type.
 * Retired versions are excluded; unknown states remain unresolved.
 */
export function submissionEvidenceState(statuses: string[]): 'missing' | 'present' | 'approved' | 'locked' {
  const current = statuses.map(normalized).filter(s => !RETIRED.has(s));
  if (current.length === 0 || current.some(s => !APPROVED.has(s) && !PRESENT.has(s))) return 'missing';
  if (current.every(s => s === 'locked')) return 'locked';
  return current.every(s => APPROVED.has(s)) ? 'approved' : 'present';
}

export function groupSubmissionEvidence<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

export const evidenceIsApproved = (state: string): boolean => state === 'approved' || state === 'locked';
export const evidenceIsRetired = (status: string): boolean => RETIRED.has(normalized(status));
