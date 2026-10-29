/**
 * A GMP deviation's lifecycle, its classes and its categories (P-50): one map
 * the server enforces (server/services/qms/deviations.ts) and the Quality
 * register offers, as CAPA's is (capa-lifecycle.ts).
 *
 * A deviation is opened, investigated, and sent for approval with its root
 * cause and resolution recorded. Approval may send it back. `closed` is reached
 * only by the signed close (POST /api/mdx/qms/deviations/:id/close), never by a
 * status move.
 *
 * @module shared/constants/deviation-lifecycle
 */
export const DEVIATION_STATUSES = ['open', 'under_investigation', 'pending_approval', 'closed'] as const;
export type DeviationStatus = (typeof DEVIATION_STATUSES)[number];

/** The status moves a person makes in the register. */
export const DEVIATION_TRANSITIONS: Record<DeviationStatus, readonly DeviationStatus[]> = {
  open: ['under_investigation'],
  under_investigation: ['pending_approval'],
  pending_approval: ['under_investigation'],
  closed: [],
};

export const DEVIATION_CLASSIFICATIONS = ['minor', 'major', 'critical'] as const;
export const DEVIATION_TYPES = ['planned', 'unplanned'] as const;
export const DEVIATION_CATEGORIES = ['process', 'equipment', 'documentation', 'material', 'environmental', 'human_error'] as const;
