# Design-system lens — eCTD / Submission Center lane, 2026-09-28

Head reviewed: `c1cd656b2` (`concept2cure-v2`). Read-only. No gate run with
`--write-baseline`; `git status --porcelain` empty before and after.

Lens: `.claude/agents/design-system-auditor.md`, invoked by name.

This lens is one of the three the 2026-09-24 review recorded as owed:
*"the design-system lens did not run anywhere, so the next weekly review owes
those first."* It had never run on this lane.

## Gates

| Gate | Result | Delta vs 2026-09-24 |
|---|---|---|
| `ci:design-system` | pass — no icon-library, spring/bounce or inline `<style>` violations | — |
| `ci:token-contrast` | pass — 67 pairs, 15 documented exceptions, all at or above recorded ratios | 0 |
| `ci:check-phantom-tokens` | pass — 9 phantom tokens across 53 sites (baseline 9), no new | 0 |
| `ci:check-chip-tones` | pass — 139 literal tone uses, all 28 resolve | count 138→139 |
| `ci:token-cascade` | pass — 39 stylesheets resolve cleanly | 38→39 |
| `ci:check-css-selector-shadowing` | pass — 42 stylesheets, 21 known shadowed, 0 new | 0 |
| `ci:check-orphaned-stylesheets` | pass — 46 imported / 0 orphaned (baseline 0) | 45→46 |

Seven gates, all pass, no baseline regressions. The three count bumps are repo
growth elsewhere: none of the four primary files in this lane touches a `.css`
file or adds a literal tone. Which file added the 139th tone was not traced.

Two further gates were run by the reviewing session after the lens reported
(see the correction below): `ci:launch-scope` and `ci:launch-scope-api`, both
**pass**.

## Correction carried by this lens, and a correction to it

The lens corrected a premise in its own charge. The charge said
`shared/constants/ui-surface-registry.ts` "drives `SURFACE_VIEWS` and the lazy
chunks". It does not. `client/src/concept2cure/v2/surfaceViews.ts:50` imports
only the `UiSurface` **type**; the `SURFACE_VIEWS` map (`surfaceViews.ts:360`)
and its `lazySurface(...)` imports are built independently, keyed by matching
string ids in a second file. They are two parallel registries.

**The premise was mine, in the charge, and it was wrong.** Recorded so the next
review does not inherit it.

The lens then inferred that *"nothing enforces the two files staying aligned"*
and flagged that it had not run `ci:launch-scope`. **That inference is wrong,
and the reviewing session checked it rather than filing it.**
`scripts/ci/check-launch-scope.mjs` enforces the alignment in both directions:

- rule 1 — *"Every launch surface id is a SURFACE_VIEWS key (the shell can
  route to it) and is registered in UI_SURFACES or is the synthesised `home`"*
- rule 2c — *"Every SURFACE_VIEWS key outside the scope (after
  DEEP_LINK_ALIASES) is in UI_SURFACES, so the server emits the 'launch-scope'
  verdict that locks its deep link. An unregistered one renders ungated."*

Both gates pass at head. So: the structure is two files, correctly described;
the risk is real in principle and closed in practice by a gate the lens did not
run. Neither half should be dropped from the record.

## Registry integrity

`git diff 42eb291d..c1cd656b2 -- shared/constants/ui-surface-registry.ts`
touches only `apiPrefixes` and their comments. Every submission-lane prefix
checked against the mount table:

- `ectd-compile` → `/api/submission-orchestrator`, mounted
  `server/bootstrap/register-document-routes.ts:173`. Real.
- `dossier-map` → `/api/dossier-map`, mounted
  `server/bootstrap/register-inline-routes.ts:981`. Real.
- `gateway-transmittals` → narrowed from bare `/api/mdx` to `/api/mdx/gateways`;
  `/api/mdx` is mounted (`register-inline-routes.ts:1180`) and
  `mdxSubmissionGatewayRoutes` is layered onto it (`:1223`). Real. The file's own
  comment records why it was narrowed (D2, 2026-09-26: the bare prefix made
  every unrelated device-kit API answer as "launch").
- `submission-center`'s deliberate non-listing of `/api/submission-center` is
  still commented as deliberate.

No phantom prefix in this lane. The ~44 other prefix edits in the diff were not
checked against the mount table.

## Finding — DS-01, advisory

**`EctdCompile.tsx:1362-1456` presents stats in a second idiom.** The folded
orchestrator/release-signature panels render counts as free-standing "big stat"
blocks (`fontSize: 22, fontWeight: 700` over a `fontSize: 12` caption, eight
times). The file's pre-existing panels report numbers inline — `<b>{n}</b>
errors · <b>{n}</b> warnings` (`:1235`) and `rd-chip` badges in table cells
(`:1215`). Two ways of showing a count in one surface.

Tempering, and it changes the fix: the big-stat idiom is **not** invented here.
It is already copy-pasted in `Part11Console.tsx:224-225`,
`InvestigatorBrochure.tsx:173` and `Risk.tsx`, and there is no `StatCard`
primitive in the shared v2 set (`icons.tsx`, `C2CForm.tsx`, `AnswerLead.tsx`,
`dataConnect.tsx`). The fold reused an already-duplicated pattern rather than
inventing one.

So the fix is a `StatBlock` primitive consumed by all four call sites. Spot-fixing
`EctdCompile.tsx` alone would create a fifth divergent copy — which is the
failure mode, not the remedy. **Not fixed in this change; it is a shared-primitive
decision wider than this lane.**

Timing note: the fold landed in `1ae9dbb47` (2026-09-08), *before* the last full
review, not after. The prior review's report does not mention `EctdCompile.tsx`
at all, so it was not checked then either.

## Positive finding, recorded because it is the rule working

`SubmissionSeqWorkspaces.tsx:37,318,333,420` and
`VaultPlaceIntoSubmission.tsx:34-40,358` both consume `PlacementReasonField` /
`placementReasonOk` / `PLACEMENT_REASON_REQUIRED` from the shared
`./filingTarget.tsx:323-376` rather than each hand-rolling a reason textarea —
one canonical placement-reason control across both surfaces that needed it. It
reuses existing classes per call site rather than minting new ones. This is the
Zero Duplication rule being followed, in the lane, in this window.

No hex colors in any of the four primary files (grep-confirmed, all four empty).
The `SubmissionCenter.tsx` / `EctdCompile.tsx` diffs since the last review are
backend plumbing (`programId` anchoring, `serverMessage`/`redactInternals`) with
no styling change.

## Not covered

- `ci:undefined-css-classes`, `ci:surface-text-ramp` — not in the charge.
- The ~44 non-submission `apiPrefixes` edits in the registry diff.
- `shared/types/submission-ui.ts`, `SUBMISSION_WORKSPACES`, the rest of the
  1,089-line registry.
- Which file added the 139th chip tone / 39th stylesheet / 46th import.
- 2026-09-24's open item G2 (`TB_MOD` raw-hex palette in `TaskBoard.tsx`) — out
  of this week's lane.
- The four primary files were checked by targeted grep and at the diffed
  regions plus the fold, not read line by line end to end.
