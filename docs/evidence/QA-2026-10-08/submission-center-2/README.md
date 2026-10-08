# Submission Center, second pass: P-23, the P-14 remedy, protocol signing authority, FILING_SPINE F13

Follow-ups from the QA walk of 2026-10-08 (`../submission-center/`, `0e50993c5`; `../qms/`, `cf950eeb9`). This
moves row D2 (the filing spine) and the transmit half of D7. Decisions P-14 and P-23 are in
`docs/LAUNCH_DEFINITION_OF_DONE.md`, and slice F13 is in `docs/design/FILING_SPINE.md` §7.2.

Every new or changed test was run red against an export of HEAD `6c58f587b` (the working tree is shared, so it
was never stashed), then green against this change:

| | Red on HEAD's sources | Green |
|---|---|---|
| All new and changed tests | 33 of mine fail ([`red/all-new-and-changed-tests-on-HEAD-sources.txt`](red/all-new-and-changed-tests-on-HEAD-sources.txt)); the 34th is another session's authenticator case | 131 / 131 ([`green/all-new-and-changed-tests.txt`](green/all-new-and-changed-tests.txt)) |
| Item 1 before the fix, in the working tree | 4 fail ([`red/item1-p23-before-fix-working-tree.txt`](red/item1-p23-before-fix-working-tree.txt)) | in the row above |

Some cases are guards that pass on both trees, and that is intended: a signature someone else names is not
voided; an anchored submission offers no anchor control; an unknown region is still refused.

## 1. P-23: a signature serves only the act it was given for

**Cause.** Gate 1's single-use check (`governedSignatureVerdict`, `server/services/submission-service/submission-service.ts`)
treated a signature as spent only when the audit row of a performed freeze, dispatch or transmit named it
(`SEQUENCE_FROZEN`, `SEQUENCE_DISPATCHED`, `ECTD_TRANSMITTED`). A refused step writes no such row. So the QA
signature `act_772cf9fa…` (a freeze of `ectd-sequence:6` refused at its gate) stayed able to freeze that
sequence once the gate cleared. A transmit that sent nothing (`transmitted: false, gateway_not_configured`)
also left its signature able to send later, once credentials existed. Separately, transmit did not compare the
typed application number with the program's record, which the eCTD export already does
(`assemble-from-core.ts exportApplicationId`, answered 409 `APPLICATION_NUMBER_MISMATCH`).

**Where signatures are consumed** (checked):
- `POST /api/c2c/actions/sign` (`routes/c2c/actions.ts`) records the `sign` act and its electronic_signatures row. Nothing is consumed there.
- Consumption happens at the step: `freezeSequence`, `dispatchSequence` and `transmitSequence` (Gate 1).
- The package spine's `executeGovernedTransmit` (`submission-gateways/governed-transmit.ts`) persists its signature only after the gateway accepts the bytes. A refused attempt there leaves no signature, so it needed no change.

**Fix.**
- `server/services/part11/signature-persistence.ts` (owns the withdrawal vocabulary):
  - It gains `VOIDED_VERIFICATION_STATUS = 'voided'`, which `isSignatureWithdrawn` reads.
  - It gains `voidSignatureForRefusedAct`, one compare-and-set UPDATE of the Verification column group (`is_valid`, `verification_status`, `verification_date`). The revocation touches the same group. The rest of the row is left exactly as signed: signer, hash, manifest and binding (§11.70).
- `submission-service.ts`:
  - `voidRefusedStepSignature` and `voidingSignatureOnRefusal` wrap `freezeSequence`, `dispatchSequence` and `transmitSequence`. A refusal voids the signature it was given, and the refusal says so: "The signature given for this freeze is now void; sign again for a new attempt."
  - A transmit that sends nothing voids too, and answers `signatureVoided: true`.
  - What is voided: only the caller's own executed `sign` on this sequence that declares this step. A colleague's signature named by someone else is refused by Gate 1 and left alone.
  - What is not voided: a signature a performed step already spent, or one that is already void. Nothing is voided once the package may have reached the gateway: only a guard refusal before the wire (`refusedBeforeWire`) voids.
  - Two independent records: the signature row, and a chained `GOVERNED_SIGNATURE_VOIDED` audit row naming the signature, the step and the refusal. Gate 1 refuses on either one (`signatureSpentBy` reads the ledger), so the void survives the loss of either write.
  - The request's own shape (an environment, a usable application number) is checked before anything is read. A malformed request is not a refused act and voids nothing.
- Application number:
  - `transmitApplicationNumberRefusal` applies the export's rule: a usable identifier (`REGULATORY_IDENTIFIER_PATTERN`), and 409 `APPLICATION_NUMBER_MISMATCH` when it contradicts the recorded number.
  - It runs in transmit, and in `governed-precheck` (new `applicationId` field), which the Dispatch tab asks before the signature is taken.
- `sequence-release-signature.ts`: a voided dispatch signature reads "superseded, revoked or voided".
- Client (`SubmissionCenter.tsx`): the pre-sign check sends the typed number, and "Not transmitted" says when the signature given for it is void.

**Red → green.**
- `refused-step-voids-signature.pglite.test.ts` (new): 4 red, 1 guard → 5 green. It proves:
  - a refused freeze leaves its signature unusable once the gate clears, and a fresh signature then freezes;
  - the same holds for a transmit with no credentials, then with credentials;
  - a contradicting number is refused 409, both at transmit and in the precheck;
  - someone else's signature is not voided.
- `transmit-refusals.test.ts`: +1 (a slash-form number). It was red on HEAD: that number reached the database read.
- `submissionCenterLifecycleQa.test.tsx`: +2.

## 2. P-14's remedy: anchor an existing submission to its project

**Cause.** Nothing wrote `submissions.program_id` after creation, and the `UNANCHORED_SUBMISSION` refusal named no
screen.

**Model, checked first.** A project holds several submissions, one per market:
- `listSubmissions` scopes by `program_id`;
- FILING_SPINE has one market row per submission;
- `submissions_program_idx` is not unique.

So "a program not already anchored to a different submission" is not a rule of this model. These rules apply instead (`anchorSubmissionToProgram`):
- 404 when the submission or the project is not a live record of the caller's organisation (`programInOrganization`).
- 403 unless the caller leads the project or manages the organisation (`canMutateProgram`). The role is read from the membership row.
- 409 `INVALID_STATE` when the submission already has a project. A filing is not moved between projects here.
- 409 `CROSS_PROJECT` when it already files another project's document (placed before P-14 refused that). The refusal names the sequences and sections.
- The UPDATE is a compare-and-set on `program_id IS NULL`, and it commits together with a chained `SUBMISSION_PROGRAM_ANCHORED` audit row carrying the reason.

**Fix.**
- Route: `POST /api/submissions/:id/program-anchor {programId, reason}` (`server/routes/submissions.ts`). It requires the reason through `requireGovernedReason`.
- Client: `SubmissionProgramAnchor.tsx` sits under the submission header when the server records no project. The project select starts on "Not stated — choose" (P-21), a reason is required, and the answer is shown in the server's words.
- The refusal now reads: "…so anchor the submission first: in Submission Center, open this submission and choose “Anchor to a project”. Nothing was placed."

**Red → green.**
- `submission-program-anchor.pglite.test.ts`: 7 red → 7 green.
- `submissions-program-anchor.test.ts` (route): 4 red → 4 green.
- `submissionProgramAnchor.test.tsx`: 3 red and 1 guard → 4 green.
- `leaf-cross-project.pglite.test.ts`: unchanged and green.

## 3. Protocol signing ceremony: signing authority before the password

**Cause.** `signGovernedAct` (`server/services/part11/governed-signature-ceremony.ts`), which protocol finalization and
review dispositions run, had only two gates: the route's writer gate and the RBAC gate dark-launched behind
`GOVERNANCE_RBAC_ENFORCE`. So a member's password made a protocol signature. The PGlite suite even had a user of
another organisation sign ORG's protocol as "someone independent".

**Fix.**
- `assertSigningAuthority` runs before the RBAC gate and before `verifyReauth`. It applies the platform's one policy: `isSigningAuthorized`, on the role from the membership row (`resolveSignerOrgRole`), as `signingAuthorityRefusal` does in `actions.ts`.
- A role without authority gets 403 `ESIGNATURE_NO_AUTHORITY`. A lookup that cannot run gets 503 `SIGNING_AUTHORITY_UNVERIFIED`, with the cause logged and never shown.
- Report finalize uses the same ceremony. It already checked authority itself; the ceremony is now the floor.
- Another session's uncommitted hunks in that file (`AUTHENTICATOR_REQUIRED`) were kept.

**Red → green.**
- `protocol-signatures.routes.test.ts`: +4.
- `protocol-signature.pglite.integration.test.ts`: +2. Its signers hold P-18 roles now, and an approver replaces the non-member.
- `protocol-signature-manifestation.pglite.integration.test.ts`: the signers' roles only.
- 6 red → green.
- `ci:sign-ceremony`: green, 20 baselined sites, unchanged.

## 4. FILING_SPINE F13: transmissions and acknowledgements in the Dispatch tab

**Route, verified.** `GET /api/mdx/gateways/transmittals` (`server/routes/mdx-submission-gateway.ts`):
- It takes `program_id` (uuid), `region`, `status` and `limit`.
- It answers `{data, meta.count}`, with `status`, `transmission_id`, `ack_received_at`, `submitted_by_name` and `metadata` per row.
- A sequence transmit records `metadata.sequence`, the sequence NUMBER, not its id. So the list says it is filtered by project and region, and it marks this sequence's rows.

**Defect found while verifying.** The region filter took only the four regions of the package-transmit route
(fda, ema, pmda, ca). `transmitSequence` routes to every registered gateway, so a UK sequence's list would have
been a 422 on every read. The filter now takes any region a registered gateway serves (`listGateways()`).

**Fix.**
- `DossierTransmissions` in the Dispatch tab (`SubmissionSeqWorkspaces.tsx`) shows each transmission with:
  - status (its tone from the one `transmittalStatusTone`, moved to `gatewayLabels.ts` so both lists agree);
  - the transmittal id and the gateway's reference;
  - the acknowledgement time, or "not acknowledged";
  - the sender, and the environment.
- The region comes from the server's transmit route, never from a client-side map.
- A failed or misshapen read is an error, never "none sent". A submission with no project says it cannot be listed by project, and reads nothing.
- `SubLike` carries `programId`.

**Red → green.**
- `dossierTransmissions.test.tsx`: 5 red → 5 green.
- `mdx-submission-gateway-transmittals-region.test.ts`: 1 red and 1 guard → 2 green.

**F0.** `tests/ui/filing-path-reachability.baseline.json` holds no F13 hop. Its five entries are F7, F4, F10, F15
and F3, so nothing was removed. The gate is green.

## Verification

- **New and changed tests:** 131 / 131 (above).
- **Wider run** ([`checks/related-suites.txt`](checks/related-suites.txt)): every touched suite and every suite that drives the touched code, all golden journeys, `tests/lineage` and the F0 gate. 269 files and 3332 tests pass, with 1 file (2 tests) skipped. RLS_ENFORCE=off.
- **DB tier** ([`checks/db-tier.txt`](checks/db-tier.txt)): 66 submission, eCTD and signature `*.dbtest.ts` files against a fresh CI-shaped database with RLS on. 66 files and 774 tests pass on the final tree. No migration was added, so deploy-migrate was not run.
  - An earlier run failed one sign-in case, from another session's in-progress change; it passes now.
  - Real-Postgres `freeze-gate-row-lock.pg.test.ts` case 2 fails, identically on HEAD's sources with RLS on and off, so it predates this change.
- **Gates** ([`checks/gates.txt`](checks/gates.txt)): `ci:sign-ceremony`, `ci:undefined-css-classes` and `ci:untracked-imports` are green, as are seven related gates.
  - `ci:untracked-imports` reads pushed commits, so it did not see this uncommitted work. Run with `--all`, it names `SubmissionProgramAnchor.tsx`, which the commit must add.
  - `ci:tenant-entry-points` is red on `server/routes/mdx-admin.ts`. That file is untouched here, and its last change was `ddc8c0db5`.
- **Scoped tsc** ([`checks/tsc-scoped.txt`](checks/tsc-scoped.txt)): no errors in the 25 changed files.
- **ESLint** ([`checks/lint-table.txt`](checks/lint-table.txt)): no file has more warnings than at HEAD, and every new file has 0.

## Not verified

- No browser walk: the running QA app was not restarted on this change.
- The void and the anchor are proven on PGlite and with mocked routes. No `*.dbtest.ts` drives them against real Postgres with RLS on.
- `executeGovernedTransmit` (the package spine) and AnA's transmit tool were read, not tested here. The first records its signature only after a send.

