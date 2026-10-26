# Rule 2 S5a — COA/PRO omitted inputs

D2, continuing the clinical definition-family audits, one family per commit.
R-2/F2 calculator availability remains open. This corrects the existing stated-input
worksheets; it does not choose their availability policy.

## What already exists

- `server/services/clinical-outcome-assessment/coa-knowledge.ts` owns the six pure
  COA/PRO functions. Four consume optional booleans. Several branches already distinguish
  explicit false from absence, but content validity, internal consistency, overall
  adequacy, endpoint positioning and development strategy still infer missing facts.
  Meaningful-change calculation also admits an anchor with no stated correlation.
- `server/services/ana/coaProTools.ts` supplies their schemas; the six registered
  handlers in `AnaToolExecutor.ts` call the canonical functions through `runStatsTool`.
  S5-0 already supplies the stated-input basis. No second calculator or handler is needed.
- `server/services/ana/coa-selection.ts` is an older reference/selection advisor. Its
  own tests cover that lookup; it does not evaluate the four optional-boolean worksheets.
- GCP operations already represents unknown inputs separately from false and withholds
  aggregate conclusions that depend on them. `immunogenicity-reference.ts` exports
  `statedBoolean`, which rejects malformed booleans and preserves undefined/null as absent;
  `ana-biostats/computation-engine.ts` owns the recognized `ComputationRefusal` class.
- Searches covered the engine/function/tool names across server, client, tests, shared
  and services. Other consumers are the tool inventory/register, clinical skill text and
  an intelligence fixture; no direct UI/result-type consumer was found. The deletion
  search `git log --all --diff-filter=D -- '*coa*' '*COA*' '*clinical-outcome*'` found
  no local deletions. This checkout is shallow, so that does not prove full-history absence.

## Resulting behavior

Keep explicit true/false behavior and reference data. Expose omitted/null boolean inputs
as `not_stated`; withhold conclusions that need them. Do not invent a single-item
instrument, a failed validation, claim intent, blinding, modification plan or de novo
strategy from an omitted fact. Unknown anchor correlation cannot validate an anchor.
Retain the existing engine/refusal boundary and stated-input labels. Explicit single-item
non-applicability no longer counts as missing evidence in the validation roll-up.

`inputStates` exposes each of the 19 optional booleans as its stated boolean or
`not_stated` (undefined and null both mean unanswered). Missing facts cannot select a
primary subjective endpoint, establish fit, or choose an instrument strategy. A known
failed validation still fails; a stated unavailable instrument still permits de novo
planning without requiring inapplicable existing-instrument answers. Unknown strategy
has no Phase 3 selection and a null total duration; the generic planning steps remain.

An anchor needs a finite stated mean and sufficient stated correlation to contribute.
Unknown usability is `not_stated` with a null contribution; no responder definition is
generated from it. Valid anchors still contribute when another anchor is unassessed.
Required context and decision enums are checked at runtime as well as described in
schemas. Malformed booleans, numeric evidence and optional endpoint positions use the
existing named `needs_parameters` refusal; no success basis is added to those replies.

The six tool descriptions, anchor-correlation field and clinical skill text explain
the missing-input behavior. The canonical capability manifest was regenerated; only
the six COA descriptions changed. No new tool, store, route, dependency or source reader
was introduced, and calculator availability is unchanged.

## Verification

- `red/summary.txt` and the complete compressed logs show the initial **56 failed /
  7 passed** behavioral run on `33694a45`, followed by **9 failed / 56 passed**
  dependent-decision cases and **10 failed / 65 passed** numeric-evidence cases before
  their respective corrections. None fails because an engine export is missing.
- `green/omitted-inputs.txt` captures the initial **75/75** focused green. The final
  expanded suite also pins truthful no-usable-evidence wording and numeric 0/1 refusal
  for all boolean fields.
- `green/regression-summary.txt` and `green/regression.txt.gz`: **801 tests passed in
  27 files**. This includes the final COA suite, the older selection advisor, stated
  envelopes and successful record controls, submission-center/IVD/deepening pins, all
  clinical skill tests, immunogenicity, GCP operations and the canonical refusal helper.
- `green/gates.txt`: whole-program TypeScript **0 errors**, changed-file ESLint
  ratchet **no warning growth**, and validation traceability passed. The first lint
  run identified two function-size increases; small local extractions resolved both
  without changing the warning baseline.
- Independent read-only review checked all six functions, all 19 optional booleans,
  decisive versus irrelevant missing facts, strict false preservation, runtime refusal
  handling and local consumers. No material blocker remains.

These are pure-engine and tool-boundary tests using the repository's test setup;
no native database or live-provider proof is claimed. This increment completes only
COA/PRO. The other five clinical families remain queued and are documented in
`queued-clinical-families.md`; S5b–S5d and the R-2/F2 policy decision remain open.
