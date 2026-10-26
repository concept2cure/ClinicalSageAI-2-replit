# A2.5 — complete the existing filing picker note and Ask AnA guidance

Launch row D2, client journey; canonical branch `concept2cure-v2`. Base
`301ca385c` includes the accepted central-service/project-workflow direction;
this slice remains the small filing-picker completion named by that handoff.

## What already exists

- `v2/surfaces/AnaVerbs.tsx` owns RegistryPicker, server offer reads, grouped
  filings, chosen-offer notes and search. Descriptions are currently tooltips;
  search omits them. It already retains the chosen filing's market response.
- `server/services/regulatory/market-support.ts` sends outline pack/state,
  Module 1 state/detail and channel state/detail. The client
  `v2/MarketSupportLine.tsx` reads summary/line but does not type those richer
  fields. Extend that existing read model; do not copy catalog claims about
  validation or transport into offers that do not have them.
- `shared/regulatory/filing-catalog.ts` owns normalized catalog entries and
  descriptions. `v2/surfaces/FilingsCatalog.tsx` contains the existing Ask AnA
  question. Move that exact question builder to the shared catalog and consume
  it in both existing places.
- `v2/surfaces/Projects.tsx` owns the actor-bound NewProjectWizard and creation
  guards. Its parent currently publishes only that intake is open; it does not
  know the actual wizard step or chosen filing. The existing surface-context
  channel can publish those facts from the owning wizard session.

Searches cover RegistryPicker, market-support, outline/module1/channel details,
filing prompts, descriptions and every caller, plus deleted history on the same
filing/picker/market-support paths. Available history includes an earlier
duplicate IND readiness engine removal; no picker replacement is reconstructed.
The canonical placement map and its updated owner inventory remain authoritative.

## Contract and verification

Show the chosen filing's catalog description as reference wording. Compose build
facts only from its existing market response, keeping unclaimed/unsupported and
failed-read limits honest. Search descriptions. Reuse one shared Ask AnA prompt,
wire it through the current callback, and publish the wizard's actual step and
selection without typed personal/project input. Keep actor, workspace, market,
entitlement, review and human-Create gates intact. No catalog/flow/route retirement,
new store/dependency, lifecycle-clock copying or external provider call.

## Result

The chosen note now shows **Catalog reference** and **How you’ll build it**, using
the existing catalog description and verified outline pack/version, Module 1 and
channel details from the selected market response. No additional request is made.
Unclaimed aliases do not inherit parent-application build facts; omitted or
malformed richer fields say the details could not be read. Existing offers,
refusals and their Retry behavior remain intact. Description search uses the same
rule for offered and not-offered filings.

`filingAskPrompt` in the shared catalog owns the existing question wording, used
by both the catalog detail and the picker. Optional `onAsk` props preserve other
picker/direct-wizard callers; Projects passes its real shell callback through.
Ask AnA prepares the question in the existing conversation, as other screen
questions do. The person still chooses whether to send it.

Projects remains the sole surface-context publisher. Its wizard reports a
memoized public step and selected filing through a React callback, avoiding two
publishers clobbering the same slot. The context includes no typed name, product,
indication, client-workspace name or account identity. Closing restores portfolio
context; reopening, account changes, invalid actors and delayed portfolio reads
cannot revive earlier wizard metadata. Existing workspace/current-read and
human-Create guards remain unchanged.

## Verification

- Picker/search red: **7 failures**, one already-passing no-callback case.
  Catalog prompt red: **2/2 failures**, including actual button delegation.
  Wizard-state red: **5/5 failures** against the prior generic context.
- Final affected client regression: **177/177**, 21 suites, including the
  actual wizard's six step/selection/privacy/actor cases and existing intake,
  opener/idempotence, workspace, refusal, regional classification and portfolio
  checks. The two direct wizard/opener suites also pass **12/12**.
- Picker/market/server-offer/catalog regression: **148/148**, seven suites;
  catalog-specific regression: **49/49**, four suites. These targeted runs
  overlap and their counts must not be added. See [picker.md](picker.md) and
  [catalog.md](catalog.md) for exact scopes and limitations.
- Three native-server Chromium flows pass together (**39.6 seconds**): the new
  filing guidance/prefill flow, the existing action-to-wizard/manual-Create
  flow and project-step return/reload. The new flow searches description-only
  wording, selects IND, compares displayed pack/version/Module 1/channel against
  a real authenticated market response, and clicks the actual Ask AnA button.
  The existing conversation contains the exact shared question and Projects
  origin. No model stream or project POST occurs in that flow.
- Native server uses the isolated deploy-shaped PostgreSQL database as
  NOSUPERUSER/NOBYPASSRLS `app_service`, RLS enforcement on, and fresh synthetic
  signups. No responses are mocked, no AI provider is configured or called, and
  this is a handoff/composer check, not a claim of a model answer.
- Production frontend/server/audit-verifier build passes (Vite **27.60 seconds**).
  Existing large-chunk notices remain. Affected lint has no errors or added
  warning allowance; Projects retains its seven existing warnings.
- Independent review found no blockers in matched market facts, unclaimed
  limits, shared prompt, single context ownership, cleanup and private-field
  exclusion. The context fixture initially omitted the existing required
  `success: true` workspace envelope; that fixture alone was corrected. No
  production admission check was weakened.

Screenshots and result JSON contain synthetic records and safe support metadata;
tokens and raw authenticated traces are not committed. Full TypeScript and
pre-push gates are required for publication. A2.6 is next. Its additive enrichment
does not remove the later visible section-readiness parity prerequisite.

Concurrent tracked-insertion and document-section expertise changes through
`449baa69d` merged without source conflicts. Five directly interacting wizard,
shared-question, editor-remedy/insertion and section-scope suites pass **101/101**
on the merged tree (`merged-tests.txt.gz`). Native browser/build qualification
above precedes this merge; publishing gates qualify the final combined tree.

The first pre-push attempt passed all checks before TypeScript, which caught
a missing required segment prop in the new catalog-button test. Added the
existing `biopharma` test lane; the same two catalog tests pass. This is a
test-only correction with no runtime change or baseline expansion. The refused
attempt is preserved in `prepush-type-red.txt.gz`. A subsequent upstream
repo-health report refresh (`4a870264d`) changes documentation only.
