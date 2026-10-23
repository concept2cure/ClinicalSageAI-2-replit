/**
 * The CMC register paths that keep a change history, in one place.
 *
 * The server mounts `GET /api/cmc/<path>/:id/history` for each of these
 * (`server/services/cmc/register-history.ts` keys its target map by this list,
 * so a path added here without a target is a compile error), and the register
 * table shows a History action for exactly these registers
 * (`client/src/concept2cure/v2/surfaces/cmcRecordHistory.tsx`).
 *
 * One list, because the alternative is a client that offers the action on a
 * register the server does not serve — a History button that answers 404 — or a
 * register whose edits are recorded and never shown.
 *
 * `specifications` is deliberately absent: it has its own history route over
 * `specification_audit_log`, which holds each limit's revisions rather than the
 * chain's record of the write (`server/api/cmc/specificationRoutes.ts`).
 */
export const CMC_REGISTER_HISTORY_PATHS = [
  'analytical-methods',
  'change-control',
  'characterization-studies',
  'comparability-studies',
  'container-closures',
  'dissolution-profiles',
  'drug-products',
  'drug-substances',
  'formulation-records',
  'impurity-profiles',
  'manufacturing-processes',
  'material-specs',
  'process-validation',
  'qc-testing',
  'reference-standards',
  'stability-studies',
] as const;

export type CmcRegisterHistoryPath = (typeof CMC_REGISTER_HISTORY_PATHS)[number];

/** Does this register keep a change history? The last path segment decides. */
export function keepsRegisterHistory(path: string): path is CmcRegisterHistoryPath {
  return (CMC_REGISTER_HISTORY_PATHS as readonly string[]).includes(path);
}
