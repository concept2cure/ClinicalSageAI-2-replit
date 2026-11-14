# F1 · Reporting: the readiness board and what a project holds (2026-11-12)

**Package:** F1. **Session:** the reporting session (`session_011HLkYC…`, lane L11). **Finding:** rehearsal finding 5.4
(`docs/evidence/DEMO/2026-11-09-rehearsal/deep-walk/`, re-check of 2026-11-12, "reporting-artifacts"), ledger row
GA-DEMO-06, demo-day finding T2-F12. The CSR lane's map of 2026-11-12 reported it again and named the second copy.

## Re-checked in the running app first (`before/`)

Reporting & analytics, C2C-101 open, "Compare readiness across all my projects", on the rebuilt demo database:

1. Each card was **216px wide** at 1440 (`before/board-probes.json`), the ring beside the text, so the text ran one or
   two words a line and a card stood 430px tall.
2. The verdict was printed as stored: "missing · critical risk · 23 critical blockers".
3. C2C-101's first two lines were "No governed artifacts discovered for this scope" and "No approved or locked
   governed artifacts". Project home shows the same project's filing ("Sections approved or locked", 0 of 72) and six
   Vault documents. "Governed artifacts" was not defined anywhere, and the two lines took two of the card's three places.

## What already exists (RULE 3)

Searched: `artifact_state`, `artifact_approval`, both blocker strings, `registerCoreProviders`, `computeInitialRun`,
`readDossier`, `readDossierFigures`, `programOfProject`, `PROJECT_RECORD_READS`, `listVaultDocuments`,
`readArtifactRegistry`, and deleted history of `server/services/report-os/providers/*` (this clone is shallow; nothing
found).

| Piece | Path | What it does | What it did not |
|---|---|---|---|
| The readiness run | `server/services/report-os/orchestrator.ts` `computeInitialRun` | The run every digest, board card and lead reads. Two lifecycle rows (`artifact_state`, `artifact_approval`), then the evaluator's readiness | Counted one store, `concept2cure_artifacts` |
| A second copy | `server/services/report-os/providers/db-providers.ts` | The same count and the same strings as "providers", with a second readiness verdict the run dropped on 2026-10-08 | No caller but its own test |
| The filing's figure | `server/services/c2c/dossier-read.ts` `readDossierFigures` | The home filing's counted and complete sections, one definition; Project home's figure | Not read by Reporting |
| Project to program | `server/services/c2c/program-project-anchor.ts` `programOfProject` | An integer project's program, through its root | Not used by Reporting |
| The stores a project's documents live in | `c2c_documents` and `c2c_document_sections` (the filing), `vault.documents`, `authoring_documents`, `concept2cure_artifacts` | Each has its own reader | Only the last was counted here |
| The board | `client/src/concept2cure/v2/surfaces/Insights.tsx` `RODashboard`, `styles/insights-v2.css` `.ro-port-*` | One card a project, opens the project | Layout and words as above |

Nothing new was added: no screen, route, table or service.

## What changed

**The run counts the filing's sections as well as governed artifacts.** `readFilingSections` reaches each project's
program through `programOfProject` and reads `readDossierFigures`, so the count is the dossier's and Project home's,
not a third definition. Each statement says what it counted:

| The project holds | `artifact_state` | `artifact_approval` | Lines in the blocker list |
|---|---|---|---|
| A filing, nothing approved | ready | "No filing section is approved or locked (0 of 72)." | that one |
| A filing with an approved or locked section | ready | ready | none |
| A filing and governed artifacts, nothing approved | ready | "No filing section (0 of 72) or governed artifact (0 of 21) is approved or locked." | that one |
| Governed artifacts only | ready | "No governed artifact is approved or locked (0 of 2)." | that one |
| Nothing | "No filing document or governed artifact is recorded for this project." | "Nothing is recorded to approve." | the first only, once |
| A filing store this environment has not provisioned | "The filing's sections could not be read in this environment, and no governed artifact is recorded." | — | that one; never "holds nothing" |

A project group sums its projects, each program once. Another organization's filing is never counted. Each row names
both source tables and carries the four counts. The run's summary carries `filing: { sections, approvedOrLocked }`.

**Not claimed.** Vault documents and Authoring documents are not counted by this run, so no line speaks about them.
The readiness verdict itself (the evaluator, over the registry) is unchanged.

**The second copy is removed:** `providers/db-providers.ts` and its test. Nothing called it. What it computed is
delivered by `orchestrator.ts` `computeInitialRun`, proved reachable by `orchestrator-held-records.pglite.test.ts` and
`orchestrator-readiness.test.ts`, and by the walk below. `providers/registry.ts` and `helpers.ts` now have only their
own test as a reader: found, not removed here.

**The board's cards.** The figure and the name share one row; what holds the project back runs across the card
below. A card is at least 280px wide and one a row at phone width. The verdict is said in words ("Not ready",
"Partly ready", "Ready"); one the screen does not know is shown as recorded. No empty line where no indication is
recorded. The verdict line is `--text-300` at 12px (it was `--text-400` at 11px). Every fact a card showed is still on
it (P-122).

## Red first, then green

| File | What it shows |
|---|---|
| `red.txt` | Before: 15 of 16 fail across the two new files (every count and sentence on real SQL; the words, the layout and the empty line on the card) |
| `green.txt` | After: 65 client files that read a Reporting screen, 703 of 703; 105 server files that reach the run or belong to Reporting, 1,305 of 1,305 |

One older file changed: `orchestrator-readiness.test.ts` gives its stand-in database a query function for the new read.

## In the running app, after (`after/`)

RLS and launch scope enforced, signed in as the demo owner (`walk.cjs`; `after/probes.json` holds what each page read).

| Width, theme | Cards | Narrowest text column | Overflow | Page errors |
|---|---|---|---|---|
| 1440, light and dark | 292 × 308, three a row | 152px (the name beside the ring) | 0 | 0 |
| 390, light and dark | 358 wide, one a row | 218px | 0 | 0 |

- C2C-101: "Not ready · Critical risk · 23 critical blockers", then "No filing section is approved or locked (0 of
  72)." and two of its gaps. Project home's figure for the same project is 0 of 72.
- C2C-201 (21 governed artifacts from its Module 3 compile): "No filing section (0 of 72) or governed artifact (0 of
  21) is approved or locked."
- NEUR, the device project: "No filing section is approved or locked (0 of 31)."
- C2C-101's Executive Readiness Digest, opened (`digest-1440-light.png`): the row for what it holds reads ready, and
  the approval row carries the same sentence as the card.

## Found, not fixed here

- The digest still prints the provider ids and stored statuses ("artifact_state", "Status: partial"). That is the
  next change in this lane (`server/services/report-os/render/render.ts`).
- The evaluator reads `sections` and `concept2cure_artifacts` for its gaps, not the filing's sections. Its 0% agrees
  with Project home's 0 of 72 on this data; converging the two is larger than this finding.
