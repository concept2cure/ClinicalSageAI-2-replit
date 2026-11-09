# Rule 2 · S5d biosimilar: the biosimilar worksheets extrapolate, qualify and default nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/biosimilar/`) is in no narrower package; the tool definitions are an S4 path, which F1 covers.
**Audit:** `../design.md`, S5d, the biosimilar family.
**Date:** 2026-11-09.

## The defect

None of the six biosimilar functions checked an input, and two read an unstated fact as an answer. Inputs below were
run on the engine as it is on trunk (`f68840f22`; the engine is unchanged since `6215e5d31`).

- **Indication extrapolation** (`assess_indication_extrapolation`). A mechanism or target not stated for an
  indication became the text 'unknown', and two unknowns compared equal.
  - `{ referenceProductIndications: ['RA', 'psoriasis', "Crohn's disease"], mechanismOfActionPerIndication: {},
    clinicalStudyIndication: 'RA' }` returned **likely_extrapolable** for both unstudied indications, with
    `moaInIndication: 'unknown'`.
  - With the same mechanism stated and the (optional) target map left out, psoriasis was likely_extrapolable: every
    target read as the same. With different mechanisms and no targets, Crohn's disease was "conditional".
  - A studied indication given in another case than its map key (`clinicalStudyIndication: 'ra'`, maps keyed `RA`) was
    skipped as the studied indication but its mechanism and target were read as 'unknown', so every other indication
    was **additional_data_needed** whatever was stated.
  - `referenceProductIndications: 'RA, CD'` was assessed letter by letter (6 assessments); a missing
    clinicalStudyIndication crashed (`Cannot read properties of undefined (reading 'toLowerCase')`).
- **Interchangeability** (`assess_interchangeability`).
  - `biosimilarityEstablished: 'false', switchingStudyDataAvailable: 'false'` returned `overallEligible: 'false'` (a
    string) with "All requirements appear met — interchangeability designation may be pursued."
  - With both left out, `biosimilarityEstablished` and `overallEligible` were absent from the result and both
    requirements were listed as unmet, exactly as for a stated false. `{}` crashed (no dosingFrequency).
- **Analytical similarity** (`assess_analytical_similarity_biosimilar`). `{}` and `productType: 'Insulin'` were given
  the mAb panel (30 attributes) under the given product type; `criticalQualityAttributes: 'afucosylation'` and
  `analyticalMethodsUsed: [5]` crashed; `criticalQualityAttributes: ['xyz']` silently returned the whole insulin
  panel, and a method list matching nothing silently returned every method.
- **Clinical program** (`design_biosimilar_clinical`). `{}` designed a healthy-volunteer crossover study for
  product type `null`; `pkComplexity: 'High', immunogenicityRisk: 'High'` were read as not high (crossover, the
  four-timepoint ADA schedule). `mechanismOfAction` and `indications` were required and never read.
- **IP strategy** (`plan_biosimilar_ip_strategy`). `market: 'United States'` was read as both markets; `{}` printed
  "Date of first BLA approval of the reference product (undefined)". `patentExpiryDates` was required and never read.
- **CMC** (`assess_biosimilar_cmc`). `{}` returned no expression-system guidance and "host cell line (undefined)";
  `expressionSystem: 'cho'` returned none, and `'Commercial'` and `'Advanced'` took the non-commercial and standard
  branches.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `server/services/biosimilar/biosimilar-knowledge.ts` is the one engine for the six functions. It had
  no input checks and no three-valued reader, and was already over the 100,000-byte ceiling (136,488 bytes, one of the
  56 files the `audit:repo-health:ceiling` count holds). It has no tests of its own.
- **The shared readers, reused:** `refuseUnlessStated` and `RequiredInputCheck`
  (`ana-biostats/computation-engine.ts`); `booleanInputStates`, `statedBoolean`, the three-valued `allOf` and
  `conclusions`, and the adapters `oneOfInput`, `textInput` and `listed`, from
  `immunogenicity/immunogenicity-reference.ts` (not touched here). `allOf` and `conclusions` have lived there since
  **S5d-0** (`37135699b`) and the adapters since **S5d-0b** (`a023cb045`); the one-home test refuses a copy of any of
  the ten in an engine, and this engine defines none of them.
- **The sibling-split precedent:** `biomarkers/biomarker-reference.ts`, `digital-health/digital-health-reference.ts`
  and `medical-device/medical-device-knowledge-data.ts` hold constant tables moved unchanged out of their engines in
  S5b. `biosimilar-reference.ts` follows them, inside the engine's folder (RULE 6: a split goes inside its folder).
- **The definitions and handlers:** `server/services/ana/biosimilarTools.ts`, spread into `ALL_ANA_TOOLS`; the six
  handlers in `AnaToolExecutor.ts` run through `runStatsTool`, which turns a `ComputationRefusal` into
  `needs_parameters` with `code` and `field`. `AnaToolExecutor.ts` is not touched; its handlers import only the
  engine's six functions, which keep their names.
- **The skills:** `skills/library/cmc.ts` (biologics step 8) and `skills/library/regulatory-strategy.ts` (pathway step
  3). Each line stays true, so none is changed.
- **Other biosimilar code, not touched:** the tiered comparison on the program's data
  (`server/services/biologics/analytical-similarity.ts`, `assess_analytical_similarity`), `biologics/comparability.ts`
  (`assess_comparability`), `assess_immunogenicity_comparability` (the immunogenicity family), and the Global RI
  pathway and exclusivity engines. None imports this engine.
- **Readers of the changed result fields:** none outside the engine. `client/.../fixtures/intelligence.ts` and
  `ana-ri/persona.ts` name the tools only.
- **Searches run:** `git grep` for the six tool and function names, `biosimilarTools`, `BIOSIMILAR_TOOLS` and
  `biosimilar-knowledge`; "biosimilar", "interchangeab", "extrapolat", "351(k)" and "BPCIA" across `server/services`
  and `shared`; the result fields `feasibility`, `moaInIndication`, `overallEligible` and `missingRequirements`; the
  five moved table names.
- **History:** `git log --all --diff-filter=D --name-only`, filtered for `biosimil|interchangeab|extrapolat`, finds
  nothing. The clone is shallow, so this covers local history only.

## The change

- **Required inputs** are refused by name when missing and by field when malformed, through `refuseUnlessStated`: the
  product type (analytical similarity, clinical program), the reference product and its name (clinical program, IP,
  CMC), the PK complexity and immunogenicity risk, the indication list, mechanism map and studied indication, the
  dosing frequency, the market, and the CMC expression system, scale and capability. The optional CQA and method
  lists and the target map are refused by field when they are not a list of text or an object of text.
- **Interchangeability.** The two requirements report `true`, `false` or `not_stated` through `inputStates`; a
  malformed one is refused by field. `biosimilarityEstablished`, `expectedSameClinicalResult` and
  `switchingSafetyDemonstrated` are null when unstated; `overallEligible` is false once either is stated false, true
  when both are stated true, and null otherwise (`allOf`). An unstated requirement is listed as "… is not stated."
  followed by what it needs. `expectedSameClinicalResultBasis` says the clinical-result answer is not an input but is
  taken from biosimilarityEstablished (a disclosed default). Both requirements are no longer schema-required.
- **Extrapolation.** Mechanisms and targets are compared only when both the indication and the studied indication
  state them. An indication's entry is its exact key, else the one key equal to it ignoring case (as the studied
  indication is already skipped), and an inherited key like "constructor" is not read. Otherwise the feasibility is
  `not_assessed`, its first justification line names the facts not stated and the feasibilities their answers would
  give (`conclusions` over the two facts), and `moaInIndication` is null; a stated difference of mechanism is reported
  as a risk factor in words no single answer uses. The per-indication body moved, unchanged where stated, into a helper
  (`extrapolationFor`), so the function's ESLint complexity warning goes away.
- **Analytical similarity.** A new `selectionNotes` says when a requested attribute list matched nothing (the whole
  panel is returned, as before) and how many attributes kept their full method list because no stated method matched.
- **Inputs no function reads** say "Not read: it does not change the result", are optional in the engine's parameter
  types, and are no longer required: the clinical program's mechanismOfAction and indications, interchangeability's
  productType, and the IP strategy's patentExpiryDates and biosimilarExclusivityStatus. Each is `void`ed or passed to
  an unused parameter in the engine; removing them from `required` loses no check.
- **The definitions** fit the gateway's 1,024 characters (924 to 1,022; five were 1,119 to 1,331), keep their manifest
  renderers (result-card, ranked-cards, ranked-cards, result-card, result-card, result-card), say "relay the
  validation error", and name what an omission leaves.
- **Size.** The CQA registry with its categories (35,136 bytes), the approved-biosimilar clinical precedents (5,173),
  the endpoint selection guidance (4,207) and the expression-system registry (7,827) move unchanged, byte for byte,
  into the sibling `server/services/biosimilar/biosimilar-reference.ts` (Rule 6 split), which imports its types from
  the engine. Each moved block was found verbatim in trunk, and each exported table deep-equals trunk's
  (`util.isDeepStrictEqual`). The engine goes from 136,488 bytes (over the ceiling) to 93,761 (under it);
  the sibling is 52,219 bytes and 1,140 lines, under both thresholds. The engine stays over 1,500 lines (2,608 →
  1,622), as it was. **The committer lowers `--ceiling-large-bytes` in `audit:repo-health:ceiling` (package.json) by
  one for this file**, measured with `npm run audit:repo-health:ceiling` at commit time, because another S5d family
  (regulatory strategy) also brings an engine under the ceiling and the number depends on which lands first.
- **The design** records this family's "What already exists" and result, and its status row.

**Stated inputs whose result changes.** Fully stated, well-formed inputs were compared with the engine on trunk,
ignoring the new `selectionNotes`, `inputStates` and `expectedSameClinicalResultBasis`: 200 analytical-similarity
inputs (every product type by five attribute lists and five method lists, including empty and unmatched ones), 576
clinical programs (every product type, complexity and risk, two reference products, mechanisms and indication
lists), 192 extrapolations (every same/different mechanism and target across three indications, studied indication
`RA`, `ra` and `CD`), 256 interchangeability inputs (all four answers, eight product types, eight dosing frequencies),
36 IP plans and 90 CMC strategies. **One kind changes: 60 of the 64 extrapolations whose studied indication is `ra`**,
from additional_data_needed for every indication (trunk compared 'unknown' with the stated mechanisms and targets) to
the feasibility the stated `RA` entries give. The old result was wrong. Nothing else changes.

**Results that change because an input was omitted or malformed:**
- An extrapolation with a mechanism or target left out for an indication or the studied indication is
  `not_assessed`, where it was likely_extrapolable or conditional; with the target map left out entirely, every
  indication is `not_assessed`. A probe of 1,152 single-entry omissions, each indication's assessment against five
  completions of the omitted entry, finds no feasibility, justification, risk factor or precedent that only some
  completions give.
- Interchangeability with a requirement left out has `overallEligible: null` (it was absent, or false) and says the
  requirement was not stated; a probe of 768 omissions finds no field that only some completions give.
- Every refusal listed above, where the old engine served the mAb panel, read 'High' as not high, read an unknown
  market as both, returned no expression-system guidance, or crashed.

**Residuals, recorded rather than changed:**
- **Precedent matching.** Extrapolation precedents are found by the first word of the indication's name anywhere in a
  precedent's text, so "RA" also matches "trastuzumab"; this is stated-input behaviour, unchanged.
- **The disclosed clinical-result default** stays: `expectedSameClinicalResult` follows biosimilarityEstablished.
- **Interchangeability content.** The switching-study requirement and guidance text are as they were; this slice does
  not revisit FDA's position on switching studies. An unmatched dosing frequency ("every 3 weeks") takes the 8-week
  switching interval, as on trunk.
- **Unread inputs.** The clinical program does not read the mechanism or the indications; it says so rather than
  being made to read them.

**User-visible:** AnA no longer calls an indication likely extrapolable when nobody stated its mechanism or target,
no longer answers additional_data_needed for every indication because the studied one was typed in lower case, no
longer reports a biosimilar interchangeable-eligible from the text "false", and no longer answers an unknown product
type, market or expression system with another one's guidance; it asks for the value.

## Review (adversarial critic, 2026-11-09)

Re-run and re-checked against HEAD `f68840f22` (the engine, tools, manifest and design are unchanged since the
planner's base `6215e5d31`). Found and fixed:
1. **Size: the engine need not grow past the ceiling.** The plan took it from 136,488 to 144,816 bytes and recorded the
   CQA registry move as "a separate change". A pure move of four constant tables and the CQA categories (none read
   outside the engine, every one deep-equal to trunk's) brings it to 93,761 bytes, under 100,000, with the
   whole change applied. The plan's design row also said 145,033 bytes, which matched neither the README nor the file.
2. **The "lower-case key, none changes" claim was false.** With `clinicalStudyIndication: 'ra'` and maps keyed `RA`,
   the plan's exact-key lookup made every indication `not_assessed` ("the mechanism … of ra … is not stated") although
   the user stated it, and trunk's result (additional_data_needed throughout) differed from the plan's in 64 of 64
   such inputs. The lookup now matches the key ignoring case, as the skip already does; 60 stated results change, each
   a correction.
3. **A not-assessed extrapolation carried one answer's risk line** ("Different mechanism of action in the extrapolated
   indication …", which only the conditional answer gives). It is reworded to report the stated difference.
4. **Unread inputs stayed required in the engine's types** (`indications`, `mechanismOfAction`, `patentExpiryDates`)
   while the schema made them optional; they are optional and marked "Not read" in both.
5. **A contradiction in a definition:** `biosimilarExclusivityStatus` said "Affects competitive landscape analysis. Not
   read". The first sentence is removed.
6. **Rebased on S5d-0b** (`a023cb045`, landed during this review): the plan defined `oneOfInput`, `textInput` and
   `listed`, which now live in `immunogenicity-reference.ts`, so with the plan applied the one-home guard failed. The
   engine imports them; `textListInput` and `textMapInput`, which no other engine has, stay in the engine.

## Proof

Run in this session on the working tree, red first, after the immunogenicity commit.
- `red/before.txt`: `biosimilar-unstated-inputs.test.ts` before the change: 38 of 50 fail, all on assertions (two catch
  trunk's handlers returning a crash, "Cannot read properties of undefined (reading 'toLowerCase')", as their error).
  The 12 controls pass: the six stated-basis pins and the six routing cases.
- `green/after.txt`: 93 of 93 pass: the 50 and the one-home guard. The engine has no other suite.
- **The neighbourhood: 194 files, 4,841 tests, 4,830 pass.** It is the immunogenicity commit's set with this family's
  test. The 11 failures are the `tests/lineage/founder-path-lineage.pglite.test.ts` cases that fail identically on
  trunk.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint ratchet: net 0 (the engine 7 to 6, the sibling 0 to 1, `max-lines`, as a file of tables);
  - `manifest:ana`: regenerated in the same commit; the six tools' descriptions and input descriptions change, and the
    inputs no function reads leave the `required` lists. No renderer, scope or governed change. The descriptions are
    924 to 1,022 characters.
- **Size:** the engine is 93,761 bytes (136,488 before, already over the ceiling), the sibling
  `biosimilar-reference.ts` 52,219. The engine leaves the list of files over the 100,000-byte ceiling.

The plan was written by a read-only planner and corrected by an independent critic, both in private copies of trunk
(the review's figures are in **Review**). This session applied it to the working tree and ran the red, green,
neighbourhood and gates above.
