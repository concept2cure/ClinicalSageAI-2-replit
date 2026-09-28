# Honest-state lens: launch catalog, 2026-09-24 (run 2026-09-25 01:10 UTC)

Auditor: `honest-state-auditor` (`.claude/agents/honest-state-auditor.md`), read-only apart from
running checks. Head reviewed: `f14f5510` (`concept2cure-v2`). Its report is condensed here with
every finding kept.

## Method

Re-verified the 2026-09-22 honest-state findings (all six launch apps were reported clean; the one
open item, H1, is `mdx/surfaces/VaultSurface.tsx`, `device-vault`, outside `LAUNCH_APPS`). Resolved
scope via `shared/constants/launch-scope.ts` → `client/src/concept2cure/v2/surfaceViews.ts`
(21 surface ids; `protocol-dev` now maps to `ProtocolWorkspace`, `quality` to `QualityModule`).
Read every launch surface's fetch and render for both branches, `assessmentState.ts` usage,
fixture imports and count/percentage logic. Read the diff since last review's head; several of
those commits are themselves honest-state fixes (Vault document counts, Projects portfolio paging,
TaskBoard critical path, dispatch-readiness gate composition, eCTD release-signature fields) and a
sample was spot-verified against current code.

Checks run:

| Check | Result |
|---|---|
| `ci:internals-in-copy` | clean, 0 baselined |
| `check:microcopy` | clean, 381 files |
| `hostilePayloadProbe.test.tsx`, `PROBE_ONLY` = the 21 launch surface ids | 22/22 pass (`tasks` registers under two ids) |
| `dataConnect.tsx` | the `useLive`/`<SampleTag>` fallback API is deleted (ledger L72); `<SampleTag` renders nowhere in production code. All 21 launch surfaces use the fixture-free `useLiveData`/`useLiveRows`/`liveGetOrNull`/`liveMutateOrNull` contract |

## Findings

| # | Sev | Where | Claim vs truth | Status |
|---|---|---|---|---|
| HS1 | medium | `v2/surfaces/TemplateLibrary.tsx:101,617,679` | `_tlConf(c)` collapses a `null` `extractionConfidence` (the store's honest "no extraction ran" for hand-built or pre-migration templates, per the type comment at :69-71) into `0`, and both call sites render it unconditionally: the list row prints "… - 0%", and the always-present Extraction tab prints "Extraction confidence 0%" in a warning-amber bar because `(null \|\| 0) < 0.6`. A user reads that AnA extracted this template and nearly failed, when no extraction ever ran. The AnA-facing narrative at :477 already gates on `!= null`; the pixels do not. | **fixed** `896e96fb`: the list row reads "not extracted" and the Extraction tab shows a sentence, no bar, when `extractionConfidence` is null. The four dead `SC_*_RAW` exports were deleted in the same commit. |

Also noted, not a finding: `v2/fixtures/submission.ts:107-200` still exports `SC_SEQUENCES_RAW`,
`SC_FINDINGS_RAW`, `SC_SHADOW_RAW`, `SC_CROSSREGION_RAW` sample rows with zero importers anywhere in
`client/src`. Dead, not reachable — but the file's own policy (the note at :99-105 on the deleted
`SC_SUBMISSIONS_RAW`) says a dead sample programme is one import away from being live again, so it
goes rather than sits.

## Re-verified from 2026-09-22 (all still hold at `f14f5510`)

- Projects `surfaces/Projects.tsx:891-899,924-935`: paged portfolios show `countFloor` ("50+") with a disclosure note, not a false total (`7332200d`).
- TaskBoard `:733,781-801`: `critDesignated` still gates "critical path is clear".
- Vault `:849-874`: document counts gated behind `vaultState.loading/error`; an unreadable branch is `null`, not `0` (`d0e788b5`).
- ArtifactsCenter (`AdminSurfaces.tsx:2345-2377`): a failed read publishes as a failure, not an empty gallery; export disabled on `loading || error || rows.length===0`.
- DossierMap `:88-202`: loading, error and empty are distinct states through `useLiveRows`.
- PublishingCenter `:55-99`: a wrong-but-plausible body shape is rejected structurally before rendering.
- EctdCoauthor `:175-189`: the refusal reason travels with a `null` result rather than collapsing to "unavailable".
- DispatchReadiness `:236-359`: consumes the server's composed gate verbatim; "unanswered" is not "cleared".
- QmpWorkspace `:161-162,354-358`: the full dashboard shape is required before any completeness percentage renders.
- ChangeControl `:162-175`: `summary === null` renders "unavailable", never a zero-filled KPI row.
- ProtocolDev / BiopharmaProject: completeness and readiness narratives require server state and use `typeof === 'number'` / non-null checks, not truthiness.
- GatewayTransmittals `:360-366`: the platform's own record is labelled `…-NOT-AN-AGENCY-ACK.txt` and is never called an agency acknowledgment.
- EctdCompile release-signature panel `:1429-1481`: signer, time and meaning via `signatureMeaningLabel` (P4, fixed 2026-09-24) — open last week, closed now.
- Fixture imports across the 21 launch surfaces resolve to type-only imports, tone/status enum maps or reference taxonomy (`FILINGS_TAXONOMY`); none renders as tenant state.

## Clean, read end to end (both branches)

Projects, ProjectHome, BiopharmaJourney, FilingsCatalog, Vault, DocumentAuthoring, Review,
RegulatoryWorkspace, SubmissionCenter, DossierMap, EctdCompile, EctdCoauthor, PublishingCenter,
GatewayTransmittals, DispatchReadiness, QualityModule / SopRegister / ChangeControl, QmpWorkspace.

## Not re-verified

H1 (`mdx/surfaces/VaultSurface.tsx:367-379`, `device-vault`): outside `LAUNCH_APPS`; the device
stream stays paused under RULE 2, as last week.
