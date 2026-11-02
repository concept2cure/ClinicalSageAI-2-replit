# Rule 2 · S5c GMP quality systems: the GMP worksheets decide nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/gmp-quality-systems/`) is in no narrower package. The tool definitions and the quality-systems
skill are S4 paths, which F1 covers. The coordinating session approved S5c under F1, on these files.
**Audit:** `../design.md`, S5c, the GMP family.
**Date:** 2026-11-02.

## The defect

The six GMP worksheets in `server/services/gmp-quality-systems/gmp-quality-systems-knowledge.ts` read an omitted fact
as an answer. Inputs below were run on the engine as it was before this change.

- **Data integrity** (`assess_data_integrity`).
  - With neither impact fact given, criticality was "medium", "pending confirmation", and a review frequency followed
    from it.
  - An electronic record of no stated type was called dynamic.
  - An ALCOA+ control left out counted as satisfied. With `impactsBatchRelease: true` and `accuracyControls`
    omitted, the overall rating was "high". Stated false, it is "critical".
  - An unstated audit-trail review produced remediation advice.
  - A null control was neither satisfied nor at risk.
  - An unknown lifecycle stage was dropped silently.
- **CAPA** (`design_capa`).
  - An omitted factor count read as 1, and an omitted extent or recurrence as false, so the rule picked 5 Whys.
  - An unknown preferred method fell back to the first one.
  - A severity inferred from product impact got the 45-day target, though a critical severity would get 30.
  - An omitted recurrence printed exactly as a stated false.
- **Deviation** (`classify_gmp_deviation`).
  - An omitted `usMarketed` read as true. A distributed, confirmed out-of-specification batch was evaluated for a
    field alert report, with nothing marked not assessed.
  - A malformed boolean (`'false'`) read as false, so a batch could proceed.
- **API GMP** (`assess_api_gmp`).
  - A missing or unknown step was assessed as starting-material production.
  - An omitted critical-step fact kept the base level.
  - An omitted significance classed a change as minor, with "regulatory notification may not be required".
- **Sterile controls** (`design_sterile_controls`).
  - An omitted heat stability or filterability read as false. A product description alone gave aseptic processing,
    the isolator barrier, and "Document the justification for not using terminal sterilisation".
- **Computer system validation** (`assess_computer_system_validation`).
  - An omitted `electronicRecords` read as true, so the validation, audit-trail and access controls applied.
  - With `gxpImpact` omitted and `directImpact: true`, the impact was inferred "high", and that inferred value chose
    the assurance approach. `{ systemDescription: 'LIMS', softwareType: 'configured', directImpact: true }` gave
    `csa_risk_based_scripted`, where a stated "critical" gives `traditional_scripted_csv`.
  - `gxpImpact: 'High'` was read as low: with `softwareType: 'non_configured'` and `directImpact: false` it gave
    `csa_unscripted`.
  - An omitted supplier assessment printed the same text as a stated false.
- **All six:** malformed booleans, enums and numbers were not refused, and two definitions said "Defaults to true
  if omitted".

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `gmp-quality-systems-knowledge.ts` is the one engine for all six functions. The 2026-10-15
  fabrication sweep already gave it `unstated()`, `anyOf()`, `allOf()` and a local `refuseUnknown()`:
  - CAPA severity is `not_assessed`, its formality `undetermined`, its target null, and `notAssessed` lists the gaps;
  - the deviation class, product impact, field alert, recall and CAPA need are undetermined or null;
  - the CSV software type is refused, and the approach and e-signature controls are undetermined.

  That sweep did not reach data integrity, API GMP or sterile controls, `usMarketed` or `electronicRecords`, the
  CAPA method selection, or the validation of any boolean, optional enum or number. This change extends it. The
  local `refuseUnknown` is converged onto the shared `refuseUnlessStated`, and the three-valued helpers are reused.
- **The engine's tests:** `gmp-quality-systems/__tests__/` holds three suites, 15 tests. Two exact-equality
  `notAssessed` expectations pinned the old defaults and are updated in place: CSV now also lists
  `electronicRecords`, and the deviation lists `usMarketed`. The other 13 pass unchanged.
- **The definitions and handlers:** `server/services/ana/gmpQualitySystemsTools.ts`, spread into `ALL_ANA_TOOLS`. The
  handlers (`AnaToolExecutor.ts`, around line 20051) run through `runStatsTool`. It labels a success with
  `statedInputEnvelope`, and turns a `ComputationRefusal` into `needs_parameters` with `code` and `field`.
  `AnaToolExecutor.ts` is not touched.
- **The shared readers, reused rather than copied:**
  - `statedBoolean`, `booleanInputStates`, `statedNumber` and `statedOneOf`
    (`immunogenicity/immunogenicity-reference.ts`);
  - `refuseUnlessStated` and `ComputationRefusal` (`ana-biostats/computation-engine.ts`).

  The S5a families use the same readers.
- **The skill:** `server/services/ana/skills/library/quality-systems.ts`, three sub-skills that name the six tools.
  `skills/__tests__/golden/quality-systems.json` pins skill selection, not instruction text.
- **Separate code, not touched:** `advise_data_integrity` (`ana/data-integrity.ts`), and the GCP engine, which is
  S5c's other family.
- **Readers of the changed result fields:** none outside the engine, the definitions, the executor and the tests. The
  manifest's renderers are generic.
- **Searches run:** `git grep` across server, client, shared, scripts and tests for:
  - the six tool and function names;
  - `GMP_QUALITY_SYSTEMS_TOOLS`, `gmpQualitySystemsTools` and `gmp-quality-systems-knowledge`;
  - `advise_data_integrity`, `data-integrity` and `dataIntegrity`;
  - `not_stated` and `inputStates` in the GMP files (none before this change).
- **History:** `git log` on the engine and the tools file shows only `182fed957`.
  `git log --all --diff-filter=D --name-only`, filtered for
  `gmp|capa|deviation|data-integrity|sterile|csv-valid|computer-system|alcoa|annex1|q7`, finds nothing. The clone is
  shallow, so this covers local history only.

## The change

- **Booleans.** Every true/false input reads `true`, `false` or `not_stated` through `inputStates`. A malformed
  value (`'false'`, `0`) is refused by field, never read.
- **Required and enum inputs.** Required inputs, and enums such as `gxpImpact`, the CAPA source, the preferred
  method, the API step, the barrier and the lifecycle stages, are refused by field when missing or malformed.
  Examples: `'High'`, `'FMEA'`, `'Isolator'`, a fractional factor count, an unknown stage.
- **Data integrity.** Without the batch-release and patient-safety facts, criticality, review frequency, the raised
  stage risks and the overall rating are `not_assessed`, with the range they could take (`overallRiskRange`). An
  ALCOA+ control left out no longer lowers the rating as if it were in place. An electronic record of unstated type
  is not called dynamic. An unstated audit-trail review asks to confirm it.
- **CAPA.**
  - The root-cause method is `undetermined` without the extent, recurrence or factor count (or, for a recall or an
    out-of-specification result, the severity), unless a stated fact or `preferredRootCauseMethod` settles it.
  - A severity inferred from product impact sets no target timeline.
  - An omitted recurrence prints "recurrence not stated".
- **Deviation.** Without `usMarketed`, a field-alert evaluation the other facts do not settle is `undetermined`.
- **API GMP.**
  - A missing or unknown step is asked for.
  - Without the critical-step fact, the level of a step below level 4 is not assessed, and each control a critical
    step adds is marked "If this is a critical process step (not stated)".
  - Without significance, the change class is not assessed, unless a critical or final step settles it.
- **Sterile controls.** Without heat stability, the sterilisation approach and the barrier are not assessed.
  Without filterability for a product that is not heat-stable, the approach is not assessed. An unstated
  lyophilisation is said to be not assessed.
- **Computer system validation.**
  - Without `electronicRecords`, the validation, audit-trail and access controls are `undetermined`.
  - The assurance approach reads only a stated `gxpImpact`, so it is `undetermined` without it, unless the software
    is custom. The scaling note still says the impact is "high (inferred from direct impact; not assessed)".
  - An unstated supplier assessment is said to be unstated.
- **The definitions** say what an omission means, and no longer say "Defaults to true". Inputs the engine never
  reads say so: `gxpArea`, `batchesAffected`, `fillingLines`, `operatorCount`.
- **The quality-systems skill** tells AnA to report these states and ask for the fact.
- **The design** records this family's "What already exists" and its result, and its status row moves on.

**Stated inputs whose result changes.** The HEAD engine and the patched one were compared over 160,768 fully stated,
well-formed inputs across the six functions. Every result gains `inputStates`; nothing else differs except two
texts, each a sentence the old code used when nothing was stated:
- **Data integrity**, both impact facts stated false. `criticalityRationale` read "no direct safety/release impact
  specified — treated as medium pending confirmation". It now reads "stated not to support batch release or affect
  patient safety directly — rated medium". The criticality is unchanged.
- **Deviation**, wherever the field alert is not triggered. `fieldAlertRationale` now names US marketing among the
  reasons that decide it. The evaluation is unchanged.

**Results that change because an input was left out or malformed** (the old result was a default), for example:
- `{ source: 'complaint', productImpact: true }`: the CAPA target goes from 45 days to none.
- `{ step: 'final' }`: the level-1 profile is now refused, since 'final' is not a step.
- `gxpImpact: 'High'`: `csa_unscripted` is now refused.
- A configured, infrastructure or non-configured system with `directImpact: true` and `gxpImpact` omitted:
  `csa_risk_based_scripted` becomes `undetermined`.
- A null control: `satisfied: null` becomes `unknown`.

**Residuals, recorded rather than changed:**
- **Description length.** All six descriptions already exceeded the 1,024 characters the gateway keeps for
  OpenAI-compatible providers (1,172 to 1,511). They are now 1,416 to 1,755, and the note on omission falls past
  that point (in `design_capa` it straddles it). The per-property descriptions carry what an omission means, and
  the results carry `inputStates`. Moving the note to the front is a follow-up, as RWE recorded. Four input
  descriptions are longer than the manifest's 240-character slice, which is display only.
- **Unvalidated or unread optional inputs.** `apiName` is echoed without validation. An empty `lifecycleStages: []`
  is a stated empty scope. An omitted `lifecycleStages` means all seven stages, as the definition says.
- **Labelled inferences kept from 2026-10-15.** CAPA severity is inferred "high" from product impact (formality is
  formal either way, and the target is now null). The CSV scaling note's inferred impact no longer chooses the
  approach.
- **Sterile recommendations.** With `heatStable` omitted, two recommendations are dropped rather than marked
  conditional: the terminal-sterilisation justification, and "Reconsider barrier technology" for a stated open
  cleanroom. The approach and barrier read `not_assessed`, so nothing is invented.
- **An audit-trail gap** ("Audit-trail capability not confirmed — verify configuration.") still appears for an
  unstated `auditTrailEnabled`. It no longer raises the overall rating by itself.
- **A pre-existing citation to confirm.** The sterile-API text and the `sterileApi` definition cite "ICH Q7 §18".
  §18 appears to be cell culture and fermentation, and sterile APIs appear to fall outside Q7's scope (§1.3). It
  should be checked against the ICH Q7 text and corrected as its own repair.
- **Duplicated vocabularies.** The schema enums in `gmpQualitySystemsTools.ts` repeat the engine's constants. The
  engine's union types are now derived from them.
- **Size.** The engine is 99,524 bytes, 476 under the 100,000-byte repo-health ceiling, and was already over the
  1,500-line threshold (2,213 to 2,270 lines). A later change here has little room. A split would go in the same
  folder (Rule 6).

**User-visible:** AnA's GMP answers no longer fill in a fact that was not given. Each reports it as not assessed or
undetermined and asks for it, and a malformed value is asked for again by name.

## Proof

- `red/before.txt`: `gmp-quality-systems-unstated-inputs.test.ts` fails 77 of 89 cases on trunk `bda1d5aed`, all on
  assertions. The 12 controls pass: the six stated-basis envelopes and the six "keeps the stated …" cases.
- `green/after.txt`: 89 of 89 pass, with the engine's three suites (15 of 15, two expectations updated): 104 in all.
- The neighbourhood passes: 22 files, 2,111 tests. It covers every S5 unstated-input suite, the engine's suites, the
  skills suites, the tool-selection suites and the tool registry.
- **Gates:**
  - typecheck: 0 errors;
  - ESLint ratchet: one warning fewer (11 to 10 on the engine; an unused `round` removed);
  - `manifest:ana`: regenerated in its own commit. The six tools change their descriptions and inputs, and no
    renderer, governed flag or required input changes.

**How it was made.** A read-only planner wrote the patch. An adversarial critic then applied it to scratch copies,
ran it through the real executor, and probed it:
- 18,709 inputs with facts omitted, against every completion of those facts;
- 160,768 fully stated inputs, against the HEAD engine.

The critic found and fixed two remaining defects and three untrue sentences:
- the inferred CSV impact choosing the approach;
- the recurrence printed as a stated false;
- the root-cause-method sentence, which needed its qualifier;
- the engine header's import list;
- an evidence example that lacked its full input.

Its corrected edits and red test were applied.
