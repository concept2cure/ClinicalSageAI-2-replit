# Submission Center: the Truth Engine gets a screen (pass 9)

Launch row D2. Canonical branch `concept2cure-v2`. The founder asked for the CMC sweep to
be worked down surface by surface, starting with Submission Center — "the one a client hits
right after Module 3".

## What the sweep found, and what it did not

The same instrument as CMC, over Submission Center's five surfaces' claimed prefixes
(`live/submission-center-reachability-sweep.txt`): **83 routes, 45 reported with no client
caller.** The authoritative cross-check — the repo's own launch walker, which resolves
imports rather than grepping strings (`live/submission-center-paths-named-by-launch-screens.txt`)
— says the launch screens name **24** paths under `/api/submissions`.

Hand-verified before anything was called a gap, and the sweep over-reported in the way it
is documented to:

- **`freeze` and `dispatch` ARE reached.** `SubmissionCenter.tsx` builds
  `` `/api/submissions/sequences/${f.seq.id}/${f.kind}` `` where `f.kind` is the governed
  step, so the final segment is a variable and neither instrument can see it. Reported as
  missing doors; they are not.
- **~25 of the rest are device and IVD assessment endpoints** — `device/per`,
  `device/classify`, `device/risk-management`, `device/biocompatibility`,
  `device/sterilization`, `device/qms`, `combination-product/assess` and their siblings.
  Their surfaces are in the launch scope but call only `device/cer/{assess,structure}`.
  Reaching the rest means building device UI, which is neither CMC nor the US IND drug
  path, and is a founder decision rather than a session's.
- **~10 are a regulatory reference service with no screen** — `market-specs`,
  `document-templates`, `requirements`, `designations`, `change-categories`,
  `capabilities`, `validation-rules`. Plausibly valuable; a new surface, so not taken.

That leaves the Truth Engine, and it is the one that matches the founder's complaint
exactly.

## What already exists (RULE 3)

| Path | What it does today | What it does not do |
| --- | --- | --- |
| `server/services/truth-engine/truth-engine-service.ts` | `runConsistencyCheck` compares a claim's figures against its sources and PERSISTS each verdict to `consistency_findings`; `listConsistencyFindings` reads them back. | — |
| `server/services/truth-engine/figure-consistency.ts` `compareLabelledFigures` | Per-label comparison with `notCompared` carrying every figure that got no verdict, and why. | Returned `{findings: [], notCompared: []}` when the CLAIM yielded no recognised figure — see below. |
| `GET /api/submissions/:id/consistency` | Returns the stored findings, tenant-scoped. | Had **no browser caller**. The route says so itself: *"No browser client calls this route today (AnA's `check_consistency` is the reachable path)"*. |
| `POST /api/submissions/:id/consistency` | Runs a check, writes the §11.10(e) row, and reports `X-Consistency-Not-Compared` — because *"an empty array is 'nothing compared' as often as 'no conflict'"*. | — |
| `shared/types/submission-ui.ts` `SUBMISSION_WORKSPACES.validation` | The Validation workspace, contracted to `POST /:id/validation/explain`. | Named neither the consistency route nor `check_consistency`. |
| `SubmissionSeqWorkspaces.tsx` `ValidationWorkspace` | Dispatch readiness and the validator's findings, explained. | Showed nothing about whether the submission agrees with itself. |

Searched: `consistency`, `truth-engine`, `consistencyFindings`, `check_consistency`,
`traceProvenance`, `compareLabelledFigures`, by route, table, AnA tool and surface;
`git log --all --diff-filter=D` on Consistency/TruthEngine component names found no
deleted predecessor screen.

## What changed

1. **`SubmissionConsistency.tsx`** — the recorded checks, in the Validation workspace.
   Validation asks whether the package is well formed; this asks whether it agrees with
   itself. Each row: the dimension, the claim, the source it was checked against, the
   verdict, the engine's own detail, when it was recorded.
2. **The one thing it may never say.** An empty table means NO CHECK HAS RUN — not "no
   conflict found". Those are opposite claims to a reviewer deciding whether to file, and
   the first is the one this panel was at risk of making. The empty state says so in
   words, a failed read is the failure, a 200 of the wrong shape is a failure, and the
   heading counts what was **checked** rather than asserting a state.
3. **The workspace contract names what it now calls** — `GET /api/submissions/:id/consistency`
   and the `check_consistency` tool that writes the findings.
4. **Silence is no longer reported as agreement** (`figure-consistency.ts`). When the claim
   yields no figure the extractor recognises, the comparison loop never ran and the result
   was `{findings: [], notCompared: []}` — which every caller reads as "compared, nothing
   to flag". `notCompared` exists for exactly that distinction and the one case where it
   matters most defeated it.

## Live, through the real route (`live/`)

Measured against the running app, before and after (4):

```
POST /api/submissions/1/consistency
  left  §2.7.3 Table 4  "A total of 248 subjects were randomised."
  right CSR-0042 §10.1  "In total 251 subjects were randomised to treatment."

before:  200 []   X-Consistency-Not-Compared: 0     <- read as a clean check
after:   200 []   X-Consistency-Not-Compared: 1     <- nothing was compared, and it says so
```

Two numbers that plainly disagree, and the answer read as agreement. The extractor wants
`N = 248` or `randomised: 248`; **widening what it recognises is its own change and was
not made here.** What was fixed is reporting silence as agreement.

`live/consistency-live.json` — a recognised pair, checked and stored through the real
route, as the panel reads it:

```
dimension subject-counts · §2.7.3 Table 4 vs CSR-0042 §10.1 · conflict
detail "p_value: §2.7.3 Table 4 gives 0.001; CSR-0042 §10.1 gives 0.03."
```

## Tests: shown failing first (`red/`)

Each is the exact mutation the case exists to catch:

- `red/unchecked-shown-as-consistent.txt` — the empty state reworded to "No conflicts
  found / This submission is consistent": **2 of 14 fail**.
- `red/failed-read-shown-as-empty.txt` — the error branch removed so a failed read falls
  through to the list: **2 of 14 fail**.
- `red/silence-reported-as-agreement.txt` — the new guard disabled: **3 of 7 fail**.

## Not done here, and why

- The device and IVD assessment endpoints, and the regulatory reference service. Both are
  real capability with no screen; neither is the US IND drug path, and building either is a
  surface decision for the founder (RULE 2).
- `GET /:id/provenance` (trace a section's figures to their sources) is the Truth Engine's
  other half and has no screen either. It needs a section to trace FROM, so its natural
  home is the Builder's leaf view rather than this panel; left for its own slice rather
  than bolted here.
- The extractor's vocabulary. `compareLabelledFigures` only compares what
  `LABELLED_NUMERIC_PATTERNS` recognises, and ordinary prose — "A total of 248 subjects
  were randomised" — yields nothing. That is a real limit on the engine's usefulness; it
  is now **reported** rather than hidden, which is the precondition for widening it.
