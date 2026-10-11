# Filing-spine design review: the two open items raised to the founder, fixed

Launch row **D2**. These were open items 1 and 2 of `.design/filing-spine/DESIGN_REVIEW.md` (the review is `bd0bc196`). Both sit on the filing path, and neither needs a product decision: each makes an existing write follow a rule the repository already states.

## 1. A model verdict on the Validation tab (CLAUDE.md Rule 2)

**What was wrong**
- `explainValidation` (`server/services/submission-ai/submission-ai-service.ts`) returned the model's JSON as it came.
- Prompt `validation-explain@v1.0` asked the model to decide `blocking` ("true if any finding has severity 'error'"), and to echo each finding's `ruleId`, `severity` and `leaf`.
- The Validation tab printed **"Blocking."** and a severity chip from that reply, with no model label. That is a verdict from a model, on the screen that decides dispatch: the class F21 retired.
- A reply could also carry rows for findings that were never given.
- A model failure failed the request, though the findings need no model.
- AnA's `explain_validation_findings` passed the same reply on to the conversation.

**What changed**
- **The findings are the validator's, and the model narrates them** (the submission plan's pattern, v1.1).
  - Each finding is numbered.
  - The model returns `{ index, cause, fix }` and a `summary` (prompt `validation-explain@v1.1`).
  - The service keeps only that prose, bound to the finding at `index`. It copies the rule, severity and leaf from the validator's finding.
  - It drops a verdict, a severity, a rule, an index that was not given, and a second row for the same finding.
  - AnA's `rule_id` binds as `ruleId`.
- **The reply is `{ narrative, narrativeUnavailable }`.**
  - The narrative carries its label: "Model narrative — advisory only. The findings and their severities are the deterministic validator's…".
  - With no model, the narrative is `null` with the reason, and the findings stand.
- **The Validation tab shows the narrative under that label.** There is no "Blocking.". With no model it says "No model explanation: …". A reply in the old shape is shown as unexplained, never as a verdict.

**Deletion check (CLAUDE.md working agreement).** Nothing user-facing is removed. "Explain the findings (AI)" stays, and so does AnA's `explain_validation_findings`; only the verdict inside the reply goes. The replacement for that verdict is the deterministic gate already on the same screens:
- the Validation tab's error and warning counts, and its findings;
- the Dispatch tab's readiness gate (`assess-dispatch-readiness.ts`).

## 2. The write that changes a filing copy took no reason and checked no role (21 CFR 11.10(d)(e))

**What was wrong**
- Placing a document calls `POST /api/coauthor/documents` with `sourceAuthoringDocId`. That takes, or re-takes, the one filing copy every leaf placing that document points at.
- The leaf write beside it requires `regulatory-author` and a stated reason. This write required neither: it was guarded by `authMiddleware` only, so an org **viewer** could re-take a filing copy.
- Its ledger event (`coauthor_document.retaken`) recorded a sentence the code composed as the reason. `routes/governed-reason.ts` (`statedReasonOrNull`) forbids exactly that.

**What changed**
- **`server/routes/coauthor.ts`.** A sourced snapshot requires `regulatory-author` (the same role as the leaf write) and `requireGovernedReason(changeReason)`. Otherwise it answers 403 or 400 `REASON_REQUIRED`, and nothing is taken or re-taken.
  - A document with no source (the co-author app's own create) is a different write, and is unchanged.
  - The only client that sends `sourceAuthoringDocId` is the Place into filing dialog. It was found by search, and `coauthor-status-write.ts` only names the path in a message.
- **`server/services/coauthor/coauthor-snapshot.ts`.** The retake event records the person's stated reason. What the system did is in the event's own fields (`recreated`, `before`, `after`).
- **`AuthoringPlaceIntoFiling.tsx`.** The dialog sends the placement's reason with the copy request. The dialog already requires that reason before Place.

**Tests amended in place, each with a dated note:**
- `coauthorSnapshotFromSource.test.ts`: the retake event's reason, and three new cases (no reason, a viewer, an unsourced create).
- `coauthorSnapshotSeal.test.ts`, `coauthorSnapshotSeeds.test.ts` and `coauthorSnapshotStatus.test.ts`: they now send a reason.
- The Status suite's auth mock gains a pass-through `requireRole`, because that suite is about status. The role is held against the real middleware in `coauthorSnapshotFromSource`.

## 3. A placement a viewer could not make was offered to them (21 CFR 11.10(g), role-scoped visibility)

**What was wrong.** "Place into filing" was offered to every member. A viewer filled in the dialog (submission, sequence, code, reason) and then met a 403 from the copy write or the leaf write, both `requireRole('regulatory-author')`. The editor already reports, per act, the decision the write will meet (`callerDocumentAccess`, GE-P-3). Placement was not one of those acts.

**What changed**
- **`server/middleware/auth.ts`.** `requireRole`'s decision is extracted unchanged into `roleClaimsSatisfy(claims, allowedRoles)`, and `requireRole` calls it.
  - Exporting it is what lets a screen report that decision without a second permission model.
  - `auth.js`, the pure re-export shim vitest resolves, re-exports it.
  - The middleware suites (58 files, 568 tests) pass unchanged.
- **`server/routes/authoring.router.ts`.** `GET /docs/:docId` returns `access.placeIntoFiling`.
  - The org role is read as Send for review reads it.
  - It is expanded as `req.user`'s roles are where the writes run.
  - It is then judged by `roleClaimsSatisfy(…, ['regulatory-author'])`.
  - It is null when no role is on the request, which means unknown, and the write still decides.
- **`DocumentWorkbench.tsx` and `DocumentCanvas.tsx`.** Both pass `actRefusal(access.placeIntoFiling)`. `AuthoringPlaceIntoFiling` disables its trigger and names the refusal beside it (`aria-describedby`), as File to vault does.
  - The copy-status sentences moved unchanged to `surfaces/filingCopyStatusLines.ts` and are re-exported, so the dialog's file stays inside its length limit.

## 4. A submissions reply with no list read as "no submissions" (honest state)

`SubmissionCenter.tsx` read the project's submissions with no shape guard. A 200 with no list in it was flattened to zero rows, so New submission preselected the project's region as if that market did not exist. It is now `isRowsWith('id', 'applicationType', 'primaryRegion')`. Such a reply is a failed read, and the drawer says whether the market exists is not known.

## 5. The Vault offered "Open project" with no project open

The header's "Open project" led to Project home's "No project selected", beside the empty state's own "Go to Projects". It shows only when a project is open.

## 6. A figure with no time, and a dated line with no date (review open item 9)

**What was wrong**
- Dossier readiness on Project home is measured on each read (`readinessByProject`, `server/routes/c2c/projects.ts`). A project page stays open for hours, and the card said nothing about when the figure was measured.
- PMDA's market line read "New applications blocked: eCTD v4.0 required". It is true only from the dated registry fact's effective date (`pmda-ectd-v4-mandatory`), and the reply's `asOf` was dropped on the way to the screen.

**What changed**
- The project detail read returns `readinessAsOf`: when this read measured the figure, and null with no figure.
- The card prints "Measured <date, time>." under the ring (`dossierReadinessAsOf`, `dossierReadiness.ts`), and nothing when there is no figure.
- PMDA's line names its date: "…eCTD v4.0 required from 2026-04-01", from the fact where the block is decided (`pmdaV4RequiredFrom`, `market-support.ts`). It is the only date-dependent statement in the reply, so the `asOf` needs printing nowhere else.
- `market-support.test.ts` pinned the old line. It is amended in place with a dated note, and FILING_SPINE §3's table cell is updated.
- `projects-detail-taxonomy.test.ts` pins the create's body, which comes from the same detail read. It now carries `readinessAsOf: null`, since a new program has no figure. Amended with a dated note.

## 7. Respond's coming-later line sat in its card, Submit's did not (review open item 10)

`StagePanel` (`ProjectHome.tsx`) put the line inside the stage's tool card. It now sits under the card, bare, as Submit's does. `projectHomeLaunchScope.test.tsx` holds both stages to that.

BuilderSources, the other half of item 10, keeps its doors. The design-system auditor named `sc-trans-b` in a `cm-pushbar` the door pattern for every secondary action on the sequence workspaces (`.design/filing-spine/DESIGN_REVIEW.md`, "Where the lenses disagreed").

## 8. F14's door on the Dispatch tab took the tab's door pattern

The design-system auditor, run on F14's files, found its "Validate and compile this sequence" button was `btn ghost`. Every neighbour on the tab is `sc-trans-b`. It is now `sc-trans-b`. No gate sees this; the auditor's report is the evidence, and the gates it ran all pass.

## Red, then green

| File | Before the fix |
|---|---|
| `red/validation-explain-server-red.txt` | 4 of 4 fail. The model's `blocking`, its severities and its invented rows came through. The prompt was v1.0. `rule_id` did not bind. A model failure threw. |
| `red/validation-explain-client-red.txt` | 3 of 3 fail. No label. "Blocking." was printed from the model's flag. No unavailable state. |
| `red/filing-copy-server-red.txt` | 3 of 48 fail. A copy was taken with no reason (201) and by a viewer (201). The retake's reason was the code's sentence. |
| `red/filing-copy-client-red.txt` | 1 of 9 fails. The copy request carried no reason. |
| `red/place-gate-server-red.txt` | 2 of 8 fail. The document read had no `placeIntoFiling` for a member or a viewer. |
| `red/place-gate-client-red.txt` | 3 of 11 fail. The gate was not parsed. The trigger was enabled with a refusal. The canvas passed no `refusal`. |
| `red/shape-red.txt` | 1 of 15 fails. `fda` was preselected over a reply with no list. |
| `red/vault-header-red.txt` | 1 of 7 fails. "Open project" was offered with no project open. |
| `red/as-of-red.txt` | 5 of 43 fail. The detail read had no `readinessAsOf` (three cases), the card stated no time, and PMDA's line named no date. |
| `red/respond-line-red.txt` | 1 of 4 fails. Respond's coming-later line was inside its card. |

Results are in `green/`.

## Seen red on trunk, another lane's

Six tests fail at `2cd75e74` without this change:
- `server/routes/__tests__/report-os-audit-recording.test.ts` (3);
- `server/routes/__tests__/report-os-delivery-recording.test.ts` (2);
- `server/routes/__tests__/setup.test.ts` (1).

The cause is `ac688076` ("D3: an isolation switch set during one request no longer reaches the next"). With its six source files restored to their parent, all 59 tests in those files pass; with them, 6 fail. The tests assert the transaction's statement sequence, which that commit changed. The fix belongs to the D3 lane.
