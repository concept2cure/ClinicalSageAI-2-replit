# Rule 2 S5a — pediatric omitted inputs

D2, continuing the clinical definition-family audit. This extends the six existing
pediatric worksheets. R-2/F2 calculator availability remains open and unchanged.

## What already exists

- `server/services/pediatric/pediatric-knowledge.ts` owns age classification, PIP/PSP
  planning, extrapolation, formulation, dose-method and requirements functions.
  Four consume ten boolean input occurrences. Several branches treat absence as false;
  adult efficacy and biomarker availability are declared but unused in extrapolation.
- `server/services/ana/pediatricTools.ts` defines the six tools; their existing
  `AnaToolExecutor.ts` handlers call these functions through `runStatsTool`. S5-0
  already supplies stated-input envelopes. No additional calculator or handler is needed.
- `immunogenicity-reference.ts` exports strict `statedBoolean`, `statedOneOf` and
  `statedNumber`; the computation engine owns `ComputationRefusal` and
  `refuseUnlessStated`. COA/PRO already serializes boolean input states. Move that
  existing adapter beside the strict readers and reuse it in both families.
- `global-ri/pediatric-requirements.ts` separately models market plan posture and
  supplies a policy catalog. Its tests exercise that service, not these six engines.
  The clinical/regulatory-strategy skills, tool manifest/register and intelligence
  fixture reference these tools; no other function/result-type consumers were found.
- The dose tool returns method/formula guidance, not a calculated numeric pediatric
  dose: child metrics and adult dose are not used in numeric arithmetic. Do not add
  a parallel dose calculator or describe a formula as a verified program dose.
- Searches covered pediatric/paediatric/extrapolation names and function/tool consumers
  across server, client, shared, services and tests. The local deletion search
  `git log --all --diff-filter=D -- '*pediatric*' '*paediatric*' '*extrapolat*'`
  found no matches. This checkout is shallow; full-history absence is not established.

## Resulting behavior

Expose unanswered booleans as `not_stated`. Withhold dependent conclusions and keep
independent explicit decisions. Condition profiles and waiver-list matches remain
reference context, not evidence of product similarity or a granted waiver. Adult
efficacy false cannot permit adult-data extrapolation or borrowing. Missing PBPK/NTI
facts cannot select a method or imply no TDM. Missing orphan status cannot assert
absence of designation or select incentives. NME/adult-approval flags alone do not
exclude other PREA application triggers or establish an orphan exception.

Use the existing refusal boundary for malformed facts, required context, age bands,
units and finite numeric inputs. Missing neonatal gestation cannot mean term birth.
Retain reference structures and the current tool availability.

All ten boolean input occurrences expose explicit true/false or `not_stated` through
`inputStates`. The existing COA adapter was moved without behavioral changes into
`immunogenicity-reference.ts`; both families use that one implementation.

Extrapolation uses stated adult efficacy and actual stated similarity assessments.
Missing prerequisites produce `not_assessed`, null study flags and null borrowing
applicability; explicit negative evidence still rules out extrapolation. A condition
profile is returned separately as `conditionReference` with `basis: reference_only`.
Omitted/null similarity no longer selects a PK/PD pathway from a condition profile.
The schema has no separate field for an assessed uncertain response; this change does
not add one or reinterpret an unanswered boolean as that assessment. Biomarker status
is disclosed as conditional evidence needed before considering a bridge.

PIP/PSP planning keeps reference structures and studies. Exact normalized class-list
matches produce reference candidates, not granted waivers. Shared first words cannot
establish a match. The `none` branch refers only to the encoded orphan/adult-stage
branches, not all legal waiver grounds. FDA/EMA applicability remains null because
the input shape does not establish all application triggers or waiver facts.

Requirements return the encoded positive FDA NME trigger only when FDA is requested
and a nonorphan NME is explicitly stated. Other selected-FDA cases remain null because
non-NME triggers and orphan exceptions are not represented. Requested EMA applicability
likewise remains null; an unrequested jurisdiction is false within this request's scope.
Unknown adult approval withholds its dependent timelines; unknown orphan status withholds
orphan applicability and the EMA reward branch. Incentive descriptions are conditional
reference guidance. Existing global-RI catalog text is reused without changing that service.

Dose-method, monitoring and banding dependencies are evaluated independently. No method
or formula is selected when its deciding facts are unanswered; a supported explicit
preference, PBPK availability or neonatal branch can still determine a method. TDM can
remain unknown even with a method selected. This tool returns method/formula guidance;
it does not calculate a numeric pediatric dose. Required adult context and optional
supplied child quantities are validated, without requiring unused child metrics.

Age classification refuses missing/invalid units, negative/nonfinite ages and adult
chronological ages. Postnatal ages through 27 days require stated birth gestation.
Formulation inputs reject malformed routes, population lists, properties and excipient
lists. Unknown taste cannot claim demonstrated palatability; neonatal excipient cautions
without a proposed list are labeled as reference information.

Definitions, clinical/regulatory-strategy skill text and the regenerated capability
manifest describe these boundaries. No tools, routes, stores or dependencies were added.

## Verification

The initial behavioral red on `49211250` had **100 failed / 14 passed** cases; all
six explicit handler fixtures already passed. After those corrections, a supplemental
red had **7 failed / 17 passed**, with the original 114 cases skipped. It covered four
malformed formulation-object shapes and three text contradictions found during review.
The expanded focused suite then passed **138/138**. Full logs and summaries are filed
under `red/` and `green/`; no test fails merely because an engine export is missing.

The final broader regression passed **957 tests in 29 files**, including pediatric,
COA/PRO, the older COA advisor, stated-envelope/source controls, submission-center/IVD/
deepening pins, all skill tests, immunogenicity, GCP, the canonical refusal helper and
the separate global-RI pediatric tests. Whole-program TypeScript passed with **0 errors**;
the seven-file ESLint ratchet had **no warning growth** and validation traceability passed.
Local context/age/orphan helpers keep the existing functions within the lint complexity
limit without changing the warning baseline. The regression ran after these extractions.
See `green/regression-summary.txt`, its complete compressed log and `green/gates.txt`.

The manifest diff changes exactly the six existing pediatric tools and adds none
(`green/manifest-changes.json`). Existing shared-branch editor changes were fast-forwarded
before the broad regression and typecheck; no pediatric files overlapped.

Tests exercise pure engines and existing tool boundaries; no native database or live
provider proof is claimed. Independent read-only review found no material blocker within
this omission/invalid-input slice. This is not a comprehensive review of pediatric
clinical methodology or every regulatory reference in the repository.
