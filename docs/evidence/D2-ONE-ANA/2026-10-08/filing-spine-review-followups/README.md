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

## Red, then green

| File | Before the fix |
|---|---|
| `red/validation-explain-server-red.txt` | 4 of 4 fail. The model's `blocking`, its severities and its invented rows came through. The prompt was v1.0. `rule_id` did not bind. A model failure threw. |
| `red/validation-explain-client-red.txt` | 3 of 3 fail. No label. "Blocking." was printed from the model's flag. No unavailable state. |
| `red/filing-copy-server-red.txt` | 3 of 48 fail. A copy was taken with no reason (201) and by a viewer (201). The retake's reason was the code's sentence. |
| `red/filing-copy-client-red.txt` | 1 of 9 fails. The copy request carried no reason. |

Results are in `green/`.

## Seen red on trunk, another lane's

Six tests fail at `2cd75e74` without this change:
- `server/routes/__tests__/report-os-audit-recording.test.ts` (3);
- `server/routes/__tests__/report-os-delivery-recording.test.ts` (2);
- `server/routes/__tests__/setup.test.ts` (1).

The cause is `ac688076` ("D3: an isolation switch set during one request no longer reaches the next"). With its six source files restored to their parent, all 59 tests in those files pass; with them, 6 fail. The tests assert the transaction's statement sequence, which that commit changed. The fix belongs to the D3 lane.
