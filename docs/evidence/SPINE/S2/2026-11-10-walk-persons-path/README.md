# S2 (LX-00): the founder-path walk follows the path a person can take today

**`Plan: F1`.** Session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-10, the founder-path lineage lane. Test area only:
`tests/lineage/**` and this folder. No product file changed.

## What already exists (RULE 3)

Written before the walk was changed. Nothing here is new; the walk is made to follow these.

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| The walk | `tests/lineage/founder-path-lineage.pglite.test.ts`, `.world.ts`, `.hops-authoring.ts`, `.hops-filing.ts`, `.baseline.json` | Drives the real routes and services from a project to the agency, one case per hop, each hop a set of named checks judged against a shrink-only baseline (11 entries, ceiling 11) | Since `b8cee0745c` and `bb999f25b6` it stops at the seal hop: 6 of 15 (`01-before-6-of-15.txt`) |
| AnA's draft | `draft_authoring_document` (`server/services/authoring/authoring-draft-tool.ts`), run under the stream's own tool context (`server/services/ana/turn-tool-context.ts`) | Creates the canvas document with a chained CREATE row per section naming AnA (`provenance.source = 'ana'`), the model and the turn | Records no Data Room source (LX-06, baselined) |
| The section save | `PATCH /api/authoring/sections/:id` (`server/routes/authoring.router.ts:1598`) | One transaction: the lineage gate, the revision (`human-edit`), the filing commit, and a chained UPDATE row holding the before and after text | |
| The lineage gate | `server/services/clinical-regulatory-evidence/lineage-gate.ts` | Credits each clause to the machine that wrote it or to the person saving. A person may replace a machine sentence and cite it in one save (`f3567a6f03`) | Keeping a machine sentence and adding a citation to it is refused 422 `MACHINE_LINEAGE_FORMATTING_UNVERIFIED`, by design |
| Citing a source | `POST /api/authoring/sections/:id/cite-source` (`authoring.router.ts:2850`, `source-usage.service.ts` `citeSource`); the editor's call is `DocumentWorkbench.tsx` `citeSource`, then `insertCitation` (`editor/citationNode.ts`) | Registers the source to the section in `authoring_citations`, with the source's checksum at cite time, and writes a chained `CITATION_ADDED` row. The content then carries `<a data-cite="<source id>">name</a>` (`shared/authoring/citations.ts`) | Writes no `document_span_lineage` row: a citation and a span are two stores (LX-14) |
| The independent check | `POST /api/authoring/documents/:id/review` with `action: 'run_independent_checks'` (`authoring.router.ts:3255`; `peer-review.ts` `runAuthoringIndependentCheck`; `saved-document-critique.ts` `evaluateSavedIndependentCheck`) | Re-reads the saved sections with no model and records a receipt for that exact snapshot. Hard findings: a critical or high grounding finding, an empty section, a citation not registered to its section, pending tracked changes. Sending for review runs it too (`requestAuthoringPeerReviews`) | |
| A registered citation grounds its figure | `server/services/ana/grounding-core.ts` (`eee0aaa0be`) | The checker reads a citation as `[citation: <name>]`; a figure is grounded when its own sentence carries one | A citation in the next sentence grounds nothing |
| Finding decisions | `independent_findings` on `POST /documents/:id/review` (`peer-review.ts` `submitAuthoringPeerReview`, `workflow-import-governance.ts` `recordIndependentFindingDispositions`) | The assigned reviewer marks a finding resolved once the latest check no longer reports it. A finding from an earlier check stays open until then | A hard finding the latest check still reports cannot be resolved |
| The release gate | `workflow-import-governance.ts` `assertWorkflowImportRelease`: `assertIndependentCheckRelease`, the CSR receipt, then `assertOrdinaryMachineRelease` → `governed-machine-claims.ts` `ordinaryMachineGenesisMayRelease` | A review signature needs a current receipt and no open hard finding. A freeze or an approval also needs: either no original machine clause and no live machine span left, with a chained human CREATE or UPDATE row whose after-text is each section's current text; or a gateway receipt naming a PQ-passed model pin | No model has passed PQ (`server/services/ai-governance/approved-models.ts`: every entry `pq: pending`), so machine text cannot be released today |
| Review, freeze, approval | `POST /documents/:id/request-review` (RR5 route), `POST /docs/:id/e-sign` (REVIEWER, APPROVER), `POST /docs/:id/freeze` | P-95 (`33c3e4de9e`): an approval follows a completed review on the route | |
| The hops behind the seal | `hopFileToVault`, `hopVaultApproval`, `hopPlace`, `hopTransmit`, `walkBack`, `walkForward`, `hopRetention` in the walk | Written, and green on 2026-11-05 (`e0e32d099`) | Not run since the seal hop went red |

Searches run: `run_independent_checks`, `independent_findings`, `cite-source`, `data-cite`, `INDEPENDENT_CHECK`,
`WORKFLOW_MODEL_QUALIFICATION_REQUIRED`, `ordinaryMachineGenesisMayRelease`, `currentHumanEditRecorded` over `server/`,
`shared/`, `client/src/` and `tests/`; `git log -- tests/lineage`; `.design/claude-convergence/COORDINATION.md`
("Spine data room and lineage").

## Why the walk stopped, and the path it takes now

Two gates landed on 2026-11-06 and the walk did not follow them:

- `b8cee0745c`: a document AnA drafted is signed only with a current independent check and no open hard finding.
  The walk's AnA text states "Oral bioavailability of C2C-101 was 62%…" with no citation, a hard grounding finding.
- `bb999f25b6`: text a model wrote is released only with a gateway receipt naming a PQ-passed model. No model has
  passed PQ, so the walk could not keep AnA's text to the seal without inventing a receipt. It does not.

The product's own answer is the person's path. The release gate says it: "Replace it through the governed human
editing path before release." So the walk now does what a person does:

1. **Hop 3, unchanged, plus the designed refusal.** AnA drafts. The author runs the independent check on the draft
   through its route. It holds the uncited figure as one hard grounding finding, and the QA reviewer's signature is
   refused 409 `INDEPENDENT_CHECK_REQUIRED`. No signature row exists. This is a green check
   (`ana-draft/draft-not-signed-as-drafted`), not a baselined defect.
2. **Hop 4, the person's edit.** The person cites the Data Room source on the figure's section
   (`POST /sections/:id/cite-source`, 201), then saves both sections in their own words. The figure's sentence
   carries the editor's citation before its full stop. No sentence of AnA's is kept.
3. **Hop 5, check, review, seal.** The author runs the independent check, then sends the document for review (which
   runs it again). The reviewer reads the check, marks the earlier finding resolved (the latest check no longer
   reports it), approves, and signs REVIEWER. The author freezes. The approver signs APPROVER.
4. **Hops 6 to 8, the walks and retention** run as written, with the two changes below.

## Each gate on the way, and how the person's path met it

| Gate | Where | How it was met | Seen refusing |
|---|---|---|---|
| A citation is registered only for a current source of the same project | `source-usage.service.ts` `citeSource` | The source is the project's own Data Room capture | |
| A save may not turn the machine's words into the person's | `lineage-gate.ts` `previousMachineSpansAccountedFor` | The machine sentence is replaced, and the citation is in the person's sentence | `03-…`, run C: the citation added to AnA's kept sentence, 422 `MACHINE_LINEAGE_FORMATTING_UNVERIFIED` |
| A figure needs a citation in its own sentence | `grounding-core.ts`, read by `evaluateSavedIndependentCheck` | The registered citation sits inside the figure's sentence | `03-…`, run B: the citation in the next sentence; the reviewer's approval is refused |
| A hard finding of an earlier check stays open until the assigned reviewer decides it | `workflow-import-governance.ts` `independentFindingHistory`, `recordIndependentFindingDispositions` | The reviewer's decision, `resolved`, sent with the verdict in `independent_findings` | `04-…`: with no decision recorded the walk's check fails |
| A review signature needs a current check, no open hard finding, a named reviewer on the route, and a signer who is not an author | `authoring.router.ts` `lockedSigningContent`, `authoringReviewerPrecheck`, `separationOfDutiesRefused` | The check is current for the saved text; user 5 is named on the route and wrote nothing | Hop 3's check, every run |
| A freeze or an approval releases machine text only with a qualified receipt | `workflow-import-governance.ts` `assertOrdinaryMachineRelease` | No original machine clause and no live machine span is left, and each section's text is the after-text of the person's chained UPDATE row (`edit-save/machine-text-replaced`) | `03-…`, run A: AnA's sentence kept in 2.5.1; the freeze is refused 409 `WORKFLOW_MODEL_QUALIFICATION_REQUIRED` |
| An approval follows a completed review (P-95) | `authoring-review-route.ts` `authoringApprovalReviewRefusal` | The route's reviewer signed the text being approved | |
| The same release gate at filing and at the filing copy | `POST /docs/:id/file-to-vault`, `takeAuthoringSnapshot` | As at the freeze | `03-…`, runs A and B |
| Only an approved, current Vault version is transmitted | `leaf-source-resolver.ts` | The Authoring approval carried to the Vault copy (below) | |

## The walk before and after, per case

`01-before-6-of-15.txt` and `02-after-15-of-15.txt` hold each run's per-case and per-check lines.

| Case | Before | After |
|---|---|---|
| hop 1 · project | pass | pass |
| hop 2 · capture | pass | pass |
| hop 3 · ana-draft | pass | pass, with the new check `draft-not-signed-as-drafted` |
| hop 4 · edit-save | pass (a sentence inserted above AnA's quote) | pass (both sections rewritten, the source cited); new checks `citation-registered`, `machine-text-replaced` |
| hop 5 · seal | **fail**, 409 `INDEPENDENT_CHECK_REQUIRED` | pass; new check `check-current-and-findings-decided` |
| hop 6 · file-to-vault | **fail** (409 behind the seal) | pass; `approval-carry-decided` now states the carry |
| hop 6b · vault approval | **fail** (no Vault copy) | pass; states the carried approval; new check `carried-approval-names-authoring-signatures` |
| hop 7 · place | **fail** (409 behind the seal) | pass |
| hop 8 · transmit | **fail** (no sequence) | pass |
| walk back | **fail** (no transmittal) | pass; new check `document-to-source-by-citation` |
| walk forward | **fail** (no Vault copy) | pass; `data-room-shows-use` is green |
| adopt | pass | pass |
| retention | **fail** (nothing filed to hold) | pass |
| the database held every table and column | pass | pass |
| the baseline names only real checks | **fail** (two baselined checks did not run) | pass |

6 of 15 before, 15 of 15 after. By the two logs: 23 checks green before and 58 after; 7 of the 11 baselined checks
reached their verdict before, and all 10 do after.

## What failed for its own reason once the seal passed

Three things, none a regression:

1. **`file-to-vault/approval-carry-decided` observed `carried: true`.** A product change the walk did not follow.
   The check held the branch "approved with no review, so nothing carries". P-95 (`33c3e4de9e`, 2026-11-09) put a
   review into the walk's seal hop, and the walk had not run past the seal since. With a REVIEWER and an APPROVER
   signature over the filed content, by two people who did not write it, FD5 (c)'s carry-over applies
   (`authoring-approval-carryover.ts`, `5ff08b21d5` of 2026-10-01, `da57fe805a`). The check now states the carry and
   names both signers.
2. **Hop 6b answered 200 `created: false`, not 201.** The same cause. The Vault copy already has its lifecycle
   record, approved by the carried sign-offs, so nobody approves it a second time in the Vault. The hop now opens
   that record and checks it: approved for the Vault's bytes, and one chained `vault.version.approval_carried` row
   naming the two Authoring signatures and their signers. It moved beside hop 6, into
   `founder-path-lineage.hops-authoring.ts`, because `hops-filing.ts` stood at 499 of 500 lines.
3. **`walk-forward/data-room-shows-use` passed while baselined.** See the baseline below.

Nothing else behind the seal needed a change.

## The baseline: 11 → 10, ceiling 11 → 10

Changed only by its own rules.

- **Deleted, 1: `walk-forward/data-room-shows-use`.** Its check passes: the Data Room's "Used in" counts
  `authoring_citations`, and the person registered one. **This does not close DR-ANA-14.** A source used only by
  spans is still "Not cited yet" (LX-14). The walk no longer observes that, because nothing in it is used by a span
  alone.
- **Unchanged in findings, fixes and observed value, 10.** None failed on a different value:
  `ana-draft/tool-accepts-sources` (false), `ana-draft/source-span` (0), `edit-save/source-span-survives` (0),
  `edit-save/spans-bound-to-revision` (`[null]`), `seal/seal-binds-revision-and-lineage`
  (`{"heads":2,"bound":0,"lineageDigests":0}`), `file-to-vault/filing-names-sealed-version` (false),
  `transmit/transmittal-names-sequence` (false), `walk-back/vault-leaf-to-seal` (0),
  `walk-back/document-to-source-checksum` (0), `walk-forward/source-to-documents` (0).
- **Re-examined, 3, `why` rewritten because the old sentence was no longer true:**
  - `edit-save/source-span-survives` said "a sentence inserted above the quote retires it". The person now
    replaces the quote. It still observes 0: AnA's draft records no span, and a registered citation is not a span.
  - `walk-back/document-to-source-checksum` said the checksum was "unreachable by a recorded key". It is now
    reached by the citation (`document-to-source-by-citation`, green). The span half stays open.
  - `walk-forward/source-to-documents` said the forward walk from the Data Room "stops at its first step". By span
    lineage it does. "Used in" now reports the document.
- No entry was added. No check was removed. The `$comment` says what the walk now proves and no longer proves.

## What the walk no longer proves

Stated in the test file's header and in the baseline's `$comment`.

- **That text AnA wrote survives to the seal.** It cannot today: no model has passed PQ. Nothing here mocks the
  model registry, the evidence reader or a gateway receipt. This returns when a model passes PQ.
- **AC-03: what happens to AnA's source span when a person edits around it.** The person replaces the quoted
  sentence, so a span on it would be rightly retired. **For whoever takes LX-06 and LX-08:** on this path
  `edit-save/source-span-survives` turns green only if a cited sentence records a source span, or when the walk can
  keep AnA's quote again. LX-06 and LX-08 as written will not turn it green by themselves.
- **DR-ANA-14's span half** (above).
- **The Vault's own review and approval route (RR1b)** for an export that arrives unreviewed. The walk's document is
  reviewed in Authoring, so its approval carries. `tests/db/vault-lifecycle.dbtest.ts` and
  `tests/db/review-route-vault-rr1b.dbtest.ts` hold that route.

What it proves now: a document AnA started reaches the agency once a person has made its words their own; it is
traced back to `sha256(X)` by the citation that person registered; and AnA's draft is not signed as drafted.

## Red first

Per the working agreement, each new check was seen failing on the case it exists to catch. The changes were made in
scratch copies and are not committed.

- `03-red-on-three-refused-paths.txt`: three runs, each with one change to the person's edit. A: AnA's sentence
  kept in 2.5.1. B: the citation in the next sentence. C: the citation added to AnA's kept sentence. Each is
  refused by the product at the gate named in the table above, and hop 4's new checks fail.
- `04-red-on-the-new-checks.txt`: one run. AnA's draft without a figure is signed for review (200), so
  `draft-not-signed-as-drafted` fails, and with no earlier finding `check-current-and-findings-decided` fails. The
  carried-approval check and the walk-back citation check, each pointed at a wrong value, fail.

## Found, not fixed

**F-1. The review route answers a designed refusal as an outage.** `POST /api/authoring/documents/:id/review` with
`review_status: 'approved'`, while a hard finding is open, answers **503 `REVIEW_UNAVAILABLE`, "The review could not
be verified. Reload before trying again."** The e-sign, freeze and file-to-vault doors answer the same state 409
`INDEPENDENT_CHECK_REQUIRED` with what to do. Cause: `submitAuthoringPeerReview`
(`server/services/authoring/peer-review.ts:308-310`) lets the `WorkflowImportGovernanceError` of
`recordIndependentFindingDispositions` and `assertIndependentCheckRelease` through, and `peerReviewFailure`
(`server/routes/authoring.router.ts:3075-3085`) answers 503 for every error that is not an
`AuthoringPeerReviewRefused`. Seen in `03-…` run B and run C. The review panel does not send this request
(`authoringPeerReview.ts` `independentDecisionReady` disables it), so a person on the current screen should not meet
it; any other caller is told to reload for something a reload cannot cure. Not fixed here: it is product code, the
walk does not need it, and `authoring.router.ts` was changed today by the review-rules lane (`b80931bccd`).
**→ S4 / the review-rules lane (`01QoxbLaF…`).**

**F-2, an observation, by design.** A review signature is given on text AnA wrote when the check reports no hard
finding (`04-…`, change 1). `prepareWorkflowImportAdoption` says so: a reviewer may record review while the release
hold stands. The freeze and the approval are then refused (`03-…` run A).

## Not done

- Not walked in the running app. The editor's Cite, the review panel's Run checks and finding decisions were driven
  through their routes, not through a browser.
- `tests/db/*.dbtest.ts` (real PostgreSQL) was not run; the walk runs on PGlite.
- PGlite is one connection, so nothing here proves a concurrent case.
