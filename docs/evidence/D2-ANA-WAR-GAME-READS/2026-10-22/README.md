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
