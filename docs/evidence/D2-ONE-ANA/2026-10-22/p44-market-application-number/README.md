# P-44: a package carries its own market's application number (2026-10-22)

Rows: D2 (one filing spine across markets) and D7 (a package that names what it is). Decision P-44, `docs/LAUNCH_DEFINITION_OF_DONE.md`, taken under the founder's delegation of 2026-10-22.

## What already exists

Inventory at head, searched by every name the capability could have: procedure number, product number, agency reference, tracking number, `application_number`, deleted code.

- **One number per project.** `regulatory_programs.application_number` (`shared/schema/programs.ts`, `migrations/20260907_…`) is the only number any spine package reads. It is recorded through `PUT /api/ind-forms/program-facts` (`IndApplicantIdentity.tsx`, the MR-10 Stage 4 identity lane), with a reason and a lead-or-manager gate.
- **The readers.** `readRecordedPackageIdentity` (by project) and `readSubmissionPackageIdentity` (by submission) are in `server/services/ectd/package-identity.ts`. Both resolved to the project's number.
  - The signature binding, signed-manifest coverage and orchestrator runs already used the submission reader.
  - Export (`assemble-from-core.ts`) and transmit, with its readiness view (`submission-service.ts`), read by project although they held a submission.
- **The packagers write the number verbatim.** EU writes it into `<procedure-number>`, JP into `<application-number>`, CA into `<dossier-id>` (`regional-packager.ts`).
- **AnA.** `package_ectd_for_region` read the project's number for any region asked.
- **No per-submission store.** None of `submissions`, `submission_regions` or `ectd_sequences` has a number column. Other numbers exist outside the spine and feed no spine packager:
  - `c2c_submission_packages.metadata.regulatory`;
  - `submission_orchestrator_runs.application_number`;
  - `ectd_compilations`, `ectd_submissions`, `c2c_submissions`, `ind_applications`;
  - nothing reaches `global_dossier.dossier_branches.application_number`.
- **Deleted code.** `git log --all --diff-filter=D -S procedure_number` finds nothing. A deleted `BlueprintPage.jsx` derived an EMA number from the US one, the same defect.
- **No editing route.** Nothing edits a submission's fields beyond `POST /:id/program-anchor`, whose gate and chained audit row this change mirrors.

## What changed (complete the submission reader; converge the two project-only callers onto it)

- **Migration.** `migrations/20261022b_submissions_market_application_number.sql` adds `submissions.application_number`. It is additive and replay-safe, placed in the set before the sweeps. It is read by name and kept out of the Drizzle schema so that `getSubmission` works on every database the column has not reached.
- **The reader.** `readSubmissionPackageIdentity` applies the market rule. The home market, the region of the project's primary agency, reads the project's number. Any other market reads its submission's own number, never the project's, and its refusal names the market.
  - `readRecordedPackageIdentity` now also carries the project's primary agency (`homeAgency`), so no second query is needed.
  - `isHomeMarket` is the one rule. When either side names no known region, the submission reads the project's number as before.
- **Callers.** Export (`assemble-from-core.ts`) and transmit, with its readiness view (`submission-service.ts`), read by submission. No second reader was added.
- **AnA.** `package_ectd_for_region` packages the project's home market only. Any other region is refused `NOT_HOME_MARKET`, and the refusal names where that market's package is built.
- **The governed act.** `POST /api/submissions/:id/application-number` (`server/services/submission-service/market-application-number.ts`):
  - the project's lead or a manager, with a stated reason;
  - the existing identifier rules, plus six digits when the market is the US;
  - one transaction with a chained audit row naming the old and new value;
  - an unchanged number writes nothing;
  - the home market, an unanchored submission, a slash and another organization's submission are each refused by name.
- **The read and the row.** `GET` on the same path answers through the same reader. Each non-home market row on the project's Submit tab says what its package carries, or that it is refused until a number is recorded, and records one (`MarketApplicationNumber.tsx`, mounted by `ProjectMarkets.tsx`). Submission Readiness, which draws the same list, is unchanged.

## Red, then green

- `red/project-number-for-every-market.txt`: the reader test on the pre-change reader.
  - An EU MAA added to an NDA project read `214321`, the US number.
  - Its export resolved, building a package, instead of refusing.
- `red/ana-packages-any-region.txt`: AnA's tool asked for `ema` on an FDA project built the package instead of refusing.
- `green/`: the reader, the governed act (8 cases on PGlite with the real chained audit writer), AnA, the row, and every suite near package identity, submissions, transmit, compile, signatures and the markets list.

Typecheck clean. These pass: `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-guard-order`, `ci:launch-scope-api`, `ci:sql-interpolation`, `ci:internals-in-copy`, `check:microcopy`, `ci:undefined-css-classes`, `ci:design-system`, `ci:action-overclaim`. HawkScan not run: HAWK_API_KEY is not set.

## Handed on

- **To the identity lane (MR-10 Stage 4).** `REGULATORY_IDENTIFIER_PATTERN` refuses the slash that EMA's `EMEA/H/C/…` form carries, while rule EMA-CESP-002 expects it. Until that is decided, a market's number is recorded without slashes, and the form says a slash is not accepted yet.
- **Not in P-44.** Two submissions in the same region as the home market (an IND and an NDA, both US) still share the project's one number, as before.

## Review round (same day), pushed at the founder's instruction to stop

Two read-only lenses reviewed the first commit: security and Part 11.

**Fixed, red first** (`red-review/`, `green-review/focused.txt`, 6 files and 36 tests):
- **The package's region decides the market**, not the submission's. An EU sequence under the US submission read the NDA number. `readSubmissionPackageIdentity` now takes the sequence's region, and every caller passes it.
- **Compile and the orchestrator read by submission.** Compile had read the project's number, so the decision text's "compile" was not yet true. It also stores the packaged number on the compilation.
- **The GET checks project access** through `getSubmissionForRequest`, as every submission read does.
- **A number a frozen or dispatched sequence was built under is not changed.** Recording one for the first time is still allowed.
- **The audit row carries `programId`**, so the project's activity feed shows it, along with the IP and user agent. The read returns who recorded the number last, when and why.

**Open, not done (stopped at the founder's instruction):**
- **Part 11 lens, UI items:**
  - say "No change" when the number is unchanged (the server already returns `changed:false`);
  - state the consequence in the form, including that a changed number withdraws a release signature;
  - re-read the market's verdict after a save;
  - keep the form open on refusal, and state the reason's 8-character minimum;
  - explain why the control is absent for someone who may not change the project;
  - show the recorded-by line the read now returns;
  - map `SUBMISSION_APPLICATION_NUMBER_RECORDED` to a label in the project feed.
- **No test yet** for the freeze guard, the access-scoped GET or `lastRecorded`.
- **Security lens, handed on:**
  - non-US signature coverage of the number (the identity lane's non-FDA recipe);
  - an unknown region reads as home;
  - the legacy no-spine draft backbone in `ectd-compile.ts:835`.


## Completion of the review round (resumed after the stop)

**Trunk red I caused.** I pushed the review round (`a23ad51fa`) on the focused suites alone, when told to stop. It turned 9 tests in 6 files red on trunk. Each was a stand-in that predated the submission reader:
- the orchestrator mocks had no `readSubmissionPackageIdentity`;
- the binding and coverage tests asserted the old three-argument call;
- the compile-spine harness's submission row had no `program_id`.

In one case the old expectation was the defect P-44 removes: an EU package carried the US IND number. That case now records the EU market's own number. All six are fixed here and pass at head.

**Closed:**
- **Freeze guard.** A number a frozen or dispatched sequence was built under is not changed (`red-review/freeze-guard-off.txt`: the test fails with the guard switched off).
- **Access-scoped GET.** `red-review/get-without-access-scope.txt`: the route test fails with the access check removed.
- **Audit and read.** The audit row names the project, and the read returns who recorded the number, when and why.
- **Part 11 UI items** (`red-review/row-before-part11-fixes.txt`: 5 of 7 fail on the earlier row):
  - an unchanged number is said to be no change;
  - the form states what recording does, including that a signed release reads unsigned until it is signed again;
  - the market's verdict is read again after a change;
  - a refusal is said inside the form, which keeps what was typed;
  - the reason's 8-character minimum is stated;
  - someone who may not change the project is told who can;
  - the row says who recorded the number, when and why.
- **The project feed** names `SUBMISSION_APPLICATION_NUMBER_RECORDED` in words.

**Still handed on:**
- **To the identity lane:**
  - non-US release signatures do not cover the number;
  - the slash in EMA's `EMEA/H/C/…` form is not accepted.
- An unknown region reads as home.
- The legacy no-spine draft backbone (`ectd-compile.ts:835`).
- A multi-region submission's non-primary regions (`submission_regions`) have no number of their own. Their packages are now refused by name, never given the project's.
