/**
 * Tenant-isolation SQL fragment for the shared precedent corpus.
 *
 * precedent.regulatory_precedents holds public precedents (organization_id IS
 * NULL) and, going forward, org-private precedents (organization_id = <id>).
 * This pure helper builds the WHERE condition that returns public rows plus the
 * caller's own org rows — and only public rows when no org is in context — so a
 * tenant can never see another tenant's private precedents.
 *
 * Kept as a pure function (no DB, no mocks) so the isolation boundary is
 * directly unit-testable.
 */
export interface OrgIsolationFragment {
  /** SQL condition referencing the organization_id column. */
  condition: string;
  /** Positional params introduced by the condition (in order). */
  params: number[];
  /** The next free positional-parameter index after this fragment. */
  nextParamIdx: number;
}

export function buildPrecedentOrgIsolation(
  organizationId: number | undefined,
  paramIdx: number
): OrgIsolationFragment {
  if (typeof organizationId === 'number') {
    return {
      condition: `(organization_id IS NULL OR organization_id = $${paramIdx})`,
      params: [organizationId],
      nextParamIdx: paramIdx + 1,
    };
  }
  // No org in context → only public precedents. Never an equality on an org.
  return {
    condition: `organization_id IS NULL`,
    params: [],
    nextParamIdx: paramIdx,
  };
}
