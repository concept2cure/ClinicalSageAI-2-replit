# Microcopy lens: launch catalog, 2026-09-24 (run 2026-09-25 02:45 UTC)

Auditor: `microcopy-reviewer` (`.claude/agents/microcopy-reviewer.md`), read-only. Head reviewed:
`42eb291d` (`concept2cure-v2`). Its report is condensed here with every finding kept. The auditor
has no shell, so `check:microcopy` and `ci:internals-in-copy` were run by the control tower on the
remediation (results in the status column).

## Scope

Resolved from `shared/constants/launch-scope.ts` → `client/src/concept2cure/v2/surfaceViews.ts`,
cross-checked against `../2026-09-22/README.md`: Projects, ProjectHome, BiopharmaJourney,
FilingsCatalog, TaskBoard, Vault, ArtifactsCenter, DocumentAuthoring, TemplateLibrary, Review,
BiopharmaProject, ProtocolDev, SubmissionCenter, DossierMap, EctdCompile, EctdCoauthor,
PublishingCenter, GatewayTransmittals, DispatchReadiness, quality/App + SopRegister +
ChangeControl, QmpWorkspace, plus `v2/editor/*`, `EsignModal`, `GovernedConfirmDialog`,
`GlobalMutationErrors`.

## Prior state the auditor recorded

Every empty state checked pairs its title with a specific, actionable hint; no exclamation marks,
no "Oops" / "successfully" / "Are you sure" anywhere in scope; confirmations name the object and
the consequence; `EsignModal` and `GovernedConfirmDialog` are clean.

## Findings

| # | Rule | Where | Finding | Status |
|---|---|---|---|---|
| M1 | internals never reach the user | `EctdCompile.tsx:963`, `DispatchReadiness.tsx:225` (rendered at :454), `TemplateLibrary.tsx:357,388,437`, `GatewayTransmittals.tsx:368`, `Review.tsx:652,684` | Eight catch blocks build a toast or error from `e instanceof Error ? e.message : String(e)` with no redaction. `useToast` renders verbatim (unlike `<ErrorState>`, which redacts), so a raw `TypeError`, a bare "Failed to fetch", or `[object Object]` is shown as-is. The fix exists and is used in the same files (`TemplateLibrary.tsx:399-408`, `Vault.tsx:691-698,745-754`): `redactInternals(message, fallback)`. | **fixed** (this run): each site reads `redactInternals(e instanceof Error ? e.message : '', '<what a person can act on>')`, with the import added where missing. |
| M2 | one name for one concept | `TaskBoard.tsx:1728` (`Select a programme…` under the label "Project"), `:1642`, `:402`, `:403`, `:387`, `:407` | The same field is "Project" in its label and "programme" in its placeholder and validation; the rest of the file and the Projects app say "project". | **fixed** (this run): the six strings say project. |

## Clean, read

`EsignModal`, `GovernedConfirmDialog`, `GlobalMutationErrors`, `toast.tsx`, `TaskBoard` (beyond
M2), `TemplateLibrary` (beyond M1), `EctdCompile`, `DispatchReadiness`, `GatewayTransmittals`,
`Review`, `Vault`, `QmpWorkspace`, `SubmissionCenter`, `DocumentWorkbench`, `SopRegister`,
`ChangeControl`.
