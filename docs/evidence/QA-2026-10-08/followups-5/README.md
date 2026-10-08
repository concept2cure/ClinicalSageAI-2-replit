# QA 2026-10-08 — follow-ups from the second Submission Center and IND/reporting passes (fifth pass)

Decisions applied as written in `docs/LAUNCH_DEFINITION_OF_DONE.md`, "Follow-up decisions from the second Submission
Center and IND/reporting passes" (from `d5176f241` and `aac603a1b`; the report-finalize item also follows `505f71263`).
Four of the eight are in this pass: **Form 356h**, **Protocol reviewers**, **Report finalize**, **Pack copy**. Not in
this pass, by instruction: registers as compliance reports (it needs a design). Launch-catalog surfaces only
(Submission Readiness, the protocol workspace under Authoring, Reporting & analytics). Row moved: **D2** (the launch
catalog does what it says). No surface, module, engine or migration is added.

Method, per item: a test that fails on HEAD's code, then the fix, then the same test green. **Red** is every new or
changed test run against HEAD's version of each source file this change touches, served by
`red/vitest.head.unit.config.ts.txt` and `red/vitest.head.db.config.ts.txt` (`git show HEAD:<path>`), so the shared
working tree, which three other workers were editing, was never swapped. **Green** is the same test files on this
change. Unit and PGlite runs used `RLS_ENFORCE=off` (a local, ignored `.env` turns it on; CI has none). The DB tier
ran on the fresh database `concept2cure-ri_qa_fresh2` with `RLS_ENFORCE=on`, as the runtime role (not the owner, not
BYPASSRLS; each DB suite asserts it).

| # | Decision | Red on HEAD → green | Status |
|---|---|---|---|
| 1 | Form 356h: a continuing NDA, BLA or ANDA sequence is held to 1.1 | 4 → 0 (1 pure, 3 through the DB-bound assessor) | done |
| 2 | Protocol reviewers: assigned only if they hold signing authority | 9 → 0 (4 PGlite, 2 client, 3 DB tier) | done |
| 3 | Report finalize: one authority check, the ceremony's floor | 7 → 0 (6 route, 1 DB tier) | done |
| 4 | Pack copy: a pack's description names only the reports it computes | 7 → 0 (one per segment) | done |

Totals: `red/unit-tests-against-HEAD-sources.txt` **23 failed / 172** (6 of 11 files), `red/db-tests-against-HEAD-sources-fresh-db.txt`
**4 failed / 25**. `green/unit-new-and-changed-tests.txt` **172 / 172** (11 files), `green/db-tier-fresh-db.txt`
**163 / 163** (10 DB suites).

## 1. Form 356h — a continuing NDA, BLA or ANDA sequence carries its application form

Cause: `server/services/ectd/assess-dispatch-readiness.ts` (HEAD, `readinessOptionsForSequence`). `aac603a1b` held a
continuing **IND** sequence to 1.1 (Form FDA 1571) and left every other continuing sequence at `{}`, so an NDA, BLA or
ANDA amendment or supplement with no Form FDA 356h drew no MISSING_REQUIRED_SECTION finding and cleared the structural
gate (the other gates still applied).

Fix:
- One table, `US_CONTINUING_FORM`, names the form each US kind's continuing sequence carries: IND, Form FDA 1571
  (21 CFR 312); NDA and ANDA, Form FDA 356h (21 CFR 314); BLA, Form FDA 356h (21 CFR 601). A continuing sequence of
  those kinds gets `requiredByRegulation: { codes: ['1.1'] }`, an error, and nothing else of the original's Module 1
  list. The basis reads, for an NDA: "Every submission to an NDA carries a Form FDA 356h (21 CFR 314), filed under 1.1
  (Forms), so this sequence cannot be validated, frozen or dispatched without it." The IND sentence is unchanged.
- Originals are unchanged (held to the kind's whole list, which includes 1.1). EU and JP continuing sequences are
  unchanged.
- No fixture needed amending, unlike `aac603a1b`'s withdrawal-approval-binding amendments. The journeys that assess
  an NDA's sequence (`drug-nda-ectd.journey`, the founder path's filing hops in `tests/lineage`) build the original
  0000, which was already held to 1.1, and no other fixture assesses a continuing NDA, BLA or ANDA sequence. The runs
  below are the proof: every golden journey, `tests/lineage` and the ectd, submission-service and submission-gateway
  suites are green. The new assessor case below is the first to exercise a continuing one.

Tests:
- `assess-dispatch-readiness.gates.test.ts`: "a continuing NDA, BLA or ANDA sequence is held to its 1.1 form (Form FDA
  356h), as an error, and to nothing else" replaces "a continuing marketing-application sequence is still not held to
  a Module 1 list"; an EU variation and a JP amendment stay unheld.
- `assess-dispatch-readiness.vault-leaf.pglite.test.ts`: through `assessSequenceDispatchReadiness`, from the
  application type the submission row records (`nda`, `BLA`, `anda`): a supplement with its cover letter and no 356h
  is one error on 1.1 and one validation blocker; with the 356h filed under 1.1 nothing is missing.

## 2. Protocol reviewers — a review is assigned only to someone who can sign it

Cause: `server/services/protocol-reviews/protocol-reviews-service.ts` (HEAD, `assignReviewerTx`). An account-bound
reviewer was checked against `GOVERNED_WRITE_ROLES` (admin, manager, member, approver, reviewer, …). The disposition is
a signature, and since `505f71263` its ceremony refuses a role without signing authority (`assertSigningAuthority`:
`isSigningAuthorized` on the membership-row role; by default admin, approver, reviewer). So a member or a manager was
assigned, and then refused at signing with 403 ESIGNATURE_NO_AUTHORITY. Only the assigned account may sign an
account-bound review and nothing reassigns one, so that review could never complete. Reproduced on the fresh database
(red file): a member's and a manager's assignment answered 201.

Fix:
- `assertReviewerCanSign` reads the reviewer's role exactly as the ceremony does, `resolveSignerOrgRole`, and holds it
  to `isSigningAuthorized`. Not a member: 400, as before. A role without authority: **409 REVIEWER_CANNOT_SIGN**, "That
  reviewer's role (member) does not permit signing, so they could not sign this review's disposition. Assign someone
  who can sign, or name a reviewer who has no account here. Nothing was recorded." It is decided before the insert and
  before the governed-action row, both of which follow it in the same transaction (the route and the AnA tool
  `assign_protocol_reviewer` share `assignReviewerTx`). The route maps the code to 409.
- The picker: the request-a-review drawer's account select (`ProtocolDevForms.tsx`, fed by `listReviewerCandidates` in
  `ProtocolDevWrites.ts`) left out viewers only. `GET /api/tenant-users/:tenantId` now marks each member `canSign`
  (`isSigningAuthorized` on the membership role, so the client keeps no role list of its own), and the picker offers
  only rows marked `canSign: true`. A row with no mark is not offered. With no signer, it offers "No account here" and
  says "No member of this organization can sign a review, so name the reviewer below".

Tests:
- `protocol-signature.pglite.integration.test.ts`: a member and a manager are refused with 409 and the sentence, with
  no assignment row; a property case holds that each role is assignable exactly when `isSigningAuthorized` admits it;
  a viewer is now REVIEWER_CANNOT_SIGN. The fixture's REVIEWER holds the reviewer role.
- `reviewer-name-binding.pglite.integration.test.ts`: fixture only. Its reviewers hold signing roles, and the role is
  read through `resolveSignerOrgRole`, mocked onto the PGlite row as the signature suite already does.
- `tests/db/protocol-reviewer-signing-authority.dbtest.ts` (new, lane `dbprv`, org 93270): over HTTP with the production
  auth gate, on the fresh database with RLS on. A member and a manager get 409 and the exact body, and no assignment or
  ledger row is written. The member list marks `canSign` as the assignment judges it. A reviewer is assigned (201) and
  then signs the disposition with the real ceremony (201): the assignment status is completed and one
  `electronic_signatures` row carries meaning `review`.
- `protocolReviewerPickerSigners.test.tsx` (new): the picker offers exactly the `canSign` rows (not a manager, a
  member or an unmarked row), and with no signer it says so. The existing picker tests' fixtures carry `canSign`.

## 3. Report finalize — one authority check, the ceremony's floor

Cause: `server/routes/report-os.ts` (HEAD). `POST /runs/:id/finalize` ran its own `hasSigningAuthority`
(`resolveSignerOrgRole` + `isSigningAuthorized`) before reading the run, and `signGovernedAct` then ran the ceremony's
`assertSigningAuthority`, the same check again. That meant two membership reads, two copies of the rule and two
sentences.

Fix: the route's copy is removed (the function, its call and two imports). The finalize tier gate
(`requireRole(...REPORT_FINALIZE_ROLES)`) is unchanged, so a member or a viewer is still refused before anything is
read. A finalize-tier role without signing authority now reaches the ceremony and is refused there:
- 403 ESIGNATURE_NO_AUTHORITY, "Your role does not permit applying an electronic signature (21 CFR Part 11
  §11.10(g)). Nothing was signed.";
- one membership read, before any password is compared or any transaction opened;
- an unreadable membership is the ceremony's 503 SIGNING_AUTHORITY_UNVERIFIED (it was a 500).

The run and its type are now read before the refusal.

Tests (kept, and pointed through the ceremony): `report-os-finalize-signature.test.ts`:
- owner and manager under the default policy, a viewer membership under an admin token, and no membership are each
  refused with the ceremony's exact body;
- `resolveSignerOrgRole` is called once, no password is compared, and no statement runs;
- the unreadable membership case is 503;
- an authorised finalize looks the role up once.

`report-os-registry-seed.dbtest.ts` asserts the ceremony's exact body for the manager on the fresh database.
`insightsFinalizeSigned.test.tsx`'s server-payload fixture now carries the ceremony's sentence (the client shows the
server's sentence either way).

## 4. Pack copy — a pack's description names only the reports it computes

Cause: `client/src/concept2cure/v2/surfaces/Insights.tsx` (HEAD, `RO_PRESETS`). Each pack's `why` was written for all
its members. `aac603a1b` made `roPresetsForSeg` keep only runnable members and kept the copy. Examples on HEAD:
- The pre-approval pack held the readiness digest alone and promised "safety-signal alignment and the audit assurance".
- The BLA assembly pack held the digest and the FCOI register and described closing "the evidence … gaps" its
  engine-less trace was for.
- The 510(k) and IVD packs held the inspection pack alone and described the equivalence matrix.
- The portfolio pack named audit assurance.
- The research-administration pack named COI, which it does not hold.

Fix: a pack is defined by a `purpose` that names no report ("For the run-up to an action date.").
`roPresetsForSeg` writes the description from that purpose and the catalog labels of the members it keeps: "For
closing gaps before a BLA is filed. It holds the Executive Readiness Digest and the Financial Disclosure Register (21
CFR 54)." The description therefore names exactly the reports the pack computes, and follows the server's `runnable`
flag rather than a copy that can drift from it. The preset button, the opener and the pack header all read it.

Tests: `insightsReportsRunWhatTheyName.test.tsx`, "1b", rendered for a pharma, biologic, device, IVD, CRO, academic
and health-system catalog. Each pack offered is opened, and its description must:
- equal the button's;
- contain every tile title the pack shows;
- once those titles are removed, contain no word that names a report in this catalog (digest, register, matrix, trace,
  audit, assurance, signal, equivalence, inspection, eTMF, scorecard, IRB, IACUC, COI, …).

`insightsHonestCopy.test.ts` (no preset claims a filing state) is unchanged and green.

## Runs

- `red/unit-tests-against-HEAD-sources.txt`, `red/db-tests-against-HEAD-sources-fresh-db.txt`: the new and changed
  tests on HEAD's sources (above).
- `green/unit-new-and-changed-tests.txt`, `green/db-tier-fresh-db.txt`: the same, on this change. The DB tier adds
  the report-os, membership, users-RLS, domain-sign-ceremony, two-tenant RLS and signer-authenticator suites.
- `green/related-suites.txt`: the affected and neighbouring suites (ectd, submission-service, submission-gateways, ind-lifecycle, tests/regulatory, protocol-development, protocol-reviews, part11, report-os, the protocol, report-os, tenant-users and insights route suites, session permissions, and the client insights, protocol, dispatch and submission suites): **397 files passed, 1 skipped; 5,308 tests passed, 2 skipped, 0 failed**.
- `green/golden-journeys-and-lineage.txt`: every golden journey and `tests/lineage` (the founder path): **12 / 12 files, 37 / 37 tests**.
- `gates.txt`: `ci:sign-ceremony` (20 baselined sites, exactly as baselined), `ci:undefined-css-classes` and
  `ci:untracked-imports` green. The last reads committed changes only, so it is also run with `--all`. Every
  untracked import it reports is in another worker's in-flight files; none is in this change.
- `tsc.txt`: a scoped tsc over the TypeScript files this change touches. It reports no diagnostic in them, and it was
  made to fail on a planted misuse of this change's `ProtocolReviewError` code union.
- `lint.txt`: ESLint errors/warnings per changed file, HEAD against now. Every file is equal (rule-and-message sets
  compared too); the two new files are clean.

No harness script was written for this pass, so nothing imports `rate-limits/scripts/lib.mjs`. The HEAD-sources
vitest configs are recorded as `.txt` and import only the repo's own configs.

## Observed, not changed

- `insightsReportsRunWhatTheyName.test.tsx` "a pack lists only the types an engine computes": its click on the
  opener's preset button is sometimes lost while the canvas settles after its first read. It failed in 1 of 5
  isolated runs at HEAD (HEAD test and HEAD sources), and in about 1 in 4 on this change. The new "1b" cases re-open
  the pack until it stays open, so they assert the description, not the first click; 8 of 8 isolated runs were green.
  The existing case is left as it is.

## Not verified

- The whole repository suite. Only the suites listed in `green/` were run.
- The picker in a real browser (jsdom only), and the AnA tool path's 409 by its own test. The tool calls the same
  `assignReviewerTx`, and its refusal reaches AnA as the error text.
- An `ESIGNATURE_SIGNING_ROLES` override with the picker. `canSign` is computed server-side from the same policy
  function, but no test sets the override for the list.
- A full (unscoped) `tsc`.

## Decisions needed

- **Assignments already made to members without signing authority.** They cannot be signed, and nothing reassigns or
  withdraws an account-bound review. Should they be listed, withdrawn, or reassignable?
- **A reviewer whose role is lowered after assignment** still ends at the ceremony's 403. Same question.
- **409 rather than 403** for REVIEWER_CANNOT_SIGN. The caller may assign; it is the named account's role that
  conflicts with the assignment.
- **Finalize order.** A finalize-tier role without authority (a manager, under the default policy) now learns whether
  the run exists, is final or is eligible before the 403. They can read the organisation's runs anyway.
- **Pack copy is composed from catalog labels**, so it is longer than the hand-written copy. Hand-written copy per
  runnable set would need a table that can drift.
- **The 356h basis cites the CFR at part level** (21 CFR 314; 21 CFR 601), as the IND sentence cites 21 CFR 312. This
  is for regulatory review if section-level citations are wanted.
