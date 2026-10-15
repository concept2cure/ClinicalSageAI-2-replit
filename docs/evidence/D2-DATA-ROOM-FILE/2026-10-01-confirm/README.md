# VR-11b: Confirm N suggested with one reason, and the count awaiting confirmation (row D2)

**Plan item:** VR-11, second half (`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`). **Date:** 2026-10-01.
**First half:** VR-11a, File into Vault from the data room (`../2026-10-01/`).
**Founder decision:** none.

## The finding

The classifier, and AnA, only ever suggest a folder. A suggested document is not filed until a person
confirms it, and the Vault's coverage counts only confirmed filings. Confirming was one document at a
time, in the detail pane. VR-11a files a whole data room as suggestions, so that left a person clicking
through each one. Nothing counted the suggestions waiting: the Vault counted only "unfiled", and the
classifier's "high"-confidence suggestions, including false ones, were waiting with no count.

## The change

| Piece | File |
|---|---|
| **Bulk confirm.** `confirmSuggestedFilings` requires a reason for change (`requireGovernedReason`, the shared floor of 8 characters; 422 `REASON_REQUIRED` otherwise) and the folder the person is confirming. Each document then goes through `placeVaultDocument` on its own transaction. The reason becomes the placement rationale and is carried in the document's own chained `vault.document.file` row. A refusal on one document leaves the others confirmed. `complete` is false whenever any was refused. Every id asked about gets an answer; a malformed one is refused for itself, never dropped. | `server/services/vault/vault-placement-batch.ts` |
| **No confirmation on a placement the person did not see.** `placeVaultDocument` takes an `expected` folder and status and checks them under its row lock. A document moved, or confirmed by someone else, since the list was loaded is refused `CONFLICT` and not touched. | `server/services/vault/vault-placement.service.ts` |
| `POST /api/c2c/project-vault/:id/file-batch`, behind `requireEditorAccess` like every Vault write | `server/routes/c2c/project-vault.ts` |
| `awaitingConfirmationCount` counts documents in a folder whose status is still "suggested". It is a `FILTER` on the program-wide count query that `unfiledCount` already uses, so it covers the whole program, not the page. | `server/routes/c2c/project-vault.ts` |
| **The Vault.** The header shows "N awaiting confirmation" beside "unfiled". In a folder holding suggestions, "Confirm N suggested in <folder>" opens one reason field. The action stays disabled until the reason is long enough. The answer names each document: "Confirmed in …", or "Not confirmed" with the reason. A partial batch says "Not every filing was confirmed", and a refused request says "Nothing was confirmed" and why. The Vault is read again after anything was confirmed. AnA's view of the page carries the count. | `client/src/concept2cure/v2/surfaces/VaultConfirmSuggested.tsx`, `Vault.tsx`, `styles/misc-surfaces-v2.css` |
| URS-VAULT-015, OQ-VAULT-16 (with its runner step), RA-001 v0.13, TM-001 rebuilt | `docs/validation/`, `tests/validation/oq/vault/run.mjs` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-placement-batch.dbtest.ts`: PostgreSQL as `app_service` with RLS on, through the real route | `red/db-confirm-batch.txt`: 5 of 5 fail on trunk's server code (no route, no count). | 5 of 5. Without a reason, or with one that is too short, the request is 422 and nothing changes. With one, each document is confirmed and placed by the person, with exactly one chained row carrying the reason (`from` suggested, `to` confirmed). A document moved, or confirmed, since the list was loaded is refused `CONFLICT` with no row written, and the others commit; `complete:false`. A malformed id is refused for itself. A viewer gets 403 with nothing changed. The count equals the program's suggested-in-a-folder documents; a suggestion with no folder is not counted. |
| The same suite against two mutants | `red/mutation-expected-placement.txt`: with the `expected` check disabled, the conflict case fails. `red/mutation-reason.txt`: with the reason requirement disabled, the reason case fails. | as above |
| `server/routes/__tests__/vault-tree-bounded.test.ts`, new case | — | Every row on the page is filed, yet the count is the program's (42), taken by the aggregate query. 16 of 16. |
| `client/src/concept2cure/v2/__tests__/vaultConfirmSuggested.test.tsx` | `red/client.txt`: 3 of 4 fail with trunk's `Vault.tsx`. The grouping case is a pure function and passes. | 4 of 4 |
| Regression: every Vault client suite, the Vault services and routes, the project routes, and AnA's document tools | — | 433 files, 4551 tests |

Also green:
- Gates: `ci:launch-scope-api`, `ci:check-client-api-calls`, `ci:undefined-css-classes`,
  `ci:internals-in-copy`, `ci:action-overclaim`, `ci:success-before-ok`, `ci:design-system`,
  `ci:ana-surface-context`, `ci:fixture-fallback`, `ci:unauthenticated-fetch`,
  `ci:tenant-isolation:no-regression`, `ci:runtime-ddl`, `ci:vault-document-writers`,
  `ci:column-reachability`, `ci:unkeyed-request-tables`, `ci:tenant-entry-points`, `ci:sign-ceremony`,
  `audit-requestdb-coverage --strict-no-regression`.
- Validation: `ci:validation-traceability`.
- `tsc`.
- Lint: no changed file gained a warning, and the new files have none.

The full DB tier is in `green/db-tier.txt`: 1006 of 1007. The one failure, `tests/db/actor-displays.dbtest.ts`, is red on trunk after `4f74b0f18` (the audit-read rule) and is handed to that lane on the board.

## Limits, stated

- **One folder per request.** "Confirm N suggested in <folder>" is per folder, as a Vault reviewer
  checks a folder. A view that mixes folders shows one action for each.
- **The reason is not an electronic signature.** Confirming a filing is a governed change with a
  reason, as a single confirm is; signing belongs to review and approval (VR-13).
- **At most 100 documents per request.**
- **OQ-VAULT-16 is written but not executed.** It runs with the other OQ-002 steps in W3.
