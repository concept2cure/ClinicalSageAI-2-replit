# Placing Module 3 into the IND is governed, idempotent, and works for amendments

Row **D2** (and D5 §11.10(e)). Discovery map 2026-10-04 findings:
`placement-second-door`, `placement-not-atomic-not-idempotent` and
`cmc-placement-no-reason-own-picker`. A fourth defect turned up while testing
and is listed below.

## The defects

Each was reproduced on a running server (`red-simulation-before.txt`,
`red-route-before.txt`):

1. **No role, no reason.** `POST /api/cmc/module3-os/place-into-submission`
   writes leaves into a regulator-facing sequence. Its Submission Center
   equivalent requires the `regulatory-author` role and a governed reason. This
   route required neither: a viewer could place Module 3 into the IND, and the
   ledger said what changed but never why.
2. **Placing twice duplicated everything.** Re-placing into the same sequence
   added a second leaf for every section: **21 → 42 leaves**. A retry after a
   failure partway through doubled every section the first attempt had reached.
3. **An amendment could not be filed (found here).** The second sequence, a CMC
   information amendment, returned **500**. Placement named the earlier
   sequence's leaf as `parentLeafId`. `upsertLeaf` admits a parent only inside
   the same sequence, so it refused the first section.
   - The unit test had pinned `parentLeafId: 700` (the earlier sequence's
     leaf). Its mock of `upsertLeaf` never applied the rule, so the defect
     passed CI.
   - The packager derives eCTD `modified-file` from what the agency holds, by
     section code (`prior-sequence-loader.ts`). So the cross-sequence parent was
     never needed.
4. **Its own picker.** The board used its own submission and sequence pickers.
   They listed every submission of the organisation, another project's included,
   which the server then refused.

## The fix

- **Route.** It now has `requireRole('regulatory-author')`, the Submission
  Center's gate. `requireGovernedReason` gives 400 `REASON_REQUIRED` with
  `field: 'reason'`. The reason travels to every leaf's audit row (`upsertLeaf`
  `reason`) and to the provenance event.
- **Service** (`place-module3-into-submission.ts`):
  - A section that already has a live Module 3 leaf in this sequence is
    **updated in place** (`leafId`). Placing again, or retrying after a partial
    failure, completes the placement without duplicates. Each placement reports
    `updatedInPlace`.
  - A section filed in an earlier sequence is a `replace` with **no**
    cross-sequence parent.
  - A leaf whose last operation was `delete` is off file, so its section is
    filed afresh.
- **Client.** `CmcPlaceIntoSubmission.tsx` replaces the board's inline copy
  (moved out of `CmcModule3Build.tsx`). It uses the ONE filing picker the Vault
  and Authoring placements use (`filingTarget.tsx`): this program's submissions
  only, locked sequences offered disabled with the reason. It also uses the one
  `PlacementReasonField`. The button stays disabled until the reason meets the
  floor. The capability is the same, now reachable through
  `CmcPlaceIntoSubmission.tsx`. That file is pinned by
  `cmcSuiteWrites.test.tsx` (the board renders it and places through it) and by
  simulation steps 19, 21c and 21d.

## Red, then green

- **Route** (`red-route-before.txt`). Against the previous route,
  `module3PlacementGovernance.test.ts` fails all three tests: a viewer placed
  (200, where 403 was expected), a placement with no reason placed (200, where
  400 was expected), and the reason never reached the service. With the fix, all
  three pass.
- **Staff simulation, real server** (`green-simulation-after.txt`): **129
  passed, 0 failed**.
  - A placement with no reason is refused with 400 `REASON_REQUIRED`.
  - Re-placing into the same sequence leaves **21 leaves, each updated in
    place**.
  - Sequence 0002 carries the Module 3 leaves as **`replace=21`**.
- **Service.** `place-module3-into-submission.test.ts` has 21 tests, including
  the same-sequence update. The replace test now pins `parentLeafId: null`.
- **Client.** `cmcSuiteWrites.test.tsx` has 20 tests, including "does not
  place without a stated reason, and offers only this program's submissions".
- **Wider runs.** All CMC route suites pass: 17 files, 172 tests.

## Not yet

- **Not one transaction.** Placement is not a single transaction:
  `upsertLeaf` opens its own locked transaction per leaf. A failure partway
  still leaves the sections placed so far. Because placement is now idempotent,
  placing again completes it without duplicates. True all-or-nothing placement
  needs `upsertLeaf` to accept a caller's transaction, which is a Submission
  Center change.
