# F1: a removed sequence is not a project filing head (2026-11-09)

Found while proving F1 repair B (`docs/evidence/D7-READINESS-LIVE-SEQUENCE/2026-11-08/README.md`, "Found here"). The
coordinating session assigned it to RIM on 2026-11-09 with its fix and its red case.

## What already exists (RULE 3)

- `projectFilingHeads` (`server/services/projects/schedule-of-events/service.ts`) reads a project's filing heads:
  - its sequences;
  - those sequences' leaves.

  It had **no `deleted_at` filter on `ectd_sequences`** in either query.
- Its two callers are both in that file, and each gets the fix through the function:
  - `buildProjectMonitor` puts the heads into the monitor's input hash.
  - `observeProjectFilingGate` asks the one dispatch verdict (`assessSequenceDispatchReadiness`) of a project's single
    sequence. It answers `FILING_TARGET_REQUIRED` when there is none and `FILING_TARGET_AMBIGUOUS` when there are
    several.
- Since repair B, the verdict answers a removed sequence `NOT_FOUND`, and the gate reads that as `unavailable`. Before
  repair B, a removed sequence was assessed as if live.
- The leaf query keeps a removed **leaf** (`deleted_at`) on purpose: a leaf's removal must change the heads. That is
  unchanged.

## The change

- Both queries in `projectFilingHeads` ask for a live sequence:
  - the sequences query adds `AND s.deleted_at IS NULL`;
  - the leaves query adds it to its join to `ectd_sequences`.
- A project whose only sequence was removed has no filing target: `FILING_TARGET_REQUIRED`, not assessed. Nothing is
  asked of the removed sequence.
- No migration, no new file, and no route or client change.

## Proof

`server/services/projects/schedule-of-events/__tests__/admission.test.ts`:
- Its PGlite `ectd_sequences` gains the real table's `deleted_at` column.
- Two cases:
  - a project whose only sequence was removed: the filing check is `{ state: 'not_assessed', codes: ['FILING_TARGET_REQUIRED'] }`, and the dispatch verdict is never asked;
  - a removed sequence's leaves are not heads: changing one leaves the monitor's input hash as it was.

| File | What it shows |
|---|---|
| `red.txt` | at `74383c2df`: the removed sequence is assessed (`blocked` from the mocked verdict; `unavailable` in production since repair B) |
| `green.txt` | every schedule-of-events test |
| `mutation-1-removed-sequence-is-a-head.txt` | the sequences filter dropped: the first case fails |
| `mutation-2-removed-sequence-leaves-are-heads.txt` | the leaves join filter dropped: the second case fails |

## Plan

`Plan: F1`, `Completes: server/services/projects/schedule-of-events/service.ts`. The hold is recorded in
`.design/claude-convergence/COORDINATION.md` and released with this push.
