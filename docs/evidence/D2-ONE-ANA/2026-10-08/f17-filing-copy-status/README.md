# F17: placement states the filing copy's status

Launch row **D2**. Slice F17 of `docs/design/FILING_SPINE.md` §7.2. Claimed on the board by `…session_011DpxUyQmE1enma4gTjcfBy`.

## What was wrong

Place into filing files a copy of the authored document (`coauthor_documents`) and places that copy as the leaf.

- **The copy's status is fixed at placement.** It comes from the source's state at that moment (`server/services/coauthor/coauthor-snapshot.ts`): APPROVED gives `approved`, FROZEN gives `finalized`, and anything else gives `draft`.
- **Only an approved copy is released.** Freeze, dispatch and transmit refuse a sequence that has any leaf whose document is not approved (`server/services/ectd/dispatch-gate.ts` `evaluateReleaseApprovalGate`; `leaf-source-resolver.ts`, DP-35).
- **The dialog said none of this.** A document placed as a draft stayed a draft copy after it was approved.
- **Placing again half-worked, silently.** It re-took the same copy as approved, because the server re-derives it. But the leaf answered "Already placed … Nothing was written" and kept the content pin it had taken from the draft, so nothing told the person what had happened or what to do.

The design marked "which field the dialog reads for the source's state" as unverified. By reading: the editor's document row carries `status` (`editor/DocumentWorkbench.tsx`, the `GET /docs` row). The copy's own status comes back on the `POST /api/coauthor/documents` row.

## What changed

- **`shared/regulatory/filing-copy-status.ts` (new).** `snapshotStatusFor` moved here unchanged from `coauthor-snapshot.ts`, which now imports and re-exports it. The server, which writes the copy, and the dialog, which states the copy's status, now share one rule.
- **`surfaces/AuthoringPlaceIntoFiling.tsx`:**
  - **Before placing** (`copyStatusLine`, from the new `docStatus` prop):
    - a draft or in-review document: "Filed as draft. Freeze will refuse it until you re-place it after approval."
    - a frozen, unsigned document: "Filed as finalized, not approved. Freeze will refuse it…"
    - an approved document: "Filed as approved…"
    - an unknown state: the rule only, with no claim about this document.
  - **After placing** (`placedCopyNote`): the server's copy status is stated. A copy that is not approved carries the freeze refusal.
  - **Already placed:** "The leaf was not changed" replaces "Nothing was written", because the copy may have been re-taken.
    - **Copy now approved:** the dialog says so and offers **Re-place approved version**. That button sends `PUT /api/submissions/sequences/:seqId/leaves` with `leafId`, rewriting the same leaf, which the server re-pins to the approved copy's text. The receipt must name the same leaf, document and section, or the failure is shown as for any placement.
    - **Copy still a draft:** the refusal is stated and no re-place is offered.
- **`editor/DocumentWorkbench.tsx`** passes `docStatus={activeDoc.status}`.

## Runs

| File | Result |
|---|---|
| `red/vitest.txt` | `__tests__/placeIntoFilingApprovalState.test.tsx` at `77d95ef2`, before the change: **8 failed**. |
| `green/vitest.txt` | **8 passed**. |

`documentAuthoringPlaceIntoFiling.test.tsx`, the existing dialog suite, passes unchanged. The full-suite, typecheck, lint and gate results are in the commit message.

## Not done here

- **No reverse check.** The dialog does not read a sequence's leaves to find, unprompted, a leaf whose copy has gone stale. "Re-place approved version" is offered when the person places the document again and the server answers with the leaf that already holds it.
- **No re-place from the Builder.** Offering it from the Builder's leaf rows needs the leaf's link back to its authoring source, which F18 also lacks.
