# D5: a filing decision records the evidence kind before and after

**Row:** D5 (§11.10(e)). **Workstream:** the AnA client-files lane
(`…01DiJJAk`). **Date:** 2026-09-26. **Source:** VR-05's test list in
`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`: "the filing audit row
carries evidenceKind in from/to. Red today."

## The defect

`placeVaultDocument`'s audit row (`vault.document.file`) recorded the folder,
the placement status and the CTD section on both ends of a move, but not the
evidence kind. That is what the document is taken to be (report, certificate,
label, …), and a Move can change it (`evidence_kind = COALESCE($2,
evidence_kind)`). Such a change was made with no record of what it replaced.

## The fix

`writePlacement` adds `evidenceKind` to the row's `from` (the value it read
`FOR UPDATE`) and `to` (the value the `UPDATE` returned). Nothing else changes.

## Evidence

On PostgreSQL as `app_service` with RLS on:

| File | Result |
|---|---|
| `red/db-vault-placement.txt` | Before the fix: 1 failed, 17 passed. Filed as `report` and then moved as `cert`, the row's `from.evidenceKind` was undefined. |
| `green/db-vault-placement.txt` | 37 passed: `vault-placement` (18), `document-catalog` and `document-catalog-role`, which file through the same writer. |
| `green/unit-placement-callers.txt` | 124 passed across the 6 unit suites that call the placement writer, including AnA's `place_project_document`. |

ESLint is 0 on the writer and the suite, as at HEAD.
