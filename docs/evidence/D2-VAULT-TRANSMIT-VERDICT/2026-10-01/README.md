# VR-14's dialog half: the Place dialog shows the server's transmit verdict (rows D2 and D7)

**Plan item:** VR-14 of `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-10-01.
**Founder decision:** FD5, decided (c) by the founder on 2026-10-01. Nothing is grandfathered, and a sealed
Authoring approval carries over to its Vault copy when it is bound to the bytes' SHA-256. The server half was
built by `…01471vSK` (`1b7c179e3`; `docs/evidence/W5/2026-10-01-vault-leaf-finalized/`). It refuses to freeze,
dispatch or transmit a sequence whose Vault leaf names a version that is not approved and current. This change
is the part the user sees before that refusal.

## The finding

The Place dialog started with a blank section code, even for a document whose filing a person had confirmed.
It said nothing about the version's review stage, so the first sign that an unapproved version would not go
out was a `DISPATCH_BLOCKED` at transmit, possibly weeks later. A person checking in a new version could not
see that the current one was already in a sequence that had not left yet.

## The change

| Piece | File |
|---|---|
| **The verdict, from the server.** The versions read gives each version `transmitRefusal`, taken from `vaultVersionNotTransmittable`, the same function the transmit gate uses. It is null when the version is approved and current. Otherwise it is the refusal's own words ('not reviewed', 'in_review, not approved', 'superseded by a later version', 'approved for different content than these bytes'). Each placement also carries its sequence's `dispatchStatus`. | `server/routes/c2c/project-vault.ts`, `server/services/vault/vault-where-used.ts` |
| **The dialog.** The section code is pre-filled only from a **confirmed** filing. A suggested one is named, not filled. A pre-filled code is judged exactly as a typed one. The dialog shows the version's review stage and prints the server's verdict verbatim, before the click and again in the success line. There is no list of stages in the client. A verdict that could not be read says so; it never reads as approved. A Delete leaf says its approval is not checked. Placement is not refused on the verdict: the server's freeze, dispatch and transmit are. | `client/.../surfaces/VaultPlaceIntoSubmission.tsx`, `Vault.tsx` (passes the project and the filing) |
| **Before a check-in.** "Upload new version" is preceded by a warning naming each submission, sequence and status that carries the current version and has not been sent to the agency. The warning excludes Delete leaves, sequences already sent or acknowledged, and placements on earlier versions. | `client/.../surfaces/VaultVersions.tsx` (`CheckInWarning`, `openPlacementsOf`) |
| URS-VAULT-020 extended (URS v0.14), TM-001 rebuilt, VR-14 marked complete in the plan | `docs/validation/`, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-where-used.dbtest.ts`, two new cases: PostgreSQL as `app_service` with RLS on, through the real route. Leaves are written by `upsertLeaf`. | `red/db-on-trunk.txt`: both fail on trunk's server code (`expected undefined to be 'superseded by a later version'`; `expected [[102, undefined]] to deeply equal [[102, 'sent']]`). The other six still pass. | `green/db-where-used.txt`: 8 of 8. A superseded version reads 'superseded by a later version' and the unreviewed current one 'not reviewed', identical to the function's own answer. A sent sequence's placement says 'sent', and an unsent one says null. |
| The dialog: `vaultPlaceIntoSubmission.test.tsx`, `vaultPlaceIntoSubmissionDialog.test.tsx`, and the new `vaultPlaceFromVault.test.tsx` (the real Vault surface opening the dialog) | `red/client-on-trunk-dialog.txt`: 20 of 55 fail with trunk's dialog. The ten that pass on trunk assert absences that were already true: a blank field in five shapes, and a non-PDF not read. They also include the four check-in cases, whose red is the next row. | `green/client-dialog.txt`: 55 of 55 |
| The check-in warning: `vaultWhereUsed.test.tsx` W1–W4 | `red/client-checkin-warning-on-trunk.txt`: W1 fails with trunk's `VaultVersions.tsx` (no warning exists there). The cases asserting no warning (W2–W4) were each made to fail by flipping their own input: W2's 'sent' to 'pending', W1's 'pending' to 'acknowledged', W3's 'delete' to 'replace', and W4's leaf moved to the current version (`red/mutants/W2-pending.txt`, `TW1`, `TW3`, `TW4`) | included in the suites below |
| Dialog mutants, each applied, run, then reverted (`red/mutants/M*.diff` and `.txt`) | M1, the section starts blank: the pre-fill cases. M2, the 'confirmed' check dropped: the suggested and unfiled cases. M4, the warning judged from the stage rather than the server's verdict: the 'superseded' and 'different content' cases. M5, the operation ignored: the Delete case. M6, the success suffix dropped: the unapproved-placement case. M7, a read error treated as no warning: all three failure shapes. | — |
| Every Vault client suite (25 files) | — | `green/client-vault-suites.txt`: 178 of 178 |

The red logs are trimmed to their case lines, assertions and summaries, with the rendered DOM dumps dropped.
`green/gates.txt` lists the gates, and all pass, including `ci:launch-scope-api`. `tsc` is clean. Lint counts
on every changed file equal trunk's, and the new test file has none. `green/migrate.txt` is the
`deploy-migrate` run this DB tier used. This change has no schema.

## Limits, stated

- **The spec's case (d) was split.** The design asked that a pre-filled `3.2.P.8` keep Place disabled. The
  dialog's shared CTD rule (`filingTarget.tsx`) refuses only a code with no dot, so `3.2.P.8` is admitted in an
  NDA. The rule was not changed here. The case was split in two: a confirmed `3` shows the existing
  "container" note, and a confirmed `3.2.P.8` placed into an IRB package shows the existing vocabulary refusal.
  Both keep Place disabled. Whether `3.2.P.8` should count as a container is a change to that shared rule.
- **The verdict is read once, when the dialog opens.** An approval granted while the dialog is open shows on
  the next opening. The server judges again at freeze, dispatch and transmit regardless.
- **The DB tier shows two refusals, not an approved version's null.** The null path is the function's own.
  The server half's evidence covers it with an approved lifecycle record for the staged bytes
  (`docs/evidence/W5/2026-10-01-vault-leaf-finalized/green-vault-finalized.txt`), not through the signing
  ceremony.
