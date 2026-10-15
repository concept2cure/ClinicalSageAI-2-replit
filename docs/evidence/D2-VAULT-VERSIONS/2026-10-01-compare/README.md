# Version compare: what changed between two versions of a Vault document (row D2)

**Plan item:** critique 15 of `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` §4 ("Version compare" had
neither a slice nor an exclusion). **Date:** 2026-10-01. **Founder decision:** none.

## The finding

VR-09 lists every version of a document and downloads any of them. A reviewer asking "what changed in
v2.0" still had to download both and compare them by eye. Veeva shows the difference.

## The change

| Piece | File |
|---|---|
| **The comparison.** Both ids must be versions of one document: the family `readVersionFamily` returns under the VR-08 link rule. Another document's version is refused `NOT_SAME_DOCUMENT`; another organisation's document is not found. The earlier version is always `from`. Byte identity comes from the recorded SHA-256s, never inferred from text. The recorded title, type, classification and file name are compared field by field. The extracted text is compared with `diffArrays` from the `diff` package (already a dependency): deterministic, no model. | `server/services/vault/vault-version-compare.ts` |
| **Honest limits in the answer.** The text comparison is withheld, with a reason, in two cases: when a version has no extracted text (the reason names it), and when the texts differ too much to align within the edit budget (2,000 edits, the protocol redline's budget, plus a 500 ms timeout). Otherwise unchanged runs are collapsed to their count, keeping 3 lines either side of a change. A read capped at 20,000 lines per side, or output capped at 2,000 lines, is marked `truncated`. The counts are always the whole comparison's. | same |
| `GET /api/c2c/project-vault/:id/documents/:documentId/compare?against=<versionId>`. A read, like the versions list. | `server/routes/c2c/project-vault.ts` |
| **The Vault.** Each earlier version in the versions list offers "Compare with v2.0". The panel shows "v1.0 → v2.0 (current)", whether the bytes are the same, each changed detail, the line counts, and the changed lines. Lines are marked `+` and `−` in text as well as by colour, and unchanged runs read "… N unchanged lines …". A comparison that could not be read is an error, never an empty difference. | `client/src/concept2cure/v2/surfaces/VaultVersionCompare.tsx`, `VaultVersions.tsx`, `styles/misc-surfaces-v2.css` |
| URS-VAULT-016, OQ-VAULT-17 (with its runner step), RA-001 v0.14, TM-001 rebuilt | `docs/validation/`, `tests/validation/oq/vault/run.mjs` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-version-compare.dbtest.ts`: PostgreSQL as `app_service` with RLS on, through the real ingest, check-in and route, with text files | `red/db-compare.txt`: 4 of 4 fail on trunk's server code (no route) | `green/db-and-unit.txt`: 4 of 4. v1.0 → v2.0 returns 2 lines added, 1 removed and 39 unchanged, with the exact lines, a collapsed run and the title change. Asked the other way round it is still v1.0 → v2.0. Another document's version is 422 `NOT_SAME_DOCUMENT`, and another organisation's document is 404. A version with no extracted text gets a reason naming v1.0, while the details are still compared. |
| The same suite against a mutant | `red/mutation-same-document.txt`: with the same-document check bypassed, the refusal case fails | as above |
| `server/services/vault/__tests__/vault-version-compare.test.ts` | — | 5 of 5: collapsing with context, identical text, missing text, the edit-budget refusal (about 300 ms on 6,000 lines each), and both caps, with the counts staying whole |
| `client/src/concept2cure/v2/__tests__/vaultVersionCompare.test.tsx` | `red/client.txt`: 3 of 4 fail with trunk's `VaultVersions.tsx`. The words case is a pure function in the new file and passes. | 4 of 4 |
| Regression: every Vault client suite, the Vault services and routes, the project routes | — | 432 files, 4505 tests |

Also green:
- Gates: `ci:design-system` (the colour tokens are defined in `design-system/colors_and_type.css`),
  `ci:undefined-css-classes`, `ci:launch-scope-api`, `ci:check-client-api-calls`, `ci:internals-in-copy`,
  `ci:action-overclaim`, `ci:success-before-ok`, `ci:fixture-fallback`, `ci:unauthenticated-fetch`,
  `ci:ana-surface-context`.
- Validation: `ci:validation-traceability`.
- `tsc`.
- Lint: no changed file gained a warning, and the new files have none.

`ci:tenant-isolation:no-regression` is red on trunk for `server/routes/setup.ts`, which this change does not
touch. It changed in `b221cd641`, inside that lane's window, and is handed on in `docs/work-orders/README.md`.

The full DB tier is in `green/db-tier.txt`: 1273 of 1277. All 4 failures also fail on trunk's code without this change, and each is handed to its lane on the board.

## Limits, stated

- **Text, not layout.** The comparison is over the extracted text. A change only in formatting, images or
  page layout shows as different bytes with the same text, and the panel says exactly that.
- **Line by line.** A word changed inside a long line shows as that line removed and re-added. A
  word-level view inside a changed line is a later refinement.
- **Viewing a comparison is not audited.** It is a read, as the versions list and search are. Downloads,
  which hand over the bytes, are in the chain (VR-01).
- **OQ-VAULT-17 is written but not executed.** It runs with the other OQ-002 steps in W3.
