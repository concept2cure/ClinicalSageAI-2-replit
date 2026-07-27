/**
 * useQmsReadiness — the quality system, visible from where submissions
 * are actually worked.
 *
 * Reads `GET /api/mdx/qms/readiness`. The full QMS (controlled docs,
 * training, suppliers, audits, NC product, change control) lives in
 * `client/src/concept2cure/quality/*` — a different application from
 * the MDX device shell. A device team working a 510(k) could not see
 * whether its suppliers were qualified, whether required training was
 * current, or which audit findings threatened readiness without leaving
 * for that other app. This hook carries the readiness slice across.
 *
 * Two honesty properties, both load-bearing:
 *
 * - Every block carries `available`. A tenant whose QMS tables have not
 *   been migrated must render "not tracked here yet" — a zeroed count
 *   from an absent system reads as an all-clear, which is exactly the
 *   silent-fixture failure mode this shell just had removed.
 *
 * - The payload is organization-scoped and says so. The QMS is an
 *   org-level system (21 CFR 820 / QMSR does not run per submission);
 *   presenting these counts as belonging to the selected programme
 *   would be the header-vs-panel mismatch again.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';

export interface QmsReadiness {
  documents: { available: boolean; effective: number; reviewOverdue: number; draft: number };
  suppliers: {
    available: boolean;
    total: number;
    criticalUnapproved: number;
    auditOverdue: number;
  };
  training: { available: boolean; acknowledged: number; expired: number };
  audits: { available: boolean; open: number; openMajorFindings: number };
  nonconforming: { available: boolean; undispositioned: number };
}

interface Payload {
  data: QmsReadiness;
  meta?: { scope?: string };
}

export interface UseQmsReadinessResult {
  readiness: DataState<QmsReadiness>;
  /**
   * Count of conditions that actively threaten submission readiness:
   * overdue document reviews, unapproved critical suppliers, overdue
   * supplier audits, expired training, open major audit findings, and
   * undispositioned non-conforming product. Unavailable blocks
   * contribute nothing — absence of data is not evidence of health,
   * and the card labels those blocks separately.
   */
  attentionCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useQmsReadiness(): UseQmsReadinessResult {
  const { data, loading, error, refresh } = useFetchJson<Payload>('/api/mdx/qms/readiness');
  const readiness = toDataState(data?.data ?? null, loading, error);

  const r = data?.data;
  const attentionCount = r
    ? (r.documents.available ? r.documents.reviewOverdue : 0) +
      (r.suppliers.available ? r.suppliers.criticalUnapproved + r.suppliers.auditOverdue : 0) +
      (r.training.available ? r.training.expired : 0) +
      (r.audits.available ? r.audits.openMajorFindings : 0) +
      (r.nonconforming.available ? r.nonconforming.undispositioned : 0)
    : 0;

  return { readiness, attentionCount, loading, error, refresh };
}
