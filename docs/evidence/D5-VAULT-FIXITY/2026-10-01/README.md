# Fixity: every stored Vault version re-proven against its recorded SHA-256 (rows D5, D2)

**Plan item:** critique 15 of `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` §4 ("a scheduled fixity
sweep that re-hashes stored bytes … byte loss is found only when someone downloads"). **Date:** 2026-10-01.
**Founder decision:** none. **The schedule** is handed to the scheduled-jobs lane (`docs/work-orders/README.md`).

## The finding

`readVerifiedVaultBytes` refuses to serve bytes that do not match their record. Nothing asked that
question of the versions nobody opened, so an altered or lost file stayed undetected until a reviewer
downloaded it, possibly on the day of a submission.

## The change

| Piece | File |
|---|---|
| **The check.** `checkProgramFixity` reads every stored version of a program, newest first, through `readVerifiedVaultBytes`, the verifier a download uses. Each gets a verdict: `verified`, `altered` (hash mismatch), `missing`, `unreadable` (its store cannot be opened here) or `unverifiable` (no SHA-256 recorded, so never called verified). Each verdict is written as its own chained `vault.document.fixity` row, in its own transaction, naming the person, the version, the recorded hash and the time, with a description the document's history shows ("Fixity check: altered"). At most 500 versions are checked per run, and the answer says when the program has more. | `server/services/vault/vault-fixity.ts` |
| `POST /api/c2c/project-vault/:id/fixity`, behind `requireEditorAccess`, because each verdict is a record attributed to the person. Another organisation's program is not found. | `server/routes/c2c/project-vault.ts` |
| **The Vault.** A "Stored files" lane with "Check stored files". The answer is the server's: "Checked 4 stored versions at … UTC: 2 match their recorded SHA-256, 2 could not be proven", followed by each failed version by title and version, with the reason in words. A check that did not run says so; it never reads as "all intact". | `client/src/concept2cure/v2/surfaces/VaultFixityCheck.tsx`, `Vault.tsx`, `styles/misc-surfaces-v2.css` |
| URS-VAULT-018, OQ-VAULT-19 (in the runner's step module), RA-001 v0.16, TM-001 rebuilt | `docs/validation/`, `tests/validation/oq/vault/steps-filing-compare.mjs` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-fixity.dbtest.ts`: PostgreSQL as `app_service` with RLS on, through the real ingest and route. One stored file is overwritten on disk and one is deleted. | `red/db-fixity.txt`: 3 of 3 fail on trunk (no route) | `green/db-fixity.txt`: 4 of 4. Of four versions, two are verified, the overwritten one is `altered` and the deleted one `missing`; only those two are listed. Each version has one chained row naming the person, and the altered document's history reads "Fixity check: altered". A viewer gets 403, and another organisation's program 404. |
| A mutant reporting a hash mismatch as a missing file | `red/mutation-altered-as-missing.txt`: 2 cases fail | as above |
| `server/services/vault/__tests__/vault-fixity.test.ts` | — | 2 of 2. An unopenable store is `unreadable`; no recorded hash is `unverifiable`, never verified. 501 versions check 500 and say so. |
| `client/src/concept2cure/v2/__tests__/vaultFixityCheck.test.tsx` | `red/client.txt`: 2 of 3 fail with trunk's `Vault.tsx`. The summary function lives in the new file and passes. | 3 of 3 |
| Regression: Vault client suites, Vault services and routes, project routes | — | 89 files, 663 tests |

Also green:
- Gates: `ci:design-system`, `ci:undefined-css-classes`, `ci:launch-scope-api`, `ci:check-client-api-calls`,
  `ci:internals-in-copy`, `ci:action-overclaim`, `ci:success-before-ok`, `ci:fixture-fallback`,
  `ci:unauthenticated-fetch`, `ci:tenant-isolation:no-regression`, `ci:vault-document-writers`,
  `ci:server-error-leaks`.
- Validation: `ci:validation-traceability`.
- `tsc`.
- Lint: no changed file gained a warning, and the new files have none.

The full DB tier is in `green/db-tier.txt`: 1304 of 1305. The one failure is the order-dependent activity-feed case of `tests/db/actor-displays.dbtest.ts`, which passes alone.

## Limits, stated

- **On demand, not yet scheduled.** The jobs lane owns the once-per-window scheduler and its
  entry-point baseline. The function it needs is named on the board.
- **One program per run, 500 versions at most.** A larger program is checked in several runs, and each
  answer says when there is more.
- **Reads every byte.** A check of a large program takes as long as reading it; it runs one version at a
  time so memory stays bounded.
- **OQ-VAULT-19 is written but not executed.** It runs with the other OQ-002 steps in W3, on an
  installation nobody has tampered with, so every version is expected to be verified.
