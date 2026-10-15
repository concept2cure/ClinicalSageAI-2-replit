# D5 — eCTD classify and extract propose; they change no co-author document and place nothing (2026-10-01)

Row **D5**. Lane: `…session_01SuVLo2`, claimed `05109fbf`. The finding is NEW-P11-B-1a from the 2026-09-28 editor-family review. It was taken from `…01TTTQ1h`, whose first attempt its reviewers sent back and which was never pushed; that lane's last commit was 2026-09-28 23:27.

## Before (measured at `df7c1aaf`)

`classifyDocument` (`server/services/ingestion/ingestion-service.ts`) is reached two ways:
- `POST /api/ectd-documents/:id/classify`;
- AnA `classify_submission_document`, at the confirm tier.

**What it wrote to the document:**
- the model's section code, into `module_number`, whenever confidence was 0.5 or more;
- its proposal, into the row's metadata.

It did this on any row, an **approved filing copy** included, with no lock, no reason and no audit event. Nothing read the stored proposal.

**What it placed.** With a sequence id, it placed a leaf under the model's section code with no reason. The placement route requires one (PX-1). When the person approved AnA's call, they saw a document id and a sequence id, never the section.

**Extract.** `extractStructure` merged its result into the row's metadata the same way.

## After

**Classify.** It writes nothing to the document and places nothing:
- **The proposal.** It is returned, and recorded in the AI_GENERATE audit row.
- **With a sequence id.** The result carries `proposedLeaf` (sequence, section, title, table, id, granularity, type), and `leafPlacement: { placed: false, refusal: CLASSIFY_PLACES_NOTHING }`.
- **The register.** `classify_submission_document` is now a read.

**Placing the document** is its own step, with the section in view:
- AnA's `place_into_sequence` carries the section in the call the person confirms.
- The Submission Center's `PUT /api/submissions/sequences/:seqId/leaves` asks for the reason (`SubmissionSeqWorkspaces.tsx`, `PlacementReasonField`).

**Adopting a section** is a person's act: placing the document into a filing (`AuthoringPlaceIntoFiling`, `POST /api/coauthor/documents` with a module), or `PUT /api/ectd-documents/:id` with a reason (P-6).

**Extract** no longer writes into the document. It still records its provenance link and its audit row.

**The tool descriptions** say what each tool does now.

## Red, then green

| Suite | Red on trunk | Green |
|---|---|---|
| `classify-placement.pglite.test.ts` (PGlite, the real leaf writer; restated from "places through upsertLeaf" to "places nothing") | `red/classify-extract.txt`: **9 of 10**. The approved copy's `m2.5` was rewritten to the model's `m2.4`; a leaf was placed in the open sequence; the extraction was written into the approved copy. | `green/classify-extract.txt`: 16/16 across the ingestion suites |
| `submission-center-tools`, `tool-authorization` | — | 134/134 with the ingestion suites. The classify tool's no-tenant case is restated: its own guard refuses, since the register's write-role refusal no longer applies to a read. |

## Not done, recorded

- **`place_into_sequence` records no reason.** It is a confirm-tier tool, while the placement route requires a reason (PX-1). Moving it to the reason tier needs its handler (`AnaToolExecutor.ts`, held by two lanes today) to pass the person's reason to `upsertLeaf`. It is handed on in the board.
