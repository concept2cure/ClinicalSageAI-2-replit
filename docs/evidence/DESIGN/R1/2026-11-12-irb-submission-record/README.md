# The protocol workspace records the IRB submission (2026-11-12)

Plan package R1 (reach), in S3's screen, the protocol workspace. Launch rows D2 and D7. Design:
`docs/design/IRB_SUBMISSION.md` steps 4 and 5, decisions D1, D3 and D4. The founder, 2026-11-11: "focus entirely on
getting what we built surfaced correctly on the UI and working for GA."

## What a person saw before

The protocol workspace's "IRB package" tab could only read.

- With no IRB submission it said "Create the IRB submission first." Nothing in the product could create one. Only
  AnA's `create_irb_submission` command could.
- With a submission that had no link it said "Link the submission in the Submission Center first." Nothing could do
  that either: the link could be set only at creation.
- A requirement the engine could not decide said "record it to decide this requirement". No screen recorded it.
- The record checks and the approval lifecycle were served and shown nowhere.

## What already exists (RULE 3)

Nothing new: no screen, route file, service, table or mount.

| Path | What it did | What it did not do |
|---|---|---|
| `server/routes/irb.ts`, mounted at `/api/irb` | Create, status, the four study facts, determinations (an approval is a signature), sites, consent documents, amendments, reportable events, package manifest, lifecycle, completeness. Every write governed, with a reason | No write had a caller under `client/`. No route set the link after creation |
| `server/services/irb/irb-service.ts` | The transactions and reads behind those routes | `createSubmissionTx` stored any submission id as the link, whichever organization owned it. `getCompletenessInput` read on a connection it was handed |
| `server/services/irb/irb-logic.ts`, `lifecycle.ts`, `package-manifest.ts` | The record checks, the three-valued approval lifecycle, the manifest | Unchanged |
| `client/…/surfaces/IrbPackage.tsx` | Read the list and the manifest for the protocol's number, in four honest states | Offered no write, and pointed at two that did not exist |
| `server/services/ana/AnaToolExecutor.ts` | `create_irb_submission`, `add_irb_site`, `review_irb_submission`, all in launch scope | `review_irb_submission` read the same way as the completeness route (below) |
| `docs/design/IRB_SUBMISSION.md` | Binding since 2026-09-22 | Step 4 ("link to it from Protocol development") was a read only |

Searches run: `irb_submissions`, `/api/irb`, `IrbPackage`, `createSubmissionTx`, `getCompletenessInput`, `irb` in
`client/src/concept2cure/v2`, `server/routes`, `server/services`, `migrations/` and the AnA scope inventory;
`git log --all --diff-filter=D` for `*Irb*` under `client/` (no deleted screen).

## What changed

**The tab records the submission** (`IrbSubmissionRecord.tsx`, split out of `IrbPackage.tsx` into the same folder).

- **Record the IRB submission**, where none exists for the protocol's number. Title, risk level (no preselected
  answer), the Submission Center submission to link (chosen from the open project's own), the four study facts and
  vulnerable populations as three answers each (not recorded, yes, no), safeguards, one IRB of record, consent
  waiver, and the reason. A fact left on "Not recorded" is not sent.
- **Record study facts.** Each fact starts on "Leave as it is", naming what is recorded. Only what the person
  changed is sent; "Not recorded" sends null, which takes an answer back.
- **Change status.** Draft, recorded as submitted, under review, suspended, closed, expired. A board's decision
  (approved, modifications required, deferred, disapproved) is a determination and is not offered (D4). The form says
  the board is dealt with in its own portal or inbox and that nothing is delivered from here (D3).
- **Link to a submission**, offered only while there is no link.
- **The record**: status in words, risk level, the link, each fact as yes, no or not recorded.
- **Record checks**: the engine's findings with their basis, the checks that ran, and the checks that could not run
  listed as that. No figure. "No critical finding, but a check that could raise one did not run" is stated as not a
  clean result.
- **Approval**: approval and continuing review in words, the expiration and whether it is the board's date or
  computed, and the lifecycle findings with their remediation.
- The engine's suggested review pathway is returned by the read and is not shown (D4).
- A viewer is offered no write. After a confirmed write the tab reads the record again; nothing is added locally.

**The link** (`PATCH /api/irb/submissions/:id/link`, in the existing router). A governed update with a reason. It
refuses a submission of another organization, a removed one, and a link that already exists (an approval may have
threaded its provenance to the linked submission). Creation now refuses another organization's submission too.

**The list carries the facts.** `GET /api/irb/submissions` returns the four facts, vulnerable populations and the
consent waiver, as stored.

## A defect found by opening the tab in the running app

`GET /api/irb/submissions/:id/completeness` answered **404 "IRB submission not found for this organization"** for a
submission the same person had just recorded, while the list, the lifecycle and the manifest answered.

The pool sets the tenant on a checked-out connection only at `BEGIN` (`server/db/poolInstrumentation.ts`). This
route took a connection with `pool.connect()` and read on it with no `BEGIN`, so the read ran with no tenant and
row-level security hid the row, for every organization. AnA's `review_irb_submission` read the same way. A mocked
pool that hands `connect()` the same executor as `query()` cannot see it, which is how it shipped.

`getCompletenessInput` now reads through the pool, as its two sibling reads do. The route and AnA's tool call it
without a connection (a three-line change in `AnaToolExecutor.ts`, inside that tool's handler).

## Verified

Red first: each suite was run against the code before its fix.

| What | Where | Result |
|---|---|---|
| The link, the tenant check at link and at creation, the facts in the list | `server/services/irb/__tests__/submission-link.route.test.ts` (8 cases, real router on PGlite) | Before: 6 fail. After: pass |
| The completeness read inside the tenant scope | `server/services/irb/__tests__/completeness-reads-in-tenant-scope.route.test.ts` (3 cases; a checked-out connection sees nothing before `BEGIN`) | Before: 404 twice. After: pass |
| AnA's `review_irb_submission` | `server/services/ana/__tests__/irb-review-tool-lifecycle-and-checks-run.test.ts`, with the same connection | Before: 4 fail. After: pass |
| The tab's writes, record, checks and approval | `client/…/__tests__/irbSubmissionRecord.test.tsx` (15 cases) | Pass. Against the old tab none can run: it has no button |
| The tab's four read states, D3 and D4 | `client/…/__tests__/irbPackage.test.tsx` (11 cases, unchanged) | Pass |
| Every IRB suite | `server/services/irb` (12 files) and the AnA tool suite | 137 pass |
| Lint ratchet | `scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD` | No file changed its warning count |

**In the running app**, as the Lumen lead on LMN-201's protocol, on the database seeded from zero on 2026-11-10:

- Before: "No IRB submission is recorded against protocol number LMN-201-CDI-02" (`before-no-submission-1440.png`).
- "Record the IRB submission" (`record-form-1440.png`): greater than minimal risk, runs under an IND yes, involves
  children no, no link. Recorded as IRB submission 1, draft. PHI, recruitment material and vulnerable populations read
  "not recorded".
- "Record study facts": PHI yes (`facts-form-1440.png`).
- "Link to a submission": the project's one submission, the LMN-201 IND. The package manifest then appears: 0 of 4
  required artifacts placed, 1 requirement not decided (recruitment material).
- "Change status": recorded as submitted, then under review (`status-form-1440.png`).
- Record checks (`record-1440.png`): "2 ran, 2 could not"; "A critical finding is open": no informed-consent
  document and no waiver, 45 CFR 46.116 / 46.117. Approval: not approved; continuing review not known from this
  record; expiration none recorded.
- No failed request after the fix. At 390 the page and the forms do not scroll sideways.

## Open

- **Slice 2, next:** the board's determination (an approval is a signature), sites, consent documents, amendments
  and reportable events. Until then the consent finding above can be cleared only through AnA or the API, and the
  status form says a determination is not set there.
- **Vulnerable populations cannot be changed after creation.** `PATCH …/context` records four facts and this is not
  one of them. The form says so. Slice 2 extends that route.
- **The protocol workspace on a narrow window: fixed in the commit after this one** (F1,
  `styles/protocol-dev-editing.css`). The section list kept its 268px column beside every tab, so a tab's content was
  about 100px wide at 390 (`phone-before-390.png`) and 177px at 761. Under 1100px the list now sits above the tab,
  capped at 216px. Measured in the running app on the Document, IRB package and Statistics tabs: the tab is 358px
  wide at 390 (`phone-after-390.png`), 524 at 820, 804 at 1100; from 1101 the list is beside it again and the tab has
  517px or more; 856 at 1440, as before. No sideways scroll at any of them.
- **Other reads on a connection with no `BEGIN`.** The same pattern may exist outside IRB. A sweep is listed for the
  coordinating session.
- **No seed.** The Lumen pack records no IRB submission; a person records it in the demo, as above.
- HawkScan did not run: no `HAWK_API_KEY` in this environment.

---

# Slice 2 (2026-11-12): what is on file, the board's determination, and the approval as a signature

## What a person saw after slice 1

- Sites, consent documents, amendments, reportable events and the board's determinations each had a governed write
  on `/api/irb` and **no read**: nothing anyone recorded could be shown back. None had a caller under `client/`.
- **A disapproval left the status alone.** `recordReviewTx` set the status only for `approved` and
  `modifications_required`; a `deferred` or `disapproved` determination wrote a review row and the submission still
  read "under review".
- **Vulnerable populations (45 CFR 46.111(b)) could be answered only at creation**, so a submission recorded without
  the answer (AnA's `create_irb_submission` never asks) kept the safeguards check "not assessed" with no way out.

## What already exists (RULE 3)

Unchanged from slice 1, plus: `recordReviewTx`, `addSiteTx`, `addConsentDocumentTx`, `addAmendmentTx`,
`addReportableEventTx` in `server/services/irb/irb-service.ts` and their routes in `server/routes/irb.ts`; the signing
ceremony `signGovernedAct` (`server/routes/governed-signed-act.ts`), which an approval already ran; the one signing
dialog `client/src/concept2cure/_shared/components/EsignModal.tsx`, already used by the protocol workspace
(`ProtocolDevSigning.tsx`). No table, mount, route file or service is added.

## What changed

- **`GET /api/irb/submissions/:id/record`**, in the existing router: the five registers, read through the scoped
  pool, dates as recorded, another organization's rows and removed rows left out, 404 for a submission that is not
  the caller's.
- **Every determination is the status.** `deferred` and `disapproved` now set it, with the board's review type.
- **`PATCH …/context`** records `involvesVulnerablePopulations` (three answers) and `vulnerablePopulationProtections`
  (text; blank or null takes it back), beside the four facts it already recorded.
- **The tab** (`IrbSubmissionRegisters.tsx`, split out of `IrbSubmissionRecord.tsx` into the same folder): an "On
  file for this submission" card with each register in words and an add form for each; "Record a determination" for
  modifications required, deferred and disapproved (approved is not offered there); "Record approval", whose form
  collects only what the board decided (review, date, the expiration it set, conditions) and then opens the signing
  dialog. The request is made only from the dialog, with the meaning (responsibility or approval, the two a decision
  act takes) and the password. The dialog says: "You are recording its decision from its letter and answer for this
  record; this is your signature, not the board's." The facts form takes vulnerable populations and the safeguards.
  A failed read says so and lists nothing. A viewer is offered no write. Nothing is appended locally.
- `printedSigner` in `ProtocolDevSigning.tsx` is exported so the approval prints the signer the same way.

## Verified

| What | Where | Result |
|---|---|---|
| The record read, determinations as status, vulnerable populations after creation, the list | `server/services/irb/__tests__/submission-record.route.test.ts` (10 cases; a checked-out connection sees nothing before `BEGIN`) | Against the old route and service: 9 fail. After: pass |
| The registers, the forms, the unsigned determination, the signed approval | `client/…/__tests__/irbSubmissionRegisters.test.tsx` (15 cases) | Pass. Against the old tab none can run: nothing renders the registers |
| Slice 1's tab tests, every IRB suite, the review-read suites | 19 files | 197 pass |
| Type check | `typecheck-no-regression --incremental` on the merged tree | Caught a wrong import in the new file before the push; fixed; 0 errors |

**In the running app**, as the Lumen lead on LMN-201's protocol (IRB submission 1, under review):

- Before (`slice2-on-file-before.png`): every register "None recorded"; "The board has made no decision on this record."
- Two sites, a consent document (version 1.2), a substantive amendment, a protocol deviation reported 2026-11-10, a
  "modifications required" determination of 2026-11-05 with its condition, and "involves vulnerable populations: no"
  (`slice2-after-writes-1440.png`). The status read "modifications required". The record checks went from "2 ran,
  2 could not" with a critical consent finding to "4 ran, 0 could not" with one major finding: two sites and no
  single IRB of record (45 CFR 46.114).
- "Record approval": full board, 2026-11-11, expiring 2027-11-10. The signing dialog (`slice2-approval-signing-1440.png`)
  offered Approval and Responsibility, printed the signer, and said the signature is the recorder's. Signed with the
  password: "Responsibility signature recorded". Status "approved"; Approval "approved, current", continuing review
  required, expiration 2027-11-10 (the board's date), 363 days; and the lifecycle's major finding that the
  substantive amendment is recorded as submitted and not yet approved (`slice2-approved-1440.png`).
- At 390 (`slice2-on-file-390.png`) the card reads in full and the page does not scroll sideways. No failed request.

## Open

- **Status changes of a register row** (a site activated, a consent document approved, an amendment approved, an
  event closed) have no route; nothing here adds one (RULE 6). So the amendment above stays "submitted" and its
  lifecycle finding stays open. That is the next decision for this lane: reach it through an existing route if one
  is found, or ask the founder.
- The approval form stays offered after an approval; a later approval (continuing review) is a real act, so it is
  not hidden.
