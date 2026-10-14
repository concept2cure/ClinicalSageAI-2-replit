# Push-gate reconciliation contract

The first ordinary canonical push was rejected by the existing SQL-interpolation gate. Subsequent static checks also found two copies of the canonical program-ownership predicate. No push-hook bypass is authorized or used.

Six independent read-only reviews inventory every flagged SQL expression and its helper provenance. Runtime values remain bind parameters; the additions use fixed policy predicates, fixed identifiers, finite literal lock clauses or generated placeholder numbers. The lead approves a narrow, documented update of only the 19 inventoried file counts, including the catalog-search reduction from five to zero. The gate and its selftest remain unchanged; no wholesale baseline regeneration is permitted. The audited source checkpoints and precise reasons must accompany that update.

## Approved implementation interface

`ProgramScopeOptions.forShare?: boolean` defaults to false. `programInOrganization` remains the single ownership check and uses the supplied executor. A true flag retains the matching program row with `FOR SHARE` inside the caller's transaction. Both live and explicitly retained-deleted modes use fixed query literals for the held branch; the existing unheld behavior is unchanged.

The processor and catalog admission replace their inline ownership queries with `programInOrganization(..., {forShare: true})`. Existing transaction order, actor/private-project authority, failure handling and row-lock strength remain intact. The processing owner controls the canonical helper, its tests and processing-store caller; the catalog owner controls the catalog caller.

The catalog owner also reconciles actor capture discovery with the current CRE parent contract. For program-bound captures, `client_workspace_id` is checked against the anchor's `client_workspace_id`. A legacy capture with only a workspace field needs its exact recorded chat artifact/file/project association. Candidate identity discovery remains separate from content delivery, and canonical upload admission runs before counts/LIMIT and again before disclosure. Unknown parent associations remain refusals.

The processor's program-bound workspace reservation must use the same distinction. The processing owner resolves the unique live canonical program anchor, compares its `clientWorkspaceId` with the source workspace, and holds that actual project row on the supplied transaction. Wrong or ambiguous associations remain refusals, including final revalidation after processing. The workspace-only legacy branch is outside this narrow extension unless a proven shared-contract defect requires it.

The automatic sweep must select the same valid program/workspace relationships. It derives a strict unique/valid frame through the existing `listProgramAnchorCandidates` API and binds that frame as data in the candidate and diagnostic queries. It does not implement a second anchor resolver or widen the pre-LIMIT set to knowingly invalid workspaces. The later actual claim remains authoritative and rechecks the current held relationship. An actual-SQL limited sweep must process a valid later source when an older source has the wrong workspace.

The lead requires focused lock/ownership tests, genuine workspace/artifact discovery controls, lint without warning growth, fresh source hashes, the unchanged static gates and fresh integrated qualification after these production changes. Earlier qualification and SQL-audit checkpoints remain historical; they are not overwritten to claim proof of later bytes.
