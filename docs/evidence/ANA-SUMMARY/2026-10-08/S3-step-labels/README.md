# ANA-SUMMARY S3: one step-presentation table, both tenses, redacted details (2026-10-08)

Design: `docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md` §1a (tool call labelled by source, work step, expandable
details), §2.3, §2.5, §2.6, §3.3, §5 S3, "Decisions taken". Product decision: P-24 in
`docs/LAUNCH_DEFINITION_OF_DONE.md`. Lane: ANA-SUMMARY (founder-directed, moves no D-row). Base: `546a989e7`,
uncommitted working tree (not committed or staged by this slice).

## Defects

Recounted on `546a989e7`:

1. **519 of the 608 in-scope tools had no label.** 89 had one: 82 in the server table (`agentic-loop.ts`, 88 entries,
   7 of them hidden-app tools) and 19 in the client table (`useAnaChat.ts`), 12 of those in both. Everything else
   reached the screen as its raw name, humanised (`Validate ectd package`, `Sentinel tool xyz`). The design counted
   527; the difference is drift since its count.
2. **Two label tables that disagreed** (server `Computing the sample size`, client `Computing sample size —
   biostatistics engine`), and four more places that fell back to the tool's name (`AnaActivity` `c.label || c.name`,
   the panel's current step, "Used in this session", the turn's work summary).
3. **One tense.** A finished step kept its present-progressive label ("Searching…") for ever.
4. **The read never named its document** ("Reading the document in full").
5. **The chevron opened `JSON.stringify(input)`** (`AnaActivity.tsx:279-281` at the base), so ids reached the screen,
   and labels carried input verbatim (`Generating the "readiness.executive_digest" report`).
6. **No source, no preview, no facts, no model marker** on any step.

## Fix

| Piece | File |
|---|---|
| The closed vocabulary: 54 verbs, each with a doing and a done form (all 54 used); 21 sources with the name a person reads; the preview allow-list; the fact names; the unknown step ("Running a step" / "Ran a step"); one step-duration format for server and client | `shared/ana/step-verbs.ts` (new) |
| `present` on every in-scope register entry, and its type and accessor (`stepPresentationOf`) | `server/services/ana/tool-authorization.register.json`, `server/services/ana/tool-authorization.ts` |
| `presentStep` (label in the right tense, source, preview, facts), `stepMessage` (the one place a status sentence is written, §2.6 wording), `stepUsedModel` (from the generation capture), `resolveStepDocumentTitles` (one query, scoped like `documentScopeRefusal`), `announcedStepFields` / `finishedStep` (what the frames carry, kept out of `stream.ts`) | `server/services/ana/step-presentation.ts` (new) |
| `describeToolPlan` goes through `presentStep`; `TOOL_LABELS`, `humanizeToolName` and `quoteArg` deleted; the adaptation note names an unlabelled failure from its register entry | `server/services/ana/agentic-loop.ts` |
| Titles resolved before the round is announced; `tool_use` carries label, source, preview, facts; `tool_result` carries the finished label, source, preview, facts, `usedModel` and the `stepMessage` sentence; the inline sentences and `heldBackMessage` deleted; the trace keeps the presentation so a reopened turn reads the same | `server/routes/ana-ri/stream.ts` |
| Server-run steps (web search, web fetch) from the same verb table, source `web`, the query as preview, both tenses; an unknown one reads "Running a step" (was `Running code_execution`); their failure sentence from `stepMessage` | `server/services/ana/server-tool-steps.ts` |
| The trace entry type carries the presentation | `server/services/ana/tool-trace.ts` |
| Client label table and `toolLabel` deleted; frames' labels used, the result's label replaces the announced one; presentation read from frames and from reopened traces; a trace written before S3 keeps the sentences it was shown live | `client/src/concept2cure/components/ana/useAnaChat.ts`, `useAnaChat.types.ts` |
| Details are the server's facts, the row's preview is line two, the engine glyph only when the capture saw no model; no inputs, no result, no tool name | `client/src/concept2cure/v2/AnaActivity.tsx`, `anaWorkModel.ts` (`showsEngineGlyph`, `stepFacts`), `AnaWorkSections.tsx` (`StepFactList`; current step never by name), `styles/app-v2.css` (`.ana-activity-preview`) |
| No tool-name fallback in the work summary; `formatStepDuration` re-exported from the shared module | `client/src/concept2cure/components/ana/anaProgress.ts` |
| The gate and its self-test, wired beside `ci:internals-in-copy` | `scripts/ci/check-step-presentation.mjs`, `scripts/ci/check-step-presentation.selftest.mjs`, `package.json`, `.github/workflows/ci.yml`, `.github/workflows/pr-checks.yml` |

### Rules this slice decided (see "Decisions needed" in the report)

- **Done form only on success.** A finished step reads in the done form only when its status is `success`, it was not
  held back, and its result does not say `ok: false` or `refused: true`. A failed validation reads "Validating the
  eCTD package" beside "AnA couldn't finish validating the eCTD package and continued without it.", never
  "Validated the eCTD package". The design says "the done form when finished"; this narrows it so no row claims an
  act the record does not support.
- **Preview fields:** the design's six plus `topic` (5 tools: FDA guidance, currency, landscape), `term` (MedDRA and
  ICD-10 coding) and `objective` (run_agent). All are human words; no id field is on the list.
- **Facts:** the design's counts plus the Vault search's `hits.length`, and a listing's scope `total` over its page
  when the result carries both (`list_project_documents` caps the page at 100).
- **Sources outside the design's list were not added.** The CRM search and the calendar write read as `connected`;
  the Artifacts Center tools as `project`; the two code-execution tools (never offered, `governed-toolset.ts`) as
  `project`, with no engine claim.
- **A tool whose handler is the refusal** (`refusedBy: 'handler'`: approve, retire, finalize, transmit) uses
  `explain` or `check`, enforced by the gate (REFUSAL): `approve_qms_document`'s handler answers `{ok:false,
  signatureRequired:true}`, which the stream reads as success, so any other verb's done form would read "Approved".
- **Seven hidden-app tools that had a hand-written label keep one** (`start_deep_investigation`,
  `check_deep_investigation`, `get_tmf_view`, `seed_tmf`, `regulatory_deadline_radar`, `load_nonclinical_program`,
  `assess_claim_evidence_integrity`), so development turns do not regress. Every other hidden-app tool reads "Running a
  step" / "Ran a step".

## The 608 entries

Generated mechanically, then reviewed by family (`review/present-review.tsv`, one row per entry: family, tool, class,
verb, object, source, preview). `review/generate_present.py` and `review/table_g.py` are the one-off generator and
the reviewed table; they are evidence of method, not a tool to rerun over the register.

| Family | In-scope entries |
|---|---|
| Regulatory knowledge (advisors, guidance and requirement lookups, framework assessments, plans, the global-RI registries) | 220 |
| Engines (statistics and modelling, CMC and quality computations, clinical pharmacology and nonclinical, classifiers and scores from facts, validators and text checks) | 102 |
| Protocol authoring | 62 |
| Authoring | 52 |
| Submission Center | 49 |
| Project and workspace | 37 |
| Agency databases | 21 |
| Data Room | 14 |
| Vault | 13 |
| Literature | 12 |
| Quality | 10 |
| Reports | 7 |
| Screen | 6 |
| Connected systems, mailbox, plan | 1 each |
| **Total in scope** | **608** |
| Hidden-app tools kept (above) | 7 |

By source: knowledge 220, **engine 123**, authoring 105, submissions 37, project 35, agency 21, data_room 14, vault 13,
literature 12, qms 10, reports 7, screen 6, connected 3, mailbox 1, plan 1.

- **Generic "Ran".** Ten tools use `run`, each with an object that says what was run ("Running a shadow review",
  "Running a platform command", "Running an agent"). Where a tool's meaning was unclear the review chose a plain
  verb over a confident wrong one ("Checking the text against expected topics" for `check_regulatory_compliance`,
  whose own description says it does not determine compliance).
- **No invented claims.** Objects say what the tool does from its own description, never its outcome. Labels never
  carry input: what a step was asked is its preview.
- **Engine claims: 123**, every one verified by the gate's model-reach check. Two claims were made and refused by the
  gate and keep source `submissions`: `assess_dispatch_readiness` and `build_pathway_manifest`, whose handlers'
  modules reach `server/services/anthropic-files.ts` (on the gateway-bypass baseline). Advisors and framework
  assessments are `knowledge`, not `engine`, even where deterministic: `engine` is for computations over the inputs
  given (calculators, validators, classifiers, scorers, packagers).

## Red → green

Tests (new):
- `server/services/ana/__tests__/step-presentation.test.ts` — presentStep, stepMessage, stepUsedModel (24 cases).
- `server/routes/ana-ri/__tests__/stream-step-presentation.test.ts` — through the streaming route (8 cases).
- `server/services/ana/__tests__/step-document-titles.pglite.test.ts` — the title query's scoping against in-memory
  PostgreSQL with the canonical disposition migration (6 cases).
- `client/src/concept2cure/v2/__tests__/anaActivityStepDetails.test.tsx` — the row and its details (8 cases).
- `client/src/concept2cure/components/ana/__tests__/useAnaChat-step-presentation.test.ts` — live frames and reopened
  traces (5 cases).

| # | Design test | Where | Red on HEAD source (`red-before-fix.txt`) | Green |
|---|---|---|---|---|
| 1 | Redaction: input `{document_id:<uuid>}`, result `{authoringDocId:<uuid>}`, no uuid in the opened details | client details; stream (server half); presentStep | the detail is `Took 2.4s{ "document_id": "3f2b8c1e-…" }`; frames carry no facts at all | no uuid in the record, its details, or what a frame's row is built from; facts `Took: 2.4s` |
| 2 | Coverage gate | `ci:step-presentation` + self-test | the gate over HEAD's register: 608 × MISSING, exit 1 (`gate-on-head-register.txt`) | OK, 608 in scope, 123 engine claims; self-test 20/20 (`gate-selftest.txt`) |
| 3 | `sentinel_tool_xyz` reads "Ran a step" live, reopened and in the details | stream; client hook (live and hydrate); client row | `Sentinel tool xyz` on the frame, the hook, the trace and the row | "Running a step" announced, "Ran a step" finished, reopened and in the row; no "sentinel" anywhere |
| 4 | Tense | stream; client hook | `Searching the project files for "shelf life"` live and finished | "Searching the Vault" → "Searched the Vault", "shelf life" beneath |
| 5 | The read names its document; an id outside the project yields no title | stream; pglite | "Reading the document in full" | `Reading "Stability report 2025"`; another project's id, another organisation's, a deleted one and a data-removed one: no title; one query with the open program bound |
| 6 | A generation in the handler → `usedModel: true`, no engine glyph | stream; client row | no `usedModel`, no glyph rule | `usedModel: true` and "Model: a model wrote part of this result"; the control step `usedModel: false`; glyph only for success + engine + capture saw none |

Counts:
- **Red: 38 failed / 51** across the five new files, run against HEAD's 12 changed source files
  (`red-before-fix.txt`; method below). The 13 that pass at HEAD are the pure functions this slice adds and HEAD's
  code never calls (`stepMessage` ×7, `cleanStepText` ×2, `stepUsedModel`, the verb table's own shape, the
  unknown-step words) and one client case whose sentence the server writes in either version. Every case that goes
  through HEAD's stream, hook, row or register is red.
- **Green: 51 / 51** (`green-after-fix.txt`).

How red was produced: the 12 changed source files were set to their HEAD content with `git show HEAD:<file> > <file>`,
the final tests run, and the files restored from a copy, md5 checked per file. The two new modules stay present at
HEAD (HEAD's code does not import them). No stash, branch or worktree.

### Tests that asserted the old strings, updated in this change

`server/services/ana/__tests__/tool-plan-labels.test.ts`, `server-tool-steps.test.ts`, `turn-plan-and-context.test.ts`,
`tool-trace-agent.test.ts` (D21: the objective is now the preview, and a `"` in it is shown as `'`), `client-journey.test.ts`,
`council-tool.test.ts`, `deep-investigation.test.ts`, `agentic-loop-rounds.test.ts`, `tests/services/agentic-loop.test.ts`,
`client/src/concept2cure/v2/__tests__/anaActivity.test.tsx` (the case that pinned the inputs disclosure now pins its
absence). No evidence harness or e2e spec asserted an old label (grep over `docs/evidence`, `e2e`, `tests`, `scripts`);
evidence READMEs that quote old labels are records of their own runs and were left as they are.

## Mutations (`mutations.txt`)

Each fix undone on its own, the relevant suites run, the file restored (md5 checked): 9 of 9 turned red.

| Mutation | Turned red |
|---|---|
| M1 a finished step reads done whatever its status | presentStep: a failed validation never reads "Validated" |
| M2 the chevron shows the inputs again | client redaction (test 1) |
| M3 the title query drops the open project | pglite: another project's document |
| M4 the title query drops the data-removed predicate | pglite: deleted or data-removed document |
| M5 usedModel always false | stream test 6 |
| M6 an unknown tool reads its humanised name | presentStep and stream test 3 |
| M7 the stream announces without resolving titles | stream test 5 |
| M8 the client keeps the announced label on the result | hook tests 3 and 4 |
| M9 the engine glyph ignores the capture | client test 6 (two cases) |

## The gate

`npm run ci:step-presentation` (`scripts/ci/check-step-presentation.mjs`): MISSING, VERB, SOURCE, PREVIEW, OBJECT,
REFUSAL and ENGINE (header of the script). The engine check parses each claimed tool's handler with the TypeScript
API, follows the same-file functions it calls and every module it imports (static or `import()`), and refuses the
claim when any path reaches `server/services/ai-gateway/gateway.ts` or a file on `gateway-bypass-baseline.json`.
Module reach is file-level, so it over-refuses rather than under-refuses; the runtime capture is still what decides
the glyph.

- Self-test (`npm run ci:step-presentation:selftest`): 20/20 (`gate-selftest.txt`) — the real tree passes; one entry
  deleted fails (exported check and CLI); `engine` on `convene_drafting_council` fails with its chain; test doubles
  calling the gateway directly, through a helper and through `import()` fail while a pure double passes; each
  structural rule fires on its own case; an unreadable verb table and an empty in-scope list throw.
- Wiring: `.github/workflows/ci.yml` and `pr-checks.yml`, right after `ci:internals-in-copy`, self-test first. Not in
  `.husky/pre-push`: `ci:internals-in-copy`, the neighbour named in the design, is not there either.
- `ci:workflow-targets`, `ci:internals-in-copy`, `ci:undefined-css-classes`, `ci:gateway-bypass`,
  `ci:ana-surface-context`, `ci:unauthenticated-fetch`, `ci:action-overclaim`, `ci:success-before-ok`,
  `ci:empty-state-honesty`, `ci:fabricated-identity`: all OK after the change (`gates.txt`).

## Static checks

- ESLint per changed file against HEAD: no file gained a warning (`lint.md`).
- Scoped type check (`tsc-scoped.txt`): a program rooted at the changed source and test files including `stream.ts`.
  No diagnostic in a changed file; the 59 listed are missing ambient declarations in files this change does not
  touch. Shown able to fail with a deliberate TS2322 in `step-presentation.ts`.

## Related suites (`related-suites-after.txt`)

- Server, `server/services/ana/__tests__` + `server/routes/ana-ri/__tests__` + three `tests/services` files:
  **314 files, 4,626 passed, 1 failed, 3 skipped** (the skips are pre-existing).
- Client, every AnA suite (`components/ana/__tests__`, `v2/__tests__/ana*`, `conversation*`, `authoringAnaPane`,
  `shellAskGuard`): **81 files, 798 passed, 1 failed**.
- `npm run test:ana`: **4 files, 303 / 303**.
- The two failures are pre-existing (below): each fails with HEAD's source for every file this change touches.

## Browser acceptance (desktop 1440×900 and 390×844)

A private instance on :5085 (the QA environment's script with PORT, ALLOWED_ORIGINS and the log path changed, plus
`ANA_DOCUMENT_CATALOG_FORCE_ON=true` so the Vault tools are offered), against a scratch copy of the W1 stand-in model
on :8807 with four plays added (`browser/stand-in-s3-plays.diff`; the copy's own self-test: 27/27). The app, its tool
handlers, the QA database (Vorelinib project, 34 Vault documents) and the gateway are real; the model is the
stand-in. Every SSE frame was recorded from inside the page (`browser/s3-browser.json`); both were stopped afterwards.
The journey scripts (`browser/s3-browser.mjs`, `browser/s3-phone.mjs`) import the QA harness's `lib.mjs` from the
session's scratch QA folder and read the seeded user's password from `QA_PASSWORD`; they are kept as the record of
what was driven, not as a runnable harness.

| Acceptance item | Shown? | Where |
|---|---|---|
| "Searched the Vault" with "stability" beneath it (the QA corpus has no "shelf life") | yes: live "Searching the Vault · running · stability", then "Searched the Vault · 1.3s · stability"; facts Searched for, Found: 8 documents, Took | `screens/03`, `22`, frames |
| A running read names its document | the announced frame said `Reading "Vorelinib-Stability-Protocol-STB-0042"` (recorded from the page's own stream); the row on screen was not caught running: the read took 19 ms | frames; `screens/05` |
| Finished rows read in the past tense | yes: "Listed the Vault documents", "Read Vorelinib-…", "Validated the eCTD package", "Drafted several sections at once"; "Used in this session" lists done forms | `screens/05`, `07`, `09` |
| "Validated the eCTD package", not "Validate ectd package" | yes, with the engine glyph (`>_`), `usedModel: false` | `screens/07`, `09` |
| A chevron opens facts with no JSON and no id | yes, every step row at both widths | `screens/03`, `05`, `09`, `22`–`25`, `s3-phone.json` |
| A model-backed step shows "Model: a model wrote part of this result" | yes: `batch_draft_sections`, whose drafting engine called the gateway (the stand-in), `usedModel: true`, check glyph not engine | `screens/09`, frames |
| 390×844 | the reopened conversation: same labels, previews and facts as live (the trace carries them); a long title is cut with an ellipsis and is whole in the Document fact | `screens/21`–`25` |

Not shown, said plainly:
- The running read row on screen (above), and anything with a real model: no key here.
- The phone page has a horizontal overflow of 39 px (scrollWidth 429 at 390). It comes from the conversation header
  (`ct-head-r`, `ana-step-chip`), not from a step row (`s3-phone.json`); the step rows clip with an ellipsis. Not this
  slice's surface; reported.
- The "Recorded" row's details show the record id and hash, as the design keeps them (§2.7); that row is not a step.
- A failed, held-back or declined step in the browser: the stand-in plays none; the sentences are covered by
  `step-presentation.test.ts` and the existing stream suites (`stream-declined-not-a-failure`, held-action tests).

## Pre-existing failures (fail on HEAD's source too, `red-before-fix.txt`)

- `server/routes/ana-ri/__tests__/stream-tool-carry-over.test.ts` › "a step the person declined is not carried…":
  `get_cmc_requirements` is in `ALWAYS_ON_TOOLS` (`tool-selection.ts:73`), so it is offered whatever the trace says.
- `client/src/concept2cure/components/ana/__tests__/useAnaChat-progress.test.ts` › "holds a steer as pending…":
  the pending steer is not cleared by the `interjected` frame.

## Not verified / open

- **`{ ok: false }` reads as success.** 36 places under `server/services/ana/` answer a refusal as `{ ok: false, … }`
  with no `error`; the stream's `refusalOf` reads only `error`, so their status is `success`. S3 keeps their label in
  the doing form so none reads as done, but the status, the adaptation note and telemetry still say success. A
  `refusalOf` change is its own fix.
- **"Model: a model wrote part of this result"** is said for any generation the capture noted, including a reranker or
  a query rewrite inside a search (`project_knowledge_search`). The design's wording; it overstates for those.
- **The wire is unchanged** (§6): `tool_use` still carries the raw input and `tool_result` the raw result, `name` the
  tool's name, and the `step` frame its `tools` list. The client keeps input and result for its own parsers and
  renders neither.
- `run_agent` no longer says "verification agent": a `present` entry is static, and the role is not on the preview
  allow-list.
- The intelligence fast path records `answer_intelligence_question` (hidden app) as "Running a step".
- The gate reads `inScope` from the inventory. A hidden surface promoted into the launch catalog brings its tools into
  scope at run time (`anaCapabilityInLaunchScope`) without moving them in the inventory; today that set is empty
  (checked), and those tools would read "Running a step" until given an entry.
- Traces written before S3 keep the labels and sentences they were shown live (§6, "Older records keep the labels they
  were shown").
