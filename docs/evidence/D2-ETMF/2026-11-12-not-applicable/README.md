# A trial master file record can be declared not applicable to its study, with a reason

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes
`server/services/etmf/tmf-artifact-persistence.ts` and `client/src/concept2cure/v2/surfaces/VaultTrialMasterFile.tsx`.
Founder decision P-124 item 5 (`docs/LAUNCH_DEFINITION_OF_DONE.md`): "Carried onto the deployed store before
admission: 'not applicable', with a reason."

## The defect

A study to which an essential record does not apply could never read complete. Take a single-country study that
imports no investigational product, or a study with no IDMC. The deployed store (`tmf_artifact_filings`) knew two
states: filed or missing. The second store (Store B, `tmf_artifacts`) had a typed status `not_applicable`, but it is
on no deploy path and is being retired (slice E4). An inspector expects such a record to be accounted for with a
justification. An open gap is not that.

## What already exists

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The filing store | `migrations/20260615_tmf_artifact_filings.sql`, `20261110_tmf_filings_study_ref.sql`; `shared/schema/tmf-artifacts.ts` | One row per (organization, study, record), with the study, the document and a removal kept on the row | Had no way to say a record does not apply |
| The writer | `server/services/etmf/tmf-artifact-persistence.ts` | Files and removes, each with a reason and the chained audit row in the same transaction | Had no declaration |
| The verdict | `server/services/etmf/tmf-completeness.ts` (`assessTmfCompleteness`) | Required, present, missing and unverified records per zone | Every record of the scope was required |
| The package | `server/services/etmf/tmf-inspection-package.ts` | Manifest, completeness, index CSV, README; a recorded download | Listed filings only |
| The routes | `server/routes/etmf.routes.ts` | `POST …/artifacts` files; `DELETE /artifacts/:id` removes | — |
| The section | `client/src/concept2cure/v2/surfaces/VaultTrialMasterFile.tsx`, `vaultTmf.ts`, `VaultTmfFiling.tsx`, `VaultTmfPackage.tsx` | Verdict, figures, records with File and Remove, the package as a document | — |
| Store B's status | `server/services/etmf/etmf-service.ts` (`ARTIFACT_STATUSES`, `setArtifactStatusTx`), `etmf-logic.ts` (`evaluateCompleteness`) | A status typed by hand, with no reason and no document | It retires with E4. Nothing of it is reached from here |
| Naming a person | `public.actor_name` (`migrations/20260929_actor_names.sql`) | Names a member or past actor of the calling organization | — |

Searches run: `not_applicable`, `notApplicable`, `not applicable`, `ARTIFACT_STATUSES`, `tmf_artifact_filings`,
`removal_reason`, `actor_name`, `TMF_ARTIFACT_`, across `server/`, `client/`, `shared/`, `migrations/`, `tests/`.
Nothing on the deployed store said "not applicable". No route, table, AnA tool or screen is added.

## What changed

- **The store** (`20261110_tmf_filings_study_ref.sql`, amended in place with a dated note, RULE 1). It gains one
  nullable column, `not_applicable_reason`. A live row that carries it is a declaration: who is `created_by`, when is
  `filed_at`, and why is the reason. `tmf_artifact_filings_not_applicable_chk` holds that a declaration names no
  document and gives a reason of at least 8 characters. Both are added only when absent, so a replay runs no DDL.
- **The writer** (`tmf-artifact-persistence.ts`). `declareTmfArtifactNotApplicable` writes the declaration and its
  `TMF_ARTIFACT_DECLARED_NOT_APPLICABLE` audit row in one transaction. The audit row names what the row held before:
  `declared`, `redeclared` (with the replaced reason), `declared_after_removal` or `declared_over_unlinked`.
  - A record with a live filing is refused (409 `RECORD_FILED`). Its filing is removed first, with its own reason,
    so no filed document leaves the trial master file without one.
  - Filing a document against a declared record ends the declaration on the same row. The audit row says
    `filed_over_not_applicable` and names the declaration it ended.
  - Withdrawing a declaration is a removal (`DELETE /artifacts/:id` with a reason). Its audit row carries
    `withdrewDeclaration`.
  - The list names who filed or declared each row (`filedByName`, through `public.actor_name`).
  - The study-access half of the file moved, unchanged, to `tmf-study-access.ts` in the same folder. The module
    re-exports what its callers import, so no caller changes.
- **The verdict** (`tmf-completeness.ts`). A declared record leaves the zone's `required` set and is listed in the
  zone's `notApplicable`. It is counted as neither present nor missing. `summary.totalNotApplicable` says how many.
- **The route** (`etmf.routes.ts`). `POST …/artifacts` with `notApplicable: true` declares the record. With a
  document it answers 400 `NOT_APPLICABLE_WITH_DOCUMENT`.
- **The package** (`tmf-inspection-package.ts`). The index gains a last column, `not_applicable_reason`. A declared
  row's `document_evidence` reads `not_applicable`. The README gains a "Not applicable" line, and "Artifacts filed"
  no longer counts declarations.
- **The section** (`VaultTrialMasterFile.tsx`, `vaultTmf.ts`, `VaultTmfFiling.tsx`, `VaultTmfPackage.tsx`).
  - A missing record offers "Not applicable…" to a role that may write the Vault. The form asks why the record does
    not apply.
  - A declared record reads: Not applicable to this study: "reason". Declared by Dana Reyes on 2026-11-12. It offers
    "Withdraw" (a reason is asked for) and "File a document" (the form says this ends the declaration).
  - The verdict sentence, the figures, the zone line and the package shown as a document each say how many records
    are declared.

## Evidence

| File | What it shows |
|---|---|
| `01-walk.txt` | In the running app: a record declared, the verdict moving from "2 of 26 … 24 are missing" to "2 of 25 … 23 are missing. 1 is declared not applicable", the row saying why, who and when, and the downloaded package's README and index carrying it. Then the declaration is withdrawn and the verdict reads as before. No console error and no failed request, in light and dark. The audit rows the walks wrote |
| `02-red.txt` | The 18 new cases against the code as it stood: all 18 fail |
| `03-green.txt` | Those pass; every eTMF server suite (173), every trial master file client suite (104), the PostgreSQL suites on a deploy-migrated database (30, including the declaration's audit row on the organization's intact chain and `actor_name` under the app's own role), and the gates |
| `04`–`07` (`.png`) | The declare form, the declared row, the withdraw form, and the declared row in the dark theme |

## Not done here

- AnA's TMF tools still read Store B. They converge in slice E4 (`docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md`),
  and `get_tmf_view` will then report declarations from this store.
- "A record's status is its document's" (P-124 item 5, the lifecycle stage on the record) is not shown yet.
- Admission: the URS and OQ, then the section moves into the Vault's Required documents view (P-124 item 6).
