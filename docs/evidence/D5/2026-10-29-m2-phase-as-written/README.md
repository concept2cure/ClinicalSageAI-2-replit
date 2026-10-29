# D5: Module 2 reads a study's phase as it is written (2026-10-29)

Session `…01E8btkB`. Found by the truthfulness reviewer in the CSR path review
for the LMN-201 / RePreve prospect, a Phase 2/3 study.

## What already exists

Searched `phase.startsWith`, `/^[2-3]/`, `phaseNumber`,
`normalizeClinicalPhase` and `normalizePhase` in `server/` and `shared/`.

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| A phase parser | `server/services/cmc/program-stage.ts` `phaseNumber` | Reads "Phase 1", "I", "1/2", "Phase IIb", "phase_3" as numbers | Private to the CMC stage reader, so Module 2 had its own reading |
| The Module 2 summaries | `server/services/m2-summary-builders.ts` `buildM25ClinicalOverview`, `buildM27ClinicalSummary` | Name pivotal (Phase 3), clinical pharmacology (Phase 1) and controlled (Phase 2–3) studies, and the gaps when there are none | Tested `c.phase` with `startsWith('3')` and `/^[2-3]/`, which holds only for a bare digit. A study recorded as "Phase 3" or "III" was never pivotal, "Phase 1" was never clinical pharmacology, and the text read "Phase Phase 3" |

## What changed

- **`shared/clinical-phase.ts`.** The CMC parser moved here, so there is one
  reading for every consumer. It adds `phaseNumbers` (each phase named, in
  order) and `phaseLabel` (for display). `program-stage.ts` re-exports
  `phaseNumber` from it, unchanged.
- **The Module 2 summaries.** They classify a study by the first phase its
  text names, and label it with `phaseLabel`. A bare digit reads exactly as
  before.
- **"2/3" reads as it always did here: Phase 2 first, so controlled but not
  pivotal.** Whether a Phase 2/3 study counts as pivotal is a product
  decision. It is the founder's, and it is not taken here.

## Evidence: seen failing first

| Check | Red | Green |
|---|---|---|
| `server/services/__tests__/m2-phase-as-written.test.ts` (new) | `red.txt`: 4 of 7 fail at HEAD: "Phase 3", "III" and "Phase IIIb" are not pivotal, and "Phase 1" is not clinical pharmacology. The controls (bare "3", "2/3" unchanged, the parser) pass | `green.txt`: 47/47, with the two existing Module 2 suites |
| The CMC program stage, on the shared parser | — | 28/28 |
