# D2, D5: a regulatory commitment's fulfilment names what met it, and a PMR, PMC or REMS is fulfilled by signature

**Rows:** D2 (Communication, Meetings & commitments, in the Projects app) and D5 (Part 11 record integrity).
**Date:** 2026-10-19. **Decision:** P-40 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, under the 2026-10-18 decisions).
**Closes:** item 3 of "Next in-catalog work" and the fulfilment row of `docs/design/RIM_GAP_ANALYSIS_2026-10-18.md`.
**How it was built:** from a design that two critics checked against the committed tree (`ae287394`). Their 31
problems were binding; where this change departs from one, the departure and its reason are under
[Departures](#departures-from-the-design-and-why).
**Reviewed:** 26 findings from reviewers, each tried by two skeptics, were fixed before commit. Each fix has a test
shown failing without it (`mutation-review-*.txt`). See [Review](#review-2026-10-19).

## The defect

At `ae287394`, recording a commitment as fulfilled took a date and a sentence. That held for every type, including a
postmarketing requirement (PMR), a postmarketing commitment (PMC) and a REMS:

| What a person could do | Why it matters |
|---|---|
| Mark a PMR fulfilled with the reason "done", unsigned and naming nothing. Anyone with write access could do it, at either door, or AnA could do it from chat. | The obligation left the overdue register and would leave the annual status report (21 CFR 314.81(b)(2)(vii), 601.70; FD&C 505(o)(3), 505-1). Nothing said which submission or document met it, and no one attested to it. |
| Point to the work only in free text ("sent in sequence 0042"). | Nothing tied the record to a sequence the agency received or to a document's bytes. A sequence that was never transmitted, or a draft, read the same. |
| Change the record afterwards with any UPDATE the runtime role can make. | Nothing in the database held a fulfilment once recorded. |

`tests/db/agency-response-signed-approval.dbtest.ts` showed the first row as intended behaviour: an unsigned PMR
fulfilment with no evidence answered 201 with ledger `['create','resolve']`. It now asserts a 400
`EVIDENCE_REQUIRED` and an unchanged row (`red.txt` §3 shows it failing on the old code).

## The decision (P-40) and its basis

Recording a PMR, PMC or REMS as fulfilled is an attestation, so it is a Part 11 signed act. It goes through the one
ceremony (`server/routes/governed-signed-act.ts` `signGovernedAct`), with meaning approval or responsibility
(`DECISION_ACT_MEANINGS`), the signer's reason, password, and second factor when enrolled. The platform's
comparable acts are signed the same way: label approval, a QMS document becoming effective, the Shadow dispositions
(P-34, P-35), and an agency response's approval (P-32).

- **What the signature names.** The dispatched sequence the agency received (dispatch status `sent` or
  `acknowledged`), or the Vault version that met it at its sha256, or both, and the date. It binds all of them
  (`BINDING_BASIS.COMMITMENT_FULFILMENT_CONTENT`, recipe `commitment-fulfilment/v1`).
- **What the database holds, at COMMIT.** It accepts a fulfilled PMR, PMC or REMS only with that signature. The
  signature must be written by the same transaction, by the person recorded, over the same evidence and date. A
  commitment's type never changes, so a PMR cannot be retyped out of its signature. A recorded fulfilment cannot
  change, and an UPDATE cannot remove it.
- **Meeting commitments and "other".** These are fulfilled by a governed write with a reason. What met them may be
  named.
- **AnA.** AnA cannot sign, so its fulfil tool refuses the three signed types and points to Communication, Meetings &
  commitments.
- **No separation of duties.** The signer attests to the record; they are not approving another person's work.

What the database does **not** hold:

- **A hard DELETE by the runtime role.** The tenant purge runs as that role, so a DELETE guard needs a purge door to
  go with it. Removal by an UPDATE (`deleted_at`) of a recorded fulfilment is refused.
- **Program scoping of the evidence.** The routes hold it: on a project's door, its own program; on the
  organisation's door, a program the person can open.
- **Correcting a fulfilment signed in error.** Neither §11.70 supersession nor a reopen exists yet. Both items are
  owed.

## The change

| Piece | File |
|---|---|
| Five columns, all SQL-only and NULL on existing rows: the sequence, the Vault version, its pinned sha256, who recorded it, and when. A same-organisation composite FK to the sequence, with a guarded unique index added on `ectd_sequences(id, organization_id)`. Plain FKs to the Vault version and the user. A coherence CHECK. One BEFORE INSERT OR UPDATE guard (detailed in the next row). Two deferred constraint triggers that hold the signature at COMMIT, re-armed every deploy with the QMS idiom (DROP TRIGGER IF EXISTS on its own names, then CREATE). The three signed types are listed inside the function, so the list can change in place. If `electronic_signatures` lacks a column the guard reads, the file refuses to arm. The eCTD header is in place, and the file is registered after `20261018b`. | `migrations/20261019_commitment_fulfilment_evidence.sql`, `scripts/db/migration-set.mjs` |
| What the BEFORE guard refuses: evidence or a recorder on insert; a move into `fulfilled` without a recorder; evidence attached in any update except the one that records the fulfilment from a non-terminal status; evidence from another organisation, a removed record, a sequence the agency did not receive, or a sha256 the version does not carry; any change of a commitment's type, on any row (so a PMR cannot be retyped out of its signature while open); any change to a recorded fulfilment (type, words, dates, status, evidence, `deleted_at`); clearing `deleted_at`. | (same file) |
| What the deferred guard requires: evidence, plus a live `governed-action` signature on `regulatory-commitment:<id>` with this basis. It must be signed by the recorder, carry meaning approval or responsibility, not be withdrawn (superseded, invalid, revoked or voided), be created in this transaction, and carry a manifest act whose `sequenceId`, `vaultDocumentId`, `vaultSha256` and `fulfilledDate` equal the row's. | (same file) |
| One rule for which types are signed (`SIGNED_FULFILMENT_TYPES`, `fulfilmentRule`), the evidence refusal, the digest recipe, and the record state the list reports | `server/services/ha-interactions/ha-logic.ts` |
| The fulfilment write. It takes a date, evidence and a recorder. A signed type must name evidence and a date, and the server never chooses the date the signature binds. The list reads the recorder through `public.actor_name`, so a former member's name survives. | `server/services/ha-interactions/ha-service.ts` |
| The evidence check, in this order: the commitment; access (the project's program, or `requireCurrentProgramAccess`, before anything about the sequence is said); same submission; filed. For a Vault version: live and in scope (`lockLiveVaultVersion`), hashed, data not withdrawn (`vaultDataEligibleSql`). It runs read-only before the password and again under lock inside the signing transaction. It also builds the options list and the list's projection: evidence the reader cannot open is `{readable:false}`, built from an explicit allow-list per row, on both doors. | `server/services/ha-interactions/commitment-fulfilment.ts` |
| One reader of what a fulfilment signature binds, used by the binder and by the list. Both run the same SQL statement, so they cannot disagree. | `server/services/ha-interactions/fulfilment-record.ts`, `server/services/part11/governed-target-binders.ts` (`regulatory-commitment` binder), `server/services/part11/signature-persistence.ts` (the basis) |
| The platform's "filed" rule, exported once. The submission service's own `isFiled` now reads it. | `server/services/submission-service/filed-dispatch.ts`, `server/services/submission-service/submission-service.ts` |
| The live-Vault-version lock, moved out of the relationships module (not copied). It pins `lower(btrim(content_hash))` and is typed on the shared executor shape. | `server/services/vault/vault-version-lock.ts`, `server/services/vault/vault-relationships.ts` |
| Both doors fulfil and read options through one route module, with one body (`{success,data,actionId,auditId,sha256Chain[,signatureId,signedAt,meaning]}`) and one code-to-status map. Every refusal that needs no password comes before the ceremony. Access that cannot be verified answers 503. The metric counts only a 201. The project door's `governedWrite` now wraps the shared `governedRequestWrite`. | `server/routes/commitment-fulfil-route.ts`, `server/routes/ha-interactions.ts`, `server/routes/c2c/agency-responses.ts` |
| AnA's `fulfill_regulatory_commitment` reads the type and refuses PMR, PMC and REMS as a signature, writing nothing. Its description and register entry say so. In the capability manifest, only this tool's line changed. | `server/services/ana/AnaToolExecutor.ts`, `notifications-study-memory-tool-defs.ts`, `tool-authorization.register.json`, `docs/ana-capability-manifest.json` |
| The screen. Each row says what met it, who recorded or signed it, and whether the signature matches the record. Each state has its own sentence: legacy (keyed on `fulfilment_recorded_at IS NULL`), signature withdrawn, signature missing, does not match, the agency has since rejected the sequence, removed from the Vault, data withdrawn, in a project you cannot open. The fulfil dialog offers only filed sequences of this scope and this program's Vault. For a signed type it opens the e-signature modal. The modal shows the date, the sequence and its dispatch state, and the version with its project (on the organisation's door) and the first 12 hex characters of the sha256 the Vault search returned for it; the server pins that version's own `content_hash` under lock. A version with no recorded sha256 cannot be chosen. The fulfilled row shows the pinned sha256 the same way (the full value on hover). | `client/.../surfaces/CommitmentRow.tsx`, `client/.../surfaces/CommitmentFulfilment.tsx`, `client/.../surfaces/CommunicationCenter.tsx`, `client/.../styles/commcenter-v2.css` |
| The Vault version picker, shared by the fulfilment and company documents. On a project it searches that program, read through the Vault find view's own guard (`isVaultSearchShape`, moved from `Vault.tsx` into this module so the two readers cannot drift); elsewhere it searches the library. It says how many matched when it lists fewer. Not every picker is this one: `VaultRelationships.tsx` AddForm still runs its own search and choice (owed). | `client/.../surfaces/VaultLibraryResults.tsx`, `client/.../surfaces/Vault.tsx`, `client/.../surfaces/CompanyDocumentSettings.tsx`, `client/.../styles/vault-picker.css`, `client/.../styles/company-documents.css` |
| A project's Vault search names each version's sha256 (`contentHash`), as the library search already did, so the picker can show what the signature will pin. | `server/routes/c2c/project-vault.ts` |
| The new service is an approved caller of the Vault supersession and eligibility builders. No predicate is hand-copied and no baseline is raised. | `scripts/ci/lib/approved-sql-predicates.mjs` |
| The purge order comment. Commitments now go before the Vault versions they name. | `server/services/tenant/tenant-offboarding.ts` |
| P-40; the gap analysis; URS-PROJ-014 (URS-001 v0.7); its risk row (RA-001 v0.22); VSR-001 §19 (an OQ step is owed) | `docs/LAUNCH_DEFINITION_OF_DONE.md`, `docs/design/RIM_GAP_ANALYSIS_2026-10-18.md`, `docs/validation/URS-001-PROJECTS.md`, `docs/validation/RA-001-RISK-ASSESSMENT.md`, `docs/validation/VSR-001-VALIDATION-SUMMARY-REPORT.md` |

## Proof

The runs in this section are the build's, before the review. The review re-ran every suite, the replay, the gates and
the typecheck after its fixes; those results are under [Review](#review-2026-10-19).

PostgreSQL 16 with pgvector at `127.0.0.1:55432/c2c_test`. The DB suites ran as the non-superuser runtime role
`app_service` (`APP_DATABASE_URL`), with `RLS_ENFORCE=on` and the audit HMAC key set.

| Run | Result | File |
|---|---|---|
| **Red.** New and changed tests on the unchanged tree, with no migration applied. | Unit, route and client: **46 failed** of 131 in 9 files. DB: **36 failed** of 39. Agency dbtest: the unsigned PMR case **failed** (201, expected 400). | `red.txt` |
| **Green.** Unit, route and client, 21 files: the new route, logic and binder suites; AnA cannot-sign, tool routing and add-ons; the launch-scope API gate; error containment; and the client Communication, commitments, Vault and company-documents suites. | **265 / 265** | `green.txt` §1 |
| **Green.** `commitment-fulfilment-evidence` (27), `commitment-fulfilment-database` (13), `agency-response-signed-approval` (39) | **79 / 79** | `green.txt` §2 |
| **Green.** Tenant purge, purge audit and purge artifact records, plus the QMS signature guard | 30 / 31. The one failure, `tenant-purge-artifact-records` (`SOURCE_READ_RECEIPT_PURGE_REFUSED`), fails identically on the trunk code. | `green.txt` §3, §4 |
| **Affected sweep.** Every unit suite that imports a changed module (95 files, by import graph). | 1437 passed. The 16 failures are the two report-os suites of §4, identical on the trunk code. | `green.txt` §6 |
| `deploy-migrate` twice on the final file | Both runs exit 0. Each trigger is present once and enabled. `regulatory_commitments` has forced RLS with `tenant_isolation_policy`. The journal records the file at `ab97ff77f110c640`. | `migration-replay.txt` |
| The migration-header rule | It refuses the file with the eCTD block removed, and passes it as written. | `gate-migration-headers.txt` |
| Typecheck | 0 errors, exit 0 | `typecheck.txt` |
| The moved Vault lock | `vault-document-relationships.dbtest.ts` fails in its own fixture on trunk and here alike, before any relationship code runs. With a temporary fixture patch (restored, `git diff` empty), all 9 cases pass through `lockLiveVaultVersion`. | `vault-relationships-lock-move.txt` |

**Each protection removed, one at a time. Every one was caught by the assertion it exists for, and the file was
restored byte for byte (sha256, or for SQL the function definition's md5).** Each mutation's exact test selection
was first run on the unmutated tree, and each passes there (`mutation-controls.txt`). That control caught one bad
selection: mutation 8's first database run skipped the setup its tests need. It failed with or without the
mutation, so it was re-run with a selection that runs that setup. `mutation-controls.txt` records the bad
selection failing on the unmutated tree; `mutation-8-binder-digest-covers-vault-sha256.txt` holds the corrected run.

| # | Protection removed | Caught by | File |
|---|---|---|---|
| 1 | A PMR, PMC or REMS must name what met it | The rule test; the route answered 401 (password checked) where it owes 400 `EVIDENCE_REQUIRED` first; same on real PostgreSQL | `mutation-1-evidence-required-for-pmr.txt` |
| 2 | A PMR is signed (the code's rule) | The rule test and every signed PMR route case. **Every case in the database file still passes**: the database refuses an unsigned PMR independently of the code. | `mutation-2-signature-required-for-pmr.txt` |
| 3 | The database requires the signature | An unsigned fulfilled PMR with evidence COMMITs; the type pin fails on `pmr`; the M5 case fails | `mutation-3-db-refuses-unsigned-pmr.txt` |
| 4 | A recorded fulfilment is write-once | The runtime role repointed a signed PMR at another sequence | `mutation-4-write-once-recorded-fulfilment.txt` |
| 5 | The signature is bound to the recorder and the evidence (the design's first predicate) | A signature by someone else, or over other evidence, let the COMMIT through | `mutation-5-signature-bound-to-signer-and-evidence.txt` |
| 6 | On a project's door, the sequence is the project's program's | Another project's sequence reached the password (401), where 404 was expected | `mutation-6-project-program-scopes-sequence.txt` |
| 7 | The list projects evidence the reader cannot open | The member's list carried the hidden sequence's number, submission id and title | `mutation-7-org-door-projects-unreadable-evidence.txt` |
| 8 | The binder's digest covers the Vault sha256 | 2 binder cases. On real PostgreSQL, the stored signature's digest is not the record's, and the list reports that the signature does not match. | `mutation-8-binder-digest-covers-vault-sha256.txt` |
| 9 | AnA refuses a signed fulfilment | PMR, PMC and REMS: no refusal. The service's own rule still refused the write, so no row changed. | `mutation-9-ana-refuses-signed-fulfilment.txt` |
| 10 | Evidence is refused before the password | Each refused case spends a password attempt: 401 five times, then 423 `ACCOUNT_LOCKED`. The signer locks their own account. | `mutation-10-evidence-refused-before-password.txt` |
| 11 | Only a sequence the agency received meets it | Pending-transmit, rejected and never-dispatched sequences reached the password (401), where 409 `SEQUENCE_NOT_FILED` was expected | `mutation-11-only-a-filed-sequence-meets-it.txt` |

## Deletion record

This change deletes no file, so the editor and canvas history search finds nothing to answer for. It does replace
five pieces of code inside files. For each one, `deletion-history.txt` has the `git log -S` output, the file that
now delivers the outcome, and the test that proves it reachable.

| Replaced | Introduced in | Now delivered by | Proven reachable by |
|---|---|---|---|
| The C2CForm "Record a commitment as fulfilled" drawer in `CommunicationCenter.tsx` | `0308ee25` | `CommitmentFulfilDialog` in `client/.../surfaces/CommitmentFulfilment.tsx`. It has the same dialog name, opened from each row's "Record fulfilment" in Meetings & commitments. | `client/.../__tests__/commitmentFulfilment.test.tsx` (9) and `communicationCommitmentsDoors.test.tsx` (5), which open it from the tab and post to each door |
| `VaultDocumentPicker` in `CompanyDocumentSettings.tsx` | `68b3dd62` | `VaultVersionPicker` in `client/.../surfaces/VaultLibraryResults.tsx` | `client/.../__tests__/companyDocumentSettings.test.tsx` (11) |
| `lockVersion` in `vault-relationships.ts` | `8e2d0bd9` (the shallow clone's horizon) | `lockLiveVaultVersion` in `server/services/vault/vault-version-lock.ts`, which relate and unrelate now call | `vault-relationships-lock-move.txt` (9/9 with the fixture patch); the fulfilment DB suites |
| The body of `agency-responses.ts` `governedWrite` | `d8ebc611` | `governedRequestWrite` in `server/routes/commitment-fulfil-route.ts`. `governedWrite` remains as a thin wrapper. | `tests/db/agency-response-signed-approval.dbtest.ts` (39/39) |
| `fulfilBody` (agency-responses) and `fulfillSchema` (ha-interactions) | `d8ebc611`; `8e2d0bd9` | `fulfilBody` in `server/routes/commitment-fulfil-route.ts`, used by both doors | `server/routes/__tests__/commitment-fulfil-route.test.ts` (10) and the evidence dbtest's two doors |

The clone is shallow: 766 commits are reachable from HEAD.

## Departures from the design, and why

1. **A sequence still pending transmit is refused, not accepted with a warning.** The two critics disagreed. One
   said to keep accepting `pending`, because a sequence transmitted outside the platform is a real case. The other
   said only `sent` or `acknowledged` means the agency has it. This change follows the second. That is the
   platform's own "filed" rule, and P-40's wording follows it. A customer who transmitted outside the platform names
   the Vault version. The options list offers only filed sequences.
2. **`FILED_DISPATCH_STATUSES` lives in its own module** (`submission-service/filed-dispatch.ts`), not "next to
   `resendRefusal` in `submission-service.ts`". That way the commitment service and the database tests read the rule
   without importing the submission service's whole graph. `submission-service.ts` reads it from there, so there is
   still one list.
3. **The Vault FK is a plain key, not composite.** `vault.documents` has no `(id, organization_id)` unique index, and
   its `organization_id` is nullable. Instead, the BEFORE guard checks the organisation and the pinned sha256 when the
   version is named, which the critics offered as the alternative.
4. **The database tests are two files, not one,** plus a shared fixture. `commitment-fulfilment-evidence.dbtest.ts`
   covers the routes, and `commitment-fulfilment-database.dbtest.ts` covers what the database holds. Mutation 2
   depends on that separation. `red.txt` was taken while they were still one file of 39 cases. The 40 cases now
   are those 39, the role check repeated in the second file, and one case whose expectation changed after red. A
   project with no program was expected to answer an empty options list. Project admission refuses such a project
   first (404), and that refusal is now what the case asserts. Some red failures were the fixture's own SQL errors
   (`42P08`, and "inconsistent types deduced" in the purge case), not the missing feature. The fixture was fixed;
   `mutation-controls.txt` shows every selection passing on the final tree.
5. **A password sent for a meeting commitment is counted by the attempt limiter before the type is refused**
   (`SIGNATURE_NOT_TAKEN`). The critics allowed this if it is stated. The screen never sends one.
6. **No OQ step.** URS-PROJ-014 is verified by automated tests only. The credentialed OQ-PROJ step is owed, and
   VSR-001 §19 says so. Row D4 claims nothing for it.

## Gates

`gates.txt` holds every gate's output and exit code. All passed.

- **Typecheck.** `npm run -s typecheck`: 0 errors, exit 0 (`typecheck.txt`).
- **Every npm script in `.husky/pre-push`, in its order** (36, plus `scripts/ops/ledger-check.mjs`): exit 0. Also
  run, though the hook does not: `ci:migration-drop-safety:selftest`, which passed.
- **The extra gates:** exit 0.
  - `ci:purge-coverage`, with `DATABASE_URL`: 604 outside the purge reach, against a baseline of 612; 0 new.
  - `ci:launch-scope`: 7 apps, 33 surfaces.
  - `ci:launch-scope-api`: 416 paths, none refused.
  - `check:microcopy` and `check:compliance-claims`.
  - `ci:empty-state-honesty` and `ci:internals-in-copy`: no new occurrences.
  - `ci:check-chip-tones`.
  - `ci:check-phantom-tokens`: 9, the baseline.
  - `ci:token-cascade`: 43 stylesheets, including `vault-picker.css`.
  - `ci:validation-traceability`: URS-PROJ-014's citations resolve.
  - `ci:migration-prefix-collisions` and `ci:sql-interpolation:selftest`.
- **The migration-header rule** (`scripts/ci/require-migration-headers.sh`, its per-file rule): shown failing on the
  file with its eCTD block removed, then passing as written (`gate-migration-headers.txt`). The script itself diffs
  `base...HEAD`, so it sees the file only once it is committed.
- **The four push-range gates** (`ci:untracked-imports`, `ci:pushed-lint-errors`, `ci:pushed-lint-warnings`,
  `ci:pushed-typecheck`) check the commits a push carries. With nothing committed, they check nothing in the hook's
  form. `gates.txt` §C therefore runs each one over the change as it will be committed: a throwaway copy of the index
  with this slice added. The repository's own index, HEAD and refs were not touched.
  - **ESLint warning ratchet:** 36 changed files, new files counted from zero; no warning added.
  - **ESLint errors:** none.
  - **Untracked imports:** run in `--all` mode, which reports 21 findings that predate this change, identical in
    both runs. Against the real index it also lists the 8 imports of this slice's new files, which are still
    untracked. That is the gate catching what it exists for. With the slice added, those 8 are gone and nothing new
    appears.
  - **So the commit must add every new file `git status` lists, including
    `client/src/concept2cure/v2/styles/vault-picker.css`.**

## Review (2026-10-19)

Reviewers raised 26 findings on the uncommitted change. Two skeptics tried to refute each one: 25 survived both, and 1
(finding 4) survived one. The fixer re-checked each against the code. All 26 are real. Several are the same defect
seen through a different lens (1 and 5; 7 and 11; 3, 12 and 25; 8 and 23), so there are 21 distinct defects. Each
has a fix and a test that fails without it. Every fix was then removed, one at a time, on the final tree; each removal
was caught by its own test and restored byte for byte (`mutation-review-1` to `-33`). Each file records the same test
selection passing on the unmutated tree first, then failing with the mutation.

| # | Finding | Fix | Test | Shown failing without it |
|---|---|---|---|---|
| 1, 5 | An open PMR could be retyped to `other` and fulfilled, unsigned and naming nothing, in one UPDATE or in two. The COMMIT guard reads the type the row has at COMMIT. | The BEFORE guard fixes `commitment_type` on every row, not only on a terminal one. The migration is amended in place, with a dated note in its header (Rule 1). No code retypes a commitment. | `commitment-fulfilment-database.dbtest.ts` "an open PMR cannot be retyped out of its signature" | `mutation-review-1` |
| 2 | Four clauses of the COMMIT guard had never been seen to fail: the binding basis, the meaning, withdrawal, and "written by this transaction". | Nine forged-signature cases, each correct in every respect except one. Beside them, a control: the same forged row, fully correct, is accepted. A further case: a signature committed in an earlier transaction. | the same file, "the signature the COMMIT requires" | `-3` basis, `-4` meaning, `-5` revoked/voided, `-6` superseded, `-7` invalid, `-8` same transaction |
| 3, 12, 25 | Neither the signature dialog nor the row showed the sha256 the signature binds, or the version's project. This README said the dialog did. | A project's Vault search now returns `contentHash`, as the library search already did. The picker carries it (`pinnedSha256`). The picked line and the signature dialog name the version, its project on the organisation's door, and `sha256` plus its first 12 hex characters. The row shows the pinned sha256, with the full value on hover. A version with no recorded sha256 cannot be chosen. README "The change" is corrected. | `commitmentFulfilment.test.tsx`: "signs through the project's door"; "names the version's project and sha256"; "no recorded sha256"; the row case | `-14`, `-15` |
| 4 | A recorded fulfilment could be soft-deleted by an UPDATE. (Split finding.) | `deleted_at` joins the columns a recorded fulfilment fixes. The purge hard-deletes and no route soft-deletes, so this costs nothing. A hard DELETE is still not held, and URS-PROJ-014, P-40 and this README now say so. | database dbtest "not removed from the register by an UPDATE" | `-2` |
| 6 | The organisation door's program filter on the options list had no test. | DB cases: a member is not offered program Q's sequence, and nothing of it appears in the body. The signer is offered it. A commitment made under a submission is offered only that submission's sequences. | `commitment-fulfilment-evidence.dbtest.ts` | `-9`. The first attempt deleted the predicate, which left the statement's `$3` unused, so the run answered 500 instead of showing a leak. The predicate is now replaced by a tautology, and the leak shows. |
| 7, 11 | A list cut at 200 kept the oldest submissions, while the dialog said "the 200 most recent". | All three statements order by `s.id DESC`, newest first. | evidence dbtest: 230 + 3 filed sequences in two submissions, on both doors | `-10` (project), `-11` (organisation). The single-submission statement already kept the newest by sequence number, so it changed only for consistency. |
| 8, 23 | On a project's door, while the options read was loading or had failed, the Vault picker searched every accessible project. The server refuses those versions, but only after the signature dialog. | `vaultScopeOf`: on a project's door, the picker appears only once the project's program is read. Until then it says why. | client: "offers no other project's Vault"; "offers no Vault search until the project's program is read" | `-16` |
| 9 | Refusals given before the password spent the platform-wide signing budget, which every signed act shares. | `whenSigning` is removed from both doors. `spendSigningAttempt` runs after every refusal that needs no password, just before the ceremony. | `commitment-fulfil-route.test.ts`, with the real limiter: twelve refusals, then a signature that still goes through; ten wrong passwords, then a 429 | `-13` |
| 10 | An unsigned fulfilment reported success when the server answered 401. | `record()` reads the response. A 401 is a refusal, in the server's words. Any other unconfirmed answer is treated as unconfirmed. | client "a 401 is a refusal" | `-17` |
| 13 | A cleared date was sent as `''` and refused as "Use yyyy-mm-dd". | The date is sent only when it is set. The field says "Leave it empty to record today". A future date is refused inline. | client "an emptied date is not sent" | `-18` |
| 14 | The refusal toast printed a double full stop. | `refusalSentence` strips the server sentence's trailing full stop before adding its own. | client "one full stop" | `-19` |
| 15 | An options read the server refused (404, 409) showed "could not be read", and the dialog stayed submittable. | On 403, 404 or 409 the dialog shows the server's sentence and offers nothing. | client "the server's own refusal of the options" | `-20` |
| 16 | On the organisation's door, the empty-list sentence said "the submissions you can open" when the list was limited to the commitment's own submission. | The options body carries `commitment.submission`, named only to a reader who can open its program (`{readable:false}` otherwise). The sentence names it, or says it is in a project the reader cannot open. | evidence dbtest "made under a submission"; client "names the submission" | `-12` (server: named only if openable), `-21` (client) |
| 17 | After the nested signature dialog, focus was lost to the page. While the signature dialog opened, focus briefly sat on the row behind both dialogs. | `useFulfilFocus` takes the opener once. Focus stays on Sign while the signature dialog opens, returns to Sign when it closes, and returns to the opener when this dialog closes. | client "focus: …" | `-22` (the opener), `-23` (whole effect: focus goes to the row behind), `-32` (return to Sign only) |
| 18 | Choosing or removing a Vault version dropped focus to the page. | Focus moves to Remove once a version is chosen, and back to the search when it is removed. The choice is announced (`role="status"`). | client "focus: …" | `-24` |
| 19 | A network failure showed the browser's raw error in the signing dialog, and "Nothing was stored" on the unsigned path. | No answer, or an answer that confirms nothing, reads "could not be confirmed". The register is reloaded. "Nothing was stored" is said only after a refusal the server returned. | client: "no answer at all…"; "a signature with no answer…" | `-25`, `-26` |
| 20 | The signature time on the row was rendered with `toLocaleString`. | `GovernedTimestamp` (UTC first, then local time with its zone). The row's own `when()` is deleted. | client row case | `-27` |
| 21 | The row tag and the AnA prompt showed the raw type code (`MEETING_COMMITMENT`). | `typeName` on the tag. The prompt uses the type's name inside a sentence ("this meeting commitment"). | client row case | `-28`, `-29` |
| 22 | URS-PROJ-014 had no RA-001 row, so the matrix builder reported it. VSR-001 §19 and this README described a TM-001 row that does not exist. | RA-001 v0.22 adds the row and a change-log entry. VSR-001 §19 and the Owed list now say TM-001 has not been regenerated. | the matrix builder, run to the scratchpad | `-33` (with the row: 24 problems, all URS-CMC; without it: 25) |
| 24 | Zero duplication: a third client guard for a project's Vault search. This README also said "One Vault version picker". | `isVaultSearchShape` moved from `Vault.tsx` into `VaultLibraryResults.tsx`, and both the find view and the picker use it. `ProgramSearchHit` and `isProgramSearchShape` are deleted; both were new in this uncommitted change. The README is corrected, and `VaultRelationships` AddForm and the editor's `readPage` are listed as owed. | client "with the Vault find view's own guard" | `-30` (a stricter copy of the guard rejects a hit the find view lists) |
| 26 | The picker showed the first 25 matches as if they were all of them. | "Showing N of M matches. Refine the search to find one not listed." | client "says how many matched" | `-31` |

**Not done, and why** (also under [Owed](#owed)):

- **A hard DELETE by the runtime role** is still not refused (finding 4's second skeptic). It needs a purge door.
- **`when()` in `AgencyResponses.tsx`** still uses `toLocaleString` (finding 20). That surface is outside this change, and its tests pin its sentences.
- **`VaultRelationships` AddForm and `editor/projectVaultSearch.ts`** (finding 24) still read the Vault search their own way. The finding allowed listing them as owed.

**Removed in the review.** `whenSigning`, and `ProgramSearchHit` / `isProgramSearchShape`, were added by this uncommitted change and never shipped. The guard in `Vault.tsx` moved; it was not deleted. Its replacement is `isVaultSearchShape` in `VaultLibraryResults.tsx`, and `vaultSurface.test.tsx` (in the sweep) proves it is still reached. No user-facing capability was removed.

**Re-run after the fixes, on the final tree.**

| Run | Result | File |
|---|---|---|
| DB: `commitment-fulfilment-evidence` (31), `commitment-fulfilment-database` (25), `agency-response-signed-approval` (39) | **95 / 95** | `green-review.txt` §1 |
| DB: tenant purge, purge audit, purge artifact records, QMS signature guard | 30 / 31. The one failure is the same as before the review, identical on trunk. | `green-review.txt` §2 |
| Unit, route and client: the build's 21 files, its 95-file sweep, every client suite that imports a surface the review changed, and the two Vault search route suites (136 files), with the database URLs set | 1751 passed, 18 failed. All 18 are in three files that fail the same way on trunk: the two report-os suites of `green.txt` §4 (17 failures here, since one more case runs with a database URL set), and `freeze-gate-row-lock.pg.test.ts` (1; it skips without a database URL, which is why `green.txt`'s sweep did not show it) | `green-review.txt` §3, §4a |
| Five client files that fail outside this change | 34 failed / 200 passed, both here and on a `git archive` export of HEAD. None of them imports a file this change touches. | `green-review.txt` §4b |
| `deploy-migrate` twice on the amended file | Both runs exit 0. The installed guard fixes the type on every row and fixes `deleted_at` once a fulfilment is recorded. Three triggers, enabled. Forced RLS. | `migration-replay-review.txt` |
| Migration-header rule | The eCTD block is still within the file's first 40 lines | (per-file rule, as in `gate-migration-headers.txt`) |
| Typecheck | 0 errors, exit 0 | `green-review.txt` §5 |
| Gates: every npm script in `.husky/pre-push`, the slice's extra gates, and the push-range gates over the change | All exit 0. The exception is `untracked-imports --all`, which reports the same 21 findings that predate this change (1 untracked, 20 unresolved), both with and without this slice. The ESLint warning ratchet first caught 5 warnings the fixes had added (complexity and length). They were fixed, and on the final run it reports no warning added. | `gates-review.txt`, `gates-review-ratchet-first-run.txt` |

## Owed

- **D4.** A credentialed OQ-PROJ step that signs a fulfilment and recomputes the bound digest from the stored record
  (the OQ-006 QMS pattern). TM-001 has not been regenerated: the committed matrix (2026-10-01) has no URS-PROJ-014
  row, and the builder still stops on the 24 URS-CMC rows without an RA-001 row, as it did before this change. Once
  regenerated, URS-PROJ-014 reads "uncovered" until the OQ step executes (VSR-001 §19). RA-001 v0.22 has its row.
- **A DELETE guard on a recorded fulfilment.** It needs a purge door to go with it, because the tenant purge runs as
  the runtime role.
- **Correcting a fulfilment signed in error,** by §11.70 supersession or a reopen. `regulatory-commitment` is not a
  revocable target in `server/routes/c2c/actions.ts`, and the write-once guard freezes the row.
- **Retention.** Vault versions named as fulfilment evidence are not yet excluded from retention disposal
  (`server/jobs/retentionCron.ts`). If one is disposed, the row says "removed from the Vault"; the pinned sha256 and
  the signature remain.
- **The annotations lock.** `vault-annotations-core.ts` keeps its own `lockVersion`: it is program-scoped, reads the
  anchor columns, and does no reconciliation check. Folding it into `vault-version-lock.ts` is owed.
- **The remaining copies of the filed list,** in `server/services/ectd/prior-sequence-loader.ts` and
  `server/routes/c2c/documents.ts`. The latter's `DISPATCHED_DISPATCH_STATUSES` also differs. Both should read
  `filed-dispatch.ts`.
- **`governedMutation` in `server/routes/ha-interactions.ts`.** It is a third copy of the governed-write
  transaction, still used by the organisation's other writes, and should fold onto `governedRequestWrite`.
- **The AnA capability manifest.** A full `npm run manifest:ana` regeneration produced large drift unrelated to this
  slice. Only this tool's line was changed by hand; the full regeneration is owed to its owner.
- **Milestones.** A milestone's "met" is the next commitments slice. It reuses `resolveFulfilmentEvidenceTx`.
- **`printedSigner`** in `AgencyResponses.tsx` still duplicates `esignSignerOf`, as before this change.
- **`when()` in `AgencyResponses.tsx`** renders signature and history times with `toLocaleString`, as before this
  change. The commitment row no longer has its copy (it renders through `GovernedTimestamp`); the agency response
  surface should move too.
- **The other Vault pickers.** `VaultRelationships.tsx` AddForm runs its own library search and choice of a version;
  `editor/projectVaultSearch.ts` `readPage` reads a project's search with its own checks. Both should read through
  `VaultLibraryResults.tsx` (`VaultVersionPicker`, `isVaultSearchShape`).
