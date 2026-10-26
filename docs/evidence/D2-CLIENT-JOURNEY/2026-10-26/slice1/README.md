# D2: slice A.1, names a client reads

The plan is section 8, A.1, of `.design/client-journey/INFORMATION_ARCHITECTURE.md`. The names come from section 9 of
that file, and the address from section 12. No admission is needed.

## What already exists

Every change renames or rewrites something that exists. Nothing is built beside it (Rule 3).

| Path | What changed |
| --- | --- |
| `shared/constants/ui-surface-registry.ts`, `ui-surface-registry.ui-v2.ts`, `config/ui-surface-registry.json` | Registry labels, which the breadcrumb, page title, ⌘K and Subscription & features read. "Plan & features" → "Subscription & features", "Vault (DMS)" → "Vault", "Submission center" → "Submission Center", "Tasks & collaboration" → "Tasks", "Review & approval" → "The review board", "Document editor & authoring" → "The editor", "510(k) workbench" → "510(k) and eSTAR", "CER generator (EU MDR)" → "Clinical evaluation (CER)", "IND lifecycle" → "IND forms", "Device & diagnostics workbench" → "IVDR evidence". |
| `client/src/concept2cure/v2/Shell.tsx` | The account menu: "Subscription & features", "Platform licensing", "Compare subscriptions". The breadcrumb names the open project, not "Project home". |
| `client/src/concept2cure/v2/projectDoors.ts` (new, names only) | One name per job for the project's step doors. ProjectPlan, ProjectHome, ProjectMarkets and ProjectMdxWorkflow read their door names from it. Where each door goes is unchanged. |
| `client/src/concept2cure/v2/routing.ts` (`SURFACE_ADDRESSES`) | The address `/concept2cure/features` for `apps`. `/concept2cure/apps` still opens it, and a copied link resolves back. |
| `ProjectComingLater.tsx` and the step surfaces | The *Coming later* lines say today's truth, and none names a folded feature as live. |
| `db/migrations/20260810_reconcile_module_catalog.sql`, `20260823_module_catalog_customer_copy.sql` | The IND catalogue's phase 1 is "Planning". Three module descriptions open with the feature's section 9 name. Both are amended in place, with dated notes (Rule 1). |
| `navEntitlements.tsx`, `LicensingSurface.tsx`, `MasterLicensing.tsx`, `WorkflowCatalog.tsx`, `UsageBilling.tsx` | "Plan" now means the project's first step only. The subscription is called "subscription". |

## Tests

- **The guard.** `client/src/concept2cure/v2/__tests__/clientNamesSlice1.test.tsx` checks that:
  - no client-visible label, door, *Coming later* line, catalogue phase or address uses a word from section 9's "Not
    in client copy" list or names a folded feature as live;
  - each job's door name is written only in `projectDoors.ts`.
- **Red.** `red/names-a-client-reads.txt`: 31 of its 34 checks fail on the code before the change. The other three
  are the test's own self-checks. `red/red-*.txt` are the catalogue's reds.
- **Green.**
  - The guard, `clientCopyNoProgram`, `shellNav` and `cmdkPlaces`: 74 tests pass.
  - Tests that pinned the old names were updated, each to the new name.
- **Affected set.** The regression verifier ran 448 affected test files in the tree.
  - Its failing files were run again in a `git archive` copy of `7d1f7f316`, and each fails there too
    (`affected-at-head.txt`).
  - Its copy verifier and its final report did not complete: the session's agent limit was reached. The pre-push
    gates are the last check.

## Known follow-up

The slice 0 launch walk's door pattern (`tests/e2e/launch-walk-no-lock.e2e.ts`, `DOOR`) was written against the names
before this slice. Some of the new door names, such as "Find or start a document in the editor", end in a lower-case
place. Re-run the walk after this slice and widen the pattern if any door is no longer pressed.
