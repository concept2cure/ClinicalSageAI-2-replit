# D2 — a war game audits the interview it is given, and nothing else

Row **D2**. Found while handling a follow-up from the 2026-10-22 knowledge audit: the NDA auditor's patent check runs for 505(b)(1) applications too.

## What already exists

- **`server/services/ana/intelligence-questions/war-game/engine.ts`.** `runWarGame(category, sourceFlowId, answers)` runs a category's auditor rules over the flattened interview answers, then scores the result and writes a summary. The AnA tool `start_war_game` reaches it.
- **`.../war-game/auditors/*-auditor.ts`.** 15 auditors, 435 rules, each a deterministic `check(answers)`.
- **`.../flows/*.ts`, through `flows/index.ts` `getFlowDefinition`.** The interviews whose answers the auditors read.
- **Gates that already exist:** `every-offered-value-is-read.test.ts` and `cautioned-positions.test.ts` check the interviews against the fact reader. **Nothing** checked the auditors against the interviews.

## Measured before (bc2e3a4a3)

- Most auditors read answer keys their own interview never asks. Only the BLA auditor read only asked fields. The NDA auditor read 42 keys, and only 9 exist in any flow: it read `application_type` and `cover_letter`, where the NDA interview asks `nda_type`.
- On a fully answered interview, 14 of the 15 war games reported findings that rest on fields never asked. Their "missing" criticals concern questions the client was never put, and the score was computed on them.
- The value checks on those keys never fired.
- `red-at-bc2e3a4a3.txt` shows 16 of 17 failing.

## Change

- **The engine records every answer key a rule reads, through a recording Proxy.** A rule that reads a key the source interview does not ask is **not assessed**: it produces no finding and no score, and it is listed in `notAssessed` with the unasked fields.
- **The report gains `rulesTotal`, `rulesAssessed` and `notAssessed`.**
  - When any check is not assessed, the assessment cannot be "audit_ready".
  - The summary states the coverage ("N of M checks could not be assessed from this interview").
  - A source flow id the platform does not run is stated, not assumed.
- **Related fields are filtered.** A related field the interview does not ask was a link to nothing, so it is dropped.
- **`WAR_GAME_SOURCE_FLOW` names each auditor's interview.**
- **`tests/ana-intelligence/war-game.test.ts`** now mocks the synthetic interview that its synthetic auditor reads.

## After

`coverage-after-engine-fix.json` records 94 of 435 rules as assessable, per auditor:

| Auditor | Assessable rules |
|---|---|
| protocol | 11/25 |
| ind | 6/26 |
| csr | 5/28 |
| 510k | 8/27 |
| cer | 2/25 |
| sop | 4/30 |
| nda | 4/32 |
| bla | 33/33 |
| pma | 3/32 |
| cmc | 2/32 |
| risk_management | 3/29 |
| safety_narrative | 4/28 |
| labeling | 2/32 |
| briefing_book | 3/28 |
| stability | 4/28 |

The rest of the war game had been reporting on questions nobody asked. The test pins these as a floor that may only rise. The next change converges each auditor onto its interview's real field ids.

## Green

- The new test passes 32/32.
- `tests/ana-intelligence` and `server/services/ana/intelligence-questions` pass: 29 files, 512 tests.
- Typecheck shows 0 errors. The ESLint ratchet shows net 0, with the engine one warning lower.

---

## Second change: the auditors converge onto their interviews (2026-10-22)

Seven agents, each owning two auditors, rewrote every not-assessed rule that has an equivalent question so that it reads the interview's real field id, using that field's value semantics:
- option values, not free text;
- multi_select arrays;
- yes/no booleans;
- `visibleWhen` gates, so a hidden field is not "missing".

A rule with no equivalent question was left not assessed. It was not mapped to a merely related question, since that would fabricate a finding. Each auditor file carries a dated header note.

**Assessable rules went from 94 to 299 of 435** (`coverage-after-convergence.json`):

| Auditor | Before | After |
|---|---|---|
| protocol | 11 | 22/25 |
| ind | 6 | 22/26 |
| csr | 5 | 21/28 |
| 510k | 8 | 24/27 |
| cer | 2 | 22/25 |
| sop | 4 | 23/30 |
| nda | 4 | 15/32 |
| bla | 33 | 33/33 |
| pma | 3 | 22/32 |
| cmc | 2 | 15/32 |
| risk_management | 3 | 17/29 |
| safety_narrative | 4 | 14/28 |
| labeling | 2 | 17/32 |
| briefing_book | 3 | 11/28 |
| stability | 4 | 21/28 |

The floor in the test is raised to these counts.

**Defects fixed along the way, in rules that were already assessed:**
- **Blank checks on yes/no fields never fired on "No":** `false` is not blank. This affected CMC, stability, PMA, CER and NDA.
- **NDA:** patent certifications were demanded of every NDA. They are now asked only of a 505(b)(2), and `not_applicable` counts as an answer.
- **Protocol:** a single arm against a historical control or no control was flagged as contradicting itself. The CONCURRENT_CONTROLS check is now used.
- **IND:** a "yes" prior clinical hold never warned, because the code read a boolean as text.
- **510(k):** sterilization, clinical-data and electrical-safety checks fired on devices whose interview branch never asks them. Each is now gated on its applicability field.
- **Stability:** `storage_conditions_mismatch` and `biologics_not_q5c` never fired, because they matched biologic text the interview does not store. They now read `is_biologic`.
- **Free text matched against multi_select or select values:** this affected SOP Part 11 and GCP, CER databases, stability zones and the 510(k) and protocol design checks.
- **Safety narrative:** the SUSAR clock is computed from the interview's own dates. The 7-day clock covers life-threatening cases as well as fatal ones (21 CFR 312.32(c)(2)).

**Yes/no answers are read the same from every source.** They arrive as booleans from the UI and as "yes"/"no" strings from the AnA tool. The engine now converts every yes_no field of the source interview once (`normalizeYesNo`), and a parity test proves the same findings result from either form in all 15 auditors.

**Red:** `red-converged-rules-at-trunk.txt` shows that, on the tree before either change, the NDA patent, protocol control-arm and yes/no "No" cases fail. The 510(k) sterile case passes there as well and pins the new gate.

**Green:**
- `tests/ana-intelligence`, `server/services/ana/intelligence-questions`, the knowledge-audit test and `predicate-yes-no-coercion`: 30 files, 545 tests pass, plus the 4 new behaviour cases (51 in the war-game file).
- Typecheck shows 0 errors, and the ESLint ratchet is unchanged.

### Not converged, and why (for a follow-up)

- **No equivalent question in the interview.** 136 rules stay not assessed. Each agent's list is in its auditor's header note. Notable gaps:
  - the CMC interview never asks about nitrosamines, a GMP statement, a QTPP or a control-strategy summary;
  - the NDA interview has no RTF assessment, ISE or DDI "none" option;
  - the safety narrative has no CIOMS/E2B completeness, source verification or investigator sign-off.
  These are questions to add to the interviews: a product decision about what the interview asks, not something to paper over in the auditor.
- **Dead rules that can never fire from their interview:**
  - protocol `low_statistical_power`: the options are 80–95%;
  - SOP `sop_027`: no review cycle option is longer than 3 years;
  - protocol `phase_design_mismatch`: no `design_type` option names randomization.
- **Labeling medication-guide rules:** these were not converged. The agent believed the flow's `visibleWhen: 'yes'` gates never open in the UI. That is wrong: `shared/ana/question-predicate.ts` coerces yes/no. These rules can be converged next.
- **The labeling `no_boxed_warning` rule** is pinned by `boxed-warning-findings-cite-the-guidance-that-states-the-criteria.test.ts`, which calls it with `serious_risks`, a field the interview does not ask. Converging the rule needs that test's input updated.
- **Partly gated rules:** a few rules read an unasked field only behind an asked gate. They count as assessed on empty answers and become not assessed when the gate opens. The engine handles this at run time.
