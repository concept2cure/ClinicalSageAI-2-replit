# F1 · Reporting: a report names its sources and their status in words (2026-11-12, landed 2026-11-14)

**Package:** F1. **Session:** the reporting session (`session_011HLkYC…`, lane L11). **Findings:** sales rehearsal E17
and E18; the CSR lane's map of 2026-11-12, item 2; seen in the running app in C2C-101's Executive Readiness Digest
(`before-digest-1440.png`, taken during the readiness-board walk).

## Before

Every report that was not a Quality report printed the engine's ids and stored values to the reader, under the
heading "Provider readiness": `artifact_state · ready`, `artifact_approval · missing`, `regional_package_manifest ·
partial`. The run's evidence table printed the same ids. A market assessment read "Assessed as a Investigational New
Drug Application".

## What already exists (RULE 3)

| Piece | Path | What it does | What it did not |
|---|---|---|---|
| The renderer | `server/services/report-os/render/render.ts` `providerReadinessSection` | One row a source: id, status, the engine's note | Named a source in words only for a native Quality report |
| Quality's own words | `render/quality-evidence.ts` | "Quality evidence", and a private copy of `humanize` | — |
| The evidence rows | `GET /api/report-os/runs/:id/dependencies` (`server/routes/report-os.ts`) | The stored rows | Sent the id and nothing else |
| The evidence table | `client/src/concept2cure/v2/surfaces/InsightsRunEvidence.tsx` | Source, Outcome, Observed; the outcome already in words | Printed `d.provider` |
| The article | `shared/regulatory/filing-document-classes.ts` `filingTypeInSentence` | "An IND safety report", "A PAS" | Its rule was private, so `marketBlocks` wrote "a" always |
| Sealed reports | `server/services/report-os/sealing/run-seal.ts` | A finalized run is served from its stored sealed document | — |

## What changed

- **`render/source-words.ts`** (split from `render.ts`, inside its folder) is the one vocabulary: a source's name
  and its status in words. 26 ids are named ("What the project holds", "Approved or locked", "Regional package",
  "Financial disclosures", "Health authority commitments" and the rest). An id it does not know is read as words
  ("A new engine"), never shown as stored. `quality-evidence.ts` now uses the same `humanize`.
- **The report's table** is "Source readiness": Source, Status, Note. The section id is unchanged; it is the key
  the screens and the PDF find the section by.
- **The evidence rows** carry `sourceLabel` beside the stored id, and the table prints it. A row with none has its
  id read as words.
- **"Assessed as an Investigational New Drug Application"**, "an MAA", "a 510(k)": `filingArticle`, exported and
  used by `filingTypeInSentence` too.

**A sealed report keeps the words it was sealed with.** It is served from its stored document, so no signed record
changes.

**Not changed:** the run's own status words (draft, partial, final), which the header and the PDF print and a reader
can read.

## Red first, then green

| File | What it shows |
|---|---|
| `red.txt` | Before: the renderer's new test file cannot load (no vocabulary), and 3 of 28 fail in the route and the client |
| `green.txt` | After, on the tree merged with trunk: the three files 37 of 37; 101 Reporting server files, 1,237; 91 client and shared files, 1,180. One failure that is not this change's is named there |

## In the running app, after (`after/`, `walk.cjs`)

- C2C-101's Executive Readiness Digest, opened at 1440 and 390: the section reads "Source readiness" with What the
  project holds · Ready, Approved or locked · Missing, Submission readiness · Missing, Regional package · Partial
  (`after/digest-sources-1440.png`, `-390.png`). No engine id anywhere on the page, no overflow, no page error.
- `GET /runs/8/dependencies`: each row carries its name in words beside the stored id (`after/probes.json`).

## Found, not fixed here (from the CSR lane, for this lane's next change in the renderer)

- `render.ts` states "Counts are the organisation's records of this kind; they are not limited to one program." for
  every register. For a register bound to the reader (the lifecycle calendar, the trial master file pack, the
  commitment register) that is true only when the reader can open every project. The providers carry a `coverage`
  sentence that the renderer does not draw (`trial-master-file-pack.ts`).
- The same claim is made on the screen from `computedScope` (`InsightsCatalogPanel.tsx`, `Insights.tsx`) and in a
  scheduled delivery's message (`scheduling/generate-deliver.ts`).
