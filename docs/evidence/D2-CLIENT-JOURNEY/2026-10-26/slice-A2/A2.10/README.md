# A2.10: filing discovery/reference fold and expanded parity review

Launch row D2, 2026-10-26, canonical branch `concept2cure-v2`.
Base: `f033cc722be329cd50c0bdac2e0bfce816f8eafd` (incoming Account work retained).
Design: `.design/client-journey/A2_10_REMAINING_FOLDS.md`.
Current four-fold audit: `.design/client-journey/A2_10_REMAINING_PARITY_REVIEW.md`.

## What already exists

- `client/src/concept2cure/v2/surfaces/Projects.tsx` and
  `surfaces/AnaVerbs.tsx::RegistryPicker` already own canonical intake, real
  server offers/refusals, filing search, selected build facts and Ask AnA.
  `shared/regulatory/filing-catalog.ts` owns filing identities and categories.
  Complete these owners; no second picker, writer or offer policy is added.
- The former `surfaces/FilingsCatalog.tsx` separately rendered those filings
  and authored lifecycle tables in `fixtures/filings-catalog-data.ts`. Its Start
  opened an editor without retaining the choice through intake. The tables are
  reference content, not assessed readiness, project deadlines or support grants.
- `surfaces/ProjectPlan.tsx` already composes IND/device plans, assignments and
  Tasks. Intake already stores the exact filing in metadata.submissionTypeId;
  its scoped detail serializer previously withheld that individual field along
  with all internal metadata. Extend that serializer and Plan, not the store.
- The shared alias/action resolver already supports one-time destination
  actions. Catalogue creator 20260810 and packaging 20260823 both replay on
  deploy. Amend both owners in place; retain retired rows and subscriptions.
- MissionControl, CroPortfolio, BiopharmaJourney, MDX Overview and
  ClientReviewZone still own distinct functions or legacy records. The audit
  traces routes/services/tables, AnA claims, current replacements and gaps.
  `server/services/cro/cro-portfolio-view-assembler.ts` reads cro_* engagements;
  those are not equivalent to canonical client_workspaces. No production
  tenant inventory is available to prove absence of mission-control records.
- Deleted-history search found the old DeviceWorkstream shell (`2895218b8`),
  useMissionControl (`440071600`) and MissionControl page family (`77034aa5f`).
  Searches/callers and limits are recorded in the design and audit. Existing
  implementations are reached or corrected; none is rebuilt beside itself.

## Delivered behavior

The filing catalogue's ten parity functions now live in the existing wizard
and recorded Plan: description/workflow search, cross-segment labels, category
copy, every offered/refused filing, visible descriptions, authority/format/CTD
metadata, build facts, authored lifecycle and the shared Ask AnA question.
`FilingReference.tsx` is one read-only projection; shared
`filing-lifecycle-reference.ts` is the single migrated owner. Its workflow label,
loop mapping and nine archetypes are byte-identical to the original tables
(`filing-content-proof.json`); no missing archetype is invented.

Unavailable filings have inspectable reference details, with no select/Start
act. AnA receives actual segment/search plus distinct inspected-reference facts
and the selected offered filing; account retirement clears the context and typed
configuration remains excluded. Independent review caught this inspected-detail
parity gap and the follow-up demonstrated red before green (`fold-review.md`).
Plan uses only recorded `submission_type_id`; malformed/missing metadata and an
unknown identity never infer a filing from tenant or application type. Internal
metadata stays private. Reference clocks/stages explicitly say they are general
catalogue reference, not current status, deadlines or agency commitments.

Legacy `/concept2cure/filings-catalog` reaches Projects with the existing
`projects.new-project` action once, preserving query/fragment and the selected
project step. Repeated navigation preserves an already open typed intake.
The old component, fixture, view/registry/nav/collaboration rows and five fixture
exceptions are removed only after FUNCTION_PARITY confirms their replacements.
No separate AnA target existed. Seed replay deprecates old catalogue rows while
preserving metadata/subscriptions, and fresh installs need no retired identity.

The expanded review also corrects CRO medical_device/diagnostic labels, preserving
unknown literal values and explicit missing values. Two device project commands
were already independently in scope: only their descriptions/historical note
are clarified. Executable scope arrays, handlers, access policy, confirmation and
audit transactions remain unchanged (`commands-source-proof.json`). Their current
ownership regressions are not a claim of newly added PM-anchor checks.

## Qualification on the final source

| Check | Observed result | Evidence |
| --- | --- | --- |
| Focused combined regression | 378 tests, 33 suites, 79.77 seconds | `final-qualified.log.gz`, exact union `test-files.txt` |
| Native PostgreSQL intake/client/anchor SQL | 16 passed, 11.80 seconds; disposable restricted role/FORCE RLS, synthetic auth/quota as declared by the suite | `native-db.log.gz`; `tests/db/project-client-workspace-intake.dbtest.ts` |
| Native application/browser | 3 passed, 34.4 seconds: IND and 510(k) legacy→wizard→canonical Create→recorded Plan→reload/mobile, plus existing action/no-premature-write flow | `browser-qualified.log.gz`, `native/results.json`, safe result JSON/PNGs |
| Creator + packaging replay | 3 passed; old subscription/metadata survive two applications, fresh replay creates no retired row | included in combined batch; separate `filing-catalog-replay-green.log.gz` |
| Production build | Client 21.96 seconds; server and audit verifier complete | `build.log.gz` |
| Formal protocol syntax and matrix | Runner syntax valid; historical set regenerates 117 requirements, 69 pass / 2 partial / 46 uncovered | `traceability.log.gz`; updated validation package |
| Mandatory publication gates | Pending the normal push at this README revision | Acceptance receipt will be added after publication |

Red evidence: exact filing projection (8 failures), alias/action destination
(5 failures), reference carryovers (5 failures), Plan reference (2 failures with
negative cases already passing), inspected-reference context (2 failures), old
catalogue recreation and later packaging mutations. Safe compressed logs are
filed beside their green results. Earlier 107-test filing and 100-test command/CRO
batches overlap the combined union and are not added to its count. The initial
browser attempts exposed harness name/label selectors, then were corrected;
no product access, limiter, offer or grant was relaxed to make them pass.
The final mobile screenshots close the existing navigation rail and show the
reference itself, with no document horizontal overflow.

`source-proof.json` pins 33 changed source/test/config hashes and deleted files.
All browser identities and data are synthetic. No credentials, tokens, traces,
model requests or real tenant data are archived.

## Remaining folds and formal validation

Mission control, device-workstream, CRO portfolio and project journey retain
shells, stores and existing entitlement verdicts. Their production-record,
engagement mapping, reliable fact-source, sharing/error/scope and reference/
review parity gaps are enumerated in the audit. A2.10 is not blanket-complete.
Continue A3's existing AnA prompt-key convergence while tracking those prerequisites.

URS-PROJ-007a and OQ-PROJ-12 v0.8 describe the revised filing path. The formal
protocol is not executed or signed at this revision; historical step-12 results
qualify the former screen only. TM-001 uses the same selected 2026-09-27 historical
execution set and marks the new requirement uncovered. Supplemental checks here
do not establish whole-product qualification or a completed commercial launch.
