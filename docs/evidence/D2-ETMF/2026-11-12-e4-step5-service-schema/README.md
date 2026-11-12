# eTMF convergence E4, step 5: the second store's service, verdict, schema and migration go

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes
`server/services/etmf/tmf-artifact-persistence.ts`, which is now the only trial master file store. Build plan:
`docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md` §1.5 and §6 step 5. Founder decisions P-74, P-75 and P-124.

## What already exists, and what is left

After steps 1 to 4, nothing in the product reached the second store:

- the report pack reads the deployed store (`d7ebbb034a`);
- so do AnA's reads (`76185b6434`);
- AnA's four writes retired and its filing re-pointed (`1c08a054a9`);
- its eight routes and its metrics are deleted (`1bcc069d3f`).

What was left had no caller in the product:

| Piece | Path | What it was |
|---|---|---|
| The service | `server/services/etmf/etmf-service.ts` | Transactions over the two tables: make a TMF, add or seed artifacts, set a typed status, list, the completeness input |
| The verdict | `server/services/etmf/etmf-logic.ts` (`evaluateCompleteness`, `CompletenessArtifact`, `CompletenessResult`) | A percentage and a verdict over typed statuses |
| The seed skeleton | `server/services/etmf/tmf-completeness.ts` (`seedArtifacts`, `TmfSeedArtifact`) | Every reference-model artifact as an "expected" placeholder row |
| The schema model | `shared/schema/etmf.ts`, exported by `shared/schema/index.ts` | Drizzle models of the two tables; no `drizzle.config.ts` entrypoint pushes it |
| The tables | `migrations/20260610_etmf.sql` | On no deploy path. Only install-fresh's overlay ran it, on a new database |

Before the verdict went, its one guard was carried onto the deployed store (`e37936ad31`): no record left to check is
no verdict, never readiness.

## What changed

- **Deleted:**
  - `server/services/etmf/etmf-service.ts`;
  - `shared/schema/etmf.ts`, and its export from `shared/schema/index.ts`.
- **`etmf-logic.ts` is the classifier only.** The verdict, its two types and the schema import are gone. The header
  says what it is, who reads it (AnA's `classify_tmf_artifact`, `vault/vault-filing.service.ts`) and where readiness
  is decided now.
- **`tmf-completeness.ts`:** `seedArtifacts` and `TmfSeedArtifact` are gone. A study's expected records are the
  reference model's, read by `assessTmfCompleteness`.
- **`migrations/20260610_etmf.sql`, amended in place (RULE 1, L-2).** It creates nothing:
  - The audit header says so, in its first 40 lines.
  - Its notes say what it used to make, why that is gone, why the change is in place and not a DROP, and that
    tables an earlier install-fresh made are left as they are.
  - It names the tables only in prose, never as a create statement, so neither gate reads it as their creator
    (plan §1.5).
  - It stays in `scripts/ci/migration-deploy-path-baseline.json` (R6). That file lists files on no deploy path, and
    this one still is one. The design said the entry would be removed; it cannot be while the file stays, and P-74
    asked for the file to be amended in place.
- **Comments that named the second store**, in files that stay:
  - `shared/schema/tmf-artifacts.ts`, `shared/schema/index.ts`;
  - `shared/constants/domain/tmf-reference-model.ts` (the zone matches `tmf_artifact_filings.zone_number`; no seed);
  - `server/services/etmf/tmf-inspection-package.ts` (its honesty note means the filings);
  - `shared/ana/dossier-consistency.ts`.

  The two migrations on the set that mention the store keep their text: an edit there is journal drift for a
  comment (plan §2.4).
- **Tests:**
  - `etmf-logic.test.ts` loses the verdict's eight cases. The deployed store's suite holds the same rules: no record
    left to check is no verdict, and one open record is not ready.
  - `etmf-unmatched-artifact-is-unclassified.test.ts` loses the service's three cases and keeps the classifier's.
  - `vault-taxonomy-etmf.test.ts` loses the seed skeleton's four.
  - The disposition harness no longer creates the retired table.
- **`etmf-second-store-retired.test.ts`:**
  - the service and the model are gone, and nothing exports them;
  - the migration creates nothing, and its header says what and why;
  - no file under `server/`, `shared/` or `client/src` names either table outside a comment;
  - `etmf-logic.ts` exports the classifier only, and the seed skeleton is gone.

Not edited: `docs/reports/purge-coverage-baseline.json` still lists the two tables. Its writer keeps tables absent
from the database it ran on, and the tables still exist on older installs. `dev_ops/migration.js` names a different
`tmf_artifacts` shape (site, zone and section codes) in a script nothing runs. It is outside this store and outside
the plan.

## Rows on older installs

`SELECT to_regclass(...)` and `count(*)` on the three local databases install-fresh built
(`c2c_dbtest`, `platform_ci_vault_fixture_e4b`, `platform_ci_vault_fixture_s6v2`) found both tables present with
**0 rows each**. Production's answer is still not determined from here (plan §1.5, "one query answers it"). Nothing
reads or writes those tables now, whatever they hold.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The retirement test against HEAD: 4 of 4 fail (the files exist, the migration creates both tables, four files name them, the verdict is exported) |
| `02-green.txt` | 4 of 4 pass. The affected suites: 1131 of 1132 pass; the one failure is not this change's (below). The typecheck (0 errors), the lint ratchet (one warning fewer) and the nine gates |
| `03-orm-reachability-schema-kept.txt` | The gate made to fail: with the migration amended and the schema model put back, `ci:orm-reachability` refuses both models ("nothing can create") |
| `04-unbacked-tables-reader-left.txt` | The gate made to fail: with the service put back, `ci:unbacked-tables` refuses its references to both tables |
| `05-migration-reachability-reader-left.txt` | The same case passes `ci:migration-reachability`, which watches tables a deploy-dead migration creates; after the amendment nothing creates them. The plan named this gate for the case; `ci:unbacked-tables` is the one that catches it |
| `06-install-fresh.txt` | install-fresh on a blank database with this change: "Application schema install complete", and afterwards `to_regclass` is NULL for both retired tables while `tmf_artifact_filings` exists |

**Not this change's.** `server/services/vault/__tests__/vault-document-filter.test.ts` fails on HEAD as well. It
names `server/services/clinical-regulatory-evidence/data-room-vault.ts` as building its own metadata predicate over
`vault.documents`. R1 changed that file in `a5043b4c49`, and this change touches neither file. It is noted to R1 on
COORDINATION.

## Next

E4 is done. Then, per the plan: the eTMF URS and OQ (E6, `docs/validation/**` is held by Validation), and admission
(the Vault app gains the `etmf` surface; the held hook-in is applied).
