# Filing catalogue fold source review

Reviewed 2026-10-26 against the working tree based on `f033cc722`.
Scope: the lead's shell/routing/catalogue fold and the interaction with the
filing carryovers. This reviewer implemented the earlier reference carryover;
the routing and migration review is separate from that implementation, not an
independent qualification of the entire product. No compiler or server was run
during this review. A narrow follow-up test run was authorized after finding 5
and is recorded there.

## What already exists

`registryModel.ts` and `routing.ts::destinationFor` already resolve old ids and
attach validated actions. `V2App.tsx` applies alias actions before one canonical
navigation; the copied-link effect uses that canonical URL as its one-time
marker and preserves query and fragment. `Projects.tsx` already owns
`projects.new-project`, including the already-open guard that preserves typed
configuration. This fold extends those owners rather than adding a router,
creator, grant or project store.

The canonical picker already reads the server's offers and fails closed on an
unreadable offer. The shared filing catalogue owns every identity and category.
Authored lifecycle text has been migrated into
`shared/regulatory/filing-lifecycle-reference.ts`; the source comparison in
`/tmp/a210-filing-content-proof.json` records byte-identical label, archetype,
clock, stage and return-loop tables against the original fixture. This is
general reference, not a project assessment or current agency deadline.

## Review findings

1. No production routing, authorization, readiness, dispatch, signature or data
   retention defect was found in the reviewed fold. The alias is global
   `filings-catalog -> projects` with the existing `projects.new-project`
   action. The removed registry/view/navigation/collaboration rows no longer
   advertise a second screen. There was no `filings-catalog` navigation target
   or callable `@` handle in the existing shared vocabulary, so this deletion
   does not remove an established callable handle.
2. The two creator/packaging migrations are amended in place. The creator
   removes the retired id from its keep-list and upsert; its existing first
   step marks an old row deprecated while preserving its other metadata.
   Packaging no longer requires a fresh deployment to contain that id. There
   is no production DELETE, DROP, tenant-subscription transfer or grant.
   `filing-catalog-fold-replay.pglite.test.ts` exercises both a preserved old
   row/subscription and repeated fresh application. Its deliberate DELETEs are
   test-fixture setup only. This is real SQL coverage, not native RLS proof.
3. `serializeProgramDetail` exposes only the exact nonempty stored
   `metadata.submissionTypeId` as `submission_type_id`; internal metadata stays
   hidden. It does not derive a filing from application type, product type or
   tenant industry. Existing program/anchor/client access machinery is
   unchanged. `ProjectHome` only passes a project read whose id matches the
   selected project; Plan resolves the recorded identity through the existing
   catalogue and renders no inferred lifecycle for an unknown identity.
4. **Caught and fixed:** a likely escaping error in the new native test's
   dynamic filing-name regex was reported to the lead before execution. The
   lead replaced it with a plain string accessible-name selector, preserving
   literal names such as `510(k)`. This was a test issue, not a production
   defect.
5. **Caught and fixed:** context parity needed one final distinction: an
   unavailable filing's
   read-only detail can be opened and its Ask AnA prompt names it, but the
   initial carryover only publishes browser segment/search and the offered
   selected filing. The old catalogue also published its opened detail.
   The authorized follow-up now reports safe canonical facts in a distinct
   `filingBrowser.inspectedReference`. Controlled detail state clears this on
   close, search/segment changes or an unavailable/unmounted detail. Account
   retirement drops the wizard context. No selection callback or writer is
   invoked. Red: 2 failures with 13 existing assertions passing; green: all
   15 tests in the two affected suites pass. Logs:
   `/tmp/a210-filing-inspected-reference-{red,green}.log`. Final combined
   qualification remains the lead's responsibility.

## The ten filing functions

| Function | Reachable owner and source/test evidence |
| --- | --- |
| Description/workflow search and segment on results | `AnaVerbs.tsx::RegistryPicker` uses description plus the migrated workflow display label and labels cross-segment cards. `registryPickerReference.test.tsx`; the existing description tests remain in `registryPickerOffers.test.tsx`. |
| Category descriptions | Same picker reads `FILING_CATEGORY_METADATA`; headings carry the canonical category description. `registryPickerReference.test.tsx`. |
| Browse every filing, including unavailable ones | The picker retains offered choices and renders every unavailable filing in the active segment, or matching filings across segments. Its unavailable details have no selection or Start action. Existing exhaustive catalogue offer test plus the read-only detail test. |
| Visible filing description | The chosen note and unavailable reference details show the canonical description as visible text. Existing offer tests and reference test. |
| Authority, format and CTD metadata | `FilingReference.tsx::FilingReferenceDetails` projects canonical metadata, including explicit absent-format/non-CTD wording. Reference test. |
| Lifecycle stages, clock and return loop | One shared authored table and `FilingLifecycleReference` render in intake and exact recorded Plan context with an explicit reference disclaimer. Reference/Plan tests and the source-content proof. |
| How it is built | The existing selected-market offer/build text remains in `ChosenFilingNote` and the wizard review. It keeps author-only, unclaimed and unavailable-build limits. `registryPickerOffers.test.tsx`. |
| Ask AnA | The canonical picker uses the same `filingAskPrompt` and display name. The old shell test was migrated to the actual picker; exact wording and no-selection side effects remain asserted. |
| Links to run the whole loop | Existing project navigation detailed below. The obsolete catalogue journey link does not define a separate lifecycle service. |
| AnA segment/search/selection | `Projects.tsx` publishes actual wizard step, `filingBrowser` segment/search and the selected offered filing while excluding configuration PII. `newProjectWizardContext.test.tsx`. Opened unavailable-reference context is now separately preserved and cleared as recorded in finding 5. |

## Whole-loop navigation, with its actual limits

- Plan reaches the existing Tasks place through
  `ProjectPlan.tsx::MyWorkLine` and validated `tasking.filter {mine:'true'}`.
  The UI explicitly says those personal tasks span every project; this fold
  does not claim to add a project-specific Tasks filter.
  `projectHomeMyWorkLine.test.tsx` covers the control.
- The project's `ProjectStages.tsx::StageTracker` reaches Submit and Respond.
  Plan's existing IND phase-eight door also reaches Submit;
  `projectHomePlan.test.tsx` pins that action. These controls indicate the
  selected step, never completed-stage progress.
- Submit mounts `ProjectMarkets.tsx`, whose `openSubmissionCenter` preserves
  recorded submission/sequence/workspace/section parameters through the
  existing nav-parameter owner. `projectMarkets.test.tsx` and
  `projectHomeSubmitStage.test.tsx` pin this handoff. This does not expand a
  supported channel or authorize dispatch.
- Respond mounts `ProjectRespond.tsx`, reads this project's agency inbox and
  offers the existing Communication and Tasks doors. Its sequence step
  reaches Submission Center with the recorded follow-up target;
  `projectRespondStage.test.tsx` covers the sequence handoff. It does not
  invent an agency letter, due date or review outcome.

The new native test source covers two fresh synthetic organizations, old-link
canonicalization, no canonical project POST before human Create, one successful
canonical creation/anchor, safe exact-filing detail, Plan reload and mobile
overflow. It is not a complete native proof of all ten functions, all unavailable
filings or the whole dispatch loop. The component and existing door tests carry
those narrower assertions. Native execution and final merged gates belong to the
lead's qualification record, not this source review.
