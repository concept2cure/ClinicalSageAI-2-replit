# F10: readiness is read inside Submit (D2, W-ONE-ANA)

2026-10-29. Launch row D2. FILING_SPINE.md F10 (the "Open readiness" link) and the slice-24 row; decision P-33
("Submission Readiness is the one dispatch verdict per sequence, shown inside Submit"), with P-36.

The red run is at `a0e24f77`, where these files were the same as at `7f9720d9` (the device FeatureDoor commit, re-read
first). The green, suite, mutation, lint and typecheck runs are at `fb562e76` with the change in the working tree.

## What already exists

Searches run: `'dispatch-readiness'` / `"dispatch-readiness"` across `client/`, `shared/`, `server/` and `tests/`;
`Check what stops sending`, `STEP_DOORS.readiness` and `Open readiness` across the client, tests and design docs;
`git log -S` on ProjectHome.tsx and ProjectMarkets.tsx for the door; `git log --all --diff-filter=D` on
`*Readiness*.tsx`, `*readiness*.tsx` and `client/src/concept2cure/v2/surfaces/*`. The deletion search found nothing.
The local history is shallow (its root commit is dated 2026-10-23), so it shows only that nothing was deleted since
then.

**The "Open readiness" link.** It is not in `ProjectHome.tsx` any more. F9 moved slice 24's door into the Markets
header of `surfaces/ProjectMarkets.tsx` (`:464-470` at head), named "Check what stops sending" (`STEP_DOORS.readiness`,
`projectDoors.ts:42`). It opened the separate canvas, with nothing carried. ProjectHome.tsx is not edited in this
slice.

**Every caller of the `dispatch-readiness` surface at head:**

| Where | What it does |
| --- | --- |
| `client/src/concept2cure/v2/surfaces/ProjectMarkets.tsx:466-470` | Submit's header door to the canvas. **Removed here.** |
| `client/src/concept2cure/v2/surfaceViews.ts:309, :455` | Registers the canvas (`DispatchReadiness`, lazy, `full: true`). |
| `client/src/concept2cure/v2/registryModel.ts:77, :769` | Segment `both`; the Apps catalog's "Review & govern" group. |
| `shared/constants/launch-scope.ts:156-157` | A launch surface and module under Submission Center (P-36). |
| `shared/constants/ui-surface-registry.ui-v2.ts:134-137` | Its layout mode. |
| `shared/navigation/index.ts:231` | The navigation entry, "Readiness". |
| `shared/navigation/callable-apps.ts:87` | AnA's "dispatch readiness" → the surface. |
| `shared/navigation/demo-scripts.ts:128, :205, :259` | Demo navigate targets. |
| `shared/types/onboarding-discovery.ts:262` | Discovery's "Review submission readiness" recommendation. |
| `shared/constants/deferred-capability-inventory.ts:31, :40` | `orchestration` and `ana-command` converge onto it. |
| `server/services/ana/skills/library/submissions.ts:407` | An AnA skill bound to its context. |
| `client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx:367` | Publishes the `dispatch-readiness` AnA context. |
| Tests | `dispatchReadiness*.test.tsx` (6 files), `submissionValidatedStage`, `documentClassSubmitTab`, `workflowDiscovery`, `clientNamesSlice1*`, `projectHomeSubmitStage:251`, `projectHomeDocuments:292`; `shared/navigation/__tests__/{callable-apps,demo-scripts}`; `server/services/entitlements/__tests__/launch-scope`; `tests/validation/oq/{projects,submission-readiness}/run.mjs`. |

`enforcement: 'dispatch-readiness'` in `server/services/ectd/validation-rule-corpus.ts` and
`shared/types/submission-api.ts` names the assessor that enforces a rule, not the surface.

**What the separate canvas showed that Submit did not.** Both draw `MarketsBody` from ProjectMarkets.tsx, one row per
market. Submit's rows drew the verdict in words (`marketVerdict`), `VerdictDetail` (blockers verbatim; the
not-assessed lines on a cleared verdict only; the structural counts), the support line, the application number, and
the row's door (`marketTarget`). Under the same rows the canvas drew `MarketGateDetail`:

- each composed gate as its own card (`GateCard`): the rule's title, "Satisfied." / "Not assessed. …" / "Blocks
  dispatch:" with that gate's own blockers, and the rule id and enforcement statement. On a blocked verdict, Submit's
  row did not say that a gate the server cleared without checking was not assessed; the card does;
- each structural finding with its rule and its act (`readinessFindingActs.ts`): Builder placement at the section, the
  placed leaf, or Validation, on that market's submission and sequence;
- the Dispatch door once the gate allows the next step, with the signed-steps note, and "Open governed transmit" once
  dispatched;
- the stale Validated-stage note;
- canvas chrome: the head, the pedigree footer (`deterministic_registry`), the no-project state, and the AnA context
  (`marketFacts`: answered, cleared, blockers, notAssessed, validatedStageHolds, external validation facts).

**What Submission Center's Validation workspace shows** (`openSubmissionCenter(onNav, { ws: 'validation', sequenceId })`
→ `ValidationWorkspace`, `SubmissionSeqWorkspaces.tsx:1249`). It reads the same `GET
/api/submissions/sequences/:id/dispatch-readiness`. It shows the stale Validated note, the leaf count and counts, each
finding with code, section, rule and message, "Explain the findings (AI)" (the model narrates; no verdict), and
`SubmissionConsistency`. It does **not** show the gate verdict, its blockers or the composed gates, and offers no act
per finding. The verdict, its blockers and the freeze, dispatch and sign controls are on the Dispatch tab
(`DispatchWorkspace`, `:2028`), which has no per-gate cards either.

## The decision: (a), the verdict renders under each Submit row and the door goes

Under each Submit market row is the canvas's own readiness detail, `MarketGateDetail`. It draws `VerdictDetail` where
the server sends no gate breakdown. The header door is removed.

Why (a):

- **One place to read it.** On a project, a person reads each market's verdict on its Submit row. The Submission
  Center tabs stay the working views for one sequence, which P-33 names ("which the Submit tab and the Submission
  Center render").
- **Nothing lost.** `VerdictDetail` was already on the rows at head. (a) with `VerdictDetail` alone would have dropped
  the gate cards, the finding acts and the Dispatch door, which only the canvas had. `MarketGateDetail` carries all of
  them, so the rows now show everything the canvas showed per market.
- **Why not (b).** Validation shows findings, not the verdict or its blockers, so the person would leave the verdict to
  read less than they left. A header door cannot name "that row's sequence" when there are two markets. And each row
  already opens Validation on its own sequence when it is blocked (`marketTarget`, F10), so (b) adds a second door to
  the same place and keeps the verdict in two homes.
- The IA already asked for this: `INFORMATION_ARCHITECTURE.md:637`, `dispatch-readiness`, "Left: the gate detail
  inline under each market row (`MarketGateDetail`, `DispatchReadiness.tsx`)".

The `dispatch-readiness` catalog and entitlement entries are untouched (P-33, P-36).

## What changed

- `client/src/concept2cure/v2/surfaces/ProjectMarkets.tsx`: Submit's `MarketsBody` passes `detail={(m) =>
  <MarketGateDetail m={m} onNav={onNav} center={center} />}`. The header door to `dispatch-readiness` is removed.
  Comments are updated.
- `client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx`: `MarketGateDetail` is exported (it was module-private).
  The header comment says Submit draws it and the canvas is a fold candidate. Nothing else changed.
- Tests: new `__tests__/submitHoldsReadiness.test.tsx`. Re-pointed, not deleted:
  `projectMarkets.test.tsx` (with a gate breakdown, the external outcome is the gate's own card),
  `projectHomeSubmitStage.test.tsx` (device rows and the verdict row carry the detail and no door; the unassessed gate is
  the one warn card, in the server's words, never "Satisfied"), and `projectHomeDocuments.test.tsx` (no readiness
  door).

No new component, and no copy. One `MarketGateDetail` is drawn by both screens. ProjectMarkets.tsx and
DispatchReadiness.tsx now import each other. Neither module uses the other's imports at load time, and both load
orders run green (the Submit suites load ProjectMarkets first, the `dispatchReadiness*` suites load DispatchReadiness
first). The cycle ends with the fold.

The component first went into ProjectMarkets.tsx, moved byte-for-byte. That raised ProjectMarkets.tsx from 0 to 2
ESLint warnings (`MarketGateDetail` complexity 28, and max-lines), and the lead's ratchet caught it. So it stays in
DispatchReadiness.tsx, where the same complexity warning already stands at head.

## Red, green, mutations

- **Red** at `a0e24f77`, before the change (`red.txt`). Three of the four cases fail on what they exist for: the
  header door is there; the rows show no findings or gates; a cleared row has no Dispatch door. The fail-closed case
  passes, because the row already said "No verdict" at head. Mutation 3 turns it red.
- **Green** after the change (`green.txt`): 4/4.
- **Suites** (`suites-head.txt`, `suites-after.txt`): 22 related suites, one file at a time. All green at head and all
  green after. Ten tests in three files failed at first, each only on the removed door or on `VerdictDetail`'s test
  ids under a gate breakdown. Each was re-pointed onto the row's detail, keeping the property it holds.
- **Mutations** (`mutations.txt`), each applied to ProjectMarkets.tsx, run, then restored byte-for-byte (checked with
  `cmp`, and the `git diff` of both surfaces unchanged):
  1. `restore-door`, slice 24's header button back: "no control on Submit opens the separate canvas" turns red.
  2. `wrong-sequence`, every row drawing the first market's readiness: three cases turn red. The MAA row loses its
     own finding; a blocked row gains a Dispatch door; a row whose read failed shows another sequence's "Satisfied".
  3. `unread-as-clear`, a failed read worded "Cleared to dispatch": the fail-closed case turns red.

**F0 reachability gate** (`tests/ui/filing-path-reachability.test.ts`): 21/21 green before and after. The baseline is
already empty (`"hops": []`), so no hop leaves or enters it.

**Checks** (`checks.txt`). ESLint per changed file is at or below head: ProjectMarkets.tsx 0 → 0, DispatchReadiness.tsx
2 → 2, the tests 0, the new test 0. The whole-tree typecheck (`typecheck-no-regression.mjs --incremental`) finds 0
errors. Undefined CSS classes, class vocabulary, fixture fallback and untracked imports are green.

## Fold candidate: the separate canvas

`surfaces/DispatchReadiness.tsx` and its `surfaceViews.ts` entry. **Not deleted in this slice.** It still has callers
(the Apps catalog card, discovery, AnA's callable app, the demo scripts, navigation), so it is not reachable only by
deep link. Per market it now duplicates Submit. What it adds is chrome: the head, the pedigree footer, the no-project
state, and the AnA context.

To delete it under the working agreement:

1. Name the replacement by path in the commit: `ProjectMarkets.tsx` Submit rows drawing `MarketGateDetail`, proved
   reachable by `submitHoldsReadiness.test.tsx` and the F0 gate (or a new F0 hop, "Submit market row → readiness
   detail").
2. Keep the name as the catalog and entitlement entry (P-33, P-36). Point `dispatch-readiness` at the open project's
   Submit step: `surfaceViews.ts`, `registryModel.ts`, `ui-surface-registry.ui-v2.ts`, `shared/navigation/index.ts`,
   `callable-apps.ts`, `demo-scripts.ts` (three targets and its test), `onboarding-discovery.ts`, and the
   `workflowDiscovery` card. With no project open, it must say "Open a project", which the canvas says today.
3. Move the AnA context first. Submit's `project-home` context carries no market verdict facts; the canvas's
   `marketFacts` must be published from Submit. That is a ProjectHome.tsx change. It must keep the rule that a missing
   verdict is never published as cleared (`dispatchReadinessActs.test.tsx`, "what AnA is told"). Rebind the AnA skill
   (`server/services/ana/skills/library/submissions.ts:407` and its golden file).
4. Decide whether the pedigree footer's statement belongs on Submit.
5. Move `MarketGateDetail` and its helpers out of DispatchReadiness.tsx, into ProjectMarkets.tsx or a file of their own,
   and take its complexity warning down so the ratchet holds. This ends the import cycle.
6. Re-point the canvas's suites onto Submit, not delete them: `dispatchReadinessActs`, `NamedRules`, `NotAssessed`,
   `OtherTypes`, `ProgramScope`, `ServerGate`, and the canvas cases in `submissionValidatedStage` and
   `documentClassSubmitTab`. The OQ scripts test the entitlement, which stays; check that they do not open the
   canvas.
7. Rerun the history search on every name the canvas has had, and update the design rows listed below.

## Left for the owners of other files

- `docs/design/FILING_SPINE.md:432` (slice 24) and `:453` (F10, "Not yet: 'Open readiness' … still opens
  dispatch-readiness"), `:363`, `:597`: the door is gone, and the readiness is under each row.
- `.design/client-journey/INFORMATION_ARCHITECTURE.md:242`, `:637`, and section 9's door row `:1698` ("Submit header |
  Open readiness | Check what stops sending"). `STEP_DOORS.readiness` (`projectDoors.ts:42`) is now drawn by no door.
  `clientNamesSlice1.test.tsx` requires a constant for every section-9 row, so remove the constant and the row
  together.
- `tests/e2e/launch-walk-doors.ts:15`: `^Check what stops sending$` in `DOOR` no longer matches anything. It is
  harmless.
- With no gate breakdown, `MarketGateDetail` prints the structural counts twice (once in `VerdictDetail`, once in its
  own block). This was already so on the canvas, and Submit now shows it too. Current servers send `gates`.
