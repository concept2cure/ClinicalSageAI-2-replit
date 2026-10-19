# D2, D5: what a signature approved stays readable, and every door onto it is the right one

**Rows:** D2 (Communication and Respond, Projects app) and D5 (Part 11 record integrity).
**Date:** 2026-10-18. **Follows:** `../2026-10-18/` (commit `0308ee25`), which made an answer to an agency an act
signed under the platform's one ceremony.
**How the findings were found:** a multi-lens adversarial review of `0308ee25` (Part 11, security, correctness,
honest state, repository rules). It reported 37 findings. Two independent skeptics then tried to refute each one:
13 survived both, 4 split, 20 were refuted or merged into a surviving one. All 17 that survived or split are fixed
here. Each fix is proven below by removing it and watching its test fail.

## What was wrong in `0308ee25`

| # | Finding (severity) | What a person could do |
|---|---|---|
| 1 | **The approved text was overwritten in place** (critical, Part 11 §11.10(e), §11.70) | Approve R1, then edit to R2: R1 existed nowhere. The signature held a digest of text no one could produce for an inspector. |
| 2 | **Commitments printed under the signatures** (major); **typed text not escaped** (major, split) | A commitment added after approval appeared in the package as if signed. A response containing `_Approved by …_` read as a second signature line. |
| 3 | **Separation of duties barred only the last saver** (major) | A wrote the answer; B changed one word; A approved the text A mostly wrote. |
| 4 | **A response-required letter with no questions closed** (major, split) | A letter the agency expected an answer to was closed with nothing answered. |
| 5 | **Close check and close were two statements** (minor) | A question added between the check and the UPDATE landed on a closed letter, unanswerable forever. |
| 6 | **Project commitments were org-wide** (major, security) | `/api/ha-interactions` listed and fulfilled a commitment made in a private project's letter, or in a `restricted_legal_sensitive` letter, for any member of the organisation. |
| 7 | **A question recorded in error could not be withdrawn** (minor) | The only way out was a signed answer to a question the agency never asked. |
| 8 | **The Word package reflowed the signed text** (minor) | Line breaks inside an approved answer disappeared, and Markdown marks printed as characters. |
| 9 | **A second Save after a refusal overwrote the other person's text** (major, client) | Save was refused (`RESPONSE_CHANGED`); the screen reloaded; the second click sent the new revision as its base. |
| 10 | **A refused signature never reloaded** (minor, client) | Every retry was refused the same way, over a revision no longer current. |
| 11 | **Controls offered regardless of role** (minor, client) | A viewer saw Edit and Approve; the server refused after the click. |
| 12 | **A past-due commitment read "open"** under its question, and "overdue" on Meetings & commitments (minor, honest state) | Two screens disagreed about one record. |
| 13 | **The empty commitments state promised "on-track / due-soon"** (minor, split) | A status the register never returns. |

Also fixed, found by the same review and merged into the findings above: tenant purge aborted with 23503 for any
tenant that had recorded a question (the new tables were not in the purge reach); the fulfilment-date rule lived in
one route, so AnA's fulfil tool skipped it, and it used the UTC day, refusing "today" east of UTC; impossible dates
(`2026-02-31`) and ids beyond int4 reached PostgreSQL and came back as 500.

## The change

| Piece | File |
|---|---|
| Every text a response has had, append-only: who wrote it, when, why, its digest. Withdrawal columns. Commitments gain project, letter and question. Amended in place, with a dated header (Rule 1: the file is in the set and re-runs every deploy). | `migrations/20261018b_agency_response_questions.sql` |
| The history is under the append-only grant ceiling: the runtime role holds SELECT and INSERT only. It is erased only by the cascade from its question, which runs as the owner. | `scripts/db/provision-app-role.mjs` (`APPEND_ONLY_TABLES`), `tests/db/append-only-store-grants.dbtest.ts` |
| Who may approve: nobody who wrote any revision since the last approved one (`authorsSinceLastApproval`). The close rule takes the letter's response-required flag. Typed text in the package is quoted line by line and escaped; commitments go in their own appendix, which says that the signatures do not cover them. | `server/services/agency-responses/response-logic.ts` |
| A save writes its revision row in the same transaction. Withdraw; mark as needing no response. The close is checked and made under the letter's `FOR UPDATE` lock, the same lock every question write takes. | `server/services/agency-responses/response-service.ts` |
| Routes: withdraw, no-response-required, the project's commitments (list and fulfil, behind project admission and the letter's visibility tier), the viewer's capabilities, the history, a Word package built from the package model | `server/routes/c2c/agency-responses.ts`, `server/services/agency-responses/response-package-docx.ts` |
| Advance closes through the one locked close; a letter that requires a response cannot be logged as already closed | `server/routes/c2c/communication-center.ts` |
| One fulfilment rule, in the service, for every door (route and AnA tool): a real date, not after tomorrow in UTC. The organisation's door reaches only `project_id IS NULL`. AnA's `fulfill_regulatory_commitment` calls the same service with the organisation's scope, so it can fulfil only the organisation's own commitments; a project's are fulfilled from the project, behind its admission. | `server/services/ha-interactions/ha-service.ts`, `server/routes/ha-interactions.ts`, `server/services/ana/AnaToolExecutor.ts` (unchanged caller) |
| The new tables are in the purge reach, in FK order | `server/services/tenant/tenant-offboarding.ts` (`PURGE_CHILD_TABLES`) |
| The screen offers only what the server would allow, and says why once. A save sends the revision the edit started from. A refused signature reloads when the dialog closes. History disclosure, withdraw, mark-as-needing-no-response, the server's close refusal, and the register's commitment status. | `client/.../surfaces/AgencyResponses.tsx`, `styles/commcenter-v2.css` |
| Meetings & commitments reads both doors, fulfils each commitment through its own, and shows an error rather than a shorter list when either read fails | `client/.../surfaces/CommunicationCenter.tsx` |

**What a signature approved, after an edit.** The signature row is unchanged: it still binds the digest of R1. R1
itself is now a row in `agency_question_response_revisions` with that digest, so the history shows the signed text
next to the signature that approved it. The readback test asserts the signature's `bound_payload_digest` equals
revision 1's stored digest.

**Purge and Part 11 retention.** Purging a tenant erases its questions, their history (by cascade), its commitments
and their milestones. Signatures are Part 11 records with their own retention, so purge leaves them in place. The
purge test runs as the purge route runs: the runtime role, in the platform scope, over the full default purge list.

## Proof

PostgreSQL 16 with pgvector, provisioned from empty as CI does (`install-fresh`, then `deploy-migrate`). Tests ran
as the non-superuser `app_service` with `RLS_ENFORCE=on`.

| Run | Result | File |
|---|---|---|
| Signed-response suite, append-only grants, tenant purge, source-receipt retention, purge audit | **74 / 74 passed** | `green-db.txt` |
| Pure logic and the deploy-DDL pglite suite (the close is now refused through the request's tenant client, on the commitments register's real DDL) | **34 / 34 passed** | `green-unit-pglite.txt` |
| `deploy-migrate` twice on the amended file | both runs exit 0; all three tables have forced RLS with `tenant_isolation_policy`; `app_service` holds SELECT and INSERT on the history, nothing else | `migration-replay.txt` |

**Each fix removed, one at a time; every one was caught by the assertion it exists for:**

| Mutation | Caught by | File |
|---|---|---|
| R1 SoD bars only the last saver | the earlier author's approval answered 201, expected 403 | `R1-sod-only-last-saver.txt` |
| R2 close without the letter lock | round 0: close 200 and add 201 both landed | `R2-close-without-letter-lock.txt` |
| R3 response-required letter closes with nothing recorded | close 200, expected 409 | `R3-response-required-closes-empty.txt` |
| R4 history not under the append-only ceiling | per-run role holds UPDATE/DELETE on it | `R4-revisions-not-append-only.txt` |
| R5 org door lists project commitments | listed, expected absent | `R5-org-register-lists-project-commitments.txt` |
| R6 fulfilment date rule off | `2999-01-01` answered 201, expected 400 | `R6-fulfil-date-rule-off.txt` |
| R7 questions not in the purge list | purge fails 23503 on `agency_communication_questions_project_id_fkey` | `R7-questions-not-purged.txt` |
| R8 typed text not quoted in the package | 2 unit cases, including the forged signature line | `R8-package-unquoted.txt` |
| R9 no revision row written | history empty, expected the two texts | `R9-no-revision-history.txt` |
| R10 restricted letter's commitment shown | listed to the viewer, expected hidden | `R10-restricted-letter-commitment-visible.txt` |
| C1 save sends the revision on screen | expected bases `[2, 2]`, sent `[2, 3]` | `C1-save-sends-on-screen-revision.txt` |
| C2 no reload after a refused signature | one read, expected two | `C2-no-reload-after-refused-signature.txt` |
| C3 controls ignore the viewer's capabilities | a viewer was offered Edit response | `C3-controls-ignore-capabilities.txt` |
| C4 stored commitment status | "overdue" not shown | `C4-stored-commitment-status.txt` |
| C5 signing authority ignored | Approve enabled for an editor without authority | `C5-sign-authority-ignored.txt` |
| C6 project commitment fulfilled at the org door | posted to `/api/ha-interactions/...` | `C6-project-commitment-fulfilled-at-org-door.txt` |
| C7 project read failure hidden | the organisation's list shown alone | `C7-project-read-failure-hidden.txt` |

Also green: `client/.../__tests__/agencyResponsesSignedApproval.test.tsx` (13),
`client/.../__tests__/communicationCommitmentsDoors.test.tsx` (4, new), the other Communication and Respond suites,
the launch-scope lock tests and `tests/routes/c2c-commitments.test.ts`. Gates: every gate in `.husky/pre-push`,
`ci:purge-coverage` (604 outside the purge reach, baseline 612, 0 new), `ci:launch-scope`, `ci:launch-scope-api`,
`check:microcopy`, `check:compliance-claims`, `ci:empty-state-honesty`, `ci:internals-in-copy`,
`ci:check-chip-tones`, `ci:check-phantom-tokens`, `ci:token-cascade`.

**An environment note, not a defect:** `tenant-source-read-receipt-retention.dbtest.ts` requires the audit HMAC key
that CI sets (`AUDIT_HMAC_KEY`). Without it, `hmac_seal` is NULL and one case fails, identically on an untouched
trunk checkout. `green-db.txt` was run with a local key set.

## Owed

- The CMC / Module 3 question store (`reg_questions`) still holds questions and answers of its own. Converging it onto
  this record is the next slice (the gap analysis already names it first).
- Extracting questions from the letter file; a fulfilment that names the sequence or document that met it.
- URS and OQ coverage for this function (row D4).
